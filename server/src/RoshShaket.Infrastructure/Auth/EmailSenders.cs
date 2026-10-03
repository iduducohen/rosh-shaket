using System.Net;
using System.Net.Http.Json;
using System.Net.Mail;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using RoshShaket.Application.Auth;

namespace RoshShaket.Infrastructure.Auth;

/// <summary>
/// One message the system sends. <see cref="Kind"/> picks the Resend template; Subject/Html are the
/// built-in version used over SMTP or when no template is configured. Variables use Resend's
/// {{{KEY}}} names, so a template only needs to reference them.
/// </summary>
public sealed record EmailMessage(string Kind, string To, string Subject, string Html, IReadOnlyDictionary<string, string> Variables);

public static class EmailContent
{
    public const string LoginCodeKind = "LoginCode";

    /// <summary>Template variables: CODE (6 digits), EXPIRES_MINUTES.</summary>
    public static EmailMessage LoginCode(string to, string code) => new(
        LoginCodeKind,
        to,
        $"קוד הכניסה שלך: {code}",
        "<div dir=\"rtl\" style=\"font-family:Arial,sans-serif;font-size:16px\">" +
        $"<p>קוד הכניסה ל'יוצאים בראש שקט':</p><p style=\"font-size:28px;letter-spacing:6px;font-weight:bold\">{code}</p>" +
        "<p style=\"color:#666\">הקוד בתוקף ל-10 דקות. אם לא ביקשתם אותו, אפשר להתעלם מההודעה.</p></div>",
        new Dictionary<string, string> { ["CODE"] = code, ["EXPIRES_MINUTES"] = "10" });
}

public sealed class SmtpEmailSender(IOptions<AuthOptions> options) : IEmailSender
{
    public async Task SendLoginCodeAsync(string email, string code, CancellationToken ct)
    {
        var o = options.Value.Smtp;
        var m = EmailContent.LoginCode(email, code);
        using var client = new SmtpClient(o.Host, o.Port)
        {
            EnableSsl = o.EnableSsl,
            Credentials = string.IsNullOrEmpty(o.User) ? null : new NetworkCredential(o.User, o.Password)
        };
        using var message = new MailMessage(o.From, m.To) { Subject = m.Subject, Body = m.Html, IsBodyHtml = true };
        await client.SendMailAsync(message, ct);
    }
}

/// <summary>Sends through the Resend API so dashboard templates can be used; falls back to the built-in HTML per email kind.</summary>
public sealed class ResendEmailSender(HttpClient http, IOptions<AuthOptions> options, ILogger<ResendEmailSender> log) : IEmailSender
{
    public Task SendLoginCodeAsync(string email, string code, CancellationToken ct) =>
        SendAsync(EmailContent.LoginCode(email, code), ct);

    public async Task SendAsync(EmailMessage m, CancellationToken ct)
    {
        var o = options.Value;
        var apiKey = o.Resend.ResolveApiKey(o.Smtp);
        object body = o.Resend.Templates.TryGetValue(m.Kind, out var templateId) && !string.IsNullOrWhiteSpace(templateId)
            // The template's own subject is overridden on purpose: it carries the code, and Resend needs one when the template has none.
            ? new { from = o.Resend.ResolveFrom(o.Smtp), to = new[] { m.To }, subject = m.Subject, template = new { id = templateId.Trim(), variables = m.Variables } }
            : new { from = o.Resend.ResolveFrom(o.Smtp), to = new[] { m.To }, subject = m.Subject, html = m.Html };

        using var request = new HttpRequestMessage(HttpMethod.Post, "emails") { Content = JsonContent.Create(body) };
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
        using var response = await http.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
        {
            var error = await response.Content.ReadAsStringAsync(ct);
            log.LogWarning("Resend send failed for {Kind} (template={Template}) with HTTP {Status}: {Error}",
                m.Kind, templateId ?? "none", (int)response.StatusCode, error.Length > 400 ? error[..400] : error);
            throw new InvalidOperationException($"Resend rejected the {m.Kind} email (HTTP {(int)response.StatusCode}).");
        }
    }
}

/// <summary>Development only: writes the code to the server log instead of sending an email.</summary>
public sealed class LoggingEmailSender(ILogger<LoggingEmailSender> log) : IEmailSender
{
    public Task SendLoginCodeAsync(string email, string code, CancellationToken ct)
    {
        log.LogWarning("DEV login code for {Email}: {Code}", email, code);
        return Task.CompletedTask;
    }
}
