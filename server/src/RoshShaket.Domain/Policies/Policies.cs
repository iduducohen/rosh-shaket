namespace RoshShaket.Domain.Policies;

// Pure legal policies: no I/O, no formatting. Each one is a single, testable responsibility.

public readonly record struct NoticePeriod(int Days, bool IsFullMonth);

public static class NoticePeriodPolicy
{
    /// <summary>Notice for a monthly employee: 1 day per month for the first 6 months,
    /// 6 days + 2.5 per month for months 7–12, one month after a year.</summary>
    public static NoticePeriod ForMonthlyEmployee(Seniority seniority)
    {
        var m = seniority.CompletedMonths;
        if (m < 6) return new NoticePeriod(m, false);
        if (m < 12) return new NoticePeriod((int)Math.Round(6m + 2.5m * (m - 6), MidpointRounding.AwayFromZero), false);
        return new NoticePeriod(30, true);
    }

    /// <summary>Notice for an hourly / daily employee (Prior Notice Law, s. 4): 1 day per month in the first year;
    /// 14 days + 1 per two months in the second; 21 days + 1 per two months in the third; one month after three years.</summary>
    public static NoticePeriod ForHourlyEmployee(Seniority seniority)
    {
        var m = seniority.CompletedMonths;
        if (m < 12) return new NoticePeriod(m, false);
        if (m < 24) return new NoticePeriod(14 + (m - 12) / 2, false);
        if (m < 36) return new NoticePeriod(21 + (m - 24) / 2, false);
        return new NoticePeriod(30, true);
    }

    public static NoticePeriod For(PayType payType, Seniority seniority) =>
        payType == PayType.Hourly ? ForHourlyEmployee(seniority) : ForMonthlyEmployee(seniority);
}

/// <summary>How an hourly ("בשכר") employee's monthly figures are derived from the hourly rate and hours.</summary>
public static class HourlyPolicy
{
    /// <summary>A full-time month in the private sector (42 weekly hours).</summary>
    public const decimal FullTimeMonthlyHours = 182m;
    public const int MaxMonthlyHours = 300;

    /// <summary>
    /// Salary for severance: last hourly rate × average monthly hours over the whole employment
    /// (Severance Pay Regulations, reg. 7, as applied by the National Labour Court to changing hours).
    /// Hours above a full-time month are overtime, which is not part of the determining salary.
    /// </summary>
    public static decimal DeterminingSalary(decimal hourlyRate, decimal averageMonthlyHours) =>
        hourlyRate * Math.Min(averageMonthlyHours, FullTimeMonthlyHours);

    /// <summary>Job scope for recuperation pay: average monthly hours ÷ a full-time month, up to 100%.</summary>
    public static decimal JobPercent(decimal averageMonthlyHours) =>
        Math.Min(100m, Math.Round(averageMonthlyHours / FullTimeMonthlyHours * 100m, 2));
}

public static class RecuperationPolicy
{
    /// <summary>Private-sector recuperation days per year, by year of work.</summary>
    public static int DaysForYearOfWork(int yearOfWork) => yearOfWork switch
    {
        <= 1 => 5,
        <= 3 => 6,
        <= 10 => 7,
        <= 15 => 8,
        <= 19 => 9,
        _ => 10
    };

    public static bool IsEntitled(Seniority seniority) => seniority.Years >= 1m;

    /// <summary>After the employment ends, recuperation pay can be claimed for the last two years only.</summary>
    public const int MaxMonthsOwed = 24;

    /// <summary>
    /// Whole months of work not yet covered by a recuperation payment: from the last payment
    /// (or the start of work, when the payment date is earlier) to the end, up to two years.
    /// </summary>
    public static int MonthsOwed(DateOnly start, DateOnly lastPaid, DateOnly end)
    {
        var from = lastPaid < start ? start : lastPaid;
        var months = (end.Year - from.Year) * 12 + end.Month - from.Month - (end.Day < from.Day ? 1 : 0);
        return Math.Clamp(months, 0, MaxMonthsOwed);
    }
}

public static class SeverancePolicy
{
    public static bool IsEntitled(ExitReason reason, Seniority seniority) =>
        seniority.Years >= 1m && reason is ExitReason.Fired or ExitReason.ResignedJustified or ExitReason.ContractEnded;

