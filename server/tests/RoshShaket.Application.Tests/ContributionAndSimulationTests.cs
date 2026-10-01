using RoshShaket.Application.EmploymentReview;
using RoshShaket.Application.Reconciliation;
using RoshShaket.Application.Rules.Contribution;
using RoshShaket.Application.Simulation;
using RoshShaket.Domain.Employment;
using Xunit;

namespace RoshShaket.Application.Tests;

public class ContributionAndSimulationTests
{
    private static (EmploymentReviewHandlers Handlers, ContributionRulesEngine Rules) Create()
    {
        var rules = new ContributionRulesEngine(new StaticContributionRuleProvider());
        var handlers = new EmploymentReviewHandlers(new InMemoryEmploymentReviewStore(), rules);
        return (handlers, rules);
    }

    [Fact]
    public async Task Rules_change_by_effective_date()
    {
        var (_, engine) = Create();
        var early = await engine.RuleForAsync(new DateOnly(2015, 6, 1), default);
        var late = await engine.RuleForAsync(new DateOnly(2020, 6, 1), default);
        Assert.NotNull(early);
        Assert.NotNull(late);
        Assert.Equal(5.0m, early!.PensionEmployeeRate);
        Assert.Equal(6.0m, late!.PensionEmployeeRate);
        Assert.Equal(8.33m, late.CompensationRate);
    }

    [Fact]
    public async Task Expected_uses_salary_and_rates()
    {
        var (_, engine) = Create();
        var exp = await engine.ComputeExpectedAsync(10000m, new DateOnly(2022, 1, 1), default);
        Assert.Equal(600m, exp.EmployeePension);
        Assert.Equal(650m, exp.EmployerPension);
        Assert.Equal(833m, exp.Compensation);
    }

    [Fact]
    public async Task Salary_schedule_and_mid_year_change()
    {
        var (handlers, _) = Create();
        var ws = Guid.NewGuid();
        await handlers.SetPeriodAsync(new UpsertPeriodRequest(ws, null,
            new DateOnly(2022, 1, 1), new DateOnly(2022, 12, 31), true, null, false, false, null), default);
        await handlers.ApplySalaryAsync(ws,
        [
            new SalarySegmentDto(new DateOnly(2022, 1, 1), new DateOnly(2022, 6, 30), 10000m, 10000m),
            new SalarySegmentDto(new DateOnly(2022, 7, 1), null, 12000m, 12000m)
        ], default);
        var c = await handlers.GetOrCreateAsync(ws, default);
        Assert.Equal(10000m, c.Months.First(m => m.Month == 3).GrossSalary);
        Assert.Equal(12000m, c.Months.First(m => m.Month == 8).GrossSalary);
    }

    [Fact]
    public void Unknown_actual_is_not_zero_gap()
    {
        var month = new EmploymentMonth(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), 2022, 3,
            10000m, 10000m,
            new ContributionTriplet(600m, 600m, null),
            new ContributionTriplet(650m, 650m, null),
            new ContributionTriplet(0m, 0m, null),
            new ContributionTriplet(833m, 833m, null),
            new ContributionTriplet(250m, 250m, null),
            new ContributionTriplet(750m, 750m, null),
            null, null, null, null, null, DataConfidence.Low, null);

