using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace RoshShaket.Infrastructure.Postgres;

/// <summary>
/// Passwords that open a user's protected PDFs (often an ID number), kept so no device asks twice.
/// Stored only encrypted with the app's Data Protection keys; returned only to the account they belong to.
/// </summary>
public interface IPdfPasswordStore
{
    Task<IReadOnlyList<string>> ListAsync(Guid userId, CancellationToken ct);
    Task AddAsync(Guid userId, string password, CancellationToken ct);
    Task<int> DeleteAllAsync(Guid userId, CancellationToken ct);
}

public sealed class PdfPasswordRow
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    /// <summary>Data Protection payload — never the password itself.</summary>
    public string Protected { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class PostgresPdfPasswordStore(RightsDbContext db, IDataProtectionProvider protection, TimeProvider clock) : IPdfPasswordStore
{
    /// <summary>A user has a handful of employers at most; the cap keeps a bad client from filling the table.</summary>
    public const int MaxPerUser = 20;
    public const int MaxLength = 128;

    private readonly IDataProtector _protector = protection.CreateProtector("RoshShaket.PdfPasswords.v1");

    public async Task<IReadOnlyList<string>> ListAsync(Guid userId, CancellationToken ct)
    {
        var rows = await db.PdfPasswords.AsNoTracking().Where(p => p.UserId == userId)
            .OrderByDescending(p => p.CreatedAt).Select(p => p.Protected).ToListAsync(ct);
        var list = new List<string>(rows.Count);
        foreach (var payload in rows)
        {
            // A payload from a lost key ring can no longer be read; skip it rather than fail the list.
            try { list.Add(_protector.Unprotect(payload)); }
            catch (System.Security.Cryptography.CryptographicException) { }
        }
        return list;
    }

    public async Task AddAsync(Guid userId, string password, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(password) || password.Length > MaxLength) return;
        var existing = await ListAsync(userId, ct);
        if (existing.Contains(password, StringComparer.Ordinal) || existing.Count >= MaxPerUser) return;
        db.PdfPasswords.Add(new PdfPasswordRow
        {
            Id = Guid.NewGuid(), UserId = userId, Protected = _protector.Protect(password), CreatedAt = clock.GetUtcNow()
        });
        await db.SaveChangesAsync(ct);
    }

    public Task<int> DeleteAllAsync(Guid userId, CancellationToken ct) =>
        db.PdfPasswords.Where(p => p.UserId == userId).ExecuteDeleteAsync(ct);
}

public static class PdfPasswordSchema
{
    public static async Task EnsureAsync(RightsDbContext db, ILogger logger, CancellationToken ct = default)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS pdf_passwords (
              "Id" uuid PRIMARY KEY,
              "UserId" uuid NOT NULL REFERENCES users("Id") ON DELETE CASCADE,
              "Protected" text NOT NULL,
              "CreatedAt" timestamptz NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_pdf_passwords_user ON pdf_passwords ("UserId");
            """, ct);
        logger.LogInformation("PDF password schema ensured.");
    }
}
