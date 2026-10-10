using System.Net;
using System.Net.Http.Json;
using System.Net.Mail;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using RoshShaket.Application.Auth;
using RoshShaket.Infrastructure.Postgres;

namespace RoshShaket.Infrastructure.Auth;

/// <summary>
/// One message the system sends. <see cref="Kind"/> picks the Resend template; Subject/Html are the
/// built-in version used over SMTP or when no template is configured. Variables use Resend's
/// {{{KEY}}} names, so a template only needs to reference them.
/// </summary>
public sealed record EmailMessage(string Kind, string To, string Subject, string Html, IReadOnlyDictionary<string, string> Variables, string? RefKey = null);

public static class EmailContent
{
    public const string LoginCodeKind = "LoginCode";

    public const string ReviewReminderKind = "ReviewReminder";
    public const string YearEndReminderKind = "YearEndReminder";

    /// <summary>
    /// "Time to check again" for someone who still works. Template variables: LINK (the app), UNSUBSCRIBE_URL, EMAIL.
    /// <paramref name="refKey"/> makes it once-only per person in the email log.
    /// </summary>
    public static EmailMessage ReviewReminder(string to, string link, string unsubscribeUrl, string refKey)
    {
        var variables = new Dictionary<string, string> { ["LINK"] = link, ["UNSUBSCRIBE_URL"] = unsubscribeUrl, ["EMAIL"] = to };
        return new(ReviewReminderKind, to, "הגיע הזמן לבדוק שוב את ההפקדות שלכם", Render("review-reminder.html", variables), variables, refKey);
    }

    /// <summary>
    /// Form 106 and the annual pension report of a year that has ended. <paramref name="second"/> is the April note, after
    /// the documents should already have arrived. Template variables: YEAR, DOCS, HEADLINE, INTRO, LINK, UNSUBSCRIBE_URL, EMAIL.
    /// </summary>
    public static EmailMessage YearEndDocsReminder(string to, int year, IReadOnlyList<string> missing, bool second, string link, string unsubscribeUrl, string refKey)
    {
        var names = missing.Select(k => k == "form106" ? "טופס 106" : "הדוח השנתי המפורט לעמיתים").ToList();
        var docs = string.Join(" ו", names);
        var plural = names.Count > 1;
        var headline = second
            ? $"{docs} של {year} עדיין לא הועלו"
            : $"{docs} של {year} {(plural ? "אמורים" : "אמור")} להגיע";
        var intro = second
            ? "זה כבר אחרי סוף מרץ, והמסמכים אמורים להיות אצלכם. אם לא קיבלתם אותם, כדאי לבקש אותם מהמעסיק או מהקופה, ולהעלות כשהם מגיעים."
            : "מסמכי סוף השנה מופקים רק אחרי שהשנה מסתיימת, ובדרך כלל מגיעים עד סוף מרץ. כשהם אצלכם, מעלים אותם ומשלימים את הבדיקה.";
        var variables = new Dictionary<string, string>
        {
            ["YEAR"] = year.ToString(), ["DOCS"] = docs, ["HEADLINE"] = headline, ["INTRO"] = intro,
            ["LINK"] = link, ["UNSUBSCRIBE_URL"] = unsubscribeUrl, ["EMAIL"] = to
        };
        var subject = second ? $"עדיין חסרים לכם מסמכי סוף שנה {year}" : $"מסמכי סוף שנה {year} אמורים להגיע";
        return new(YearEndReminderKind, to, subject, Render("year-end-docs-reminder.html", variables), variables, refKey);
    }

    /// <summary>Template variables: CODE (6 digits), EXPIRES_MINUTES, EMAIL.</summary>
    public static EmailMessage LoginCode(string to, string code)
    {
        var variables = new Dictionary<string, string> { ["CODE"] = code, ["EXPIRES_MINUTES"] = "10", ["EMAIL"] = to };
        return new(LoginCodeKind, to, $"קוד הכניסה שלכם: {code}", Render("login-code.html", variables), variables);
    }

    /// <summary>
    /// Fills a built-in template (Auth/EmailTemplates, the same HTML that is pasted into the Resend dashboard)
    /// by replacing its {{{KEY}}} placeholders with HTML-encoded values.
    /// </summary>
    public static string Render(string templateName, IReadOnlyDictionary<string, string> variables)
    {
        var html = Templates.GetOrAdd(templateName, Load);
        foreach (var (key, value) in variables)
            html = html.Replace("{{{" + key + "}}}", WebUtility.HtmlEncode(value));
        return html;
    }

    private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, string> Templates = new();

