using RoshShaket.Application.Calculation;
using RoshShaket.Application.Payslips;
using RoshShaket.Application.Rules;
using RoshShaket.Domain;
using RoshShaket.Domain.Policies;
using Xunit;

namespace RoshShaket.Application.Tests;

/// <summary>
/// An employee paid by the hour ("עובד בשכר"): Prior Notice Law s. 4, Severance Pay Regulations reg. 7
/// (determining salary = last rate × average monthly hours), and job scope out of 182 monthly hours.
/// </summary>
public class HourlyEmployeeTests
{
    private static readonly AnnualValues Values = new(new DateOnly(2025, 1, 1), 418m, 13750m);
    private static readonly DateOnly Start = new(2022, 1, 1);

    private static RightsCalculator Calculator() => new(
        [new SeveranceRule(), new NoticePeriodRule(), new VacationRedemptionRule(), new RecuperationRule(), new PensionFundsRule()],
        [new ExitReasonAdvisoryRule(), new PayTypeAdvisoryRule()]);

    private static EmploymentProfile Hourly(decimal rate, decimal hours, DateOnly? end = null) =>
        EmploymentProfile.Create(Start, end ?? new DateOnly(2025, 1, 1), 0m, 0m, WorkWeek.FiveDays, 10m, 0m,
            Section14Arrangement.None, hasStudyFund: false, PayType.Hourly, rate, hours);

    [Theory]
    [InlineData(5, 5, false)]    // first year: a day per month
    [InlineData(11, 11, false)]
    [InlineData(12, 14, false)]  // second year: 14 days + a day per two months
    [InlineData(18, 17, false)]
    [InlineData(23, 19, false)]
    [InlineData(24, 21, false)]  // third year: 21 days + a day per two months
    [InlineData(30, 24, false)]
    [InlineData(36, 30, true)]   // after three years: a month
    public void Notice_follows_the_hourly_table(int monthsWorked, int days, bool fullMonth)
    {
        var seniority = Seniority.Between(Start, Start.AddMonths(monthsWorked).AddDays(3));

        Assert.Equal(new NoticePeriod(days, fullMonth), NoticePeriodPolicy.ForHourlyEmployee(seniority));
    }

    [Fact]
    public void A_monthly_employee_with_the_same_seniority_gets_a_different_notice()
    {
        var eighteenMonths = Seniority.Between(Start, Start.AddMonths(18).AddDays(3));

        Assert.True(NoticePeriodPolicy.For(PayType.Monthly, eighteenMonths).IsFullMonth);
        Assert.Equal(17, NoticePeriodPolicy.For(PayType.Hourly, eighteenMonths).Days);
    }

    [Fact]
    public void Severance_uses_the_last_rate_times_average_monthly_hours()
    {
        var p = Hourly(rate: 50m, hours: 120m);

        Assert.Equal(6000m, p.MonthlySalary);
        Assert.Equal(65.93m, p.JobPercent);

        var r = Calculator().Calculate(new RuleContext(p, ExitReason.Fired, Values));
        var severance = r.Components.Single(c => c.Code == "severance");
        Assert.InRange(severance.Amount!.Value, 18000m, 18010m);   // 6,000 × 3 years
        Assert.Contains("תעריף", severance.Explanation);
        Assert.Contains(r.Advisories, a => a.Contains("שעתי"));
    }

    [Fact]
    public void Hours_above_a_full_time_month_are_overtime_and_stay_out_of_the_determining_salary()
    {
        var p = Hourly(rate: 50m, hours: 200m);

        Assert.Equal(50m * 182m, p.MonthlySalary);
        Assert.Equal(100m, p.JobPercent);
        var r = Calculator().Calculate(new RuleContext(p, ExitReason.Fired, Values));
        Assert.Contains(r.Advisories, a => a.Contains("שעות נוספות"));
    }

    [Fact]
    public void An_hourly_profile_needs_a_rate_and_hours_but_no_monthly_salary()
    {
        var ex = Assert.Throws<DomainValidationException>(() => Hourly(rate: 0m, hours: 0m));

        Assert.Contains("hourlyRate", ex.Errors.Keys);
        Assert.Contains("averageMonthlyHours", ex.Errors.Keys);
        Assert.DoesNotContain("monthlySalary", ex.Errors.Keys);
    }

    [Fact]
    public void A_payslip_with_an_hourly_rate_prefills_an_hourly_profile()
    {
        var hourly = PayslipMapper.ToDraft(new PayslipExtraction(true, "2025-01", null, null, null, 5, null, null, null, null,
            HourlyRate: 45m, HoursWorked: 130m));
        Assert.Equal(PayType.Hourly, hourly.PayType);
        Assert.Equal(45m, hourly.HourlyRate);
        Assert.Equal(130m, hourly.MonthlyHours);
        Assert.DoesNotContain("monthlySalary", hourly.Missing);

        var monthly = PayslipMapper.ToDraft(new PayslipExtraction(true, "2025-01", null, 12000m, 100m, 5, null, null, null, null));
        Assert.Equal(PayType.Monthly, monthly.PayType);
        Assert.Null(monthly.HourlyRate);
    }
}
