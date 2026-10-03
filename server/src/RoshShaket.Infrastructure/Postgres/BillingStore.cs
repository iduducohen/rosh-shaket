using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using RoshShaket.Application.Billing;

namespace RoshShaket.Infrastructure.Postgres;

public sealed class BillingAccountRow
{
    public Guid UserId { get; set; }
    public int Balance { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class BillingLedgerRow
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public int Delta { get; set; }
    /// <summary>welcome | purchase | document | refund</summary>
    public string Kind { get; set; } = "";
    public Guid? PurchaseId { get; set; }
    public string? DocumentType { get; set; }
    public int? Year { get; set; }
    public int? Month { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class BillingPurchaseRow
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string PlanId { get; set; } = "";
    public int Documents { get; set; }
    public decimal AmountIls { get; set; }
    public string Status { get; set; } = "";
    public string Provider { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class ApiUsageRow
{
    public Guid Id { get; set; }
    public Guid? UserId { get; set; }
    public string Kind { get; set; } = "";
    public string Model { get; set; } = "";
    public int InputTokens { get; set; }
    public int OutputTokens { get; set; }
    public decimal CostUsd { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class PostgresBillingStore(RightsDbContext db, TimeProvider clock) : IBillingStore
{
    public async Task EnsureAccountAsync(Guid userId, int freeDocuments, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        // Insert-once: concurrent first requests cannot grant the welcome credits twice.
        var inserted = await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO billing_accounts ("UserId", "Balance", "CreatedAt", "UpdatedAt")
            VALUES ({userId}, {freeDocuments}, {now}, {now})
            ON CONFLICT ("UserId") DO NOTHING
            """, ct);
        if (inserted == 1 && freeDocuments > 0)
        {
            db.BillingLedger.Add(new BillingLedgerRow { Id = Guid.NewGuid(), UserId = userId, Delta = freeDocuments, Kind = "welcome", CreatedAt = now });
            await db.SaveChangesAsync(ct);
        }
    }

    public async Task<bool> TryConsumeAsync(Guid userId, string documentType, int? year, int? month, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var taken = await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE billing_accounts SET "Balance" = "Balance" - 1, "UpdatedAt" = {now}
            WHERE "UserId" = {userId} AND "Balance" > 0
            """, ct);
        if (taken == 0) return false;
        db.BillingLedger.Add(new BillingLedgerRow
        {
            Id = Guid.NewGuid(), UserId = userId, Delta = -1, Kind = "document",
            DocumentType = documentType, Year = year, Month = month, CreatedAt = now
        });
        await db.SaveChangesAsync(ct);
        return true;
    }

    public async Task RefundAsync(Guid userId, string documentType, int? year, int? month, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE billing_accounts SET "Balance" = "Balance" + 1, "UpdatedAt" = {now} WHERE "UserId" = {userId}
            """, ct);
        db.BillingLedger.Add(new BillingLedgerRow
        {
            Id = Guid.NewGuid(), UserId = userId, Delta = 1, Kind = "refund",
            DocumentType = documentType, Year = year, Month = month, CreatedAt = now
        });
        await db.SaveChangesAsync(ct);
    }

    public async Task<BillingPurchase> AddPurchaseAsync(Guid userId, BillingPlan plan, string provider, string status, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var row = new BillingPurchaseRow
        {
            Id = Guid.NewGuid(), UserId = userId, PlanId = plan.Id, Documents = plan.Documents,
            AmountIls = plan.PriceIls, Status = status, Provider = provider, CreatedAt = now
        };
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        db.BillingPurchases.Add(row);
        db.BillingLedger.Add(new BillingLedgerRow { Id = Guid.NewGuid(), UserId = userId, Delta = plan.Documents, Kind = "purchase", PurchaseId = row.Id, CreatedAt = now });
        await db.SaveChangesAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE billing_accounts SET "Balance" = "Balance" + {plan.Documents}, "UpdatedAt" = {now} WHERE "UserId" = {userId}
            """, ct);
        await tx.CommitAsync(ct);
        return Map(row);
    }

    public async Task<BillingAccount> GetAccountAsync(Guid userId, CancellationToken ct)
    {
        var balance = await db.BillingAccounts.AsNoTracking().Where(a => a.UserId == userId).Select(a => a.Balance).FirstOrDefaultAsync(ct);
        var ledger = db.BillingLedger.AsNoTracking().Where(l => l.UserId == userId);
        var totals = await ledger.GroupBy(l => l.Kind).Select(g => new { g.Key, Sum = g.Sum(x => x.Delta) }).ToListAsync(ct);
        int Sum(string kind) => totals.FirstOrDefault(t => t.Key == kind)?.Sum ?? 0;

        var purchases = await db.BillingPurchases.AsNoTracking().Where(p => p.UserId == userId)
            .OrderByDescending(p => p.CreatedAt).ToListAsync(ct);
        var recent = await ledger.OrderByDescending(l => l.CreatedAt).Take(30)
            .Select(l => new BillingLedgerEntry(l.Delta, l.Kind, l.DocumentType, l.Year, l.Month, l.CreatedAt)).ToListAsync(ct);

        return new BillingAccount(
            balance,
            Sum("welcome"),
            Sum("purchase"),
            -Sum("document"),
            Sum("refund"),
            purchases.Sum(p => p.AmountIls),
            purchases.Select(Map).ToList(),
            recent);
    }

    public async Task RecordUsageAsync(ApiUsageRecord usage, CancellationToken ct)
    {
        db.ApiUsage.Add(new ApiUsageRow
        {
            Id = Guid.NewGuid(), UserId = usage.UserId, Kind = usage.Kind, Model = usage.Model,
            InputTokens = usage.InputTokens, OutputTokens = usage.OutputTokens, CostUsd = usage.CostUsd,
            CreatedAt = clock.GetUtcNow()
        });
        await db.SaveChangesAsync(ct);
    }

    private static BillingPurchase Map(BillingPurchaseRow p) =>
        new(p.Id, p.PlanId, BillingCatalog.Find(p.PlanId)?.Name ?? p.PlanId, p.Documents, p.AmountIls, p.Status, p.Provider, p.CreatedAt);
}

public static class BillingSchema
{
    public static async Task EnsureAsync(RightsDbContext db, ILogger logger, CancellationToken ct = default)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS billing_accounts (
              "UserId" uuid PRIMARY KEY,
              "Balance" integer NOT NULL CHECK ("Balance" >= 0),
              "CreatedAt" timestamptz NOT NULL,
              "UpdatedAt" timestamptz NOT NULL
            );
            CREATE TABLE IF NOT EXISTS billing_ledger (
              "Id" uuid PRIMARY KEY,
              "UserId" uuid NOT NULL,
              "Delta" integer NOT NULL,
              "Kind" varchar(16) NOT NULL,
              "PurchaseId" uuid NULL,
              "DocumentType" varchar(32) NULL,
              "Year" integer NULL,
              "Month" integer NULL,
              "CreatedAt" timestamptz NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_billing_ledger_user ON billing_ledger ("UserId", "CreatedAt");
            CREATE TABLE IF NOT EXISTS billing_purchases (
              "Id" uuid PRIMARY KEY,
              "UserId" uuid NOT NULL,
              "PlanId" varchar(32) NOT NULL,
              "Documents" integer NOT NULL,
              "AmountIls" numeric(10,2) NOT NULL,
              "Status" varchar(16) NOT NULL,
              "Provider" varchar(32) NOT NULL,
              "CreatedAt" timestamptz NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_billing_purchases_user ON billing_purchases ("UserId", "CreatedAt");
            CREATE TABLE IF NOT EXISTS api_usage (
              "Id" uuid PRIMARY KEY,
              "UserId" uuid NULL,
              "Kind" varchar(32) NOT NULL,
              "Model" varchar(64) NOT NULL,
              "InputTokens" integer NOT NULL,
              "OutputTokens" integer NOT NULL,
              "CostUsd" numeric(12,6) NOT NULL,
              "CreatedAt" timestamptz NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_api_usage_created ON api_usage ("CreatedAt");
            """, ct);
        logger.LogInformation("Billing schema ensured.");
    }
}
