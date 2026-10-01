namespace RoshShaket.Application.Auth;

public enum AuthProvider
{
    Google,
    Apple,
    Microsoft,
    Email
}

/// <summary>What the client sends after a provider popup: an ID token, or (Google) an authorization code.</summary>
public sealed record ExternalCredential(string? IdToken, string? AuthorizationCode, string? Name);

/// <summary>A verified identity from a provider. Only built after signature, issuer, audience and expiry checks.</summary>
public sealed record ExternalIdentity(AuthProvider Provider, string Subject, string? Email, bool EmailVerified, string? Name);

public sealed record AppUser(Guid Id, string? Email, string? Name);

/// <summary>A login method already attached to the current account.</summary>
public sealed record LinkedIdentity(AuthProvider Provider, DateTimeOffset LinkedAt);

/// <summary>Public client configuration the browser SDKs need (never secrets).</summary>
public sealed record ProviderInfo(AuthProvider Provider, bool Enabled, string? ClientId, string? RedirectUri = null, string? TenantId = null);

public sealed class AuthenticationFailedException(string message) : Exception(message);

/// <summary>Too many auth attempts; mapped to HTTP 429.</summary>
public sealed class RateLimitedException(string message) : Exception(message);

/// <summary>OTP hashing and send throttles. Pepper must be a long random secret in production.</summary>
public sealed class OtpOptions
{
    public const string Section = "Auth:Otp";

    /// <summary>HMAC key for code hashes. Never store raw OTPs.</summary>
    public string Pepper { get; set; } = "dev-insecure-otp-pepper-change-me";

    public int SendCooldownSeconds { get; set; } = 60;
    public int MaxSendsPerHour { get; set; } = 5;
}

// ---- Ports ----

/// <summary>One implementation per provider (Open/Closed: a new provider is a new class).</summary>
public interface IExternalIdentityVerifier
{
    AuthProvider Provider { get; }
    ProviderInfo Info { get; }
    Task<ExternalIdentity> VerifyAsync(ExternalCredential credential, CancellationToken ct);
}

public interface IUserRepository
{
    /// <summary>Finds the user by provider identity, links by verified email, or creates a new user.</summary>
    Task<AppUser> SignInAsync(ExternalIdentity identity, DateTimeOffset now, CancellationToken ct);

    Task<IReadOnlyList<LinkedIdentity>> ListIdentitiesAsync(Guid userId, CancellationToken ct);

    /// <summary>Attaches a verified provider identity to an already-authenticated user.</summary>
    Task LinkAsync(Guid userId, ExternalIdentity identity, DateTimeOffset now, CancellationToken ct);

    /// <summary>Removes a provider link. Fails if it would leave the account with no login method.</summary>
    Task UnlinkAsync(Guid userId, AuthProvider provider, CancellationToken ct);
}

public interface IEmailSender
{
    Task SendLoginCodeAsync(string email, string code, CancellationToken ct);
}

/// <summary>Revokes refresh tokens until their natural expiry (SHA-256 of the token string as the key).</summary>
public interface IRefreshTokenDenylist
{
    Task RevokeAsync(string refreshToken, TimeSpan ttl, CancellationToken ct);
    Task<bool> IsRevokedAsync(string refreshToken, CancellationToken ct);
}
