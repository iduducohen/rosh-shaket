using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using RoshShaket.Application.Auth;

namespace RoshShaket.Infrastructure.Auth;

public sealed class SmtpEmailSender(IOptions<AuthOptions> options) : IEmailSender
{
    public async Task SendLoginCodeAsync(string email, string code, CancellationToken ct)
    {
        var o = options.Value.Smtp;
        using var client = new SmtpClient(o.Host, o.Port)
        {
            EnableSsl = o.EnableSsl,
            Credentials = string.IsNullOrEmpty(o.User) ? null : new NetworkCredential(o.User, o.Password)
        };
        using var message = new MailMessage(o.From, email)
        {
            Subject = $"קוד הכניסה שלך: {code}",
            Body = $"<div dir=\"rtl\" style=\"font-family:Arial,sans-serif;font-size:16px\">" +
                   $"<p>קוד הכניסה ל'יוצאים בראש שקט':</p><p style=\"font-size:28px;letter-spacing:6px;font-weight:bold\">{code}</p>" +
                   $"<p style=\"color:#666\">הקוד בתוקף ל-10 דקות. אם לא ביקשתם אותו, אפשר להתעלם מההודעה.</p></div>",
            IsBodyHtml = true
        };
        await client.SendMailAsync(message, ct);
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
