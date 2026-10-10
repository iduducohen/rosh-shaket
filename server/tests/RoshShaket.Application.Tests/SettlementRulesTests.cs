using RoshShaket.Application.Calculation;
using RoshShaket.Application.Rules;
using RoshShaket.Domain;
using RoshShaket.Domain.Policies;
using Xunit;

namespace RoshShaket.Application.Tests;

/// <summary>
/// Unpaid leave, a section 14 arrangement that started late, the tax-exempt part of severance,
/// the vacation redemption ceiling, and the reminders around the final settlement.
/// </summary>
public class SettlementRulesTests
{
    private static readonly AnnualValues Values = new(new DateOnly(2026, 1, 1), 451.50m, 13750m);
    private static readonly DateOnly Start = new(2021, 3, 1);
    private static readonly DateOnly End = new(2026, 9, 28);

    private static RightsCalculator Calculator() => new(
        [new SeveranceRule(), new SeveranceTaxRule(), new NoticePeriodRule(), new VacationRedemptionRule(), new RecuperationRule(), new PensionFundsRule()],
        [new ExitReasonAdvisoryRule(), new PayTypeAdvisoryRule(), new SettlementAdvisoryRule()]);

    private static EmploymentProfile Profile(decimal salary = 16500m, Section14Arrangement s14 = Section14Arrangement.None,
        decimal vacation = 9m, decimal unpaidLeave = 0m, DateOnly? section14From = null, DateOnly? start = null, DateOnly? end = null) =>
        EmploymentProfile.Create(start ?? Start, end ?? End, salary, 100m, WorkWeek.FiveDays, vacation, 0m, s14, hasStudyFund: false,
            unpaidLeaveMonths: unpaidLeave, section14From: section14From);

    private static RightsComponent Line(EmploymentProfile p, string code, ExitReason reason = ExitReason.Fired) =>
        Calculator().Calculate(new RuleContext(p, reason, Values)).Components.Single(c => c.Code == code);

    [Fact]
    public void Unpaid_leave_beyond_14_days_a_year_is_not_counted_for_severance()
    {
        var worked = Profile();
        var withLeave = Profile(unpaidLeave: 12m);

        // Sixth year of work: 6 × 14 days are still counted, the rest of the year of leave is not.
        var expectedYears = (worked.Seniority.TotalDays - (365.25m - 84m)) / 365.25m;
        Assert.Equal(expectedYears, SeverancePolicy.CountedYears(withLeave.Seniority, 12m));
        Assert.Equal(Math.Round(16500m * expectedYears), Math.Round(Line(withLeave, "severance").Amount!.Value));
        Assert.Contains("חל\"ת", Line(withLeave, "severance").Explanation);
        Assert.True(Line(withLeave, "severance").Amount < Line(worked, "severance").Amount);
    }

    [Fact]
    public void A_short_unpaid_leave_changes_nothing()
    {
        Assert.Equal(Profile().Seniority.Years, SeverancePolicy.CountedYears(Profile().Seniority, 2m));   // 61 days < 84
    }

    [Fact]
    public void Section_14_that_started_late_leaves_full_severance_for_the_time_before()
    {
        var from = new DateOnly(2023, 3, 1);   // two of the 5.58 years came before the arrangement
        var before = (decimal)(from.DayNumber - Start.DayNumber) / (End.DayNumber - Start.DayNumber);
        var years = Profile().Seniority.Years;

        var full = Line(Profile(s14: Section14Arrangement.Full, section14From: from), "severance");
        Assert.Equal(Math.Round(16500m * years * before), Math.Round(full.Amount!.Value));
        Assert.True(full.IncludedInTotal);
        Assert.Contains("03/2023", full.Explanation);

        var partial = Line(Profile(s14: Section14Arrangement.Partial6, section14From: from), "severance");
        var topUp = (8.33m - 6m) / 8.33m;
        Assert.Equal(Math.Round(16500m * years * (before + (1 - before) * topUp)), Math.Round(partial.Amount!.Value));

        // From the first day, or with no arrangement, the date is ignored.
        Assert.Null(Profile(s14: Section14Arrangement.Full, section14From: Start).Section14From);
        Assert.Null(Profile(s14: Section14Arrangement.None, section14From: from).Section14From);
        Assert.Null(Line(Profile(s14: Section14Arrangement.Full), "severance").Amount);
    }

