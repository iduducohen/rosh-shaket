using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using RoshShaket.Domain;

namespace RoshShaket.Infrastructure.Postgres;

/// <summary>Relational data: annual legal values, anonymous calculation stats, users, workspaces, and Data Protection keys.</summary>
public sealed class RightsDbContext(DbContextOptions<RightsDbContext> options) : DbContext(options), IDataProtectionKeyContext
{
    public DbSet<AnnualValuesRow> AnnualValues => Set<AnnualValuesRow>();
    public DbSet<CalculationLogRow> CalculationLog => Set<CalculationLogRow>();
    public DbSet<UserRow> Users => Set<UserRow>();
    public DbSet<UserIdentityRow> UserIdentities => Set<UserIdentityRow>();
    public DbSet<WorkspaceRow> Workspaces => Set<WorkspaceRow>();
    public DbSet<WorkflowStateRow> WorkflowStates => Set<WorkflowStateRow>();
    public DbSet<DocumentRow> Documents => Set<DocumentRow>();
    public DbSet<WorkspaceAuditRow> WorkspaceAudits => Set<WorkspaceAuditRow>();
    public DbSet<EmploymentReviewRow> EmploymentReviews => Set<EmploymentReviewRow>();
    public DbSet<BillingAccountRow> BillingAccounts => Set<BillingAccountRow>();
    public DbSet<BillingLedgerRow> BillingLedger => Set<BillingLedgerRow>();
    public DbSet<BillingPurchaseRow> BillingPurchases => Set<BillingPurchaseRow>();
    public DbSet<ApiUsageRow> ApiUsage => Set<ApiUsageRow>();
    public DbSet<EmailLogRow> EmailLog => Set<EmailLogRow>();
    public DbSet<ReminderOptOutRow> ReminderOptOuts => Set<ReminderOptOutRow>();
    public DbSet<PdfPasswordRow> PdfPasswords => Set<PdfPasswordRow>();
    public DbSet<PartnerReviewRow> PartnerReviews => Set<PartnerReviewRow>();
    /// <summary>ASP.NET Data Protection key ring — survives Railway container replacements.</summary>
    public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<AnnualValuesRow>(e =>
        {
            e.ToTable("annual_values");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.ValidFrom).IsUnique();
            e.Property(x => x.RecuperationDayValue).HasPrecision(10, 2);
            e.Property(x => x.SeveranceTaxExemptCapPerYear).HasPrecision(12, 2);
            e.Property(x => x.FullSeveranceRatePercent).HasPrecision(5, 2);
            e.Property(x => x.Note).HasMaxLength(500);
            e.HasData(new AnnualValuesRow
            {
                Id = 1,
                ValidFrom = new DateOnly(2025, 1, 1),
                RecuperationDayValue = 418m,
                SeveranceTaxExemptCapPerYear = 13750m,
                FullSeveranceRatePercent = 8.33m,
                Note = "ערכי פיתוח – לאמת לפני השקה"
            },
            new AnnualValuesRow
            {
                Id = 2,
                ValidFrom = AnnualValuesSeed.Year2026,
                RecuperationDayValue = AnnualValuesSeed.RecuperationDayValue2026,
                SeveranceTaxExemptCapPerYear = 13750m,
                FullSeveranceRatePercent = 8.33m,
                Note = AnnualValuesSeed.Note2026
            });
        });

        b.Entity<CalculationLogRow>(e =>
        {
            e.ToTable("calculation_log");
            e.HasKey(x => x.Id);
            e.Property(x => x.Reason).HasConversion<string>().HasMaxLength(32);
            e.Property(x => x.Section14).HasConversion<string>().HasMaxLength(32);
            e.Property(x => x.EstimatedTotalRounded).HasPrecision(12, 0);
            e.HasIndex(x => x.CreatedAt);
        });

        b.Entity<UserRow>(e =>
        {
            e.ToTable("users");
            e.HasKey(x => x.Id);
            e.Property(x => x.Email).HasMaxLength(254);
            e.Property(x => x.Name).HasMaxLength(100);
            e.HasIndex(x => x.Email).IsUnique();
        });

        b.Entity<UserIdentityRow>(e =>
        {
            e.ToTable("user_identities");
            e.HasKey(x => x.Id);
            e.Property(x => x.Provider).HasMaxLength(32);
            e.Property(x => x.Subject).HasMaxLength(254);
            e.HasIndex(x => new { x.Provider, x.Subject }).IsUnique();
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<DataProtectionKey>(e =>
        {
            e.ToTable("data_protection_keys");
            e.Property(x => x.FriendlyName).HasMaxLength(200);
        });

        b.Entity<WorkspaceRow>(e =>
        {
            e.ToTable("user_workspaces");
            e.HasKey(x => x.Id);
            e.Property(x => x.Name).HasMaxLength(120);
            e.Property(x => x.Status).HasMaxLength(32);
            e.Property(x => x.CurrentStep).HasMaxLength(64);
            e.Property(x => x.CurrentRoute).HasMaxLength(200);
            e.HasIndex(x => x.UserId);
            e.HasIndex(x => new { x.UserId, x.IsActive });
            e.HasIndex(x => x.UpdatedAt);
            e.HasIndex(x => x.Status);
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Workflow).WithOne(x => x.Workspace!).HasForeignKey<WorkflowStateRow>(x => x.WorkspaceId);
            e.HasMany(x => x.Documents).WithOne(x => x.Workspace!).HasForeignKey(x => x.WorkspaceId);
        });

        b.Entity<WorkflowStateRow>(e =>
        {
            e.ToTable("workspace_workflow_states");
            e.HasKey(x => x.WorkspaceId);
            e.Property(x => x.CurrentStep).HasMaxLength(64);
            e.Property(x => x.PreviousStep).HasMaxLength(64);
            e.Property(x => x.Status).HasMaxLength(32);
            e.Property(x => x.StateJson).HasColumnType("jsonb");
        });

        b.Entity<DocumentRow>(e =>
        {
            e.ToTable("workspace_documents");
            e.HasKey(x => x.Id);
            e.Property(x => x.DocumentType).HasMaxLength(64);
            e.Property(x => x.OriginalFileName).HasMaxLength(260);
            e.Property(x => x.StoredFileName).HasMaxLength(260);
            e.Property(x => x.ContentType).HasMaxLength(120);
            e.Property(x => x.StorageProvider).HasMaxLength(32);
            e.Property(x => x.StorageKey).HasMaxLength(500);
            e.Property(x => x.HashSha256).HasMaxLength(64);
            e.Property(x => x.Status).HasMaxLength(32);
            e.Property(x => x.MetadataJson).HasColumnType("jsonb");
            e.HasIndex(x => x.UserId);
            e.HasIndex(x => x.WorkspaceId);
            e.HasIndex(x => x.UploadedAt);
            e.HasIndex(x => x.Status);
            e.HasIndex(x => x.StorageKey).IsUnique();
        });

        b.Entity<WorkspaceAuditRow>(e =>
        {
            e.ToTable("workspace_audit");
            e.HasKey(x => x.Id);
            e.Property(x => x.Action).HasMaxLength(64);
            e.Property(x => x.EntityType).HasMaxLength(64);
            e.HasIndex(x => x.UserId);
            e.HasIndex(x => x.WorkspaceId);
            e.HasIndex(x => x.CreatedAt);
        });

        b.Entity<EmploymentReviewRow>(e =>
        {
            e.ToTable("employment_reviews");
            e.HasKey(x => x.WorkspaceId);
            e.Property(x => x.PayloadJson).HasColumnType("jsonb");
        });

        b.Entity<BillingAccountRow>(e => { e.ToTable("billing_accounts"); e.HasKey(x => x.UserId); });
        b.Entity<BillingLedgerRow>(e => { e.ToTable("billing_ledger"); e.HasKey(x => x.Id); e.HasIndex(x => new { x.UserId, x.CreatedAt }); });
        b.Entity<BillingPurchaseRow>(e =>
        {
            e.ToTable("billing_purchases");
            e.HasKey(x => x.Id);
            e.Property(x => x.AmountIls).HasPrecision(10, 2);
            e.HasIndex(x => new { x.UserId, x.CreatedAt });
        });
        b.Entity<ApiUsageRow>(e =>
        {
            e.ToTable("api_usage");
            e.HasKey(x => x.Id);
            e.Property(x => x.CostUsd).HasPrecision(12, 6);
            e.HasIndex(x => x.CreatedAt);
        });
        b.Entity<EmailLogRow>(e =>
        {
            e.ToTable("email_log");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.CreatedAt);
            e.HasIndex(x => new { x.ToEmail, x.CreatedAt });
        });
        b.Entity<ReminderOptOutRow>(e =>
        {
            e.ToTable("reminder_optouts");
            e.HasKey(x => x.Email);
            e.Property(x => x.Email).HasMaxLength(254);
        });
        b.Entity<PdfPasswordRow>(e =>
        {
            e.ToTable("pdf_passwords");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.UserId);
        });
        b.Entity<PartnerReviewRow>(e =>
        {
            e.ToTable("partner_reviews");
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.PartnerId, x.UserId }).IsUnique();
        });
    }
}

