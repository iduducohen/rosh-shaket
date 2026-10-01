using System.Net.Mail;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using RoshShaket.Application.Abstractions;
using RoshShaket.Domain;

namespace RoshShaket.Application.Auth;

public sealed class ExternalSignInHandler(
    IEnumerable<IExternalIdentityVerifier> verifiers,
    IUserRepository users,
    IClock clock,
    ILogger<ExternalSignInHandler> log)
{
    private readonly IReadOnlyList<IExternalIdentityVerifier> _verifiers = verifiers.ToList();

    public IReadOnlyList<ProviderInfo> Providers() =>
        _verifiers.Select(v => v.Info).Append(new ProviderInfo(AuthProvider.Email, true, null)).ToList();

    public async Task<AppUser> HandleAsync(AuthProvider provider, ExternalCredential credential, CancellationToken ct)
    {
        var verifier = _verifiers.FirstOrDefault(v => v.Provider == provider);
        if (verifier is null || !verifier.Info.Enabled)
            throw new AuthenticationFailedException("ההתחברות הזו עוד לא הוגדרה בשרת.");

        try
        {
            var identity = await verifier.VerifyAsync(credential, ct);
            var user = await users.SignInAsync(identity, clock.Now, ct);
            log.LogInformation("auth_login_success Provider={Provider} UserId={UserId}", provider, user.Id);
            return user;
        }
        catch (AuthenticationFailedException)
        {
            log.LogWarning("auth_login_failure Provider={Provider}", provider);
            throw;
        }
    }
}

/// <summary>Passwordless email sign-in: a 6-digit code, stored as HMAC hash with TTL, attempts, and send throttles.</summary>
public sealed class EmailCodeSignInHandler(
    ICacheStore cache,
    IEmailSender sender,
    IUserRepository users,
    IClock clock,
    IOptions<OtpOptions> otpOptions,
    ILogger<EmailCodeSignInHandler> log)
{
    public static readonly TimeSpan CodeLifetime = TimeSpan.FromMinutes(10);
    public const int MaxAttempts = 5;

    private readonly OtpOptions _otp = otpOptions.Value;

    public async Task StartAsync(string email, CancellationToken ct)
    {
        var normalized = Normalize(email);
        await EnforceSendLimitsAsync(normalized, ct);

        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
        var pending = new PendingLoginCode(Hash(normalized, code), 0, clock.Now.Add(CodeLifetime));
        await cache.SetAsync(Key(normalized), pending, CodeLifetime, ct);

        var cooldownSeconds = Math.Max(0, _otp.SendCooldownSeconds);
        if (cooldownSeconds > 0)
            await cache.SetAsync(CooldownKey(normalized), true, TimeSpan.FromSeconds(cooldownSeconds), ct);
        await IncrementHourlyAsync(normalized, ct);

        await sender.SendLoginCodeAsync(normalized, code, ct);
        log.LogInformation("auth_otp_requested EmailHash={EmailHash}", EmailFingerprint(normalized));
    }

    public async Task<AppUser> VerifyAsync(string email, string code, CancellationToken ct)
    {
        var normalized = Normalize(email);
        var key = Key(normalized);
        var pending = await cache.GetAsync<PendingLoginCode>(key, ct);
        var now = clock.Now;

        if (pending is null || pending.ExpiresAt <= now)
        {
            log.LogWarning("auth_otp_failed Reason=expired EmailHash={EmailHash}", EmailFingerprint(normalized));
            throw new AuthenticationFailedException("הקוד פג תוקף. בקשו קוד חדש.");
        }
        if (pending.Attempts >= MaxAttempts)
        {
            log.LogWarning("auth_otp_failed Reason=max_attempts EmailHash={EmailHash}", EmailFingerprint(normalized));
            throw new AuthenticationFailedException("יותר מדי ניסיונות. בקשו קוד חדש.");
        }

        var expected = Convert.FromHexString(pending.Hash);
        var actual = Convert.FromHexString(Hash(normalized, (code ?? "").Trim()));
        if (!CryptographicOperations.FixedTimeEquals(expected, actual))
        {
            await cache.SetAsync(key, pending with { Attempts = pending.Attempts + 1 }, pending.ExpiresAt - now, ct);
            log.LogWarning("auth_otp_failed Reason=invalid EmailHash={EmailHash} Attempts={Attempts}",
                EmailFingerprint(normalized), pending.Attempts + 1);
            throw new AuthenticationFailedException("הקוד לא נכון. נסו שוב.");
        }

        await cache.RemoveAsync(key, ct); // one-time use
        var user = await users.SignInAsync(new ExternalIdentity(AuthProvider.Email, normalized, normalized, true, null), now, ct);
        log.LogInformation("auth_otp_verified UserId={UserId}", user.Id);
        return user;
    }

    private async Task EnforceSendLimitsAsync(string email, CancellationToken ct)
    {
        if (await cache.GetAsync<bool?>(CooldownKey(email), ct) == true)
            throw new RateLimitedException("ניתן לשלוח קוד חדש בעוד כדקה. בדקו גם את תיבת הספאם.");

        var hourly = await cache.GetAsync<int?>(HourlyKey(email), ct) ?? 0;
        if (hourly >= Math.Max(1, _otp.MaxSendsPerHour))
            throw new RateLimitedException("נשלחו יותר מדי קודים לכתובת הזו. נסו שוב בעוד שעה.");
    }

    private async Task IncrementHourlyAsync(string email, CancellationToken ct)
    {
        var key = HourlyKey(email);
        var count = (await cache.GetAsync<int?>(key, ct) ?? 0) + 1;
        await cache.SetAsync(key, count, TimeSpan.FromHours(1), ct);
    }

    internal static string Normalize(string? email)
    {
        var trimmed = (email ?? "").Trim().ToLowerInvariant();
        if (trimmed.Length > 254 || !MailAddress.TryCreate(trimmed, out var address) || address.Address != trimmed)
            throw new DomainValidationException(new Dictionary<string, string> { ["email"] = "כתובת האימייל לא תקינה." });
        return trimmed;
    }

    private static string Key(string email) => "login-code:" + EmailFingerprint(email);
    private static string CooldownKey(string email) => "login-code-cooldown:" + EmailFingerprint(email);
    private static string HourlyKey(string email) => "login-code-rl:" + EmailFingerprint(email);

    private static string EmailFingerprint(string email) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(email)));

    private string Hash(string email, string code)
    {
        var pepper = string.IsNullOrWhiteSpace(_otp.Pepper) ? "dev-insecure-otp-pepper-change-me" : _otp.Pepper;
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(pepper));
        return Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(email + ":" + code)));
    }
}

