using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
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
         "work_days_per_week": 5 או 6 או null,
         "vacation_balance": מספר או null (יתרת ימי חופשה),
         "recuperation_days_paid": מספר או null (ימי הבראה ששולמו בשנה האחרונה),
         "severance_rate": מספר או null (שיעור הפרשת מעסיק לפיצויים, למשל 8.33 או 6),
         "has_keren_hishtalmut": true|false|null}
        אם נתון לא מופיע בבירור, החזר null. אל תנחש ואל תשלים.
        is_payslip הוא true רק אם זה בבירור תלוש שכר ישראלי. אחרת false. לא חוזה, לא חשבונית, לא תעודה ולא תמונה אחרת.
        readable הוא true רק אם הטקסט חד וקריא מספיק כדי לקרוא שכר ותאריכים. false אם התמונה מטושטשת, חשוכה, חתוכה, או חסר בה חלק מהדף.
        אל תחזיר שם, תעודת זהות, כתובת, מספר עובד, פרטי מעסיק או מספר חשבון.
        """;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        NumberHandling = JsonNumberHandling.AllowReadingFromString
    };

    public async Task<PayslipExtraction> ExtractAsync(IReadOnlyList<PayslipImage> images, CancellationToken ct)
    {
        var o = options.Value;
        if (string.IsNullOrWhiteSpace(o.ApiKey))
            throw new PayslipExtractionException("קריאת תלושים אינה מוגדרת בשרת (חסר מפתח API).");

        var content = images
            .Select(i => (object)new
            {
                type = "image",
                source = new { type = "base64", media_type = i.MediaType, data = Convert.ToBase64String(i.Data) }
            })
            .Append(new { type = "text", text = Prompt })
            .ToList();

        var body = new
        {
            model = o.Model,
            max_tokens = o.MaxTokens,
            messages = new[] { new { role = "user", content } }
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

        var message = await response.Content.ReadFromJsonAsync<MessagesResponse>(Json, ct);
        var text = string.Concat(message?.Content?.Where(c => c.Type == "text").Select(c => c.Text) ?? []);
        return Parse(text);
    }

    internal static PayslipExtraction Parse(string text)
    {
        var start = text.IndexOf('{');
        var end = text.LastIndexOf('}');
        if (start < 0 || end <= start) throw new PayslipExtractionException("לא התקבלה תשובה תקינה מקריאת התלוש.");

        RawExtraction raw;
        try
        {
            raw = JsonSerializer.Deserialize<RawExtraction>(text[start..(end + 1)], Json)
                  ?? throw new PayslipExtractionException("לא התקבלה תשובה תקינה מקריאת התלוש.");
        }
        catch (JsonException)
        {
            throw new PayslipExtractionException("לא התקבלה תשובה תקינה מקריאת התלוש.");
        }

        DateOnly? startDate = DateOnly.TryParseExact(raw.StartDate, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)
            ? d : null;

        return new PayslipExtraction(
            raw.IsPayslip ?? false, raw.PayslipMonth, startDate, Positive(raw.BaseSalary), Percent(raw.JobPercent),
            raw.WorkDaysPerWeek is 5 or 6 ? raw.WorkDaysPerWeek : null, NonNegative(raw.VacationBalance),
            NonNegative(raw.RecuperationDaysPaid), Positive(raw.SeveranceRate), raw.HasKerenHishtalmut,
            raw.Readable ?? raw.IsPayslip ?? false);
    }

    private static decimal? Positive(decimal? v) => v is > 0 ? v : null;
    private static decimal? NonNegative(decimal? v) => v is >= 0 ? v : null;
    private static decimal? Percent(decimal? v) => v is > 0 and <= 100 ? v : null;

    private sealed class RawExtraction
    {
        [JsonPropertyName("is_payslip")] public bool? IsPayslip { get; set; }
        [JsonPropertyName("readable")] public bool? Readable { get; set; }
        [JsonPropertyName("payslip_month")] public string? PayslipMonth { get; set; }
        [JsonPropertyName("start_date")] public string? StartDate { get; set; }
        [JsonPropertyName("base_salary")] public decimal? BaseSalary { get; set; }
        [JsonPropertyName("job_percent")] public decimal? JobPercent { get; set; }
        [JsonPropertyName("work_days_per_week")] public int? WorkDaysPerWeek { get; set; }
        [JsonPropertyName("vacation_balance")] public decimal? VacationBalance { get; set; }
        [JsonPropertyName("recuperation_days_paid")] public decimal? RecuperationDaysPaid { get; set; }
        [JsonPropertyName("severance_rate")] public decimal? SeveranceRate { get; set; }
        [JsonPropertyName("has_keren_hishtalmut")] public bool? HasKerenHishtalmut { get; set; }
    }

    private sealed class MessagesResponse
    {
        [JsonPropertyName("content")] public List<ContentBlock>? Content { get; set; }
    }

    private sealed class ContentBlock
    {
        [JsonPropertyName("type")] public string Type { get; set; } = "";
        [JsonPropertyName("text")] public string? Text { get; set; }
    }
}
