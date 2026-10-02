using System.Globalization;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using RoshShaket.Application.Abstractions;
using RoshShaket.Application.Documents;
using RoshShaket.Application.Payslips;
using RoshShaket.Infrastructure.Common;

namespace RoshShaket.Infrastructure.Claude;

/// <summary>
/// Verifies employment-review documents (payslip / 106 / pension) with Claude.
/// Images stay in memory for the request only — never stored or logged.
/// </summary>
public sealed class ClaudeDocumentVerifier(HttpClient http, IOptions<ClaudeOptions> options, ILogger<ClaudeDocumentVerifier> log)
    : IDocumentVerifier
{
    public async Task<DocumentExtraction> ExtractAsync(
        IReadOnlyList<PayslipImage> images,
        DocumentVerifyRequest expected,
        CancellationToken ct)
    {
        var o = options.Value;
        var apiKey = !string.IsNullOrWhiteSpace(o.ApiKey) ? o.ApiKey : (Environment.GetEnvironmentVariable("Claude__ApiKey") ?? "");
        if (string.IsNullOrWhiteSpace(apiKey))
            throw new PayslipExtractionException("אימות מסמכים אינו מוגדר בשרת (חסר מפתח API).");

        var expectedType = ReviewDocumentTypes.Normalize(expected.ExpectedType);
        var prompt = BuildPrompt(expectedType, expected.ExpectedYear, expected.ExpectedMonth);

        var content = images
            .Select(i => (object)new
            {
                type = "image",
                source = new { type = "base64", media_type = i.MediaType, data = Convert.ToBase64String(i.Data) }
            })
            .Append(new { type = "text", text = prompt })
            .ToList();

        o.ApiKey = apiKey;
        var reply = await CompleteAsync(content, o, ct);
        try
        {
            return Parse(reply.Text);
        }
        catch (PayslipExtractionException)
        {
            log.LogWarning(
                "Document verify response was not valid JSON. Stop={Stop} OutputTokens={Tokens} Chars={Chars}",
                reply.StopReason, reply.OutputTokens, reply.Text.Length);
            throw;
        }
    }

    private static string BuildPrompt(string expectedType, int expectedYear, int? expectedMonth)
    {
        var focus = expectedType switch
        {
            ReviewDocumentTypes.Form106 =>
                $"המסך שנפתח הוא לשנת מס {expectedYear}. קרא מתוך התמונה בלבד את שנת המס שמופיעה בטופס 106 ואת סך השכר השנתי ברוטו אם מופיע. אל תעתיק את {expectedYear} אלא אם היא באמת כתובה במסמך.",
            ReviewDocumentTypes.PensionReport =>
                $"המסך שנפתח הוא לשנת {expectedYear}. קרא מתוך התמונה בלבד את שנת הדוח ואת יתרות הקופות אם מופיעות. אל תעתיק את {expectedYear} אלא אם היא באמת כתובה במסמך.",
            _ when expectedMonth is int em =>
                $"המסך שנפתח מצפה לתלוש שכר עבור {em}/{expectedYear}. קרא מתוך התמונה בלבד את חודש ושנת התלוש המודפסים (למשל ליד «תקופת שכר» / תאריך התלוש), שכר היסוד החודשי ברוטו, ואת סוגי ההפרשות בטבלת הפנסיה. אל תנחש ואל תעתיק שנה/חודש מהציפייה — רק מה שמופיע במסמך.",
            _ =>
                $"המסך שנפתח הוא לשנת {expectedYear}. קרא מתוך התמונה בלבד את חודש ושנת התלוש המודפסים (למשל ליד «תקופת שכר» / תאריך התלוש), שכר היסוד החודשי ברוטו, ואת סוגי ההפרשות בטבלת הפנסיה. אל תנחש ואל תעתיק את {expectedYear} — detected_year ו־detected_month חייבים להיות מהמסמך בלבד."
        };

        return $$"""
            אלו תמונות של מסמך תעסוקה ישראלי (תלוש שכר, טופס 106, או דוח פנסיה/הפקדות).
            {{focus}}
            החזר JSON בלבד, בלי טקסט נוסף ובלי סימוני קוד:
            {"readable": true|false,
             "detected_type": "payslip"|"form106"|"pension_report"|"other"|"unknown",
             "detected_year": מספר שנה או null,
             "detected_month": מספר 1 עד 12 או null,
             "period_label": "תיאור קצר של תקופה לדוח פנסיה או null",
             "summary_he": "משפט קצר בעברית על מה שזוהה, בלי פרטים מזהים",
             "gross_salary": מספר או null,
             "annual_gross": מספר או null,
             "contribution_kinds": ["pension"|"severance"|"disability"|"study"],
             "funds": [{"kind":"pension"|"severance"|"study"|"managers","provider":"שם הגוף או null","balance":מספר או null,"as_of":"YYYY-MM-DD או null","fee_annual_percent":מספר או null,"return_annual_percent":מספר או null,"track":"מסלול או null"}]}
            כללים:
            - detected_type=payslip רק לתלוש שכר ישראלי.
            - detected_type=form106 רק לטופס 106 שנתי.
            - detected_type=pension_report לדוח פנסיה, הפקדות, גמל, השתלמות או ביטוח מנהלים.
            - other / unknown אם לא ברור.
            - detected_year / detected_month: רק מה שכתוב במסמך. אם לא קריא — null. אסור להעתיק מהציפייה של המשתמש.
            - לתלוש: gross_salary = שכר יסוד חודשי ברוטו.
            - לתלוש: contribution_kinds = סוגי שורות בטבלת ההפרשות. pension=תגמולי פנסיה, severance=פיצויים, disability=אובדן כושר עבודה, study=קרן השתלמות. מערך ריק אם אין טבלה.
            - ל־106: annual_gross = סה״כ שכר שנתי אם מופיע. contribution_kinds ריק.
            - לדוח קופות: מלא funds לכל קופה ברורה. pension=פנסיה/תגמולים, severance=פיצויים, study=השתלמות, managers=ביטוח מנהלים. מערך ריק אם אין יתרות. contribution_kinds ריק.
            - readable=false אם מטושטש/חתוך/כהה.
            - אל תנחש. אל תחזיר מזהים אישיים.
            """;
    }

    private async Task<ModelReply> CompleteAsync(List<object> content, ClaudeOptions o, CancellationToken ct)
    {
        var body = new
        {
            model = o.Model,
            max_tokens = Math.Min(o.MaxTokens, 2048),
            messages = new[] { new { role = "user", content } },
            output_config = new { format = new { type = "json_schema", schema = JsonSerializer.Deserialize<JsonElement>(OutputSchema) } }
        };
        using var request = new HttpRequestMessage(HttpMethod.Post, "v1/messages") { Content = JsonContent.Create(body) };
        request.Headers.Add("x-api-key", o.ApiKey);
        request.Headers.Add("anthropic-version", "2023-06-01");

        using var response = await http.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
        {
            log.LogWarning("Document verification failed with HTTP {Status}", (int)response.StatusCode);
            throw new PayslipExtractionException("שירות אימות המסמכים לא זמין כרגע.");
        }

        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
        var root = doc.RootElement;
        var stop = root.TryGetProperty("stop_reason", out var stopEl) ? stopEl.GetString() : null;
        var tokens = root.TryGetProperty("usage", out var usage) && usage.TryGetProperty("output_tokens", out var tokenEl) && tokenEl.TryGetInt32(out var n)
            ? n : 0;

        var text = new StringBuilder();
        if (root.TryGetProperty("content", out var blocks) && blocks.ValueKind == JsonValueKind.Array)
        {
            foreach (var block in blocks.EnumerateArray())
            {
                var type = block.TryGetProperty("type", out var typeEl) ? typeEl.GetString() ?? "" : "";
                if (type is "thinking" or "redacted_thinking") continue;
                if (block.TryGetProperty("text", out var textEl) && textEl.ValueKind == JsonValueKind.String)
                    text.Append(textEl.GetString());
            }
        }

        return new ModelReply(text.ToString(), stop, tokens);
    }

    internal static DocumentExtraction Parse(string text)
    {
        var json = ClaudePayslipExtractor.SliceJson(text)
            ?? throw new PayslipExtractionException("לא התקבלה תשובה תקינה מאימות המסמך.");

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
            throw new PayslipExtractionException("לא התקבלה תשובה תקינה מאימות המסמך.");
        }

        using (doc)
        {
            var raw = doc.RootElement;
            var type = ReviewDocumentTypes.Normalize(ReadString(raw, "detected_type") ?? "unknown");
            if (type is not ("payslip" or "form106" or "pension_report" or "other" or "unknown"))
                type = "unknown";

            var year = ReadInt(raw, "detected_year");
            if (year is < 1990 or > 2100) year = null;
            var month = ReadInt(raw, "detected_month");
            if (month is < 1 or > 12) month = null;

            return new DocumentExtraction(
                ReadBool(raw, "readable") ?? true,
                type,
                year,
                month,
                Clip(ReadString(raw, "period_label")),
                Clip(ReadString(raw, "summary_he")),
                ReadDecimal(raw, "gross_salary"),
                ReadDecimal(raw, "annual_gross"),
                ReadFunds(raw),
                ReadContributionKinds(raw));
        }
    }

    private static IReadOnlyList<string> ReadContributionKinds(JsonElement raw)
    {
        if (!raw.TryGetProperty("contribution_kinds", out var kinds) || kinds.ValueKind != JsonValueKind.Array)
            return [];
        var list = new List<string>();
        foreach (var row in kinds.EnumerateArray())
        {
            var kind = row.ValueKind == JsonValueKind.String
                ? row.GetString()?.Trim().ToLowerInvariant()
                : null;
            if (kind is not ("pension" or "severance" or "disability" or "study")) continue;
            if (!list.Contains(kind)) list.Add(kind);
        }
        return list;
    }

    private static IReadOnlyList<ExtractedFundLine> ReadFunds(JsonElement raw)
    {
        if (!raw.TryGetProperty("funds", out var funds) || funds.ValueKind != JsonValueKind.Array) return [];
        var list = new List<ExtractedFundLine>();
        foreach (var row in funds.EnumerateArray())
        {
            if (row.ValueKind != JsonValueKind.Object) continue;
            var kind = ReadString(row, "kind")?.Trim().ToLowerInvariant();
            if (kind is not ("pension" or "severance" or "study" or "managers")) continue;
            var balance = ReadDecimal(row, "balance");
            if (balance is <= 0) balance = null;
            var fee = ReadDecimal(row, "fee_annual_percent");
            var ret = ReadDecimal(row, "return_annual_percent");
            var provider = Clip(ReadString(row, "provider"));
            var track = Clip(ReadString(row, "track"));
            var asOf = ReadString(row, "as_of")?.Trim();
            if (asOf is { Length: > 0 } && !DateOnly.TryParse(asOf, CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
                asOf = null;
            if (balance is null && provider is null && fee is null && ret is null && track is null) continue;
            list.Add(new ExtractedFundLine(kind, provider, balance, asOf, fee, ret, track));
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
            _ => null
        };
    }

    private static int? ReadInt(JsonElement obj, string name)
    {
        if (!obj.TryGetProperty(name, out var el)) return null;
        if (el.ValueKind == JsonValueKind.Number && el.TryGetInt32(out var n)) return n;
        if (el.ValueKind == JsonValueKind.String
            && int.TryParse(el.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var p))
            return p;
        return null;
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
        return text.Length <= 200 ? text : text[..200];
    }

    private sealed record ModelReply(string Text, string? StopReason, int OutputTokens);

    private const string OutputSchema = """
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "readable": { "type": "boolean" },
            "detected_type": { "type": "string", "enum": ["payslip", "form106", "pension_report", "other", "unknown"] },
            "detected_year": { "type": ["integer", "null"] },
            "detected_month": { "type": ["integer", "null"] },
            "period_label": { "type": ["string", "null"] },
            "summary_he": { "type": ["string", "null"] },
            "gross_salary": { "type": ["number", "null"] },
            "annual_gross": { "type": ["number", "null"] },
            "contribution_kinds": {
              "type": "array",
              "items": { "type": "string", "enum": ["pension", "severance", "disability", "study"] }
            },
            "funds": {
              "type": "array",
              "items": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "kind": { "type": "string", "enum": ["pension", "severance", "study", "managers"] },
                  "provider": { "type": ["string", "null"] },
                  "balance": { "type": ["number", "null"] },
                  "as_of": { "type": ["string", "null"] },
                  "fee_annual_percent": { "type": ["number", "null"] },
                  "return_annual_percent": { "type": ["number", "null"] },
                  "track": { "type": ["string", "null"] }
                },
                "required": ["kind", "provider", "balance", "as_of", "fee_annual_percent", "return_annual_percent", "track"]
              }
            }
          },
          "required": ["readable", "detected_type", "detected_year", "detected_month", "period_label", "summary_he", "gross_salary", "annual_gross", "contribution_kinds", "funds"]
        }
        """;
}
