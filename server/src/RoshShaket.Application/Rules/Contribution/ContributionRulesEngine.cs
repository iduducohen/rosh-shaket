using RoshShaket.Domain.Employment;

namespace RoshShaket.Application.Rules.Contribution;

public interface IContributionRuleProvider
{
    Task<IReadOnlyList<ContributionRule>> GetAllAsync(CancellationToken ct);
}

/// <summary>Picks the rule effective for a calendar month and computes Expected deposits from pensionable salary.</summary>
public sealed class ContributionRulesEngine(IContributionRuleProvider rules)
{
    public async Task<ContributionRule?> RuleForAsync(DateOnly monthStart, CancellationToken ct)
    {
        var all = await rules.GetAllAsync(ct);
        return all
            .Where(r => r.EffectiveFrom <= monthStart && (r.EffectiveTo is null || r.EffectiveTo >= monthStart))
            .OrderByDescending(r => r.EffectiveFrom)
            .FirstOrDefault();
    }

    /// <param name="hasTrainingFund">False when the employee has no training fund at all — it is not mandatory by law.</param>
    public async Task<ExpectedContributions> ComputeExpectedAsync(decimal pensionableSalary, DateOnly monthStart, CancellationToken ct, bool hasTrainingFund = true)
    {
        var rule = await RuleForAsync(monthStart, ct)
            ?? throw new InvalidOperationException($"No contribution rule for {monthStart:yyyy-MM}.");

        var baseSalary = rule.SalaryCeiling is { } cap && pensionableSalary > cap ? cap : pensionableSalary;
        var trainingBase = !hasTrainingFund ? 0m
            : rule.TrainingFundSalaryCeiling is { } tcap && baseSalary > tcap ? tcap : baseSalary;
        return new ExpectedContributions(
            rule,
            Round(baseSalary * rule.PensionEmployeeRate / 100m),
            Round(baseSalary * rule.PensionEmployerRate / 100m),
            Round(baseSalary * rule.CompensationRate / 100m),
            Round(trainingBase * rule.TrainingFundEmployeeRate / 100m),
            Round(trainingBase * rule.TrainingFundEmployerRate / 100m));
    }

    public static EmploymentMonth ApplyExpected(EmploymentMonth month, ExpectedContributions expected) =>
        month with
        {
            EmployeePension = month.EmployeePension with { Expected = expected.EmployeePension },
            EmployerPension = month.EmployerPension with { Expected = expected.EmployerPension },
            EmployerCompensation = month.EmployerCompensation with { Expected = expected.Compensation },
            EmployeeCompensation = month.EmployeeCompensation with { Expected = 0m },
            TrainingFundEmployee = month.TrainingFundEmployee with { Expected = expected.TrainingFundEmployee },
            TrainingFundEmployer = month.TrainingFundEmployer with { Expected = expected.TrainingFundEmployer }
        };

    private static decimal Round(decimal v) => Math.Round(v, 2, MidpointRounding.AwayFromZero);
}

public sealed record ExpectedContributions(
    ContributionRule Rule,
    decimal EmployeePension,
    decimal EmployerPension,
    decimal Compensation,
    decimal TrainingFundEmployee,
    decimal TrainingFundEmployer)
{
    public decimal PensionTotal => EmployeePension + EmployerPension + Compensation;
    public decimal TrainingTotal => TrainingFundEmployee + TrainingFundEmployer;
    public decimal GrandTotal => PensionTotal + TrainingTotal;
}

/// <summary>Builds empty month shells for a period (salary left null until filled).</summary>
public static class EmploymentMonthFactory
{
    public static IReadOnlyList<EmploymentMonth> GenerateEmpty(Guid workspaceId, Guid periodId, DateOnly start, DateOnly end)
    {
        if (end < start) throw new ArgumentException("End before start.");
        var list = new List<EmploymentMonth>();
        var cursor = new DateOnly(start.Year, start.Month, 1);
        var last = new DateOnly(end.Year, end.Month, 1);
        while (cursor <= last)
        {
            list.Add(new EmploymentMonth(
                Guid.NewGuid(), periodId, workspaceId, cursor.Year, cursor.Month,
                null, null,
                Empty(), Empty(), Empty(), Empty(), Empty(), Empty(),
                null, null, null, null, null, DataConfidence.Unknown, null));
            cursor = cursor.AddMonths(1);
        }
        return list;
    }

    public static ContributionTriplet Empty() => new(null, null, null);

    /// <summary>Applies a yearly (or mid-year) salary schedule onto months.</summary>
    public static IReadOnlyList<EmploymentMonth> ApplySalarySchedule(
        IReadOnlyList<EmploymentMonth> months,
        IReadOnlyList<SalarySegment> segments)
    {
        if (segments.Count == 0) return months;
        var ordered = segments.OrderBy(s => s.From).ToList();
        return months.Select(m =>
        {
            var key = new DateOnly(m.Year, m.Month, 1);
            var seg = ordered.LastOrDefault(s => s.From <= key && (s.To is null || s.To >= key));
            if (seg is null) return m;
            return m with
            {
                GrossSalary = seg.GrossSalary,
                PensionableSalary = seg.PensionableSalary ?? seg.GrossSalary,
                Confidence = m.Confidence == DataConfidence.Unknown ? DataConfidence.Low : m.Confidence
            };
        }).ToList();
    }
}

public sealed record SalarySegment(DateOnly From, DateOnly? To, decimal GrossSalary, decimal? PensionableSalary);