        var row = ReconciliationEngine.ReconcileMonth(month);
        Assert.True(row.HasUnknownActual);
        Assert.Null(row.Lines[0].GapActualVsExpected);
        Assert.False(row.HasGap); // unknown is not a numeric gap
    }

    [Fact]
    public void Simulation_compounds_per_deposit_not_lump_sum()
    {
        var early = new List<MonthlyContribution> { new(2017, 1, 1000m) };
        var late = new List<MonthlyContribution> { new(2025, 1, 1000m) };
        // Grow both to end of 2025 with same returns — early should be higher
        var earlyPts = new List<MonthlyContribution>(early);
        for (var y = 2017; y <= 2025; y++)
        for (var m = (y == 2017 ? 2 : 1); m <= (y == 2025 ? 1 : 12); m++)
            if (!(y == 2025 && m == 1)) earlyPts.Add(new MonthlyContribution(y, m, 0));

        var latePts = new List<MonthlyContribution>();
        for (var y = 2017; y <= 2025; y++)
        for (var m = 1; m <= 12; m++)
        {
            if (y == 2025 && m == 1) latePts.Add(new(2025, 1, 1000m));
            else latePts.Add(new(y, m, 0));
        }

        var a = SimulationEngine.Run(earlyPts, 5m, 0.5m, "early");
        var b = SimulationEngine.Run(latePts, 5m, 0.5m, "late");
        Assert.True(a.EstimatedBalance > b.EstimatedBalance);
    }

    [Fact]
    public void Health_score_insufficient_when_sparse()
    {
        var h = HealthScoreCalculator.Compute(0.1m, 0, 100, 120);
        Assert.Equal(HealthStatus.InsufficientData, h.Status);
        Assert.Contains("לא ניתן לקבוע", h.MessageHe);
    }

    [Fact]
    public async Task Demo_dataset_detects_gaps_and_unknown()
    {
        var (handlers, rules) = Create();
        var demo = await DemoEmploymentDataset.BuildAsync(handlers, rules, Guid.NewGuid(), default);
        Assert.Equal(120, demo.Months.Count);

        var summary = ReconciliationEngine.Summarize(demo.Months);
        Assert.True(summary.MonthsWithGap > 0);
        Assert.True(summary.MonthsNoInfo > 0 || summary.MonthsUnknownActual > 0);

        var anomalies = ReconciliationEngine.DetectAnomalies(demo.WorkspaceId, demo.Months);
        Assert.Contains(anomalies, a => a.Kind == AnomalyKind.LowContribution);
        Assert.Contains(anomalies, a => a.Kind is AnomalyKind.NoInformation or AnomalyKind.PayrollVsFundGap);

        var (contrib, _) = SimulationEngine.FromMonths(demo.Months);
        var sims = SimulationEngine.RunScenarios(contrib, DefaultSimulationAssumptions.Current);
        Assert.Equal(3, sims.Count);
        Assert.True(sims.Single(s => s.Scenario == "Optimistic").EstimatedBalance
            >= sims.Single(s => s.Scenario == "Conservative").EstimatedBalance);
    }

    [Fact]
    public async Task Partial_actual_creates_negative_gap()
    {
        var (handlers, _) = Create();
        var ws = Guid.NewGuid();
        await handlers.SetPeriodAsync(new UpsertPeriodRequest(ws, null,
            new DateOnly(2022, 1, 1), new DateOnly(2022, 1, 31), true, null, false, false, null), default);
        await handlers.ApplySalaryAsync(ws, [new SalarySegmentDto(new DateOnly(2022, 1, 1), null, 15000m, 15000m)], default);
        await handlers.RecalculateExpectedAsync(ws, default);
        var c = await handlers.GetOrCreateAsync(ws, default);
        var m = c.Months[0];
        await handlers.PatchMonthsAsync(ws, [new PatchMonthRequest(
            2022, 1, 15000m, 15000m,
            m.EmployeePension.Expected, m.EmployerPension.Expected, m.EmployerCompensation.Expected,
            m.TrainingFundEmployee.Expected, m.TrainingFundEmployer.Expected,
            m.EmployeePension.Expected,
            (m.EmployerPension.Expected ?? 0) * 0.5m,
            m.EmployerCompensation.Expected,
            m.TrainingFundEmployee.Expected, m.TrainingFundEmployer.Expected, null)], default);
        c = await handlers.RecalculateExpectedAsync(ws, default);
        var summary = ReconciliationEngine.Summarize(c.Months);
        Assert.Equal(1, summary.MonthsWithGap);
        Assert.True(summary.GapTotal < 0);
    }
}
