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
}

public static class SeverancePolicy
{
    public static bool IsEntitled(ExitReason reason, Seniority seniority) =>
        seniority.Years >= 1m && reason is ExitReason.Fired or ExitReason.ResignedJustified or ExitReason.ContractEnded;

    public static decimal FullEntitlement(decimal monthlySalary, Seniority seniority) => monthlySalary * seniority.Years;

    /// <summary>Share of the full entitlement the employer still pays at exit, given the section 14 arrangement.</summary>
    public static decimal EmployerTopUpShare(Section14Arrangement arrangement, decimal fullRatePercent) => arrangement switch
    {
        Section14Arrangement.Full => 0m,
        Section14Arrangement.Partial6 => (fullRatePercent - 6m) / fullRatePercent,
        Section14Arrangement.None => 1m,
        _ => throw new InvalidOperationException("Unknown arrangement has no single share; present a range instead.")
    };
}

public static class DailyWagePolicy
{
    public static decimal FromMonthly(decimal monthlySalary, WorkWeek workWeek) =>
        monthlySalary / ((int)workWeek == 6 ? 25m : (int)workWeek * 21.67m / 5m);
}
