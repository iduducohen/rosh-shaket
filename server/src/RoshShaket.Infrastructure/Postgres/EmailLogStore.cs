using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace RoshShaket.Infrastructure.Postgres;

/// <summary>One email the system tried to send. <see cref="Status"/> is <see cref="Sent"/> or <see cref="Failed"/>.</summary>
public sealed record EmailLogEntry(
    string Kind, string To, string Provider, string? TemplateId, string? ProviderMessageId, string Status, string? Error)
{
    public const string Sent = "sent";
    public const string Failed = "failed";
}

/// <summary>Record of every email sent (or failed), for support and for answering "did you email me?".</summary>
public interface IEmailLog
{
    Task RecordAsync(EmailLogEntry entry, CancellationToken ct);
}

public sealed class EmailLogRow
{
    public Guid Id { get; set; }
    /// <summary>LoginCode, and later every other kind of email.</summary>
    public string Kind { get; set; } = "";
    public string ToEmail { get; set; } = "";
    /// <summary>resend | smtp | log</summary>
    public string Provider { get; set; } = "";
    public string? TemplateId { get; set; }
    /// <summary>Resend's email id; look it up under Emails in the Resend dashboard.</summary>
    public string? ProviderMessageId { get; set; }
    public string Status { get; set; } = "";
    public string? Error { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class PostgresEmailLog(RightsDbContext db, TimeProvider clock) : IEmailLog
{
    public async Task RecordAsync(EmailLogEntry e, CancellationToken ct)
    {
        db.EmailLog.Add(new EmailLogRow
        {
            Id = Guid.NewGuid(), Kind = e.Kind, ToEmail = e.To, Provider = e.Provider, TemplateId = e.TemplateId,
            ProviderMessageId = e.ProviderMessageId, Status = e.Status,
            Error = e.Error is { Length: > 500 } ? e.Error[..500] : e.Error,
            CreatedAt = clock.GetUtcNow()
        });
        await db.SaveChangesAsync(ct);
    }
}

public static class EmailLogSchema
{
    public static async Task EnsureAsync(RightsDbContext db, ILogger logger, CancellationToken ct = default)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS email_log (
              "Id" uuid PRIMARY KEY,
              "Kind" varchar(32) NOT NULL,
              "ToEmail" varchar(254) NOT NULL,
              "Provider" varchar(16) NOT NULL,
              "TemplateId" varchar(64) NULL,
              "ProviderMessageId" varchar(64) NULL,
              "Status" varchar(16) NOT NULL,
              "Error" varchar(500) NULL,
              "CreatedAt" timestamptz NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_email_log_created ON email_log ("CreatedAt");
            CREATE INDEX IF NOT EXISTS ix_email_log_to ON email_log ("ToEmail", "CreatedAt");
            """, ct);
        logger.LogInformation("Email log schema ensured.");
    }
}
