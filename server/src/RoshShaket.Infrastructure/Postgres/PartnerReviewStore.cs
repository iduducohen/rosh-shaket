using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace RoshShaket.Infrastructure.Postgres;

/// <summary>One user's rating of a professional or law firm. Shown publicly with a short display name only.</summary>
public sealed record PartnerReview(string PartnerId, int Rating, string? Text, string DisplayName, DateTimeOffset UpdatedAt, bool Mine);

public sealed record PartnerRating(string PartnerId, double Average, int Count);

public interface IPartnerReviewStore
{
    Task<IReadOnlyList<PartnerReview>> ListAsync(string partnerId, Guid? viewer, CancellationToken ct);
    Task<IReadOnlyDictionary<string, PartnerRating>> RatingsAsync(CancellationToken ct);
    /// <summary>A user has one review per partner; saving again replaces it.</summary>
    Task SaveAsync(Guid userId, string partnerId, int rating, string? text, CancellationToken ct);
    Task DeleteAsync(Guid userId, string partnerId, CancellationToken ct);
}

public sealed class PartnerReviewRow
{
    public Guid Id { get; set; }
    public string PartnerId { get; set; } = "";
    public Guid UserId { get; set; }
    public int Rating { get; set; }
    public string? Text { get; set; }
    /// <summary>"דנה כ." — first name and last initial, taken from the account when the review is written.</summary>
    public string DisplayName { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class PostgresPartnerReviewStore(RightsDbContext db, TimeProvider clock) : IPartnerReviewStore
{
    public const int MaxTextLength = 1000;

    public async Task<IReadOnlyList<PartnerReview>> ListAsync(string partnerId, Guid? viewer, CancellationToken ct) =>
        await db.PartnerReviews.AsNoTracking().Where(r => r.PartnerId == partnerId)
            .OrderByDescending(r => r.UpdatedAt)
            .Select(r => new PartnerReview(r.PartnerId, r.Rating, r.Text, r.DisplayName, r.UpdatedAt, viewer != null && r.UserId == viewer))
            .ToListAsync(ct);

    public async Task<IReadOnlyDictionary<string, PartnerRating>> RatingsAsync(CancellationToken ct) =>
        await db.PartnerReviews.AsNoTracking()
            .GroupBy(r => r.PartnerId)
            .Select(g => new PartnerRating(g.Key, g.Average(r => r.Rating), g.Count()))
            .ToDictionaryAsync(r => r.PartnerId, ct);

    public async Task SaveAsync(Guid userId, string partnerId, int rating, string? text, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var name = await db.Users.AsNoTracking().Where(u => u.Id == userId).Select(u => new { u.Name, u.Email }).FirstOrDefaultAsync(ct);
        var row = await db.PartnerReviews.FirstOrDefaultAsync(r => r.UserId == userId && r.PartnerId == partnerId, ct);
        if (row is null)
        {
            row = new PartnerReviewRow { Id = Guid.NewGuid(), UserId = userId, PartnerId = partnerId, CreatedAt = now };
            db.PartnerReviews.Add(row);
        }
        row.Rating = rating;
        row.Text = string.IsNullOrWhiteSpace(text) ? null : text.Trim();
        row.DisplayName = DisplayName(name?.Name, name?.Email);
        row.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
    }

    public Task DeleteAsync(Guid userId, string partnerId, CancellationToken ct) =>
        db.PartnerReviews.Where(r => r.UserId == userId && r.PartnerId == partnerId).ExecuteDeleteAsync(ct);

    /// <summary>Never the full name or the email: "דנה כ." from a name, or a generic label.</summary>
    internal static string DisplayName(string? name, string? email)
    {
        var parts = (name ?? "").Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length == 0) return "משתמש/ת";
        return parts.Length == 1 ? parts[0] : $"{parts[0]} {parts[^1][0]}.";
    }
}

public static class PartnerReviewSchema
{
    public static async Task EnsureAsync(RightsDbContext db, ILogger logger, CancellationToken ct = default)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS partner_reviews (
              "Id" uuid PRIMARY KEY,
              "PartnerId" varchar(80) NOT NULL,
              "UserId" uuid NOT NULL REFERENCES users("Id") ON DELETE CASCADE,
              "Rating" integer NOT NULL CHECK ("Rating" BETWEEN 1 AND 5),
              "Text" varchar(1000) NULL,
              "DisplayName" varchar(80) NOT NULL,
              "CreatedAt" timestamptz NOT NULL,
              "UpdatedAt" timestamptz NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ux_partner_reviews_user ON partner_reviews ("PartnerId", "UserId");
            """, ct);
        logger.LogInformation("Partner review schema ensured.");
    }
}
