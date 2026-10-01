namespace RoshShaket.Infrastructure.Auth;

public sealed class AuthOptions
{
    /// <summary>Preferred config section (User Secrets / Railway): Authentication:Google:ClientId → Authentication__Google__ClientId.</summary>
    public const string Section = "Authentication";

    /// <summary>Legacy section kept for existing Railway/docker Auth__* variables.</summary>
    public const string LegacySection = "Auth";

    /// <summary>Browser origin the provider consoles redirect back to, without a trailing slash. Example: http://localhost:5051.</summary>
    public string RedirectOrigin { get; set; } = "";

    public GoogleAuthOptions Google { get; set; } = new();
    public AppleAuthOptions Apple { get; set; } = new();
    public MicrosoftAuthOptions Microsoft { get; set; } = new();
    public SmtpOptions Smtp { get; set; } = new();
    public OtpAuthOptions Otp { get; set; } = new();

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

public sealed class OtpAuthOptions
{
    /// <summary>HMAC pepper for email login codes. Authentication__Otp__Pepper or AUTH_OTP_PEPPER.</summary>
    public string Pepper { get; set; } = "dev-insecure-otp-pepper-change-me";
    public int SendCooldownSeconds { get; set; } = 60;
    public int MaxSendsPerHour { get; set; } = 5;
}
