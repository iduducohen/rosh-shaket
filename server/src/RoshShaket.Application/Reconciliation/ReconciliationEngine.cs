using RoshShaket.Domain.Employment;

namespace RoshShaket.Application.Reconciliation;

/// <summary>Deterministic Expected vs Reported vs Actual analysis. Unknown ≠ 0.</summary>
public static class ReconciliationEngine
{
    public static MonthReconciliation ReconcileMonth(EmploymentMonth m)
    {
        var lines = new List<LineReconciliation>
        {
            Line("EmployeePension", FundKind.Pension, m.EmployeePension),
            Line("EmployerPension", FundKind.Pension, m.EmployerPension),
            Line("EmployerCompensation", FundKind.Severance, m.EmployerCompensation),
            Line("TrainingFundEmployee", FundKind.Study, m.TrainingFundEmployee),
            Line("TrainingFundEmployer", FundKind.Study, m.TrainingFundEmployer)
        };

        var hasAnyData = m.GrossSalary is not null
            || lines.Any(l => l.Expected is not null || l.Reported is not null || l.Actual is not null);
        var hasGap = lines.Any(l => l.GapActualVsExpected is < 0 || l.GapReportedVsExpected is < 0);
        var hasUnknown = lines.Any(l => l.Actual is null && l.Expected is not null);

        var confidence = DeriveConfidence(m, lines);
        return new MonthReconciliation(m.Year, m.Month, hasAnyData, hasGap, hasUnknown, confidence, lines);
    }

    public static ReconciliationSummary Summarize(IReadOnlyList<EmploymentMonth> months)
    {
        var rows = months.Select(ReconcileMonth).ToList();
        var checkedMonths = rows.Count(r => r.HasAnyData);
        var ok = rows.Count(r => r.HasAnyData && !r.HasGap && !r.HasUnknownActual);
        var withGap = rows.Count(r => r.HasGap);
        var noInfo = rows.Count(r => !r.HasAnyData);
        var unknownActual = rows.Count(r => r.HasUnknownActual);

        decimal? Sum(Func<ContributionTriplet, decimal?> pick) =>
            SumNullable(months.SelectMany(m => new[]
            {
                pick(m.EmployeePension), pick(m.EmployerPension), pick(m.EmployerCompensation),
                pick(m.TrainingFundEmployee), pick(m.TrainingFundEmployer)
            }));

        var expected = Sum(t => t.Expected);
        var reported = Sum(t => t.Reported);
        var actual = Sum(t => t.Actual);
        decimal? gap = expected is null || actual is null ? null : actual.Value - expected.Value;

        var firstGap = rows.FirstOrDefault(r => r.HasGap);
        var lastGap = rows.LastOrDefault(r => r.HasGap);

        var coverage = months.Count == 0 ? 0 : (decimal)checkedMonths / months.Count;
        var health = HealthScoreCalculator.Compute(coverage, withGap, noInfo, months.Count);

        return new ReconciliationSummary(
            months.Count, checkedMonths, ok, withGap, noInfo, unknownActual,
            expected, reported, actual, gap,
            firstGap is null ? null : $"{firstGap.Month:D2}/{firstGap.Year}",
            lastGap is null ? null : $"{lastGap.Month:D2}/{lastGap.Year}",
            health, rows);
    }

    public static IReadOnlyList<Anomaly> DetectAnomalies(Guid workspaceId, IReadOnlyList<EmploymentMonth> months)
    {
        var list = new List<Anomaly>();
        EmploymentMonth? prev = null;
        foreach (var m in months.OrderBy(x => x.Year).ThenBy(x => x.Month))
        {
            var row = ReconcileMonth(m);
            if (!row.HasAnyData)
            {
                list.Add(A(workspaceId, m, null, AnomalyKind.NoInformation, "low",
                    "אין מידע לחודש זה — לא ניתן לקבוע אם בוצעה הפקדה.", DataConfidence.Low));
            }

            foreach (var line in row.Lines)
            {
                if (line.Expected is { } exp && line.Actual is { } act && act < exp - 0.01m)
                {
                    list.Add(A(workspaceId, m, line.Fund, AnomalyKind.LowContribution, "high",
                        $"הפקדה בפועל ({act:N0}) נמוכה מהצפוי ({exp:N0}) ב-{line.Code}.", DataConfidence.Medium));
                }
                if (line.Expected is not null && line.Actual is null && line.Reported is not null)
                {
                    list.Add(A(workspaceId, m, line.Fund, AnomalyKind.PayrollVsFundGap, "medium",
                        $"יש דיווח בתלוש ל-{line.Code} אך אין אישור מהקופה (בפועל = לא ידוע).", DataConfidence.Low));
                }
            }

            if (prev?.GrossSalary is { } ps && m.GrossSalary is { } gs && ps > 0)
            {
                var change = Math.Abs(gs - ps) / ps;
                if (change >= 0.25m)
                {
                    list.Add(A(workspaceId, m, null, AnomalyKind.UnusualChange, "medium",
                        $"שינוי חריג בשכר מ-{ps:N0} ל-{gs:N0} ₪.", DataConfidence.Medium));
                }
            }
            prev = m;
        }
        return list;
    }

