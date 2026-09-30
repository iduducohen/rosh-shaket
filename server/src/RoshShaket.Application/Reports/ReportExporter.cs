using System.Globalization;
using System.Text;
using System.Text.Json;
using RoshShaket.Application.Reports;

namespace RoshShaket.Application.Reports;

public static class ReportExporter
{
    public static byte[] ToJson(RightsReport report)
    {
        var json = JsonSerializer.Serialize(report, new JsonSerializerOptions
        {
            WriteIndented = true,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        });
        return Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(json)).ToArray();
    }

    public static byte[] ToCsv(RightsReport report)
    {
        var sb = new StringBuilder();
        sb.AppendLine("סוג,תרחיש,פריט,ערך,יחידה,הערה");

        foreach (var s in report.Scenarios)
        {
            Csv(sb, "סיכום", s.ReasonLabel, "סה\"כ משוער", s.EstimatedTotal.ToString("0", CultureInfo.InvariantCulture), "₪", "");
            Csv(sb, "סיכום", s.ReasonLabel, "ותק בשנים", s.SeniorityYears.ToString("0.##", CultureInfo.InvariantCulture), "שנים", "");
            foreach (var c in s.Components)
            {
                var value = c.Amount?.ToString("0", CultureInfo.InvariantCulture) ?? c.DisplayValue ?? "";
                var unit = c.Amount is not null ? "₪" : "";
                Csv(sb, "רכיב", s.ReasonLabel, c.Title, value, unit, c.Flag ?? "");
            }
        }

        foreach (var f in report.Funds)
        {
            var unit = f.Unit == "amount" ? "₪" : f.Unit == "percent" ? "%" : "";
            if (f.Employer is not null)
                Csv(sb, "קופה", f.Kind, $"{f.Name ?? f.Kind} · מעסיק", f.Employer.Value.ToString("0.##", CultureInfo.InvariantCulture), unit, f.Detail ?? "");
            if (f.Employee is not null)
                Csv(sb, "קופה", f.Kind, $"{f.Name ?? f.Kind} · עובד", f.Employee.Value.ToString("0.##", CultureInfo.InvariantCulture), unit, f.Detail ?? "");
        }

        return Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(sb.ToString())).ToArray();
    }

    public static byte[] ToHtml(RightsReport report)
    {
        var sb = new StringBuilder();
        sb.Append("<!DOCTYPE html><html lang=\"he\" dir=\"rtl\"><head><meta charset=\"utf-8\"/>");
        sb.Append("<title>").Append(Esc(report.Title)).Append("</title>");
        sb.Append("""
            <style>
              body{font-family:Arial,Helvetica,sans-serif;max-width:900px;margin:24px auto;padding:0 16px;color:#0E2229;line-height:1.45}
              h1{font-size:28px} h2{font-size:20px;margin-top:28px}
              table{width:100%;border-collapse:collapse;margin:12px 0 20px}
              th,td{border:1px solid #D6DEE2;padding:8px 10px;text-align:right}
              th{background:#E8F3F0}
              .muted{color:#5B6B73;font-size:13px}
              .total{font-size:32px;font-weight:700}
              @media print{body{margin:0}}
            </style></head><body>
            """);
        sb.Append("<h1>").Append(Esc(report.Title)).Append("</h1>");
        sb.Append("<p class=\"muted\">נוצר ב-").Append(report.GeneratedAt.ToLocalTime().ToString("dd/MM/yyyy HH:mm")).Append("</p>");

        var b = report.Basis;
        sb.Append("<h2>בסיס החישוב</h2><table><tbody>");
        Row(sb, "שכר חודשי", $"₪{b.MonthlySalary:0}");
        Row(sb, "אחוז משרה", $"{b.JobPercent:0}%");
        Row(sb, "התחלה", b.StartDate.ToString("dd/MM/yyyy"));
        Row(sb, "סיום", b.EndDate.ToString("dd/MM/yyyy"));
        Row(sb, "יתרת חופשה", $"{b.VacationBalanceDays:0.##} ימים");
        if (b.FromPayslip) Row(sb, "מקור", b.PayslipMonth is { } m ? $"תלוש ({m})" : "תלוש");
        sb.Append("</tbody></table>");

        foreach (var s in report.Scenarios)
        {
            sb.Append("<h2>").Append(Esc(s.ReasonLabel)).Append("</h2>");
            sb.Append("<div class=\"total\">₪").Append(s.EstimatedTotal.ToString("0")).Append("</div>");
            sb.Append("<p class=\"muted\">ותק: ").Append(s.SeniorityYears.ToString("0.#")).Append(" שנים</p>");
            sb.Append("<table><thead><tr><th>רכיב</th><th>סכום</th><th>הסבר</th></tr></thead><tbody>");
            foreach (var c in s.Components)
            {
                var amount = c.Amount is { } a ? $"₪{a:0}" : Esc(c.DisplayValue ?? "—");
                sb.Append("<tr><td>").Append(Esc(c.Title)).Append("</td><td>").Append(amount)
                    .Append("</td><td>").Append(Esc(c.Explanation)).Append("</td></tr>");
            }
            sb.Append("</tbody></table>");
        }

        if (report.Funds.Count > 0)
        {
            sb.Append("<h2>קופות מהתלוש (שיעורים / הפרשות)</h2>");
            sb.Append("<table><thead><tr><th>סוג</th><th>שם</th><th>עובד</th><th>מעסיק</th></tr></thead><tbody>");
            foreach (var f in report.Funds)
            {
                sb.Append("<tr><td>").Append(Esc(f.Kind)).Append("</td><td>").Append(Esc(f.Name ?? "—"))
                    .Append("</td><td>").Append(FmtFund(f.Employee, f.Unit))
                    .Append("</td><td>").Append(FmtFund(f.Employer, f.Unit)).Append("</td></tr>");
            }
            sb.Append("</tbody></table>");
        }

        sb.Append("<p class=\"muted\">").Append(Esc(report.Disclaimer)).Append("</p></body></html>");
        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    private static void Csv(StringBuilder sb, string type, string scenario, string item, string value, string unit, string note)
    {
        sb.Append(Q(type)).Append(',').Append(Q(scenario)).Append(',').Append(Q(item)).Append(',')
            .Append(Q(value)).Append(',').Append(Q(unit)).Append(',').Append(Q(note)).AppendLine();
    }

    private static void Row(StringBuilder sb, string k, string v) =>
        sb.Append($"<tr><th>{Esc(k)}</th><td>{Esc(v)}</td></tr>");

    private static string FmtFund(decimal? v, string? unit) =>
        v is null ? "—" : unit == "percent" ? $"{v:0.##}%" : unit == "amount" ? $"₪{v:0.##}" : v.Value.ToString("0.##", CultureInfo.InvariantCulture);

    private static string Q(string s) => $"\"{s.Replace("\"", "\"\"")}\"";
    private static string Esc(string s) => s.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;");
}
