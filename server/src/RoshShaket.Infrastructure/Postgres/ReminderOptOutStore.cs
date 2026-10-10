using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace RoshShaket.Infrastructure.Postgres;

/// <summary>An address that asked to stop receiving reminder emails.</summary>
public sealed class ReminderOptOutRow
{
    public string Email { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}

public interface IReminderOptOut
{
    Task<bool> IsOptedOutAsync(string email, CancellationToken ct);
    Task OptOutAsync(string email, CancellationToken ct);
}

public sealed class PostgresReminderOptOut(RightsDbContext db, TimeProvider clock) : IReminderOptOut
{
    public Task<bool> IsOptedOutAsync(string email, CancellationToken ct)
    {
        var key = email.Trim().ToLowerInvariant();
        return db.ReminderOptOuts.AsNoTracking().AnyAsync(x => x.Email == key, ct);
    }

    public async Task OptOutAsync(string email, CancellationToken ct)
    {
        var key = email.Trim().ToLowerInvariant();
        if (await db.ReminderOptOuts.AnyAsync(x => x.Email == key, ct)) return;
        db.ReminderOptOuts.Add(new ReminderOptOutRow { Email = key, CreatedAt = clock.GetUtcNow() });
        await db.SaveChangesAsync(ct);
    }
}

public static class ReminderOptOutSchema
{
    public static async Task EnsureAsync(RightsDbContext db, ILogger logger, CancellationToken ct = default)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS reminder_optouts (
              "Email" varchar(254) PRIMARY KEY,
              "CreatedAt" timestamptz NOT NULL
            );
            """, ct);
        logger.LogInformation("Reminder opt-out schema ensured.");
    }
}
