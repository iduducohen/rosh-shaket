using Microsoft.EntityFrameworkCore;
using RoshShaket.Domain;

namespace RoshShaket.Infrastructure.Postgres;

/// <summary>Relational data: annual legal values (with validity dates) and anonymous calculation stats.</summary>
public sealed class RightsDbContext(DbContextOptions<RightsDbContext> options) : DbContext(options)
{
    public DbSet<AnnualValuesRow> AnnualValues => Set<AnnualValuesRow>();
    public DbSet<CalculationLogRow> CalculationLog => Set<CalculationLogRow>();

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
            // Seed values — VERIFY against official publications before production.
            e.HasData(new AnnualValuesRow
            {
                Id = 1,
                ValidFrom = new DateOnly(2025, 1, 1),
                RecuperationDayValue = 418m,
                SeveranceTaxExemptCapPerYear = 13750m,
                FullSeveranceRatePercent = 8.33m,
                Note = "ערכי פיתוח – לאמת לפני השקה"
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
