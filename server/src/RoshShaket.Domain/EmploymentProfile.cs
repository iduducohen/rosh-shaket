using RoshShaket.Domain.Policies;

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
    /// <summary>Hourly employees only: the last hourly rate.</summary>
    public decimal? HourlyRate { get; }
    /// <summary>Hourly employees only: average hours a month over the whole employment.</summary>
    public decimal? AverageMonthlyHours { get; }
    /// <summary>
    /// When recuperation pay was last paid, if the employee knows. The employer then owes the relative part
    /// for the months since. Null = unknown, and <see cref="RecuperationDaysPaidLastYear"/> is used instead.
    /// </summary>
    public DateOnly? LastRecuperationPaid { get; }
    /// <summary>
    /// Global salary only: the monthly "global overtime" component, paid on top of <see cref="MonthlySalary"/>.
    /// Zero when the payslip does not separate it from the base salary.
    /// </summary>
    public decimal? GlobalOvertime { get; }
    /// <summary>Months of unpaid leave (חל"ת) during the employment. Beyond 14 days a year they are not counted for severance.</summary>
    public decimal UnpaidLeaveMonths { get; }
    /// <summary>
    /// When section 14 started to apply, if later than the start of work (an employee from before 2008,
    /// or an arrangement added to the contract later). Null = from the first day.
    /// </summary>
    public DateOnly? Section14From { get; }

    public Seniority Seniority => Seniority.Between(StartDate, EndDate);
    public decimal JobFraction => JobPercent / 100m;

    private EmploymentProfile(DateOnly start, DateOnly end, decimal salary, decimal jobPercent, WorkWeek workWeek,
        decimal vacationBalance, decimal recuperationPaid, Section14Arrangement section14, bool hasStudyFund, PayType payType,
        decimal? hourlyRate, decimal? averageMonthlyHours, DateOnly? lastRecuperationPaid, decimal? globalOvertime,
        decimal unpaidLeaveMonths, DateOnly? section14From)
    {
        UnpaidLeaveMonths = unpaidLeaveMonths;
        Section14From = section14From;
        LastRecuperationPaid = lastRecuperationPaid;
        GlobalOvertime = globalOvertime;
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
        HourlyRate = hourlyRate;
        AverageMonthlyHours = averageMonthlyHours;
    }

    public static EmploymentProfile Create(DateOnly start, DateOnly end, decimal monthlySalary, decimal jobPercent,
        WorkWeek workWeek, decimal vacationBalanceDays, decimal recuperationDaysPaidLastYear,
        Section14Arrangement section14, bool hasStudyFund, PayType payType = PayType.Monthly,
        decimal? hourlyRate = null, decimal? averageMonthlyHours = null, DateOnly? lastRecuperationPaid = null,
        decimal? globalOvertime = null, decimal unpaidLeaveMonths = 0m, DateOnly? section14From = null)
    {
        var errors = new Dictionary<string, string>();
        if (payType == PayType.Hourly)
        {
            if (hourlyRate is not > 0) errors["hourlyRate"] = "התעריף לשעה צריך להיות גדול מאפס";
            if (averageMonthlyHours is not (> 0 and <= HourlyPolicy.MaxMonthlyHours)) errors["averageMonthlyHours"] = $"ממוצע שעות בחודש: בין 1 ל-{HourlyPolicy.MaxMonthlyHours}";
            if (errors.Count == 0)
            {
                // The rules work on a monthly figure: for an hourly employee it is derived, never typed.
                monthlySalary = HourlyPolicy.DeterminingSalary(hourlyRate!.Value, averageMonthlyHours!.Value);
                jobPercent = HourlyPolicy.JobPercent(averageMonthlyHours.Value);
            }
        }
        else
        {
            hourlyRate = null;
            averageMonthlyHours = null;
        }
        if (end <= start) errors["endDate"] = "תאריך הסיום צריך להיות אחרי תאריך ההתחלה";
        if (end.Year - start.Year > 60) errors["startDate"] = "תאריך ההתחלה לא סביר";
        // An hourly employee enters a rate and hours; the monthly salary and job scope are derived above.
        if (payType != PayType.Hourly)
        {
            if (monthlySalary <= 0) errors["monthlySalary"] = "השכר צריך להיות גדול מאפס";
            if (jobPercent is <= 0 or > 100) errors["jobPercent"] = "היקף משרה בין 1 ל-100";
        }
        if (!Enum.IsDefined(workWeek)) errors["workWeek"] = "ימי עבודה בשבוע: 1 עד 6";
        if (vacationBalanceDays < 0) errors["vacationBalanceDays"] = "יתרת חופשה לא יכולה להיות שלילית";
        if (recuperationDaysPaidLastYear < 0) errors["recuperationDaysPaidLastYear"] = "ימי הבראה לא יכולים להיות שליליים";
        globalOvertime = payType == PayType.Global ? globalOvertime ?? 0m : null;
        if (globalOvertime < 0) errors["globalOvertime"] = "רכיב השעות הנוספות לא יכול להיות שלילי";
        if (unpaidLeaveMonths < 0) errors["unpaidLeaveMonths"] = "חודשי חל\"ת לא יכולים להיות שליליים";
        else if (end > start && unpaidLeaveMonths > Seniority.Between(start, end).Months) errors["unpaidLeaveMonths"] = "חודשי החל\"ת ארוכים מתקופת העבודה";
        // The date matters only with an arrangement, and only when it is after the first day.
        if (section14 is not (Section14Arrangement.Full or Section14Arrangement.Partial6) || section14From <= start) section14From = null;
        if (section14From > end) errors["section14From"] = "סעיף 14 לא יכול להתחיל אחרי תאריך הסיום";
        if (lastRecuperationPaid > end) errors["lastRecuperationPaid"] = "מועד תשלום ההבראה לא יכול להיות אחרי תאריך הסיום";
        if (errors.Count > 0) throw new DomainValidationException(errors);

        return new EmploymentProfile(start, end, monthlySalary, jobPercent, workWeek, vacationBalanceDays,
            recuperationDaysPaidLastYear, section14, hasStudyFund, payType, hourlyRate, averageMonthlyHours, lastRecuperationPaid, globalOvertime,
            unpaidLeaveMonths, section14From);
    }
}
