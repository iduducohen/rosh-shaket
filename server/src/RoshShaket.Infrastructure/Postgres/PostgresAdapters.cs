using Microsoft.EntityFrameworkCore;
using RoshShaket.Application.Abstractions;
using RoshShaket.Domain;

namespace RoshShaket.Infrastructure.Postgres;

public sealed class PostgresAnnualValuesProvider(RightsDbContext db) : IAnnualValuesProvider
{
    public async Task<AnnualValues> GetForDateAsync(DateOnly date, CancellationToken ct)
    {
        var row = await db.AnnualValues.AsNoTracking()
            .Where(v => v.ValidFrom <= date)
            .OrderByDescending(v => v.ValidFrom)
            .FirstOrDefaultAsync(ct)
            ?? await db.AnnualValues.AsNoTracking().OrderBy(v => v.ValidFrom).FirstOrDefaultAsync(ct)
            ?? throw new InvalidOperationException("No annual values configured.");

        return new AnnualValues(row.ValidFrom, row.RecuperationDayValue, row.SeveranceTaxExemptCapPerYear, row.FullSeveranceRatePercent);
    }
}

public sealed class PostgresCalculationLog(RightsDbContext db) : ICalculationLog
{
    public async Task RecordAsync(AnonymizedCalculation r, CancellationToken ct)
    {
        db.CalculationLog.Add(new CalculationLogRow
        {
            Id = Guid.NewGuid(),
            CreatedAt = r.CreatedAt,
            Reason = r.Reason,
            SeniorityYearsBucket = r.SeniorityYearsBucket,
            Section14 = r.Section14,
            EstimatedTotalRounded = r.EstimatedTotalRounded,
            FromPayslip = r.FromPayslip
        });
        await db.SaveChangesAsync(ct);
    }
}