    private static string Load(string name)
    {
        using var stream = typeof(EmailContent).Assembly.GetManifestResourceStream("EmailTemplates." + name)
            ?? throw new InvalidOperationException($"Email template '{name}' is not embedded.");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}

/// <summary>What a transport reports back: the provider's message id (to find it in the Resend dashboard) and the template used.</summary>
public sealed record EmailReceipt(string? MessageId = null, string? TemplateId = null);

/// <summary>One way of delivering an <see cref="EmailMessage"/>: Resend, SMTP or the development log.</summary>
public interface IEmailTransport
{
    string Name { get; }
    Task<EmailReceipt> SendAsync(EmailMessage message, CancellationToken ct);
}

/// <summary>The app's email sender: builds each message, hands it to the configured transport and records the attempt in email_log.</summary>
public sealed class RecordedEmailSender(IEmailTransport transport, IEmailLog emailLog, ILogger<RecordedEmailSender> log) : IEmailSender
{
    public Task SendLoginCodeAsync(string email, string code, CancellationToken ct) =>
        SendAsync(EmailContent.LoginCode(email, code), ct);

    public async Task SendAsync(EmailMessage m, CancellationToken ct)
    {
        EmailReceipt receipt;
        try
        {
            receipt = await transport.SendAsync(m, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            await RecordAsync(new EmailLogEntry(m.Kind, m.To, transport.Name, null, null, EmailLogEntry.Failed, ex.Message, m.RefKey), ct);
            throw;
        }
        await RecordAsync(new EmailLogEntry(m.Kind, m.To, transport.Name, receipt.TemplateId, receipt.MessageId, EmailLogEntry.Sent, null, m.RefKey), ct);
    }

    // The email already went out (or already failed); a logging problem must not change the result the user sees.
    private async Task RecordAsync(EmailLogEntry entry, CancellationToken ct)
    {
        try { await emailLog.RecordAsync(entry, ct); }
        catch (Exception ex) { log.LogWarning(ex, "Could not record the {Kind} email in email_log", entry.Kind); }
    }
}

public sealed class SmtpEmailSender(IOptions<AuthOptions> options) : IEmailTransport
{
    public string Name => "smtp";

    public async Task<EmailReceipt> SendAsync(EmailMessage m, CancellationToken ct)
    {
        var o = options.Value.Smtp;
        using var client = new SmtpClient(o.Host, o.Port)
        {
            EnableSsl = o.EnableSsl,
            Credentials = string.IsNullOrEmpty(o.User) ? null : new NetworkCredential(o.User, o.Password)
        };
        using var message = new MailMessage(o.From, m.To) { Subject = m.Subject, Body = m.Html, IsBodyHtml = true };
        await client.SendMailAsync(message, ct);
        return new EmailReceipt();
    }
}

/// <summary>Sends through the Resend API so dashboard templates can be used; falls back to the built-in HTML per email kind.</summary>
public sealed class ResendEmailSender(HttpClient http, IOptions<AuthOptions> options, ILogger<ResendEmailSender> log) : IEmailTransport
{
    public string Name => "resend";

    public async Task<EmailReceipt> SendAsync(EmailMessage m, CancellationToken ct)
    {
        var o = options.Value;
        var apiKey = o.Resend.ResolveApiKey(o.Smtp);
        var template = o.Resend.Templates.TryGetValue(m.Kind, out var configured) && !string.IsNullOrWhiteSpace(configured)
            ? configured.Trim()
            : null;
        object body = template is not null
            // The template's own subject is overridden on purpose: it carries the code, and Resend needs one when the template has none.
            ? new { from = o.Resend.ResolveFrom(o.Smtp), to = new[] { m.To }, subject = m.Subject, template = new { id = template, variables = m.Variables } }
            : new { from = o.Resend.ResolveFrom(o.Smtp), to = new[] { m.To }, subject = m.Subject, html = m.Html };

        using var request = new HttpRequestMessage(HttpMethod.Post, "emails") { Content = JsonContent.Create(body) };
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
        using var response = await http.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
        {
            var error = await response.Content.ReadAsStringAsync(ct);
            log.LogWarning("Resend send failed for {Kind} (template={Template}) with HTTP {Status}: {Error}",
                m.Kind, template ?? "none", (int)response.StatusCode, error.Length > 400 ? error[..400] : error);
            throw new InvalidOperationException($"Resend rejected the {m.Kind} email (HTTP {(int)response.StatusCode}).");
        }

        var sent = await response.Content.ReadFromJsonAsync<ResendSendResponse>(ct);
        return new EmailReceipt(sent?.Id, template);
    }

    private sealed record ResendSendResponse(string? Id);
}

/// <summary>Development only: writes the code to the server log instead of sending an email.</summary>
public sealed class LoggingEmailSender(ILogger<LoggingEmailSender> log) : IEmailTransport
{
    public string Name => "log";

    public Task<EmailReceipt> SendAsync(EmailMessage m, CancellationToken ct)
    {
        log.LogWarning("DEV {Kind} email for {Email}: {Variables}", m.Kind, m.To,
            string.Join(", ", m.Variables.Where(v => v.Key != "EMAIL").Select(v => $"{v.Key}={v.Value}")));
        return Task.FromResult(new EmailReceipt());
    }
}
