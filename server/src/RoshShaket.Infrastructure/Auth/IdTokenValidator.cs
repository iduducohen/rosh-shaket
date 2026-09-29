using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using RoshShaket.Application.Auth;

namespace RoshShaket.Infrastructure.Auth;

public sealed record SigningKey(string Kid, string Kty, string N, string E);

/// <summary>Where signing keys come from (HTTP in production, fixed keys in tests).</summary>
public interface IJwksSource
{
    Task<IReadOnlyList<SigningKey>> GetKeysAsync(string jwksUri, bool forceRefresh, CancellationToken ct);
}

public sealed class HttpJwksSource(HttpClient http, IMemoryCache cache) : IJwksSource
{
    public async Task<IReadOnlyList<SigningKey>> GetKeysAsync(string jwksUri, bool forceRefresh, CancellationToken ct)
    {
        var key = "jwks:" + jwksUri;
        if (!forceRefresh && cache.TryGetValue(key, out IReadOnlyList<SigningKey>? cached) && cached is not null) return cached;

        using var doc = JsonDocument.Parse(await http.GetStringAsync(jwksUri, ct));
        var keys = doc.RootElement.GetProperty("keys").EnumerateArray()
            .Where(k => k.TryGetProperty("kid", out _) && k.TryGetProperty("n", out _) && k.TryGetProperty("e", out _))
            .Select(k => new SigningKey(k.GetProperty("kid").GetString()!, k.GetProperty("kty").GetString() ?? "RSA",
                k.GetProperty("n").GetString()!, k.GetProperty("e").GetString()!))
            .ToList();
        cache.Set(key, (IReadOnlyList<SigningKey>)keys, TimeSpan.FromHours(6));
        return keys;
    }
}

public sealed record TokenRules(string JwksUri, IReadOnlyCollection<string> Audiences, Func<string, JsonElement, bool> IsValidIssuer);

/// <summary>
/// Validates an OpenID Connect ID token (RS256): signature against the provider's published keys,
/// issuer, audience, expiry. Built on framework crypto only, so it has no third-party dependency.
/// </summary>
public sealed class IdTokenValidator(IJwksSource jwks, TimeProvider time)
{
    private static readonly TimeSpan Skew = TimeSpan.FromMinutes(2);

    public async Task<JsonElement> ValidateAsync(string token, TokenRules rules, CancellationToken ct)
    {
        var parts = (token ?? "").Split('.');
        if (parts.Length != 3) throw Fail();

        using var header = JsonDocument.Parse(Base64Url(parts[0]));
        if (header.RootElement.GetProperty("alg").GetString() != "RS256") throw Fail();
        var kid = header.RootElement.TryGetProperty("kid", out var k) ? k.GetString() : null;

        var signingKey = await FindKeyAsync(rules.JwksUri, kid, ct) ?? throw Fail();
        using var rsa = RSA.Create();
        rsa.ImportParameters(new RSAParameters { Modulus = Base64Url(signingKey.N), Exponent = Base64Url(signingKey.E) });
        var signed = Encoding.ASCII.GetBytes(parts[0] + "." + parts[1]);
        if (!rsa.VerifyData(signed, Base64Url(parts[2]), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1)) throw Fail();

        var payload = JsonDocument.Parse(Base64Url(parts[1])).RootElement.Clone();
        var now = time.GetUtcNow();

        if (!payload.TryGetProperty("exp", out var exp) || DateTimeOffset.FromUnixTimeSeconds(exp.GetInt64()) < now - Skew) throw Fail("פג תוקף ההתחברות. נסו שוב.");
        if (payload.TryGetProperty("nbf", out var nbf) && DateTimeOffset.FromUnixTimeSeconds(nbf.GetInt64()) > now + Skew) throw Fail();
        if (!payload.TryGetProperty("iss", out var iss) || !rules.IsValidIssuer(iss.GetString() ?? "", payload)) throw Fail();
        if (!AudienceMatches(payload, rules.Audiences)) throw Fail();
        if (!payload.TryGetProperty("sub", out var sub) || string.IsNullOrEmpty(sub.GetString())) throw Fail();

        return payload;
    }

    private async Task<SigningKey?> FindKeyAsync(string uri, string? kid, CancellationToken ct)
    {
        var keys = await jwks.GetKeysAsync(uri, false, ct);
        var match = keys.FirstOrDefault(x => x.Kid == kid);
        if (match is not null) return match;
        keys = await jwks.GetKeysAsync(uri, true, ct); // provider rotated keys
        return keys.FirstOrDefault(x => x.Kid == kid);
    }

    private static bool AudienceMatches(JsonElement payload, IReadOnlyCollection<string> audiences)
    {
        if (!payload.TryGetProperty("aud", out var aud)) return false;
        audiences = audiences.Where(a => !string.IsNullOrWhiteSpace(a)).ToList(); // unset config values never match
        return aud.ValueKind == JsonValueKind.Array
            ? aud.EnumerateArray().Any(a => audiences.Contains(a.GetString() ?? ""))
            : audiences.Contains(aud.GetString() ?? "");
    }

    public static string? GetString(JsonElement payload, string name) =>
        payload.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    /// <summary>Providers send email_verified as a bool or as the string "true".</summary>
    public static bool GetBool(JsonElement payload, string name) =>
        payload.TryGetProperty(name, out var v) && (v.ValueKind == JsonValueKind.True ||
            (v.ValueKind == JsonValueKind.String && string.Equals(v.GetString(), "true", StringComparison.OrdinalIgnoreCase)));

    private static byte[] Base64Url(string s)
    {
        var padded = s.Replace('-', '+').Replace('_', '/');
        padded += (padded.Length % 4) switch { 2 => "==", 3 => "=", _ => "" };
        try { return Convert.FromBase64String(padded); }
        catch (FormatException) { throw Fail(); }
    }

    private static AuthenticationFailedException Fail(string? message = null) =>
        new(message ?? "לא הצלחנו לאמת את ההתחברות. נסו שוב.");
}
