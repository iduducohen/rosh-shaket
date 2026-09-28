using RoshShaket.Application.Calculation;
using RoshShaket.Application.Payslips;
using RoshShaket.Application.Rules;
using RoshShaket.Domain;
using RoshShaket.Domain.Policies;
using Xunit;

namespace RoshShaket.Application.Tests;

// Reference cases. Before MVP, add ~10 real cases approved by a labor lawyer or payroll accountant.
public class RulesTests
{
    private static readonly AnnualValues Values = new(new DateOnly(2025, 1, 1), 418m, 13750m);

    private static RightsCalculator Calculator() => new(
        [new SeveranceRule(), new NoticePeriodRule(), new VacationRedemptionRule(), new RecuperationRule(), new PensionFundsRule()],
        [new ExitReasonAdvisoryRule(), new PayTypeAdvisoryRule()]);

    private static EmploymentProfile Demo(Section14Arrangement s14 = Section14Arrangement.Partial6) =>
        EmploymentProfile.Create(new DateOnly(2021, 3, 1), new DateOnly(2026, 9, 28), 16500m, 100m,
            WorkWeek.FiveDays, 9m, 0m, s14, hasStudyFund: true);

    [Fact]
    public void Fired_with_6_percent_section14_totals_top_up_vacation_and_recuperation()
    {
        var r = Calculator().Calculate(new RuleContext(Demo(), ExitReason.Fired, Values));
        Assert.Equal(35518m, Math.Round(r.EstimatedTotal));
        Assert.Equal(25739m, Math.Round(r.Components.Single(c => c.Code == "severance").Amount!.Value));
    }

    [Fact]
    public void Resigned_gets_no_severance_from_employer()
    {
        var r = Calculator().Calculate(new RuleContext(Demo(), ExitReason.Resigned, Values));
        var sev = r.Components.Single(c => c.Code == "severance");
        Assert.False(sev.IncludedInTotal);
        Assert.Contains(r.Advisories, a => a.Contains("90"));
    }

    [Fact]
    public void Full_section14_means_no_top_up()
    {
        var r = Calculator().Calculate(new RuleContext(Demo(Section14Arrangement.Full), ExitReason.Fired, Values));
        Assert.Null(r.Components.Single(c => c.Code == "severance").Amount);
    }

    [Fact]
    public void Unknown_section14_is_flagged_not_summed()
    {
        var r = Calculator().Calculate(new RuleContext(Demo(Section14Arrangement.Unknown), ExitReason.Fired, Values));
        var sev = r.Components.Single(c => c.Code == "severance");
        Assert.Equal(Certainty.NeedsVerification, sev.Certainty);
        Assert.False(sev.IncludedInTotal);
    }

    [Fact]
    public void Under_one_year_no_severance_and_no_recuperation()
    {
        var p = EmploymentProfile.Create(new DateOnly(2026, 1, 1), new DateOnly(2026, 9, 1), 12000m, 100m,
            WorkWeek.FiveDays, 3m, 0m, Section14Arrangement.None, false);
        var r = Calculator().Calculate(new RuleContext(p, ExitReason.Fired, Values));
        Assert.Null(r.Components.Single(c => c.Code == "severance").Amount);
        Assert.Null(r.Components.Single(c => c.Code == "recuperation").Amount);
    }

    [Theory]
    [InlineData(90, 2, false)]
    [InlineData(200, 6, false)]
    [InlineData(300, 14, false)]
    [InlineData(400, 30, true)]
    public void Notice_period_for_monthly_employee(int days, int expected, bool fullMonth)
    {
        var n = NoticePeriodPolicy.ForMonthlyEmployee(new Seniority(days));
        Assert.Equal(expected, n.Days);
        Assert.Equal(fullMonth, n.IsFullMonth);
    }

    [Theory]
    [InlineData(1, 5)] [InlineData(3, 6)] [InlineData(10, 7)] [InlineData(15, 8)] [InlineData(19, 9)] [InlineData(25, 10)]
    public void Recuperation_days_by_year_of_work(int year, int days) =>
        Assert.Equal(days, RecuperationPolicy.DaysForYearOfWork(year));

    [Fact]
    public void Invalid_profile_throws_with_field_errors()
    {
        var ex = Assert.Throws<DomainValidationException>(() => EmploymentProfile.Create(
            new DateOnly(2026, 1, 1), new DateOnly(2025, 1, 1), 0m, 100m, WorkWeek.FiveDays, 0, 0, Section14Arrangement.None, false));
        Assert.Contains("endDate", ex.Errors.Keys);
        Assert.Contains("monthlySalary", ex.Errors.Keys);
    }

    [Fact]
    public void Payslip_severance_rate_maps_to_section14_suggestion()
    {
        var draft = PayslipMapper.ToDraft(new PayslipExtraction(true, "2026-08", null, 16500m, 100m, 5, 9m, null, 6m, true));
        Assert.Equal(Section14Arrangement.Partial6, draft.Section14Suggestion);
        Assert.Contains("startDate", draft.Missing);
    }
}