    public static SourceMatrix BuildSourceMatrix(IReadOnlyList<EmploymentMonth> months)
    {
        var years = months.Select(m => m.Year).Distinct().OrderBy(y => y).ToList();
        var payroll = new Dictionary<int, decimal?>();
        var form106 = new Dictionary<int, decimal?>();
        var pension = new Dictionary<int, decimal?>();
        var study = new Dictionary<int, decimal?>();

        foreach (var y in years)
        {
            var ym = months.Where(m => m.Year == y).ToList();
            payroll[y] = SumYear(ym, m =>
                NullableAdd(m.EmployeePension.Reported, m.EmployerPension.Reported, m.EmployerCompensation.Reported,
                    m.TrainingFundEmployee.Reported, m.TrainingFundEmployer.Reported));
            form106[y] = ym.Any(m => (m.Flags ?? "").Contains("106", StringComparison.OrdinalIgnoreCase))
                ? payroll[y]
                : null;
            pension[y] = SumYear(ym, m =>
                NullableAdd(m.EmployeePension.Actual, m.EmployerPension.Actual, m.EmployerCompensation.Actual));
            study[y] = SumYear(ym, m =>
                NullableAdd(m.TrainingFundEmployee.Actual, m.TrainingFundEmployer.Actual));
        }

        return new SourceMatrix(
            years,
            years.Select(y => new YearAmount(y, payroll[y])).ToList(),
            years.Select(y => new YearAmount(y, form106[y])).ToList(),
            years.Select(y => new YearAmount(y, pension[y])).ToList(),
            years.Select(y => new YearAmount(y, study[y])).ToList());
    }

    private static decimal? SumYear(IReadOnlyList<EmploymentMonth> months, Func<EmploymentMonth, decimal?> pick)
    {
        decimal sum = 0;
        var any = false;
        foreach (var m in months)
        {
            var v = pick(m);
            if (v is null) continue;
            any = true;
            sum += v.Value;
        }
        return any ? sum : null;
    }

    private static LineReconciliation Line(string code, FundKind fund, ContributionTriplet t) =>
        new(code, fund, t.Expected, t.Reported, t.Actual, t.GapReportedVsExpected, t.GapActualVsExpected);

    private static DataConfidence DeriveConfidence(EmploymentMonth m, List<LineReconciliation> lines)
    {
        var hasActual = lines.Any(l => l.Actual is not null);
        var hasReported = lines.Any(l => l.Reported is not null);
        if (hasActual && hasReported) return DataConfidence.High;
        if (hasReported && (m.Flags ?? "").Contains("106", StringComparison.OrdinalIgnoreCase)) return DataConfidence.Medium;
        if (hasReported || m.GrossSalary is not null) return DataConfidence.Low;
        return DataConfidence.Unknown;
    }

    private static Anomaly A(Guid ws, EmploymentMonth m, FundKind? fund, AnomalyKind kind, string severity, string text, DataConfidence c) =>
        new(Guid.NewGuid(), ws, m.Year, m.Month, fund, kind, severity, text, c);

    private static decimal? SumNullable(IEnumerable<decimal?> values)
    {
        decimal sum = 0;
        var any = false;
        foreach (var v in values)
        {
            if (v is null) continue;
            any = true;
            sum += v.Value;
        }
        return any ? sum : null;
    }

    private static decimal? NullableAdd(params decimal?[] values)
    {
        decimal sum = 0;
        var any = false;
        foreach (var v in values)
        {
            if (v is null) continue;
            any = true;
            sum += v.Value;
        }
        return any ? sum : null;
    }
}

public sealed record LineReconciliation(
    string Code, FundKind Fund,
    decimal? Expected, decimal? Reported, decimal? Actual,
    decimal? GapReportedVsExpected, decimal? GapActualVsExpected);

public sealed record MonthReconciliation(
    int Year, int Month, bool HasAnyData, bool HasGap, bool HasUnknownActual,
    DataConfidence Confidence, IReadOnlyList<LineReconciliation> Lines);

public sealed record ReconciliationSummary(
    int TotalMonths, int MonthsWithData, int MonthsOk, int MonthsWithGap,
    int MonthsNoInfo, int MonthsUnknownActual,
    decimal? ExpectedTotal, decimal? ReportedTotal, decimal? ActualTotal, decimal? GapTotal,
    string? FirstGapMonth, string? LastGapMonth,
    HealthScoreResult Health, IReadOnlyList<MonthReconciliation> Months);

public sealed record SourceMatrix(
    IReadOnlyList<int> Years,
    IReadOnlyList<YearAmount> Payroll,
    IReadOnlyList<YearAmount> Form106,
    IReadOnlyList<YearAmount> Pension,
    IReadOnlyList<YearAmount> Study);

public sealed record YearAmount(int Year, decimal? Amount);

public static class HealthScoreCalculator
{
    /// <summary>Never return Healthy when coverage is too thin.</summary>
    public static HealthScoreResult Compute(decimal coverage, int monthsWithGap, int monthsNoInfo, int totalMonths)
    {
        if (totalMonths == 0 || coverage < 0.25m)
        {
            return new HealthScoreResult(HealthStatus.InsufficientData, coverage,
                "מצב: לא ניתן לקבוע — אין מספיק מידע על תקופת ההעסקה.");
        }
        if (monthsWithGap > 0)
        {
            return new HealthScoreResult(HealthStatus.GapsFound, coverage,
                "מצב: נמצאו פערים בין הצפוי לבין מה שדווח או הופקד בפועל.");
        }
        if (monthsNoInfo > totalMonths * 0.3m || coverage < 0.7m)
        {
            return new HealthScoreResult(HealthStatus.NeedsReview, coverage,
                "מצב: דורש בדיקה — חלק מהחודשים חסרים או לא מאומתים מול הקופה.");
        }
        return new HealthScoreResult(HealthStatus.Healthy, coverage,
            "מצב: תקין על בסיס המידע שסופק (הערכה, לא אישור סופי).");
    }
}

public sealed record HealthScoreResult(HealthStatus Status, decimal CoverageRatio, string MessageHe);
