using System.Text.Json;
using Microsoft.Extensions.Caching.Distributed;
using RoshShaket.Application.Abstractions;

namespace RoshShaket.Infrastructure.Caching;

/// <summary>ICacheStore over IDistributedCache: Redis in production, in-memory when no Redis is configured.</summary>
public sealed class DistributedCacheStore(IDistributedCache cache) : ICacheStore
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<T?> GetAsync<T>(string key, CancellationToken ct)
    {
        var bytes = await cache.GetAsync(key, ct);
        return bytes is null ? default : JsonSerializer.Deserialize<T>(bytes, Json);
    }

    public Task SetAsync<T>(string key, T value, TimeSpan ttl, CancellationToken ct) =>
        cache.SetAsync(key, JsonSerializer.SerializeToUtf8Bytes(value, Json),
            new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = ttl }, ct);

    public Task RemoveAsync(string key, CancellationToken ct) => cache.RemoveAsync(key, ct);
}
