using System.Text;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using RoshShaket.Application.EmploymentReview;
using RoshShaket.Application.Reminders;
using RoshShaket.Infrastructure.Auth;
using RoshShaket.Infrastructure.Postgres;

namespace RoshShaket.Infrastructure.Reminders;

public sealed class ReminderOptions
{
    public const string Section = "Reminders";

    /// <summary>Off by default: reminder emails go to real people, so sending is a deliberate switch.</summary>
    public bool Enabled { get; set; }

    /// <summary>How often the job looks for due reminders.</summary>
    public int IntervalHours { get; set; } = 6;

    /// <summary>The web app, for the link in the email. Falls back to Authentication:RedirectOrigin.</summary>
    public string AppUrl { get; set; } = "";

    /// <summary>The public address of this API, for the unsubscribe link. Required for sending.</summary>
    public string PublicApiUrl { get; set; } = "";

    /// <summary>Emails are only sent between these hours, Israel time.</summary>
    public int SendFromHour { get; set; } = 8;
    public int SendToHour { get; set; } = 19;

    /// <summary>A safety cap for one run.</summary>
    public int MaxEmailsPerRun { get; set; } = 200;
}

/// <summary>The link in a reminder that stops reminders for one address. An opaque token, so no one can opt out someone else.</summary>
public static class ReminderToken
{
    private const string Purpose = "reminder-unsubscribe.v1";

    public static string Create(IDataProtectionProvider provider, string email)
    {
        var bytes = provider.CreateProtector(Purpose).Protect(Encoding.UTF8.GetBytes(email.Trim().ToLowerInvariant()));
        return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    public static string? Read(IDataProtectionProvider provider, string? token)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;
        try
        {
            var padded = token.Replace('-', '+').Replace('_', '/');
            padded = padded.PadRight(padded.Length + (4 - padded.Length % 4) % 4, '=');
            var bytes = provider.CreateProtector(Purpose).Unprotect(Convert.FromBase64String(padded));
            return Encoding.UTF8.GetString(bytes);
        }
        catch (Exception ex) when (ex is FormatException or System.Security.Cryptography.CryptographicException)
        {
            return null;
        }
    }
}

/// <summary>
/// Sends the reminder emails: a regular check for someone who still works, and a nudge for the year-end documents
/// (Form 106, the annual pension report). What is due comes from <see cref="ReminderPlanner"/>; a reminder goes out once
/// (email_log RefKey) and never to an address that opted out.
/// </summary>
public sealed class ReminderService(
    IServiceScopeFactory scopes,
    IOptions<ReminderOptions> options,
    IOptions<AuthOptions> auth,
    TimeProvider clock,
    ILogger<ReminderService> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stop)
    {
        if (!options.Value.Enabled)
        {
            log.LogInformation("Reminder emails are off (Reminders:Enabled is false).");
            return;
        }

        try
        {
            await Task.Delay(TimeSpan.FromMinutes(2), stop);
            while (!stop.IsCancellationRequested)
            {
                try
                {
                    var sent = await RunOnceAsync(stop);
                    if (sent > 0) log.LogInformation("Reminder run sent {Count} email(s).", sent);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    log.LogError(ex, "Reminder run failed.");
                }
                await Task.Delay(TimeSpan.FromHours(Math.Max(1, options.Value.IntervalHours)), stop);
            }
        }
        catch (OperationCanceledException)
        {
            // Shutting down.
        }
    }

    /// <summary>One pass over the accounts. Returns how many emails went out.</summary>
    public async Task<int> RunOnceAsync(CancellationToken ct)
    {
        var o = options.Value;
        var now = clock.GetUtcNow();
        var hour = TimeZoneInfo.ConvertTime(now, IsraelTime()).Hour;
        if (hour < o.SendFromHour || hour >= o.SendToHour) return 0;

        var appUrl = (string.IsNullOrWhiteSpace(o.AppUrl) ? auth.Value.RedirectOrigin : o.AppUrl).TrimEnd('/');
        var apiUrl = o.PublicApiUrl.TrimEnd('/');
        if (appUrl.Length == 0 || apiUrl.Length == 0)
        {
            log.LogWarning("Reminders are enabled but Reminders:AppUrl (or Authentication:RedirectOrigin) and Reminders:PublicApiUrl are not both set. Nothing was sent.");
            return 0;
        }

        using var scope = scopes.CreateScope();
        var sp = scope.ServiceProvider;
        var db = sp.GetRequiredService<RightsDbContext>();
        var store = sp.GetRequiredService<IEmploymentReviewStore>();
        var sender = sp.GetRequiredService<RecordedEmailSender>();
        var sentLog = sp.GetRequiredService<IEmailLogQuery>();
        var optOut = sp.GetRequiredService<IReminderOptOut>();
        var protection = sp.GetRequiredService<IDataProtectionProvider>();

        var targets = await db.Workspaces.AsNoTracking()
            .Where(w => w.DeletedAt == null && w.User != null && w.User.Email != null)
            .Select(w => new { w.Id, Email = w.User!.Email! })
            .ToListAsync(ct);

        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(now, IsraelTime()).DateTime);
        var sentCount = 0;
        foreach (var target in targets)
        {
            if (sentCount >= o.MaxEmailsPerRun) break;
            var email = target.Email.Trim().ToLowerInvariant();
            if (await optOut.IsOptedOutAsync(email, ct)) continue;

            var review = await store.GetAsync(target.Id, ct);
            if (review is null) continue;

            foreach (var due in ReminderPlanner.Plan(today, review))
            {
                var kind = due.Kind == ReminderKind.RegularCheck ? EmailContent.ReviewReminderKind : EmailContent.YearEndReminderKind;
                if (await sentLog.WasSentAsync(kind, email, due.RefKey, ct)) continue;

                var unsubscribe = $"{apiUrl}/api/reminders/unsubscribe?token={ReminderToken.Create(protection, email)}";
                var link = $"{appUrl}/review/documents";
                var message = due.Kind == ReminderKind.RegularCheck
                    ? EmailContent.ReviewReminder(email, link, unsubscribe, due.RefKey)
                    : EmailContent.YearEndDocsReminder(email, due.Year!.Value, due.Missing, due.RefKey.EndsWith(":2"), link, unsubscribe, due.RefKey);
                try
                {
                    await sender.SendAsync(message, ct);
                    sentCount++;
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    // Recorded as failed in email_log by the sender; the next run tries again.
                    log.LogWarning(ex, "Reminder {Kind} for workspace {Workspace} could not be sent.", kind, target.Id);
                }
            }
        }
        return sentCount;
    }

    private static TimeZoneInfo IsraelTime()
    {
        foreach (var id in new[] { "Asia/Jerusalem", "Israel Standard Time" })
        {
            try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
            catch (TimeZoneNotFoundException) { }
        }
        return TimeZoneInfo.Utc;
    }
}
