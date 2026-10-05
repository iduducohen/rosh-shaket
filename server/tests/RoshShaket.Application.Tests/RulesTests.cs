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

    private static EmploymentProfile DemoPaidRecuperationOn(DateOnly lastPaid) =>
        EmploymentProfile.Create(new DateOnly(2021, 3, 1), new DateOnly(2026, 9, 28), 16500m, 100m,
            WorkWeek.FiveDays, 9m, 0m, Section14Arrangement.Partial6, hasStudyFund: true, lastRecuperationPaid: lastPaid);

    [Fact]
    public void Recuperation_since_the_last_payment_is_the_relative_part_of_the_year()
    {
        var r = Calculator().Calculate(new RuleContext(DemoPaidRecuperationOn(new DateOnly(2026, 7, 1)), ExitReason.Fired, Values));
        var rec = r.Components.Single(c => c.Code == "recuperation");

        // Sixth year of work = 7 days; 2 months of 12 since July.
        Assert.Equal(Math.Round(7m * 2m / 12m * 418m, 2), Math.Round(rec.Amount!.Value, 2));
        Assert.Contains("2 חודשים מתוך 12", rec.Explanation);
        Assert.Null(rec.Flag);
    }

    [Fact]
    public void Recuperation_never_paid_is_owed_for_two_years_at_most()
    {
        var r = Calculator().Calculate(new RuleContext(DemoPaidRecuperationOn(new DateOnly(2019, 1, 1)), ExitReason.Fired, Values));
        var rec = r.Components.Single(c => c.Code == "recuperation");

        Assert.Equal(7m * 2m * 418m, rec.Amount);
        Assert.NotNull(rec.Flag);
    }

    [Theory]
    [InlineData("2025-09-28", 12)]
    [InlineData("2026-08-29", 0)]   // less than a whole month
    [InlineData("2026-09-28", 0)]
    [InlineData("2020-01-01", 24)]  // before the start of work: counted from the start, capped at two years
    public void Recuperation_months_owed(string lastPaid, int months) =>
        Assert.Equal(months, RecuperationPolicy.MonthsOwed(new DateOnly(2021, 3, 1), DateOnly.Parse(lastPaid), new DateOnly(2026, 9, 28)));

    [Fact]
    public void Recuperation_paid_after_the_end_date_is_rejected()
    {
        var ex = Assert.Throws<DomainValidationException>(() => DemoPaidRecuperationOn(new DateOnly(2026, 10, 1)));
        Assert.Contains("lastRecuperationPaid", ex.Errors.Keys);
    }

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
        Assert.True(draft.Readable);
        Assert.Contains("startDate", draft.Missing);
        Assert.Empty(draft.Funds);
    }

    [Fact]
    public void Payslip_fund_rows_fill_study_fund_and_section14()
    {
        var funds = new[]
        {
            new FundLine("pension", "מנורה", 6m, 6.5m, "percent", "פוליסה 123"),
            new FundLine("severance", "מנורה", 0m, 8.33m, "percent", null),
            new FundLine("disability", "מנורה", null, 2.5m, "percent", null),
            new FundLine("study", "אלטשולר", 2.5m, 7.5m, "percent", null)
        };
        var draft = PayslipMapper.ToDraft(new PayslipExtraction(
            true, "2026-08", new DateOnly(2016, 1, 1), 16500m, 100m, 5, 11.04m, 1m, null, null, true, funds));

        Assert.Equal(11.04m, draft.VacationBalanceDays);
        Assert.Equal(1m, draft.RecuperationDaysPaidLastYear);
        Assert.Equal(Section14Arrangement.Full, draft.Section14Suggestion);
        Assert.True(draft.HasStudyFund);
        Assert.Equal(4, draft.Funds.Count);
        Assert.Contains("pension", draft.Filled);
        Assert.Contains("study", draft.Filled);
    }
}