    public static decimal FullEntitlement(decimal monthlySalary, Seniority seniority) => monthlySalary * seniority.Years;

    public static decimal FullEntitlement(decimal monthlySalary, decimal countedYears) => monthlySalary * countedYears;

    /// <summary>Unpaid leave of up to this many days a year still counts in the seniority (Severance Pay Regulations, reg. 10).</summary>
    public const int UnpaidLeaveDaysCountedPerYear = 14;

    private const decimal DaysPerMonth = 365.25m / 12m;

    /// <summary>
    /// Years counted for severance: unpaid leave keeps the continuity of work, but only the first
    /// 14 days of it in each year are counted. The yearly allowance is applied to the total, as an estimate.
    /// </summary>
    public static decimal CountedYears(Seniority seniority, decimal unpaidLeaveMonths)
    {
        if (unpaidLeaveMonths <= 0m) return seniority.Years;
        var allowance = UnpaidLeaveDaysCountedPerYear * Math.Ceiling(seniority.Years);
        var notCounted = Math.Max(0m, unpaidLeaveMonths * DaysPerMonth - allowance);
        return Math.Max(0m, seniority.TotalDays - notCounted) / 365.25m;
    }

    /// <summary>Part of the employment (0–1) that came before section 14 applied. 0 when it applied from the start.</summary>
    public static decimal ShareBeforeSection14(DateOnly start, DateOnly end, DateOnly? section14From)
    {
        if (section14From is not { } from || from <= start) return 0m;
        var total = end.DayNumber - start.DayNumber;
        if (total <= 0) return 0m;
        var before = Math.Min(from.DayNumber, end.DayNumber) - start.DayNumber;
        return (decimal)before / total;
    }

    /// <summary>
    /// The tax-exempt part of statutory severance: one month's salary per year of work,
    /// and no more than the yearly ceiling (Income Tax Ordinance s. 9(7a)).
    /// </summary>
    public static decimal TaxExempt(decimal monthlySalary, decimal countedYears, decimal ceilingPerYear) =>
        Math.Min(monthlySalary, ceilingPerYear) * countedYears;

    /// <summary>Share of the full entitlement the employer still pays at exit, given the section 14 arrangement.</summary>
    public static decimal EmployerTopUpShare(Section14Arrangement arrangement, decimal fullRatePercent) => arrangement switch
    {
        Section14Arrangement.Full => 0m,
        Section14Arrangement.Partial6 => (fullRatePercent - 6m) / fullRatePercent,
        Section14Arrangement.None => 1m,
        _ => throw new InvalidOperationException("Unknown arrangement has no single share; present a range instead.")
    };
}

public static class VacationPolicy
{
    /// <summary>Annual vacation by year of work, in work days (Annual Leave Law). Index 0 = first year.</summary>
    private static readonly int[] FiveDayWeek = [12, 12, 12, 12, 12, 14, 15, 16, 17, 18, 19, 20];
    private static readonly int[] SixDayWeek = [14, 14, 14, 14, 14, 16, 18, 19, 20, 21, 22, 23, 24];

    public static int AnnualDays(int yearOfWork, WorkWeek workWeek)
    {
        var table = (int)workWeek == 6 ? SixDayWeek : FiveDayWeek;
        return table[Math.Clamp(yearOfWork, 1, table.Length) - 1];
    }

    /// <summary>Unused vacation can be claimed for the last three years and the current one.</summary>
    public const int YearsRedeemable = 4;

    /// <summary>The most days the law lets an employee redeem at the legal minimum, by seniority.</summary>
    public static int MaxRedeemableDays(Seniority seniority, WorkWeek workWeek)
    {
        var current = seniority.CurrentYearOfWork;
        var days = 0;
        for (var year = current; year > current - YearsRedeemable && year >= 1; year--) days += AnnualDays(year, workWeek);
        return days;
    }
}

public static class DailyWagePolicy
{
    public static decimal FromMonthly(decimal monthlySalary, WorkWeek workWeek) =>
        monthlySalary / ((int)workWeek == 6 ? 25m : (int)workWeek * 21.67m / 5m);
}
