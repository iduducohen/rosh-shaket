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
using RoshShaket.Application.EmploymentReview;
using RoshShaket.Application.Rules.Contribution;
using RoshShaket.Application.Billing;

namespace RoshShaket.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration config)
    {
        services.Configure<ClaudeOptions>(config.GetSection(ClaudeOptions.Section));
        services.Configure<CacheOptions>(config.GetSection(CacheOptions.Section));
        services.Configure<MongoOptions>(config.GetSection(MongoOptions.Section));
        services.Configure<AuthOptions>(o =>
        {
            // Legacy Auth__* first, then Authentication__* wins (User Secrets / Railway preferred).
            config.GetSection(AuthOptions.LegacySection).Bind(o);
            config.GetSection(AuthOptions.Section).Bind(o);
        });
        services.Configure<OtpOptions>(o =>
        {
            var auth = new AuthOptions();
            config.GetSection(AuthOptions.LegacySection).Bind(auth);
            config.GetSection(AuthOptions.Section).Bind(auth);
            o.Pepper = auth.Otp.Pepper;
            o.SendCooldownSeconds = auth.Otp.SendCooldownSeconds;
            o.MaxSendsPerHour = auth.Otp.MaxSendsPerHour;
            var flat = config["AUTH_OTP_PEPPER"];
            if (!string.IsNullOrWhiteSpace(flat)) o.Pepper = flat;
        });
        services.Configure<FileStorageOptions>(config.GetSection(FileStorageOptions.Section));
        services.PostConfigure<AuthOptions>(o =>
        {
            o.Google.AdditionalAudiences = Merge(o.Google.AdditionalAudiences, o.Google.IosClientId);
            o.Apple.AdditionalAudiences = Merge(o.Apple.AdditionalAudiences, o.Apple.BundleId);
            var origin = System.Environment.GetEnvironmentVariable("AUTH_REDIRECT_ORIGIN");
            if (!string.IsNullOrWhiteSpace(origin) && string.IsNullOrWhiteSpace(o.RedirectOrigin))
                o.RedirectOrigin = origin;
        });

        // Postgres — annual values + anonymous stats
        services.AddDbContext<RightsDbContext>(o => o.UseNpgsql(config.GetConnectionString("Postgres")));

        // Mongo — editorial content (short timeouts so a down DB fails fast instead of ~30s 500s)
        services.AddSingleton<IMongoClient>(_ =>
        {
            var cs = NormalizeMongoConnectionString(config.GetConnectionString("Mongo"));
            if (string.IsNullOrWhiteSpace(cs))
                cs = "mongodb://localhost:27017";
            Console.WriteLine($"Mongo: connecting with {RedactMongoConnectionString(cs)}");
            var settings = MongoClientSettings.FromConnectionString(cs);
            settings.ServerSelectionTimeout = TimeSpan.FromSeconds(3);
            settings.ConnectTimeout = TimeSpan.FromSeconds(3);
            settings.SocketTimeout = TimeSpan.FromSeconds(8);
            return new MongoClient(settings);
        });
        services.AddSingleton(sp => sp.GetRequiredService<IMongoClient>()
            .GetDatabase(sp.GetRequiredService<IOptions<MongoOptions>>().Value.Database));

        // Redis — cache (falls back to in-memory when not configured / misconfigured for Railway)
        var redis = config.GetConnectionString("Redis");
        var envName = config["ASPNETCORE_ENVIRONMENT"]
            ?? System.Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")
            ?? "Production";
        var redisIsLoopback = !string.IsNullOrWhiteSpace(redis) &&
            (redis.Contains("localhost", StringComparison.OrdinalIgnoreCase)
             || redis.Contains("127.0.0.1", StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(redis) && !(redisIsLoopback && !envName.Equals("Development", StringComparison.OrdinalIgnoreCase)))
        {
            services.AddStackExchangeRedisCache(o =>
            {
                o.Configuration = redis;
                o.InstanceName = "rosh-shaket:";
            });
        }
        else
        {
            if (redisIsLoopback)
                Console.WriteLine("Redis: ignoring localhost connection string outside Development; using in-memory cache.");
            services.AddDistributedMemoryCache();
        }
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
        services.AddHttpClient<IDocumentVerifier, ClaudeDocumentVerifier>((sp, http) =>
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
        services.AddSingleton<IRefreshTokenDenylist, RefreshTokenDenylist>();
        services.AddScoped<IWorkspaceRepository, PostgresWorkspaceRepository>();
        services.AddScoped<IDocumentRepository, PostgresDocumentRepository>();
        services.AddScoped<IWorkspaceAudit, PostgresWorkspaceAudit>();
        services.AddSingleton<IFileStorage, LocalFileStorage>();
        services.AddSingleton<IContributionRuleProvider, StaticContributionRuleProvider>();
        services.AddScoped<IEmploymentReviewStore, PostgresEmploymentReviewStore>();
        services.Configure<BillingOptions>(config.GetSection(BillingOptions.Section));
        services.AddScoped<IBillingStore, PostgresBillingStore>();
        if (!string.IsNullOrWhiteSpace(config[$"{AuthOptions.Section}:Smtp:Host"]) ||
            !string.IsNullOrWhiteSpace(config[$"{AuthOptions.LegacySection}:Smtp:Host"]))
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

    /// <summary>Railway root users authenticate against admin; ensure authSource is set.</summary>
    internal static string? NormalizeMongoConnectionString(string? cs)
    {
        if (string.IsNullOrWhiteSpace(cs)) return cs;
        cs = cs.Trim();
        if (cs.Contains("authSource=", StringComparison.OrdinalIgnoreCase)) return cs;
        // Credentials present → prefer authSource=admin (Railway Mongo plugin default).
        if (cs.Contains('@') && (cs.StartsWith("mongodb://", StringComparison.OrdinalIgnoreCase)
                                 || cs.StartsWith("mongodb+srv://", StringComparison.OrdinalIgnoreCase)))
        {
            return cs.Contains('?', StringComparison.Ordinal)
                ? cs + "&authSource=admin"
                : cs + "/?authSource=admin";
        }
        return cs;
    }

    internal static string RedactMongoConnectionString(string cs)
    {
        try
        {
            var uri = new Uri(cs.Replace("mongodb+srv://", "https://", StringComparison.OrdinalIgnoreCase)
                .Replace("mongodb://", "http://", StringComparison.OrdinalIgnoreCase));
            var user = uri.UserInfo.Contains(':') ? uri.UserInfo.Split(':')[0] : uri.UserInfo;
            var auth = string.IsNullOrEmpty(user) ? "" : user + ":***@";
            return $"mongodb://{auth}{uri.Host}:{uri.Port}{uri.PathAndQuery}";
        }
        catch
        {
            return "(unparseable mongo connection string)";
        }
    }

    /// <summary>Creates the Postgres schema and seeds Mongo editorial content on first run.</summary>
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
                await EmploymentReviewSchema.EnsureAsync(db, logger);
                await BillingSchema.EnsureAsync(db, logger);

                await db.Database.ExecuteSqlRawAsync("DROP TABLE IF EXISTS data_protection_keys CASCADE");
                await db.Database.ExecuteSqlRawAsync(
                    """
                    CREATE TABLE data_protection_keys (
                        "Id" serial PRIMARY KEY,
                        "FriendlyName" text,
                        "Xml" text NOT NULL
                    )
                    """);

                logger.LogInformation("Postgres database ensured.");
                break;
            }
            catch (Exception ex)
            {
                // Connection refused or other transient DB errors can occur if Postgres isn't ready yet.
                logger.LogWarning(ex, "Failed to ensure Postgres database on attempt {Attempt}/{Max}.", attempt, maxAttempts);

                if (attempt == maxAttempts)
                {
                    logger.LogError(ex, "Giving up ensuring Postgres database after {Max} attempts. Application will continue but DB operations may fail.", maxAttempts);
                    break;
                }

                // Exponential backoff
                var delayMs = Math.Min(30_000, 500 * (int)Math.Pow(2, attempt));
                await Task.Delay(delayMs);
            }
        }

        try
        {
            var mongo = scope.ServiceProvider.GetRequiredService<IMongoDatabase>();
            logger.LogInformation("Ensuring Mongo content database {Database} is seeded.", mongo.DatabaseNamespace.DatabaseName);
            await MongoContentSeed.EnsureAsync(mongo, logger);
            logger.LogInformation("Mongo content database ready.");
        }
        catch (Exception ex)
        {
            // Soft-fail: app still serves embedded checklist/sources if Mongo is unreachable.
            logger.LogError(ex, "Mongo content seed failed; API will use embedded fallback until Mongo is available.");
        }
    }
}
