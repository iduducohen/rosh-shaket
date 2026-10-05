using RoshShaket.Domain;

namespace RoshShaket.Api.Contracts;

// Transport shapes only. Mapping to the domain goes through EmploymentProfile.Create, so validation lives in one place.

public sealed record ProfileDto(
    DateOnly StartDate,
    DateOnly EndDate,
    decimal MonthlySalary,
    decimal JobPercent,
    int WorkDaysPerWeek,
    decimal VacationBalanceDays,
    decimal RecuperationDaysPaidLastYear,
    Section14Arrangement Section14,
    bool HasStudyFund,
    PayType PayType = PayType.Monthly,
    decimal? HourlyRate = null,
    decimal? AverageMonthlyHours = null,
    DateOnly? LastRecuperationPaid = null,
    decimal? GlobalOvertime = null)
{
    public EmploymentProfile ToDomain() => EmploymentProfile.Create(
        StartDate, EndDate, MonthlySalary, JobPercent, (WorkWeek)WorkDaysPerWeek,
        VacationBalanceDays, RecuperationDaysPaidLastYear, Section14, HasStudyFund, PayType, HourlyRate, AverageMonthlyHours, LastRecuperationPaid, GlobalOvertime);
}

public sealed record CalculateRequest(ProfileDto Profile, ExitReason Reason, bool FromPayslip = false, bool ConsentToAnonymousStats = false);

public sealed record CompareRequest(ProfileDto Profile, bool FromPayslip = false);

public sealed record ComponentDto(
    string Code, string Title, decimal? Amount, string? DisplayValue, string Explanation,
    Certainty Certainty, bool IncludedInTotal, string? SourceKey, string? Flag);

public sealed record CalculationResponse(
    ExitReason Reason,
    decimal SeniorityYears,
    decimal EstimatedTotal,
    IReadOnlyList<ComponentDto> Components,
    IReadOnlyList<string> Advisories,
    DateOnly ValuesValidFrom,
    decimal RecuperationDayValue)
{
    public static CalculationResponse From(CalculationResult r) => new(
        r.Reason,
        Math.Round(r.Seniority.Years, 2),
        Math.Round(r.EstimatedTotal, 0),
        r.Components.Select(c => new ComponentDto(c.Code, c.Title, c.Amount is { } a ? Math.Round(a, 0) : null,
            c.DisplayValue, c.Explanation, c.Certainty, c.IncludedInTotal, c.SourceKey, c.Flag)).ToList(),
        r.Advisories,
        r.ValuesUsed.ValidFrom,
        r.ValuesUsed.RecuperationDayValue);
}
