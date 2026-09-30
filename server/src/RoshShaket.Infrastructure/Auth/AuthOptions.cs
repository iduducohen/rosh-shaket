namespace RoshShaket.Infrastructure.Auth;

public sealed class AuthOptions
{
    public const string Section = "Auth";

    /// <summary>Browser origin the provider consoles redirect back to, without a trailing slash. Example: http://127.0.0.1:5051.</summary>
    public string RedirectOrigin { get; set; } = "";

    public GoogleAuthOptions Google { get; set; } = new();
    public AppleAuthOptions Apple { get; set; } = new();
    public MicrosoftAuthOptions Microsoft { get; set; } = new();
    public SmtpOptions Smtp { get; set; } = new();

    public string? WebRedirectUri =>
        string.IsNullOrWhiteSpace(RedirectOrigin) ? null : RedirectOrigin.TrimEnd('/') + "/login";
}

public sealed class GoogleAuthOptions
{
    public string ClientId { get; set; } = "";       // Web client. Android tokens use this as the audience.
    public string ClientSecret { get; set; } = "";   // Popup code flow. The browser never sees it.
    public string IosClientId { get; set; } = "";    // iOS client. Native tokens carry it as aud. Same value as native-auth.json.
    public string[] AdditionalAudiences { get; set; } = [];
}

public sealed class AppleAuthOptions
{
    public string ClientId { get; set; } = "";       // Services ID for the website.
    public string BundleId { get; set; } = "il.roshshaket.app"; // Native iOS token audience.
    public string[] AdditionalAudiences { get; set; } = [];
}

public sealed class MicrosoftAuthOptions
{
    public string ClientId { get; set; } = "";
    public string TenantId { get; set; } = "common";
}

public sealed class SmtpOptions
{
    public string Host { get; set; } = "";
    public int Port { get; set; } = 587;
    public string User { get; set; } = "";
    public string Password { get; set; } = "";
    public string From { get; set; } = "";
    public bool EnableSsl { get; set; } = true;
}
