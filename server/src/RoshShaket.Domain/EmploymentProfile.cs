namespace RoshShaket.Domain;

/// <summary>Everything the rules need about one employment. Created only through <see cref="Create"/>, so it is always valid.</summary>
public sealed record EmploymentProfile
{
    public DateOnly StartDate { get; }
    public DateOnly EndDate { get; }
    public decimal MonthlySalary { get; }
    public decimal JobPercent { get; }
    public WorkWeek WorkWeek { get; }
    public decimal VacationBalanceDays { get; }
    public decimal RecuperationDaysPaidLastYear { get; }
    public Section14Arrangement Section14 { get; }
    public bool HasStudyFund { get; }
    public PayType PayType { get; }

    public Seniority Seniority => Seniority.Between(StartDate, EndDate);
    public decimal JobFraction => JobPercent / 100m;

    private EmploymentProfile(DateOnly start, DateOnly end, decimal salary, decimal jobPercent, WorkWeek workWeek,
        decimal vacationBalance, decimal recuperationPaid, Section14Arrangement section14, bool hasStudyFund, PayType payType)
    {
        StartDate = start;
        EndDate = end;
        MonthlySalary = salary;
        JobPercent = jobPercent;
        WorkWeek = workWeek;
        VacationBalanceDays = vacationBalance;
        RecuperationDaysPaidLastYear = recuperationPaid;
        Section14 = section14;
        HasStudyFund = hasStudyFund;
        PayType = payType;
    }

    public static EmploymentProfile Create(DateOnly start, DateOnly end, decimal monthlySalary, decimal jobPercent,
        WorkWeek workWeek, decimal vacationBalanceDays, decimal recuperationDaysPaidLastYear,
        Section14Arrangement section14, bool hasStudyFund, PayType payType = PayType.Monthly)
    {
        var errors = new Dictionary<string, string>();
        if (end <= start) errors["endDate"] = "תאריך הסיום צריך להיות אחרי תאריך ההתחלה";
        if (end.Year - start.Year > 60) errors["startDate"] = "תאריך ההתחלה לא סביר";
        if (monthlySalary <= 0) errors["monthlySalary"] = "השכר צריך להיות גדול מאפס";
        if (jobPercent is <= 0 or > 100) errors["jobPercent"] = "היקף משרה בין 1 ל-100";
        if (!Enum.IsDefined(workWeek)) errors["workWeek"] = "ימי עבודה בשבוע: 1 עד 6";
        if (vacationBalanceDays < 0) errors["vacationBalanceDays"] = "יתרת חופשה לא יכולה להיות שלילית";
        if (recuperationDaysPaidLastYear < 0) errors["recuperationDaysPaidLastYear"] = "ימי הבראה לא יכולים להיות שליליים";
        if (errors.Count > 0) throw new DomainValidationException(errors);

        return new EmploymentProfile(start, end, monthlySalary, jobPercent, workWeek, vacationBalanceDays,
            recuperationDaysPaidLastYear, section14, hasStudyFund, payType);
    }
}
