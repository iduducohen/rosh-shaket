using RoshShaket.Application.EmploymentReview;
using RoshShaket.Application.Rules.Contribution;
using RoshShaket.Domain.Employment;

namespace RoshShaket.Application.EmploymentReview;

/// <summary>Mandatory 10-year demo: 2016–2025 with intentional gaps, partial deposits, and unknown months.</summary>
public static class DemoEmploymentDataset
{
    public static readonly Guid DemoWorkspaceId = Guid.Parse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");

    public static IReadOnlyList<SalarySegmentDto> SalarySegments { get; } =
    [
        new(new DateOnly(2016, 1, 1), new DateOnly(2016, 12, 31), 8000m, 8000m),
        new(new DateOnly(2017, 1, 1), new DateOnly(2017, 12, 31), 8500m, 8500m),
        new(new DateOnly(2018, 1, 1), new DateOnly(2018, 12, 31), 9500m, 9500m),
        new(new DateOnly(2019, 1, 1), new DateOnly(2019, 12, 31), 10500m, 10500m),
        new(new DateOnly(2020, 1, 1), new DateOnly(2020, 12, 31), 11500m, 11500m),
        new(new DateOnly(2021, 1, 1), new DateOnly(2021, 12, 31), 13000m, 13000m),
        new(new DateOnly(2022, 1, 1), new DateOnly(2022, 12, 31), 15000m, 15000m),
        new(new DateOnly(2023, 1, 1), new DateOnly(2023, 12, 31), 16500m, 16500m),
        new(new DateOnly(2024, 1, 1), new DateOnly(2024, 12, 31), 18000m, 18000m),
        new(new DateOnly(2025, 1, 1), new DateOnly(2025, 12, 31), 20000m, 20000m)
    ];

    public static async Task<EmploymentReviewCase> BuildAsync(
        EmploymentReviewHandlers handlers,
        ContributionRulesEngine rules,
        Guid? workspaceId = null,
        CancellationToken ct = default)
    {
        var ws = workspaceId ?? DemoWorkspaceId;
        await handlers.SetPeriodAsync(new UpsertPeriodRequest(
            ws, "חברת הדגמה בע״מ",
            new DateOnly(2016, 1, 1), new DateOnly(2025, 12, 31),
            true, "Fired", false, false, "Dataset הדגמה — לא נתונים אמיתיים"), ct);

        await handlers.ApplySalaryAsync(ws, SalarySegments, ct);
        var withExpected = await handlers.RecalculateExpectedAsync(ws, ct);

        var patches = new List<PatchMonthRequest>();
        foreach (var m in withExpected.Months)
        {
            var expEmp = m.EmployeePension.Expected ?? 0;
            var expEr = m.EmployerPension.Expected ?? 0;
            var expSev = m.EmployerCompensation.Expected ?? 0;
            var expTe = m.TrainingFundEmployee.Expected ?? 0;
            var expTr = m.TrainingFundEmployer.Expected ?? 0;

            // Default: reported = expected, actual = expected (healthy)
            decimal? repEmp = expEmp, repEr = expEr, repSev = expSev, repTe = expTe, repTr = expTr;
            decimal? actEmp = expEmp, actEr = expEr, actSev = expSev, actTe = expTe, actTr = expTr;
            string? flags = null;

            // Intentional anomalies
            if (m.Year == 2018 && m.Month == 3)
            {
                // Missing deposit entirely in fund
                actEmp = 0; actEr = 0; actSev = 0; actTe = 0; actTr = 0;
            }
            else if (m.Year == 2020 && m.Month == 4)
            {
                // Partial actual
                actEmp = Round(expEmp * 0.5m);
                actEr = Round(expEr * 0.5m);
                actSev = Round(expSev * 0.5m);
            }
            else if (m.Year == 2022 && m.Month == 2)
            {
                // Partial actual pension
                actEmp = expEmp; actEr = Round(expEr * 0.7m); actSev = expSev;
            }
            else if (m.Year == 2023 && m.Month is 7 or 8)
            {
                // No information month — clear salary too? Keep salary but no report/actual
                repEmp = repEr = repSev = repTe = repTr = null;
                actEmp = actEr = actSev = actTe = actTr = null;
            }
            else if (m.Year == 2024 && m.Month == 11)
            {
                // Reported but unknown actual
                actEmp = actEr = actSev = actTe = actTr = null;
                flags = "106";
            }

            patches.Add(new PatchMonthRequest(
                m.Year, m.Month, m.GrossSalary, m.PensionableSalary,
                repEmp, repEr, repSev, repTe, repTr,
                actEmp, actEr, actSev, actTe, actTr, flags));
        }

        var patched = await handlers.PatchMonthsAsync(ws, patches, ct);
        // Re-apply expected after patches (patch keeps expected)
        patched = await handlers.RecalculateExpectedAsync(ws, ct);

        await handlers.SetFundsAsync(ws,
        [
            new FundAccount(Guid.NewGuid(), ws, FundKind.Pension, 480000m, new DateOnly(2025, 12, 31), "קרן הדגמה", 0.5m, 5.2m, "מניות", DataConfidence.Medium),
            new FundAccount(Guid.NewGuid(), ws, FundKind.Study, 95000m, new DateOnly(2025, 12, 31), "השתלמות הדגמה", 0.6m, 4.8m, "כללי", DataConfidence.Medium),
            new FundAccount(Guid.NewGuid(), ws, FundKind.Severance, 210000m, new DateOnly(2025, 12, 31), "פיצויים בקופה", 0.5m, 5.0m, null, DataConfidence.Low)
        ], ct);

        await handlers.AddDocumentMetaAsync(ws, new ReviewDocumentMeta(
            Guid.NewGuid(), "payslip", 2025, 12, "demo", true, "תלוש אחרון — שכר 20,000", false), ct);
        await handlers.AddDocumentMetaAsync(ws, new ReviewDocumentMeta(
            Guid.NewGuid(), "form106", 2024, null, "demo", true, "טופס 106 לשנת 2024", false), ct);
        await handlers.AddDocumentMetaAsync(ws, new ReviewDocumentMeta(
            Guid.NewGuid(), "pension_report", 2025, 12, "demo", true, "יתרת פנסיה 480,000", false), ct);

        _ = rules;
        return (await handlers.GetOrCreateAsync(ws, ct));
    }

    private static decimal Round(decimal v) => Math.Round(v, 2, MidpointRounding.AwayFromZero);
}
