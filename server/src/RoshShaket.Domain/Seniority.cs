namespace RoshShaket.Domain;

/// <summary>Length of employment. Value object, computed from dates only.</summary>
public readonly record struct Seniority(int TotalDays)
{
    private const decimal DaysPerYear = 365.25m;

    public decimal Years => TotalDays / DaysPerYear;
    public decimal Months => Years * 12m;
    public int CompletedMonths => (int)Math.Floor(Months);

    /// <summary>1 during the first year, 2 during the second, and so on.</summary>
    public int CurrentYearOfWork => Math.Max(1, (int)Math.Ceiling(Years));

    public static Seniority Between(DateOnly start, DateOnly end) => new(end.DayNumber - start.DayNumber);
}
