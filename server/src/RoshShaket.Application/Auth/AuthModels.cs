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

/// <summary>Public client configuration the browser SDKs need (never secrets).</summary>
public sealed record ProviderInfo(AuthProvider Provider, bool Enabled, string? ClientId, string? RedirectUri = null, string? TenantId = null);

public sealed class AuthenticationFailedException(string message) : Exception(message);

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
}

public interface IEmailSender
{
    Task SendLoginCodeAsync(string email, string code, CancellationToken ct);
}
