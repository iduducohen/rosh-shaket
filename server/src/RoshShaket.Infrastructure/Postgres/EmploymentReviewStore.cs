using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using RoshShaket.Application.EmploymentReview;

namespace RoshShaket.Infrastructure.Postgres;

public sealed class EmploymentReviewRow
{
    public Guid WorkspaceId { get; set; }
    public string PayloadJson { get; set; } = "{}";
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class PostgresEmploymentReviewStore(RightsDbContext db) : IEmploymentReviewStore
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    public async Task<EmploymentReviewCase?> GetAsync(Guid workspaceId, CancellationToken ct)
    {
        var row = await db.EmploymentReviews.AsNoTracking().FirstOrDefaultAsync(x => x.WorkspaceId == workspaceId, ct);
        if (row is null) return null;
        return JsonSerializer.Deserialize<EmploymentReviewCase>(row.PayloadJson, JsonOpts);
    }

    public async Task SaveAsync(EmploymentReviewCase review, CancellationToken ct)
    {
        var json = JsonSerializer.Serialize(review, JsonOpts);
        var row = await db.EmploymentReviews.FirstOrDefaultAsync(x => x.WorkspaceId == review.WorkspaceId, ct);
        if (row is null)
        {
            db.EmploymentReviews.Add(new EmploymentReviewRow
            {
                WorkspaceId = review.WorkspaceId,
                PayloadJson = json,
                UpdatedAt = review.UpdatedAt
            });
        }
        else
        {
            row.PayloadJson = json;
            row.UpdatedAt = review.UpdatedAt;
        }
        await db.SaveChangesAsync(ct);
    }
}

public static class EmploymentReviewSchema
{
    public static async Task EnsureAsync(RightsDbContext db, ILogger logger, CancellationToken ct = default)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS employment_reviews (
              "WorkspaceId" uuid PRIMARY KEY,
              "PayloadJson" jsonb NOT NULL,
              "UpdatedAt" timestamptz NOT NULL
            );
            """, ct);
        logger.LogInformation("Employment review schema ensured.");
    }
}
