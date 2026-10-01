using System.Text.Json;
using System.Text.Json.Serialization;
using RoshShaket.Application.EmploymentReview;
using RoshShaket.Application.Reports;
using RoshShaket.Application.Reconciliation;
using RoshShaket.Application.Simulation;
using RoshShaket.Domain.Employment;

namespace RoshShaket.Application.Reports;

public sealed class ReconciliationReportBuilder
{
    public ReconciliationReport Build(
        EmploymentReviewCase review,
        ReconciliationSummary summary,
        IReadOnlyList<Anomaly> anomalies,
        IReadOnlyList<SimulationResult> simulations,
        SourceMatrix matrix)
    {
        var period = review.Period;
        return new ReconciliationReport(
            GeneratedAt: DateTimeOffset.UtcNow,
            DisclaimerHe: "דוח הערכה בלבד — אינו ייעוץ משפטי או אישור סופי על זכויות. חודשים ללא מידע מוצגים כ\"לא ידוע\" ולא כ־0.",
            EmployerName: period?.EmployerName,
            StartDate: period?.StartDate,
            EndDate: period?.EndDate,
            ExitReason: period?.ExitReason,
            TotalMonths: summary.TotalMonths,
            MonthsWithData: summary.MonthsWithData,
            MonthsWithGap: summary.MonthsWithGap,
            MonthsNoInfo: summary.MonthsNoInfo,
            ExpectedTotal: summary.ExpectedTotal,
            ReportedTotal: summary.ReportedTotal,
            ActualTotal: summary.ActualTotal,
            GapTotal: summary.GapTotal,
            Health: summary.Health,
            SalaryByYear: review.Months
                .GroupBy(m => m.Year)
                .OrderBy(g => g.Key)
                .Select(g => new YearSalaryRow(g.Key, g.Average(m => m.GrossSalary ?? 0)))
                .ToList(),
            Anomalies: anomalies,
            Simulations: simulations,
            SourceYears: matrix.Years,
            MissingDocuments: MissingDocs(review),
            Funds: review.Funds);
    }

    public string ToHtml(ReconciliationReport r)
    {
        var health = r.Health.MessageHe;
        var rows = string.Join("", r.Anomalies.Take(40).Select(a =>
            $"<tr><td>{a.Month:D2}/{a.Year}</td><td>{a.Kind}</td><td>{System.Net.WebUtility.HtmlEncode(a.Explanation)}</td></tr>"));
        return $"""
            <!DOCTYPE html><html lang="he" dir="rtl"><meta charset="utf-8">
            <title>דוח בדיקת הפקדות</title>
            <body style="font-family:Arial,sans-serif;padding:24px">
            <h1>דוח בדיקת תקופת העסקה</h1>
            <p><b>{System.Net.WebUtility.HtmlEncode(r.DisclaimerHe)}</b></p>
            <p>מעסיק: {System.Net.WebUtility.HtmlEncode(r.EmployerName ?? "—")} |
               תקופה: {r.StartDate} – {r.EndDate} | סיבה: {r.ExitReason ?? "—"}</p>
            <h2>סיכום</h2>
            <ul>
              <li>חודשים: {r.TotalMonths} | עם מידע: {r.MonthsWithData} | פערים: {r.MonthsWithGap} | ללא מידע: {r.MonthsNoInfo}</li>
              <li>צפוי: {Fmt(r.ExpectedTotal)} | מדווח: {Fmt(r.ReportedTotal)} | בפועל: {Fmt(r.ActualTotal)} | פער: {Fmt(r.GapTotal)}</li>
              <li>{System.Net.WebUtility.HtmlEncode(health)}</li>
            </ul>
            <h2>חריגות</h2>
            <table border="1" cellpadding="6" cellspacing="0"><thead><tr><th>חודש</th><th>סוג</th><th>הסבר</th></tr></thead>
            <tbody>{rows}</tbody></table>
            <h2>מסמכים חסרים</h2>
            <ul>{string.Join("", r.MissingDocuments.Select(d => $"<li>{System.Net.WebUtility.HtmlEncode(d)}</li>"))}</ul>
            </body></html>
            """;
    }

    public string ToCsv(ReconciliationReport r)
    {
        var lines = new List<string> { "year,month,kind,severity,explanation" };
        foreach (var a in r.Anomalies)
            lines.Add($"{a.Year},{a.Month},{a.Kind},{a.Severity},\"{a.Explanation.Replace("\"", "\"\"")}\"");
        return string.Join("\n", lines);
    }

    public string ToJson(ReconciliationReport r) =>
        JsonSerializer.Serialize(r, new JsonSerializerOptions
        {
            WriteIndented = true,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            Converters = { new JsonStringEnumConverter() }
        });

    private static string Fmt(decimal? v) => v is null ? "לא ידוע" : $"₪{v:N0}";

    private static IReadOnlyList<string> MissingDocs(EmploymentReviewCase review)
    {
        var types = review.Documents.Select(d => d.DocumentType).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var needed = new (string Key, string Label)[]
        {
            ("payslip", "תלושי שכר"),
            ("form106", "טופסי 106"),
            ("pension_report", "דוח הפקדות/יתרות פנסיה"),
            ("study_report", "דוח קרן השתלמות"),
            ("managers_report", "דוח ביטוח מנהלים (אם קיים)"),
            ("termination", "מסמכי סיום העסקה")
        };
        return needed.Where(n => !types.Contains(n.Key)).Select(n => n.Label).ToList();
    }
}

public sealed record YearSalaryRow(int Year, decimal AverageGross);

public sealed record ReconciliationReport(
    DateTimeOffset GeneratedAt,
    string DisclaimerHe,
    string? EmployerName,
    DateOnly? StartDate,
    DateOnly? EndDate,
    string? ExitReason,
    int TotalMonths,
    int MonthsWithData,
    int MonthsWithGap,
    int MonthsNoInfo,
    decimal? ExpectedTotal,
    decimal? ReportedTotal,
    decimal? ActualTotal,
    decimal? GapTotal,
    HealthScoreResult Health,
    IReadOnlyList<YearSalaryRow> SalaryByYear,
    IReadOnlyList<Anomaly> Anomalies,
    IReadOnlyList<SimulationResult> Simulations,
    IReadOnlyList<int> SourceYears,
    IReadOnlyList<string> MissingDocuments,
    IReadOnlyList<FundAccount> Funds);
