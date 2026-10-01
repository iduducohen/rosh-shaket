using RoshShaket.Application.Payslips;
using RoshShaket.Domain;

namespace RoshShaket.Application.Documents;

public static class ReviewDocumentTypes
{
    public const string Payslip = "payslip";
    public const string Form106 = "form106";
    public const string PensionReport = "pension_report";

    public static readonly IReadOnlySet<string> Allowed =
        new HashSet<string>(StringComparer.OrdinalIgnoreCase) { Payslip, Form106, PensionReport };

    public static string Normalize(string? type) =>
        (type ?? "").Trim().ToLowerInvariant() switch
        {
            "payslip" or "pay_slip" or "salary" => Payslip,
            "form106" or "106" or "form_106" => Form106,
            "pension_report" or "pension" or "pensionreport" => PensionReport,
            var t => t
        };
}

/// <summary>What the client claims the upload is for (year cube + type chip).</summary>
public sealed record DocumentVerifyRequest(
    string ExpectedType,
    int ExpectedYear,
    int? ExpectedMonth);

/// <summary>One fund balance line read from a pension / savings report.</summary>
public sealed record ExtractedFundLine(
    string Kind,
    string? Provider,
    decimal? Balance,
    string? AsOf,
    decimal? FeeAnnualPercent,
    decimal? ReturnAnnualPercent,
    string? Track);

/// <summary>Fields read from the document image(s). Never includes identifiers.</summary>
public sealed record DocumentExtraction(
    bool Readable,
    string DetectedType,
    int? DetectedYear,
    int? DetectedMonth,
    string? PeriodLabel,
    string? SummaryHe,
    decimal? GrossSalary = null,
    decimal? AnnualGross = null,
    IReadOnlyList<ExtractedFundLine>? Funds = null,
    /// <summary>Payslip contribution kinds: pension, severance, disability, study.</summary>
    IReadOnlyList<string>? ContributionKinds = null);

/// <summary>Extraction + match against the user's selection.</summary>
public sealed record DocumentVerificationResult(
    bool Readable,
    string DetectedType,
    int? DetectedYear,
    int? DetectedMonth,
    string? PeriodLabel,
    bool TypeMatches,
    bool YearMatches,
    bool MonthMatches,
    bool OverallOk,
    string MessageHe,
    string? SummaryHe,
    decimal? GrossSalary = null,
    decimal? AnnualGross = null,
    IReadOnlyList<ExtractedFundLine>? Funds = null,
    IReadOnlyList<string>? ContributionKinds = null);

public static class DocumentVerificationMapper
{
    public static DocumentVerificationResult Compare(DocumentExtraction x, DocumentVerifyRequest expected)
    {
        var expectedType = ReviewDocumentTypes.Normalize(expected.ExpectedType);
        var detectedType = ReviewDocumentTypes.Normalize(x.DetectedType);
        if (detectedType is not ("payslip" or "form106" or "pension_report"))
            detectedType = string.IsNullOrWhiteSpace(detectedType) ? "unknown" : "other";

        var typeMatches = detectedType == expectedType;
        var yearMatches = x.DetectedYear is null || x.DetectedYear == expected.ExpectedYear;
        var monthNeeded = expectedType == ReviewDocumentTypes.Payslip;
        var monthMatches = !monthNeeded
            || expected.ExpectedMonth is null
            || x.DetectedMonth is null
            || x.DetectedMonth == expected.ExpectedMonth;

        var overall = x.Readable && typeMatches && yearMatches && monthMatches
            && detectedType is "payslip" or "form106" or "pension_report";

        return new DocumentVerificationResult(
            x.Readable,
            detectedType,
            x.DetectedYear,
            x.DetectedMonth,
            x.PeriodLabel,
            typeMatches,
            yearMatches,
            monthMatches,
            overall,
            BuildMessage(x.Readable, expectedType, detectedType, expected, x, typeMatches, yearMatches, monthMatches),
            x.SummaryHe,
            Positive(x.GrossSalary),
            Positive(x.AnnualGross),
            x.Funds,
            x.ContributionKinds);
    }

    private static decimal? Positive(decimal? v) => v is > 0 ? v : null;