public sealed record PendingLoginCode(string Hash, int Attempts, DateTimeOffset ExpiresAt);

public sealed class AccountLinkingHandler(
    IEnumerable<IExternalIdentityVerifier> verifiers,
    IUserRepository users,
    IClock clock,
    ILogger<AccountLinkingHandler> log)
{
    private readonly IReadOnlyList<IExternalIdentityVerifier> _verifiers = verifiers.ToList();

    public Task<IReadOnlyList<LinkedIdentity>> ListAsync(Guid userId, CancellationToken ct) =>
        users.ListIdentitiesAsync(userId, ct);

    public async Task LinkAsync(Guid userId, AuthProvider provider, ExternalCredential credential, CancellationToken ct)
    {
        var verifier = _verifiers.FirstOrDefault(v => v.Provider == provider);
        if (verifier is null || !verifier.Info.Enabled)
            throw new AuthenticationFailedException("ההתחברות הזו עוד לא הוגדרה בשרת.");

        var identity = await verifier.VerifyAsync(credential, ct);
        await users.LinkAsync(userId, identity, clock.Now, ct);
        log.LogInformation("auth_identity_linked UserId={UserId} Provider={Provider}", userId, provider);
    }

    public async Task UnlinkAsync(Guid userId, AuthProvider provider, CancellationToken ct)
    {
        await users.UnlinkAsync(userId, provider, ct);
        log.LogInformation("auth_identity_unlinked UserId={UserId} Provider={Provider}", userId, provider);
    }
}

public sealed class RefreshTokenDenylist(ICacheStore cache) : IRefreshTokenDenylist
{
    public Task RevokeAsync(string refreshToken, TimeSpan ttl, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(refreshToken) || ttl <= TimeSpan.Zero)
            return Task.CompletedTask;
        return cache.SetAsync(Key(refreshToken), true, ttl, ct);
    }

    public async Task<bool> IsRevokedAsync(string refreshToken, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(refreshToken)) return false;
        return await cache.GetAsync<bool?>(Key(refreshToken), ct) == true;
    }

    private static string Key(string refreshToken) =>
        "refresh-deny:" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(refreshToken)));
}
