using RoshShaket.Domain;

namespace RoshShaket.Application.Payslips;

public sealed record PayslipImage(byte[] Data, string MediaType);

/// <summary>One contribution row from the payslip pension table. Kind is pension, severance, disability, or study.</summary>
public sealed record FundLine(
    string Kind,
    string? Name,
    decimal? Employee,
    decimal? Employer,
    string? Unit,
    string? Detail);

/// <summary>Raw fields read from payslips. Every field is optional: unknown stays null, never guessed.</summary>
public sealed record PayslipExtraction(
    bool IsPayslip,
    string? PayslipMonth,
    DateOnly? StartDate,
    decimal? BaseSalary,
    decimal? JobPercent,
    int? WorkDaysPerWeek,
    decimal? VacationBalance,
    decimal? RecuperationDaysPaid,
    decimal? SeveranceRatePercent,
    bool? HasStudyFund,
    bool Readable = true,
    IReadOnlyList<FundLine>? Funds = null,
    /// <summary>The employer printed on the payslip (a company, never the employee).</summary>
    string? EmployerName = null,
    /// <summary>Tokens the AI call used — for cost tracking, never sent to the client.</summary>
    Documents.AiUsage? Usage = null);

/// <summary>What the client pre-fills for the user to confirm.</summary>
public sealed record ProfileDraft(
    bool IsPayslip,
    string? PayslipMonth,
    DateOnly? StartDate,
    decimal? MonthlySalary,
    decimal? JobPercent,
    WorkWeek? WorkWeek,
    decimal? VacationBalanceDays,
    decimal? RecuperationDaysPaidLastYear,
    Section14Arrangement? Section14Suggestion,
    bool? HasStudyFund,
    IReadOnlyList<string> Filled,
    IReadOnlyList<string> Missing,
    bool Readable,
    IReadOnlyList<FundLine> Funds,
    string? EmployerName = null);

public sealed class PayslipUploadPolicy
{
    public const int MaxImages = 5;
    public const long MaxBytesPerImage = 10 * 1024 * 1024;
    public static readonly IReadOnlySet<string> AllowedMediaTypes =
        new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "image/jpeg", "image/png", "image/webp" };

    public void Validate(IReadOnlyList<PayslipImage> images)
    {
        var errors = new Dictionary<string, string>();
        if (images.Count == 0) errors["files"] = "לא התקבלה תמונה";
        if (images.Count > MaxImages) errors["files"] = $"עד {MaxImages} תלושים בכל פעם";
        if (images.Any(i => !AllowedMediaTypes.Contains(i.MediaType))) errors["mediaType"] = "רק JPG, PNG או WEBP";
        if (images.Any(i => i.Data.LongLength > MaxBytesPerImage)) errors["size"] = "כל תמונה עד 10MB";
        if (errors.Count > 0) throw new DomainValidationException(errors);
    }
}

public static class PayslipMapper
{
    public static ProfileDraft ToDraft(PayslipExtraction x)
    {
        var filled = new List<string>();
        void Mark(object? v, string name) { if (v is not null) filled.Add(name); }

        var funds = (x.Funds ?? []).Where(f => f.Kind is "pension" or "severance" or "disability" or "study").ToList();
        var severanceRate = x.SeveranceRatePercent
            ?? funds.FirstOrDefault(f => f.Kind == "severance" && f.Unit == "percent")?.Employer;
        bool? study = funds.Any(f => f.Kind == "study") ? true : x.HasStudyFund;

        WorkWeek? week = x.WorkDaysPerWeek is >= 1 and <= 6 ? (WorkWeek)x.WorkDaysPerWeek.Value : null;
        Section14Arrangement? s14 = severanceRate switch
        {
            >= 8.13m and <= 8.53m => Section14Arrangement.Full,
            >= 5.8m and <= 6.2m => Section14Arrangement.Partial6,
            _ => null
        };

        Mark(x.StartDate, "startDate"); Mark(x.BaseSalary, "monthlySalary"); Mark(x.JobPercent, "jobPercent");
        Mark(week, "workWeek"); Mark(x.VacationBalance, "vacationBalanceDays");
        Mark(x.RecuperationDaysPaid, "recuperationDaysPaidLastYear"); Mark(s14, "section14"); Mark(study, "hasStudyFund");
        foreach (var kind in new[] { "pension", "severance", "disability", "study" })
            if (funds.Any(f => f.Kind == kind)) filled.Add(kind);

        var missing = new List<string>();
        if (x.StartDate is null) missing.Add("startDate");
        if (x.BaseSalary is null) missing.Add("monthlySalary");

        return new ProfileDraft(x.IsPayslip, x.PayslipMonth, x.StartDate, x.BaseSalary, x.JobPercent, week,
            x.VacationBalance, x.RecuperationDaysPaid, s14, study, filled, missing, x.Readable, funds, x.EmployerName);
    }
}

public sealed class PayslipExtractionException(string message) : Exception(message);
