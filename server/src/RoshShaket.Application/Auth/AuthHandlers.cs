using System.Net.Mail;
using System.Security.Cryptography;
using System.Text;
using RoshShaket.Application.Abstractions;
using RoshShaket.Domain;

namespace RoshShaket.Application.Auth;

public sealed class ExternalSignInHandler(IEnumerable<IExternalIdentityVerifier> verifiers, IUserRepository users, IClock clock)
{
    private readonly IReadOnlyList<IExternalIdentityVerifier> _verifiers = verifiers.ToList();

    public IReadOnlyList<ProviderInfo> Providers() =>
        _verifiers.Select(v => v.Info).Append(new ProviderInfo(AuthProvider.Email, true, null)).ToList();

    public async Task<AppUser> HandleAsync(AuthProvider provider, ExternalCredential credential, CancellationToken ct)
    {
        var verifier = _verifiers.FirstOrDefault(v => v.Provider == provider);
        if (verifier is null || !verifier.Info.Enabled)
            throw new AuthenticationFailedException("ההתחברות הזו עוד לא הוגדרה בשרת.");

        var identity = await verifier.VerifyAsync(credential, ct);
        return await users.SignInAsync(identity, clock.Now, ct);
    }
}

/// <summary>Passwordless email sign-in: a 6-digit code, stored hashed with a TTL and an attempt limit.</summary>
public sealed class EmailCodeSignInHandler(ICacheStore cache, IEmailSender sender, IUserRepository users, IClock clock)
{
    public static readonly TimeSpan CodeLifetime = TimeSpan.FromMinutes(10);
    public const int MaxAttempts = 5;

    public async Task StartAsync(string email, CancellationToken ct)
    {
        var normalized = Normalize(email);
        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
        var pending = new PendingLoginCode(Hash(normalized, code), 0, clock.Now.Add(CodeLifetime));
        await cache.SetAsync(Key(normalized), pending, CodeLifetime, ct);
        await sender.SendLoginCodeAsync(normalized, code, ct);
    }

    public async Task<AppUser> VerifyAsync(string email, string code, CancellationToken ct)
    {
        var normalized = Normalize(email);
        var key = Key(normalized);
        var pending = await cache.GetAsync<PendingLoginCode>(key, ct);
        var now = clock.Now;

        if (pending is null || pending.ExpiresAt <= now)
            throw new AuthenticationFailedException("הקוד פג תוקף. בקשו קוד חדש.");
        if (pending.Attempts >= MaxAttempts)
            throw new AuthenticationFailedException("יותר מדי ניסיונות. בקשו קוד חדש.");

        var expected = Convert.FromHexString(pending.Hash);
        var actual = Convert.FromHexString(Hash(normalized, (code ?? "").Trim()));
        if (!CryptographicOperations.FixedTimeEquals(expected, actual))
        {
            await cache.SetAsync(key, pending with { Attempts = pending.Attempts + 1 }, pending.ExpiresAt - now, ct);
            throw new AuthenticationFailedException("הקוד לא נכון. נסו שוב.");
        }

        await cache.RemoveAsync(key, ct); // one-time use
        return await users.SignInAsync(new ExternalIdentity(AuthProvider.Email, normalized, normalized, true, null), now, ct);
    }

    private static string Normalize(string? email)
    {
        var trimmed = (email ?? "").Trim().ToLowerInvariant();
        if (trimmed.Length > 254 || !MailAddress.TryCreate(trimmed, out var address) || address.Address != trimmed)
            throw new DomainValidationException(new Dictionary<string, string> { ["email"] = "כתובת האימייל לא תקינה." });
        return trimmed;
    }

    private static string Key(string email) => "login-code:" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(email)));
    private static string Hash(string email, string code) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(email + ":" + code)));
}

public sealed record PendingLoginCode(string Hash, int Attempts, DateTimeOffset ExpiresAt);
