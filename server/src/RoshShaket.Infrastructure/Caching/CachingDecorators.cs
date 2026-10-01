using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using RoshShaket.Application.Abstractions;
using RoshShaket.Domain;
using RoshShaket.Domain.Content;
using RoshShaket.Infrastructure.Common;
using RoshShaket.Infrastructure.Mongo;

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
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            log.LogWarning(ex, "Cache read failed for {Key}", key);
        }

        var value = await load();
        try { await cache.SetAsync(key, value, ttl, ct); }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
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
    // Don't block the UI for a slow/unreachable Mongo — editorial copy has an embedded fallback.
    private static readonly TimeSpan MongoBudget = TimeSpan.FromSeconds(1.2);

    private TimeSpan Ttl => TimeSpan.FromMinutes(options.Value.ContentMinutes);

    public async Task<IReadOnlyList<ChecklistItem>> GetChecklistAsync(CancellationToken ct) =>
        await SafeCache.GetOrLoadAsync(cache, log, "content:checklist", Ttl,
            () => LoadContentAsync(token => inner.GetChecklistAsync(token), EmbeddedContent.Checklist, "checklist", ct), ct);

    public async Task<IReadOnlyList<RightsSource>> GetSourcesAsync(CancellationToken ct) =>
        await SafeCache.GetOrLoadAsync(cache, log, "content:sources", Ttl,
            () => LoadContentAsync(token => inner.GetSourcesAsync(token), EmbeddedContent.Sources, "sources", ct), ct);

    private async Task<List<T>> LoadContentAsync<T>(
        Func<CancellationToken, Task<IReadOnlyList<T>>> load,
        IReadOnlyList<T> fallback,
        string name,
        CancellationToken ct)
    {
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(ct);
        budget.CancelAfter(MongoBudget);
        try
        {
            var items = await load(budget.Token);
            if (items.Count > 0) return items.ToList();
            log.LogWarning("Mongo content {Name} returned empty; using embedded fallback", name);
            return fallback.ToList();
        }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            // Timeout / outage — serve embedded copy immediately.
            log.LogError(ex, "Mongo content load failed for {Name}; using embedded fallback", name);
            return fallback.ToList();
        }
    }
}
