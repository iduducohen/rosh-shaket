using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using RoshShaket.Application.Abstractions;
using RoshShaket.Domain;
using RoshShaket.Domain.Content;
using RoshShaket.Infrastructure.Common;

namespace RoshShaket.Infrastructure.Caching;

// Decorators (Open/Closed + Liskov): caching is added around a port without touching the adapter behind it.
// A cache failure never breaks a request — it falls through to the source.

internal static class SafeCache
{
    public static async Task<T> GetOrLoadAsync<T>(ICacheStore cache, ILogger log, string key, TimeSpan ttl,
        Func<Task<T>> load, CancellationToken ct) where T : class
    {
        try
        {
            var hit = await cache.GetAsync<T>(key, ct);
            if (hit is not null) return hit;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            log.LogWarning(ex, "Cache read failed for {Key}", key);
        }

        var value = await load();
        try { await cache.SetAsync(key, value, ttl, ct); }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            log.LogWarning(ex, "Cache write failed for {Key}", key);
        }
        return value;
    }
}

public sealed class CachedAnnualValuesProvider(
    IAnnualValuesProvider inner, ICacheStore cache, IOptions<CacheOptions> options, ILogger<CachedAnnualValuesProvider> log)
    : IAnnualValuesProvider
{
    public Task<AnnualValues> GetForDateAsync(DateOnly date, CancellationToken ct) =>
        SafeCache.GetOrLoadAsync(cache, log, $"annual-values:{date:yyyy-MM-dd}",
            TimeSpan.FromMinutes(options.Value.AnnualValuesMinutes), () => inner.GetForDateAsync(date, ct), ct);
}

public sealed class CachedContentRepository(
    IContentRepository inner, ICacheStore cache, IOptions<CacheOptions> options, ILogger<CachedContentRepository> log)
    : IContentRepository
{
    private TimeSpan Ttl => TimeSpan.FromMinutes(options.Value.ContentMinutes);

    public async Task<IReadOnlyList<ChecklistItem>> GetChecklistAsync(CancellationToken ct) =>
        await SafeCache.GetOrLoadAsync(cache, log, "content:checklist", Ttl,
            () => LoadOrEmptyAsync(() => inner.GetChecklistAsync(ct), "checklist", ct), ct);

    public async Task<IReadOnlyList<RightsSource>> GetSourcesAsync(CancellationToken ct) =>
        await SafeCache.GetOrLoadAsync(cache, log, "content:sources", Ttl,
            () => LoadOrEmptyAsync(() => inner.GetSourcesAsync(ct), "sources", ct), ct);

    private async Task<List<T>> LoadOrEmptyAsync<T>(Func<Task<IReadOnlyList<T>>> load, string name, CancellationToken ct)
    {
        try
        {
            return (await load()).ToList();
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Mongo outage must not take down the whole API (partners/auth still work from other stores).
            log.LogError(ex, "Mongo content load failed for {Name}; returning empty list", name);
            return [];
        }
    }
}