    private static string BuildMessage(
        bool readable,
        string expectedType,
        string detectedType,
        DocumentVerifyRequest expected,
        DocumentExtraction x,
        bool typeMatches,
        bool yearMatches,
        bool monthMatches)
    {
        if (!readable)
            return "לא הצלחנו לקרוא את המסמך בבירור. העלו קובץ חד וקריא של כל הדף.";

        if (detectedType is "other" or "unknown")
            return expectedType switch
            {
                ReviewDocumentTypes.Payslip => "הקובץ לא נראה כמו תלוש שכר.",
                ReviewDocumentTypes.Form106 => "הקובץ לא נראה כמו טופס 106.",
                ReviewDocumentTypes.PensionReport => "הקובץ לא נראה כמו דוח פנסיה / דוח הפקדות.",
                _ => "לא זוהה סוג מסמך מתאים."
            };

        if (!typeMatches)
            return $"זוהה {Label(detectedType)}, אבל בחרתם {Label(expectedType)}.";

        if (!yearMatches && x.DetectedYear is int dy)
            return expectedType == ReviewDocumentTypes.Form106
                ? $"שנת המס בטופס היא {dy}, אבל בחרתם {expected.ExpectedYear}."
                : $"במסמך מופיעה שנת {dy}, אבל בחרתם {expected.ExpectedYear}.";

        if (!monthMatches && x.DetectedMonth is int dm && expected.ExpectedMonth is int em)
            return $"התלוש הוא לחודש {dm}/{x.DetectedYear ?? expected.ExpectedYear}, אבל בחרתם {em}/{expected.ExpectedYear}.";

        return expectedType switch
        {
            ReviewDocumentTypes.Payslip when x.DetectedMonth is int m && x.DetectedYear is int y =>
                $"תלוש מאומת ל־{m}/{y}.",
            ReviewDocumentTypes.Form106 when x.DetectedYear is int y =>
                $"טופס 106 מאומת לשנת המס {y}.",
            ReviewDocumentTypes.PensionReport when x.DetectedYear is int y =>
                string.IsNullOrWhiteSpace(x.PeriodLabel)
                    ? $"דוח פנסיה מאומת לשנת {y}."
                    : $"דוח פנסיה מאומת ({x.PeriodLabel}).",
            _ => "המסמך תואם לבחירה."
        };
    }

    private static string Label(string type) => type switch
    {
        ReviewDocumentTypes.Payslip => "תלוש שכר",
        ReviewDocumentTypes.Form106 => "טופס 106",
        ReviewDocumentTypes.PensionReport => "דוח פנסיה",
        "other" => "מסמך אחר",
        _ => "מסמך לא מזוהה"
    };
}

public sealed class DocumentVerifyUploadPolicy
{
    public const int MaxImages = 3;
    public const long MaxBytesPerImage = PayslipUploadPolicy.MaxBytesPerImage;
    public static readonly IReadOnlySet<string> AllowedMediaTypes = PayslipUploadPolicy.AllowedMediaTypes;

    public void Validate(IReadOnlyList<PayslipImage> images, DocumentVerifyRequest request)
    {
        var errors = new Dictionary<string, string>();
        if (images.Count == 0) errors["files"] = "לא התקבלה תמונה";
        if (images.Count > MaxImages) errors["files"] = $"עד {MaxImages} עמודים בכל בדיקה";
        if (images.Any(i => !AllowedMediaTypes.Contains(i.MediaType))) errors["mediaType"] = "רק JPG, PNG או WEBP";
        if (images.Any(i => i.Data.LongLength > MaxBytesPerImage)) errors["size"] = "כל תמונה עד 10MB";

        var type = ReviewDocumentTypes.Normalize(request.ExpectedType);
        if (!ReviewDocumentTypes.Allowed.Contains(type))
            errors["expectedType"] = "סוג מסמך לא נתמך לאימות";
        if (request.ExpectedYear is < 1990 or > 2100)
            errors["expectedYear"] = "שנה לא תקינה";
        if (type == ReviewDocumentTypes.Payslip && request.ExpectedMonth is < 1 or > 12)
            errors["expectedMonth"] = "לתלוש חובה לציין חודש (1–12)";

        if (errors.Count > 0) throw new DomainValidationException(errors);
    }
}
