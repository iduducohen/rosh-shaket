using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using MongoDB.Driver;
using RoshShaket.Application.Abstractions;
using RoshShaket.Infrastructure.Caching;
using RoshShaket.Infrastructure.Claude;
using RoshShaket.Infrastructure.Common;
using RoshShaket.Infrastructure.Mongo;
using RoshShaket.Infrastructure.Postgres;

namespace RoshShaket.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration config)
    {
        services.Configure<ClaudeOptions>(config.GetSection(ClaudeOptions.Section));
        services.Configure<CacheOptions>(config.GetSection(CacheOptions.Section));
        services.Configure<MongoOptions>(config.GetSection(MongoOptions.Section));

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

        return services;
    }

    /// <summary>Creates the Postgres schema and seed on first run. Replace with EF migrations before production.</summary>
    public static async Task InitializeDatabasesAsync(this IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<RightsDbContext>();
        await db.Database.EnsureCreatedAsync();
    }
}
