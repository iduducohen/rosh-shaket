using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using MongoDB.Driver;
using RoshShaket.Application.Abstractions;
using RoshShaket.Application.Auth;
using RoshShaket.Infrastructure.Auth;
using RoshShaket.Infrastructure.Caching;
using RoshShaket.Infrastructure.Claude;
using RoshShaket.Infrastructure.Common;
using RoshShaket.Infrastructure.Mongo;
using RoshShaket.Infrastructure.Postgres;
using RoshShaket.Infrastructure.Storage;
using RoshShaket.Application.Workspaces;

namespace RoshShaket.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration config)
    {
        services.Configure<ClaudeOptions>(config.GetSection(ClaudeOptions.Section));
        services.Configure<CacheOptions>(config.GetSection(CacheOptions.Section));
        services.Configure<MongoOptions>(config.GetSection(MongoOptions.Section));
        services.Configure<AuthOptions>(config.GetSection(AuthOptions.Section));
        services.Configure<FileStorageOptions>(config.GetSection(FileStorageOptions.Section));
        services.PostConfigure<AuthOptions>(static o =>
        {
            o.Google.AdditionalAudiences = Merge(o.Google.AdditionalAudiences, o.Google.IosClientId);
            o.Apple.AdditionalAudiences = Merge(o.Apple.AdditionalAudiences, o.Apple.BundleId);
        });

        // Postgres — annual values + anonymous stats
        services.AddDbContext<RightsDbContext>(o => o.UseNpgsql(config.GetConnectionString("Postgres")));

        // Mongo — editorial content
        services.AddSingleton<IMongoClient>(_ => new MongoClient(config.GetConnectionString("Mongo")));
        services.AddSingleton(sp => sp.GetRequiredService<IMongoClient>()
            .GetDatabase(sp.GetRequiredService<IOptions<MongoOptions>>().Value.Database));

        // Redis — cache (falls back to in-memory when not configured)
        var redis = config.GetConnectionString("Redis");
        if (!string.IsNullOrWhiteSpace(redis))
            services.AddStackExchangeRedisCache(o => { o.Configuration = redis; o.InstanceName = "rosh-shaket:"; });
        else
            services.AddDistributedMemoryCache();
        services.AddSingleton<ICacheStore, DistributedCacheStore>();

        // Ports -> adapters, with caching decorators
        services.AddScoped<PostgresAnnualValuesProvider>();
        services.AddScoped<IAnnualValuesProvider>(sp =>
            ActivatorUtilities.CreateInstance<CachedAnnualValuesProvider>(sp, sp.GetRequiredService<PostgresAnnualValuesProvider>()));

        services.AddSingleton<MongoContentRepository>();
        services.AddSingleton<IContentRepository>(sp =>
            ActivatorUtilities.CreateInstance<CachedContentRepository>(sp, sp.GetRequiredService<MongoContentRepository>()));

        services.AddScoped<ICalculationLog, PostgresCalculationLog>();
        services.AddSingleton<IClock, SystemClock>();

        services.AddHttpClient<IPayslipExtractor, ClaudePayslipExtractor>((sp, http) =>
        {
            var o = sp.GetRequiredService<IOptions<ClaudeOptions>>().Value;
            http.BaseAddress = new Uri(o.BaseUrl);
            http.Timeout = TimeSpan.FromSeconds(o.TimeoutSeconds);
        });

        // Sign-in: one verifier per provider, users in Postgres, email codes through SMTP (or the log in development)
        services.AddMemoryCache();
        services.AddSingleton(TimeProvider.System);
        services.AddHttpClient<IJwksSource, HttpJwksSource>();
        services.AddTransient<IdTokenValidator>();
        services.AddHttpClient<GoogleIdentityVerifier>();
        services.AddTransient<IExternalIdentityVerifier>(sp => sp.GetRequiredService<GoogleIdentityVerifier>());
        services.AddTransient<IExternalIdentityVerifier, AppleIdentityVerifier>();
        services.AddTransient<IExternalIdentityVerifier, MicrosoftIdentityVerifier>();
        services.AddScoped<IUserRepository, PostgresUserRepository>();
        services.AddScoped<IWorkspaceRepository, PostgresWorkspaceRepository>();
        services.AddScoped<IDocumentRepository, PostgresDocumentRepository>();
        services.AddScoped<IWorkspaceAudit, PostgresWorkspaceAudit>();
        services.AddSingleton<IFileStorage, LocalFileStorage>();
        if (!string.IsNullOrWhiteSpace(config[$"{AuthOptions.Section}:Smtp:Host"]))
            services.AddSingleton<IEmailSender, SmtpEmailSender>();
        else
            services.AddSingleton<IEmailSender, LoggingEmailSender>();

        return services;
    }

    private static string[] Merge(IEnumerable<string>? existing, string? extra)
    {
        var list = (existing ?? []).Where(s => !string.IsNullOrWhiteSpace(s)).Select(s => s.Trim()).ToList();
        if (!string.IsNullOrWhiteSpace(extra) && !list.Contains(extra.Trim(), StringComparer.Ordinal))
            list.Add(extra.Trim());
        return [.. list];
    }

    /// <summary>Creates the Postgres schema and seed on first run. Replace with EF migrations before production.</summary>
    public static async Task InitializeDatabasesAsync(this IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var loggerFactory = scope.ServiceProvider.GetService<Microsoft.Extensions.Logging.ILoggerFactory>()
            ?? Microsoft.Extensions.Logging.Abstractions.NullLoggerFactory.Instance;
        var logger = loggerFactory.CreateLogger("InitializeDatabases");

        var db = scope.ServiceProvider.GetRequiredService<RightsDbContext>();

        const int maxAttempts = 5;
        for (var attempt = 1; attempt <= maxAttempts; attempt++)
        {
            try
            {
                logger.LogInformation("Ensuring Postgres database is created (attempt {Attempt}/{Max}).", attempt, maxAttempts);
                await db.Database.EnsureCreatedAsync();
                await WorkspaceSchema.EnsureAsync(db, logger);
                logger.LogInformation("Postgres database ensured.");
                return;
            }
            catch (Exception ex)
            {
                // Connection refused or other transient DB errors can occur if Postgres isn't ready yet.
                logger.LogWarning(ex, "Failed to ensure Postgres database on attempt {Attempt}/{Max}.", attempt, maxAttempts);

                if (attempt == maxAttempts)
                {
                    logger.LogError(ex, "Giving up ensuring Postgres database after {Max} attempts. Application will continue but DB operations may fail.", maxAttempts);
                    return; // swallow error to allow the app to run; callers should handle DB unavailability.
                }

                // Exponential backoff
                var delayMs = Math.Min(30_000, 500 * (int)Math.Pow(2, attempt));
                await Task.Delay(delayMs);
            }
        }
    }
}