/// <summary>
/// Yearly values added after the first release. EnsureCreated seeds only a new database,
/// so <see cref="EnsureAsync"/> adds the missing rows to a database that already exists.
/// </summary>
public static class AnnualValuesSeed
{
    public static readonly DateOnly Year2026 = new(2026, 1, 1);
    /// <summary>Private sector, recuperation year 2026: extension order published 18.8.2026 (general collective agreement of 22.6.2026).</summary>
    public const decimal RecuperationDayValue2026 = 451.50m;
    public const string Note2026 = "הבראה 2026: צו הרחבה מיום 18.8.2026. תקרת הפטור לפיצויים – לאמת לפני השקה";

    public static async Task EnsureAsync(RightsDbContext db, ILogger logger, CancellationToken ct = default)
    {
        var added = await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO annual_values ("ValidFrom", "RecuperationDayValue", "SeveranceTaxExemptCapPerYear", "FullSeveranceRatePercent", "Note")
            VALUES ({Year2026}, {RecuperationDayValue2026}, 13750, 8.33, {Note2026})
            ON CONFLICT ("ValidFrom") DO NOTHING
            """, ct);
        if (added > 0) logger.LogInformation("Added the 2026 annual values.");
    }
}

public sealed class AnnualValuesRow
{
    public int Id { get; set; }
    public DateOnly ValidFrom { get; set; }
    public decimal RecuperationDayValue { get; set; }
    public decimal SeveranceTaxExemptCapPerYear { get; set; }
    public decimal FullSeveranceRatePercent { get; set; }
    public string? Note { get; set; }
}

public sealed class CalculationLogRow
{
    public Guid Id { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public ExitReason Reason { get; set; }
    public int SeniorityYearsBucket { get; set; }
    public Section14Arrangement Section14 { get; set; }
    public decimal EstimatedTotalRounded { get; set; }
    public bool FromPayslip { get; set; }
}

public sealed class UserRow
{
    public Guid Id { get; set; }
    public string? Email { get; set; }
    public string? Name { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset LastLoginAt { get; set; }
    public DateTimeOffset LastActiveAt { get; set; }
}

public sealed class UserIdentityRow
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public UserRow? User { get; set; }
    public string Provider { get; set; } = "";
    public string Subject { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}