    [Fact]
    public void Severance_up_to_the_ceiling_is_tax_exempt_and_the_rest_is_shown_as_taxable()
    {
        var years = Profile().Seniority.Years;

        var below = Line(Profile(salary: 10000m), "severance-tax");
        Assert.Equal("פטור ממס", below.DisplayValue);
        Assert.False(below.IncludedInTotal);

        var above = Line(Profile(salary: 16500m), "severance-tax");
        Assert.Contains(Math.Round((16500m - 13750m) * years).ToString("N0"), above.DisplayValue);
        Assert.Contains("161א", above.Explanation);

        // The estimate stays gross: the tax line adds nothing to the total.
        var withTax = Calculator().Calculate(new RuleContext(Profile(), ExitReason.Fired, Values));
        Assert.Equal(withTax.Components.Where(c => c.IncludedInTotal).Sum(c => c.Amount ?? 0m), withTax.EstimatedTotal);
    }

    [Fact]
    public void The_tax_line_appears_only_when_there_is_severance_money()
    {
        var resignedNoFund = Calculator().Calculate(new RuleContext(Profile(), ExitReason.Resigned, Values));
        Assert.DoesNotContain(resignedNoFund.Components, c => c.Code == "severance-tax");

        var resignedWithFund = Calculator().Calculate(new RuleContext(Profile(s14: Section14Arrangement.Full), ExitReason.Resigned, Values));
        Assert.Contains(resignedWithFund.Components, c => c.Code == "severance-tax");
    }

    [Fact]
    public void A_vacation_balance_above_four_years_of_entitlement_is_flagged()
    {
        // Sixth year, five-day week: 14 + 12 + 12 + 12 = 50 days for the last three years and the current one.
        Assert.Equal(50, VacationPolicy.MaxRedeemableDays(Profile().Seniority, WorkWeek.FiveDays));

        Assert.Null(Line(Profile(vacation: 50m), "vacation").Flag);
        var over = Line(Profile(vacation: 60m), "vacation");
        Assert.Contains("50", over.Flag);
        Assert.Equal(Certainty.NeedsVerification, over.Certainty);
    }

    [Fact]
    public void Reminders_cover_a_dismissal_just_before_a_year_and_work_that_began_before_2008()
    {
        var elevenMonths = Profile(start: new DateOnly(2025, 10, 20), end: End);
        var advisories = Calculator().Calculate(new RuleContext(elevenMonths, ExitReason.Fired, Values)).Advisories;
        Assert.Contains(advisories, a => a.Contains("סמוך לסוף שנת העבודה הראשונה"));
        Assert.Contains(advisories, a => a.Contains("9 בחודש"));

        var veteran = Profile(s14: Section14Arrangement.Full, start: new DateOnly(2005, 1, 1));
        Assert.Contains(Calculator().Calculate(new RuleContext(veteran, ExitReason.Fired, Values)).Advisories, a => a.Contains("לפני 2008"));
        var dated = Profile(s14: Section14Arrangement.Full, start: new DateOnly(2005, 1, 1), section14From: new DateOnly(2008, 1, 1));
        Assert.DoesNotContain(Calculator().Calculate(new RuleContext(dated, ExitReason.Fired, Values)).Advisories, a => a.Contains("לפני 2008"));
    }

    [Fact]
    public void Impossible_values_are_rejected()
    {
        var ex = Assert.Throws<DomainValidationException>(() => Profile(unpaidLeave: 80m));
        Assert.Contains("unpaidLeaveMonths", ex.Errors.Keys);

        ex = Assert.Throws<DomainValidationException>(() => Profile(s14: Section14Arrangement.Full, section14From: End.AddDays(5)));
        Assert.Contains("section14From", ex.Errors.Keys);
    }
}
