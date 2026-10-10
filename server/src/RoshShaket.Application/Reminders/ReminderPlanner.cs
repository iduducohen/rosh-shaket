using System.Text.Json;
using RoshShaket.Application.EmploymentReview;

namespace RoshShaket.Application.Reminders;

public enum ReminderKind
{
    /// <summary>Someone still working at the place: time to upload the new payslips and check again.</summary>
    RegularCheck,

    /// <summary>Form 106 and the annual pension report of a year that has ended and are still not in the file.</summary>
    YearEndDocs
}

/// <summary>
/// One reminder that is due. <see cref="RefKey"/> is unique per person and moment, so the same reminder is
/// never sent twice. <see cref="Missing"/> holds the document keys: form106, pension_annual.
/// </summary>
public sealed record DueReminder(ReminderKind Kind, string RefKey, int? Year, IReadOnlyList<string> Missing);

/// <summary>Decides, from a person's case and today's date, which reminder emails are due. No I/O, so it is easy to test.</summary>
public static class ReminderPlanner
{
    /// <summary>Days without any change to the case before someone who still works is asked to check again.</summary>
    public const int RecheckAfterDays = 75;

    public const string Form106 = "form106";
    public const string PensionAnnual = "pension_annual";

    public static IReadOnlyList<DueReminder> Plan(DateOnly today, EmploymentReviewCase review)
    {
        var due = new List<DueReminder>();
        var period = review.Period;
        if (period is null) return due;

        var waived = Waivers(review.DocumentWaivers);

        // Year-end documents exist only after the year ends and arrive by the end of March.
        // First note on 1 March, when they are about to arrive. Second on 5 April, when they should already be there.
        var lastYear = Math.Min(period.EndDate.Year, today.Year - 1);
        for (var year = period.StartDate.Year; year <= lastYear; year++)
        {
            var missing = new List<string>();
            if (!HasDocument(review, "form106", year, annualOnly: false) && !waived.Contains((Form106, year)) && !waived.Contains(("form106", year)))
                missing.Add(Form106);
            if (!HasDocument(review, "pension_report", year, annualOnly: true)
                && !waived.Contains((PensionAnnual, year)) && !waived.Contains(("pension_report", year)))
                missing.Add(PensionAnnual);
            if (missing.Count == 0) continue;

            if (today >= new DateOnly(year + 1, 3, 1) && today < new DateOnly(year + 1, 4, 5))
                due.Add(new DueReminder(ReminderKind.YearEndDocs, $"yearend:{year}:1", year, missing));
            else if (today >= new DateOnly(year + 1, 4, 5) && today < new DateOnly(year + 1, 7, 1))
                due.Add(new DueReminder(ReminderKind.YearEndDocs, $"yearend:{year}:2", year, missing));
        }

        // Still working: a regular check, at most once a quarter, only after the case has been quiet for a while.
        if (string.Equals(period.ExitReason, "Ongoing", StringComparison.OrdinalIgnoreCase))
        {
            var lastChange = DateOnly.FromDateTime(review.UpdatedAt.UtcDateTime);
            if (today.DayNumber - lastChange.DayNumber >= RecheckAfterDays)
                due.Add(new DueReminder(ReminderKind.RegularCheck, $"check:{today.Year}-Q{(today.Month - 1) / 3 + 1}", null, []));
        }

        return due;
    }

    private static bool HasDocument(EmploymentReviewCase review, string type, int year, bool annualOnly) =>
        review.Documents.Any(d =>
            string.Equals(d.DocumentType, type, StringComparison.OrdinalIgnoreCase)
            && d.Year == year
            // A pension report saved before the two kinds existed counts as the annual report.
            && (!annualOnly || !string.Equals(d.PensionKind, "deposits", StringComparison.OrdinalIgnoreCase)));

    /// <summary>Whole-year waivers ("I do not have it") as (documentType, year).</summary>
    private static HashSet<(string Type, int Year)> Waivers(JsonElement? json)
    {
        var set = new HashSet<(string, int)>();
        if (json is not { ValueKind: JsonValueKind.Array } rows) return set;
        foreach (var row in rows.EnumerateArray())
        {
            if (row.ValueKind != JsonValueKind.Object) continue;
            if (row.TryGetProperty("month", out var month) && month.ValueKind == JsonValueKind.Number) continue;
            if (!row.TryGetProperty("documentType", out var type) || type.ValueKind != JsonValueKind.String) continue;
            if (!row.TryGetProperty("year", out var year) || !year.TryGetInt32(out var y)) continue;
            set.Add((type.GetString()!, y));
        }
        return set;
    }
}
