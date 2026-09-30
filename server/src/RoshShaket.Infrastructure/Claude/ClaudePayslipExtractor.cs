using System.Globalization;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using RoshShaket.Application.Abstractions;
using RoshShaket.Application.Payslips;
using RoshShaket.Infrastructure.Common;

namespace RoshShaket.Infrastructure.Claude;

/// <summary>Reads payslip fields with Claude (Messages API). Images are sent once and never stored or logged.</summary>
public sealed class ClaudePayslipExtractor(HttpClient http, IOptions<ClaudeOptions> options, ILogger<ClaudePayslipExtractor> log)
    : IPayslipExtractor
{
    internal const string Prompt = """
        אלו תמונות של תלוש שכר ישראלי אחד או יותר. אם יש כמה, השתמש בתלוש העדכני ביותר לשכר וליתרות.
        חלץ רק את הנתונים הבאים, והחזר JSON בלבד, בלי טקסט נוסף ובלי סימוני קוד:
        {"is_payslip": true|false,
         "readable": true|false,
         "payslip_month": "YYYY-MM" או null,
         "start_date": "YYYY-MM-DD" או null (תאריך תחילת עבודה / ותק),
         "base_salary": מספר או null (שכר יסוד חודשי ברוטו, בלי שעות נוספות והחזרים),
         "job_percent": מספר או null,
         "work_days_per_week": מספר 1 עד 6 או null,
         "vacation_balance": מספר או null,
         "recuperation_days_paid": מספר או null,
         "severance_rate": מספר או null (שיעור הפרשת מעסיק לפיצויים, למשל 8.33 או 6),
         "has_keren_hishtalmut": true|false|null,
         "funds": [{"kind":"pension"|"severance"|"disability"|"study","name":"שם הקופה או null","employee":מספר או null,"employer":מספר או null,"unit":"percent"|"amount"|null,"detail":"מידע נוסף או null"}]}
        vacation_balance הוא רק יתרת ימי החופשה: השדה "יתרה" או "יתרה לצבירה". לא מכסה, לא זכאות שנתית ולא ניצול. אם מופיעים מכסה 20 ויתרה 11.04, החזר 11.04.
        recuperation_days_paid הוא מספר ימי ההבראה ששולמו או נוצלו בפועל בשנה, לא המכסה השנתית. אם בתלוש כתוב 1, החזר 1. החזר 0 רק אם כתוב במפורש 0. אם אי אפשר להבדיל בין מכסה לבין מה ששולם, החזר null.
        funds הוא טבלת ההפרשות לפנסיה בתלוש, שורה לכל רכיב:
        pension = תגמולי פנסיה, severance = פיצויים, disability = אובדן כושר עבודה, study = קרן השתלמות.
        employee הוא הפרשת העובד, employer הוא הפרשת המעסיק. unit הוא percent כשהמספרים באחוזים, ו-amount כשהם בשקלים.
        name הוא שם הקופה. detail הוא מידע נוסף שמופיע באותה שורה, כמו מספר פוליסה או בסיס שכר, בלי תעודת זהות, מספר עובד או חשבון בנק.
        אם אותה קופה מופיעה לכמה רכיבים, החזר שורה נפרדת לכל רכיב. אם אין שורה, אל תמציא. מערך ריק אם אין טבלה.
        אם נתון לא מופיע בבירור, החזר null. אל תנחש ואל תשלים.
        is_payslip הוא true רק אם זה בבירור תלוש שכר ישראלי. אחרת false. לא חוזה, לא חשבונית, לא תעודה ולא תמונה אחרת.
        readable הוא true רק אם הטקסט חד וקריא מספיק כדי לקרוא שכר ותאריכים. false אם התמונה מטושטשת, חשוכה, חתוכה, או חסר בה חלק מהדף.
        אל תחזיר שם, תעודת זהות, כתובת, מספר עובד, פרטי מעסיק או מספר חשבון.
        התשובה עצמה היא אובייקט JSON אחד בלבד, בלי הסבר לפניו או אחריו.
        """;

    public async Task<PayslipExtraction> ExtractAsync(IReadOnlyList<PayslipImage> images, CancellationToken ct)
    {
        var o = options.Value;
        var apiKey = o.ApiKey ?? Environment.GetEnvironmentVariable("Claude__ApiKey") ?? "";
        if (string.IsNullOrWhiteSpace(apiKey))
            throw new PayslipExtractionException("קריאת תלושים אינה מוגדרת בשרת (חסר מפתח API).");

        var content = images
            .Select(i => (object)new
            {
                type = "image",
                source = new { type = "base64", media_type = i.MediaType, data = Convert.ToBase64String(i.Data) }
            })
            .Append(new { type = "text", text = Prompt })
            .ToList();

        o.ApiKey = apiKey;
        var reply = await CompleteAsync(content, o, ct);
        var text = reply.Text;

        try
        {
            return Parse(text);
        }
        catch (PayslipExtractionException)
        {
            // Shape only. The text can contain salary and fund names, so it is not logged.
            log.LogWarning(
                "Payslip response was not valid JSON. Stop={Stop} OutputTokens={Tokens} Chars={Chars} Blocks={Blocks}",
                reply.StopReason, reply.OutputTokens, reply.Text.Length, reply.BlockTypes);
            throw;
        }
    }

    private async Task<ModelReply> CompleteAsync(List<object> content, ClaudeOptions o, CancellationToken ct)
    {
        var messages = new List<object> { new { role = "user", content } };
        var body = new
        {
            model = o.Model,
            max_tokens = o.MaxTokens,
            messages,
            output_config = new { format = new { type = "json_schema", schema = JsonSerializer.Deserialize<JsonElement>(OutputSchema) } }
        };
        using var request = new HttpRequestMessage(HttpMethod.Post, "v1/messages") { Content = JsonContent.Create(body) };
        request.Headers.Add("x-api-key", o.ApiKey);
        request.Headers.Add("anthropic-version", "2023-06-01");

        using var response = await http.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
        {
            // Status only: the body may echo request content, which is personal data.
            log.LogWarning("Payslip extraction failed with HTTP {Status}", (int)response.StatusCode);
            throw new PayslipExtractionException("שירות קריאת התלושים לא זמין כרגע.");
        }

        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
        var root = doc.RootElement;
        var stop = root.TryGetProperty("stop_reason", out var stopEl) ? stopEl.GetString() : null;
        var tokens = root.TryGetProperty("usage", out var usage) && usage.TryGetProperty("output_tokens", out var tokenEl) && tokenEl.TryGetInt32(out var n)
            ? n : 0;

        var text = new StringBuilder();
        var types = new List<string>();
        if (root.TryGetProperty("content", out var blocks) && blocks.ValueKind == JsonValueKind.Array)
        {
            foreach (var block in blocks.EnumerateArray())
            {
                var type = block.TryGetProperty("type", out var typeEl) ? typeEl.GetString() ?? "" : "";
                types.Add(type);
                if (type is "thinking" or "redacted_thinking") continue;
                if (block.TryGetProperty("text", out var textEl) && textEl.ValueKind == JsonValueKind.String)
                    text.Append(textEl.GetString());
            }
        }

        return new ModelReply(text.ToString(), stop, tokens, string.Join(',', types));
    }

    internal static PayslipExtraction Parse(string text)
    {
        var json = SliceJson(text) ?? throw new PayslipExtractionException("לא התקבלה תשובה תקינה מקריאת התלוש.");

        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(json, new JsonDocumentOptions
            {
                AllowTrailingCommas = true,
                CommentHandling = JsonCommentHandling.Skip
            });
        }
        catch (JsonException)
        {
            throw new PayslipExtractionException("לא התקבלה תשובה תקינה מקריאת התלוש.");
        }

        using (doc)
        {
            var raw = doc.RootElement;
            var startText = ReadString(raw, "start_date");
            DateOnly? startDate = DateOnly.TryParseExact(startText, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)
                ? d : null;
            var days = ReadDecimal(raw, "work_days_per_week");
            int? workDays = days is >= 1 and <= 6 ? (int)days : null;
            var isPayslip = ReadBool(raw, "is_payslip") ?? false;

            return new PayslipExtraction(
                isPayslip, ReadString(raw, "payslip_month"), startDate, Positive(ReadDecimal(raw, "base_salary")),
                Percent(ReadDecimal(raw, "job_percent")), workDays, NonNegative(ReadDecimal(raw, "vacation_balance")),
                NonNegative(ReadDecimal(raw, "recuperation_days_paid")), Positive(ReadDecimal(raw, "severance_rate")),
                ReadBool(raw, "has_keren_hishtalmut"), ReadBool(raw, "readable") ?? isPayslip, ReadFunds(raw));
        }
    }

    internal static string? SliceJson(string text)
    {
        text = text.Trim().TrimStart('\uFEFF');
        if (text.StartsWith("```", StringComparison.Ordinal))
        {
            var line = text.IndexOf('\n');
            text = (line >= 0 ? text[(line + 1)..] : text[3..]).Trim();
            var fence = text.LastIndexOf("```", StringComparison.Ordinal);
            if (fence >= 0) text = text[..fence].Trim();
        }

        var start = text.IndexOf('{');
        if (start < 0)
        {
            var trimmed = text.TrimStart();
            if (!trimmed.StartsWith("\"is_payslip\"", StringComparison.Ordinal) && !trimmed.StartsWith("\"readable\"", StringComparison.Ordinal))
                return null;
            text = "{" + text;
            start = text.IndexOf('{');
        }

        var braces = 0;
        var brackets = 0;
        var inString = false;
        var escape = false;
        for (var i = start; i < text.Length; i++)
        {
            var c = text[i];
            if (inString)
            {
                if (escape) escape = false;
                else if (c == '\\') escape = true;
                else if (c == '"') inString = false;
                continue;
            }
            if (c == '"') { inString = true; continue; }
            if (c == '{') braces++;
            else if (c == '}') braces--;
            else if (c == '[') brackets++;
            else if (c == ']') brackets--;
            if (braces == 0 && i > start) return text[start..(i + 1)];
        }

        if (braces <= 0) return null;
        var partial = text[start..].TrimEnd().TrimEnd(',');
        return partial + new string(']', Math.Max(0, brackets)) + new string('}', braces);
    }

    private static decimal? Positive(decimal? v) => v is > 0 ? v : null;
    private static decimal? NonNegative(decimal? v) => v is >= 0 ? v : null;
    private static decimal? Percent(decimal? v) => v is > 0 and <= 100 ? v : null;

    private static IReadOnlyList<FundLine> ReadFunds(JsonElement raw)
    {
        if (!raw.TryGetProperty("funds", out var funds) || funds.ValueKind != JsonValueKind.Array) return [];
        var list = new List<FundLine>();
        foreach (var row in funds.EnumerateArray())
        {
            if (row.ValueKind != JsonValueKind.Object) continue;
            var kind = ReadString(row, "kind")?.Trim().ToLowerInvariant();
            if (kind is not ("pension" or "severance" or "disability" or "study")) continue;
            var unitText = ReadString(row, "unit")?.Trim().ToLowerInvariant();
            var unit = unitText is "percent" or "amount" ? unitText : null;
            var name = Clip(ReadString(row, "name"));
            var detail = Clip(ReadString(row, "detail"));
            var employee = ReadDecimal(row, "employee");
            var employer = ReadDecimal(row, "employer");
            if (employee is < 0) employee = null;
            if (employer is < 0) employer = null;
            if (name is null && detail is null && employee is null && employer is null) continue;
            list.Add(new FundLine(kind, name, employee, employer, unit, detail));
        }
        return list;
    }

    private static string? ReadString(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out var el) && el.ValueKind == JsonValueKind.String ? el.GetString() : null;

    private static bool? ReadBool(JsonElement obj, string name)
    {
        if (!obj.TryGetProperty(name, out var el)) return null;
        return el.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.String => el.GetString()?.Trim().ToLowerInvariant() switch
            {
                "true" or "yes" => true,
                "false" or "no" => false,
                _ => null
            },
            _ => null
        };
    }

    private static decimal? ReadDecimal(JsonElement obj, string name)
    {
        if (!obj.TryGetProperty(name, out var el)) return null;
        if (el.ValueKind == JsonValueKind.Number) return el.TryGetDecimal(out var number) ? number : null;
        if (el.ValueKind != JsonValueKind.String) return null;
        var text = el.GetString();
        if (string.IsNullOrWhiteSpace(text)) return null;
        text = text.Replace("%", "").Replace("₪", "").Replace(",", "").Replace(" ", "").Trim();
        return decimal.TryParse(text, NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed) ? parsed : null;
    }

    private static string? Clip(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var text = value.Trim();
        return text.Length <= 160 ? text : text[..160];
    }

    private sealed record ModelReply(string Text, string? StopReason, int OutputTokens, string BlockTypes);

    private const string OutputSchema = """
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "is_payslip": { "type": "boolean" },
            "readable": { "type": "boolean" },
            "payslip_month": { "type": ["string", "null"] },
            "start_date": { "type": ["string", "null"] },
            "base_salary": { "type": ["number", "null"] },
            "job_percent": { "type": ["number", "null"] },
            "work_days_per_week": { "type": ["integer", "null"] },
            "vacation_balance": { "type": ["number", "null"] },
            "recuperation_days_paid": { "type": ["number", "null"] },
            "severance_rate": { "type": ["number", "null"] },
            "has_keren_hishtalmut": { "type": ["boolean", "null"] },
            "funds": {
              "type": "array",
              "items": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "kind": { "type": "string", "enum": ["pension", "severance", "disability", "study"] },
                  "name": { "type": ["string", "null"] },
                  "employee": { "type": ["number", "null"] },
                  "employer": { "type": ["number", "null"] },
                  "unit": { "anyOf": [ { "type": "string", "enum": ["percent", "amount"] }, { "type": "null" } ] },
                  "detail": { "type": ["string", "null"] }
                },
                "required": ["kind", "name", "employee", "employer", "unit", "detail"]
              }
            }
          },
          "required": ["is_payslip", "readable", "payslip_month", "start_date", "base_salary", "job_percent", "work_days_per_week", "vacation_balance", "recuperation_days_paid", "severance_rate", "has_keren_hishtalmut", "funds"]
        }
        """;
}
