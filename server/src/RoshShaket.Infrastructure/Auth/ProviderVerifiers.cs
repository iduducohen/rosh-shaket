using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using RoshShaket.Application.Auth;

namespace RoshShaket.Infrastructure.Auth;

public sealed class GoogleIdentityVerifier(IdTokenValidator validator, HttpClient http, IOptions<AuthOptions> options) : IExternalIdentityVerifier
{
    private GoogleAuthOptions O => options.Value.Google;
    public AuthProvider Provider => AuthProvider.Google;
    public ProviderInfo Info => new(Provider,
        !string.IsNullOrWhiteSpace(O.ClientId) && !string.IsNullOrWhiteSpace(O.ClientSecret),
        NullIfEmpty(O.ClientId));

    public async Task<ExternalIdentity> VerifyAsync(ExternalCredential credential, CancellationToken ct)
    {
        var idToken = credential.IdToken;
        if (string.IsNullOrEmpty(idToken) && !string.IsNullOrEmpty(credential.AuthorizationCode))
            idToken = await ExchangeCodeAsync(credential.AuthorizationCode, ct);
        if (string.IsNullOrEmpty(idToken)) throw new AuthenticationFailedException("חסר אסימון התחברות.");

        var p = await validator.ValidateAsync(idToken, new TokenRules(
            "https://www.googleapis.com/oauth2/v3/certs", [O.ClientId, .. O.AdditionalAudiences],
            (iss, _) => iss is "https://accounts.google.com" or "accounts.google.com"), ct);

        return new ExternalIdentity(Provider, IdTokenValidator.GetString(p, "sub")!, IdTokenValidator.GetString(p, "email"),
            IdTokenValidator.GetBool(p, "email_verified"), IdTokenValidator.GetString(p, "name"));
    }

    /// <summary>Popup code flow (custom-styled button): exchange the code server-side, where the secret lives.</summary>
    private async Task<string> ExchangeCodeAsync(string code, CancellationToken ct)
    {
        using var response = await http.PostAsync("https://oauth2.googleapis.com/token", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["code"] = code,
            ["client_id"] = O.ClientId,
            ["client_secret"] = O.ClientSecret,
            ["redirect_uri"] = "postmessage",
            ["grant_type"] = "authorization_code"
        }), ct);
        if (!response.IsSuccessStatusCode) throw new AuthenticationFailedException("ההתחברות עם Google נכשלה. נסו שוב.");
        var body = await response.Content.ReadFromJsonAsync<GoogleTokenResponse>(cancellationToken: ct);
        return body?.IdToken ?? throw new AuthenticationFailedException("ההתחברות עם Google נכשלה. נסו שוב.");
    }

    private sealed class GoogleTokenResponse
    {
        [JsonPropertyName("id_token")] public string? IdToken { get; set; }
    }

    private static string? NullIfEmpty(string s) => string.IsNullOrWhiteSpace(s) ? null : s;
}

public sealed class AppleIdentityVerifier(IdTokenValidator validator, IOptions<AuthOptions> options) : IExternalIdentityVerifier
{
    private AppleAuthOptions O => options.Value.Apple;
    public AuthProvider Provider => AuthProvider.Apple;
    public ProviderInfo Info => new(Provider,
        !string.IsNullOrWhiteSpace(O.ClientId) || !string.IsNullOrWhiteSpace(O.BundleId),
        string.IsNullOrWhiteSpace(O.ClientId) ? null : O.ClientId,
        options.Value.WebRedirectUri);

    public async Task<ExternalIdentity> VerifyAsync(ExternalCredential credential, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(credential.IdToken)) throw new AuthenticationFailedException("חסר אסימון התחברות.");
        var audiences = O.AdditionalAudiences.Prepend(O.ClientId).Where(s => !string.IsNullOrWhiteSpace(s)).ToArray();
        var p = await validator.ValidateAsync(credential.IdToken, new TokenRules(
            "https://appleid.apple.com/auth/keys", audiences,
            (iss, _) => iss == "https://appleid.apple.com"), ct);

        // Apple sends the name only to the client, and only on the first sign-in.
        var name = string.IsNullOrWhiteSpace(credential.Name) ? null : credential.Name.Trim()[..Math.Min(credential.Name.Trim().Length, 100)];
        return new ExternalIdentity(Provider, IdTokenValidator.GetString(p, "sub")!, IdTokenValidator.GetString(p, "email"),
            IdTokenValidator.GetBool(p, "email_verified"), name);
    }
}

public sealed class MicrosoftIdentityVerifier(IdTokenValidator validator, IOptions<AuthOptions> options) : IExternalIdentityVerifier
{
    private MicrosoftAuthOptions O => options.Value.Microsoft;
    public AuthProvider Provider => AuthProvider.Microsoft;
    public ProviderInfo Info => new(Provider,
        !string.IsNullOrWhiteSpace(O.ClientId),
        string.IsNullOrWhiteSpace(O.ClientId) ? null : O.ClientId,
        options.Value.WebRedirectUri,
        string.IsNullOrWhiteSpace(O.TenantId) ? "common" : O.TenantId);

    private static readonly HashSet<string> MultiTenant = new(StringComparer.OrdinalIgnoreCase) { "common", "organizations", "consumers" };

    public async Task<ExternalIdentity> VerifyAsync(ExternalCredential credential, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(credential.IdToken)) throw new AuthenticationFailedException("חסר אסימון התחברות.");
        var tenant = O.TenantId;
        var p = await validator.ValidateAsync(credential.IdToken, new TokenRules(
            $"https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys", [O.ClientId],
            (iss, payload) =>
            {
                var tid = IdTokenValidator.GetString(payload, "tid");
                var expectedTenant = MultiTenant.Contains(tenant) ? tid : tenant;
                return tid is not null && iss == $"https://login.microsoftonline.com/{expectedTenant}/v2.0";
            }), ct);

        var email = IdTokenValidator.GetString(p, "email") ?? IdTokenValidator.GetString(p, "preferred_username");
        // Microsoft email claims are not guaranteed verified, so they never link to an existing account.
        return new ExternalIdentity(Provider, IdTokenValidator.GetString(p, "oid") ?? IdTokenValidator.GetString(p, "sub")!,
            email, EmailVerified: false, IdTokenValidator.GetString(p, "name"));
    }
}
