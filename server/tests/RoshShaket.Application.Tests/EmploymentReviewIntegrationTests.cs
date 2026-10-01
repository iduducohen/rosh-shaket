using RoshShaket.Application.EmploymentReview;
using RoshShaket.Application.Reconciliation;
using RoshShaket.Application.Reports;
using RoshShaket.Application.Rules.Contribution;
using RoshShaket.Application.Simulation;
using RoshShaket.Domain.Employment;
using Xunit;

namespace RoshShaket.Application.Tests;

/// <summary>Full demo path: 10 years → analyze → gaps → simulate → report.</summary>
public class EmploymentReviewIntegrationTests
{
    [Fact]
    public async Task Ten_year_demo_end_to_end()
    {
        var rules = new ContributionRulesEngine(new StaticContributionRuleProvider());
        var handlers = new EmploymentReviewHandlers(new InMemoryEmploymentReviewStore(), rules);
        var demo = await DemoEmploymentDataset.BuildAsync(handlers, rules, Guid.NewGuid());

        Assert.Equal(120, demo.Months.Count);
        Assert.Contains(demo.Documents, d => d.DocumentType == "payslip");
        Assert.Contains(demo.Funds, f => f.Kind == FundKind.Pension && f.Balance > 0);

        var summary = ReconciliationEngine.Summarize(demo.Months);
        Assert.True(summary.MonthsWithGap >= 1);
        Assert.True(summary.Health.Status is HealthStatus.GapsFound or HealthStatus.NeedsReview or HealthStatus.InsufficientData);

        var anomalies = ReconciliationEngine.DetectAnomalies(demo.WorkspaceId, demo.Months);
        Assert.NotEmpty(anomalies);

        var (contrib, usedEstimates) = SimulationEngine.FromMonths(demo.Months);
        Assert.NotEmpty(contrib);
        var sims = SimulationEngine.RunScenarios(contrib, DefaultSimulationAssumptions.Current);
        Assert.Equal(3, sims.Count);
        Assert.True(sims[2].EstimatedBalance >= sims[0].EstimatedBalance);

        var matrix = ReconciliationEngine.BuildSourceMatrix(demo.Months);
        Assert.Contains(2016, matrix.Years);
        Assert.Contains(2025, matrix.Years);

        var report = new ReconciliationReportBuilder().Build(demo, summary, anomalies, sims, matrix);
        Assert.Contains("הערכה", report.DisclaimerHe);
        Assert.NotEmpty(report.MissingDocuments);
        var html = new ReconciliationReportBuilder().ToHtml(report);
        Assert.Contains("דוח", html);
        _ = usedEstimates;
    }
}
