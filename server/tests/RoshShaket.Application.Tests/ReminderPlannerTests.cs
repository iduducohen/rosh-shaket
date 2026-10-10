using System.Text.Json;
using RoshShaket.Application.EmploymentReview;
using RoshShaket.Application.Reminders;
using RoshShaket.Domain.Employment;
using Xunit;

namespace RoshShaket.Application.Tests;

public class ReminderPlannerTests
{
    private static ReviewDocumentMeta Doc(string type, int year, string? kind = null) =>
        new(Guid.NewGuid(), type, year, null, "upload", true, null, false, PensionKind: kind);

    private static EmploymentReviewCase Case(
        string? exitReason, DateOnly start, DateOnly end, DateTimeOffset updated,
        IReadOnlyList<ReviewDocumentMeta>? docs = null, string? waiversJson = null)
    {
        var id = Guid.NewGuid();
        var period = new EmploymentPeriod(Guid.NewGuid(), id, null, start, end, true, exitReason, false, false, null);
        JsonElement? waivers = waiversJson is null ? null : JsonDocument.Parse(waiversJson).RootElement.Clone();
        return new EmploymentReviewCase(id, period, [], [], docs ?? [], updated, null, waivers);
    }

    [Fact]
    public void Year_end_documents_are_asked_for_in_march_and_again_in_april()
    {
        var review = Case("Fired", new DateOnly(2023, 10, 22), new DateOnly(2025, 6, 30), DateTimeOffset.Parse("2026-01-10T00:00:00Z"));

        var march = ReminderPlanner.Plan(new DateOnly(2026, 3, 3), review).Where(r => r.Kind == ReminderKind.YearEndDocs).ToList();
        var april = ReminderPlanner.Plan(new DateOnly(2026, 4, 8), review).Where(r => r.Kind == ReminderKind.YearEndDocs).ToList();

        Assert.Contains(march, r => r.Year == 2025 && r.RefKey == "yearend:2025:1" && r.Missing.SequenceEqual(new[] { "form106", "pension_annual" }));
        Assert.Contains(april, r => r.Year == 2025 && r.RefKey == "yearend:2025:2");
    }

    [Fact]
    public void Nothing_is_asked_before_the_year_has_ended_or_when_the_documents_are_there()
    {
        var docs = new[] { Doc("form106", 2025), Doc("pension_report", 2025, "annual") };
        var complete = Case("Ongoing", new DateOnly(2025, 1, 1), new DateOnly(2025, 12, 31), DateTimeOffset.Parse("2026-03-01T00:00:00Z"), docs);
        var running = Case("Ongoing", new DateOnly(2026, 1, 1), new DateOnly(2026, 9, 30), DateTimeOffset.Parse("2026-10-01T00:00:00Z"));

        Assert.DoesNotContain(ReminderPlanner.Plan(new DateOnly(2026, 3, 10), complete), r => r.Kind == ReminderKind.YearEndDocs);
        Assert.DoesNotContain(ReminderPlanner.Plan(new DateOnly(2026, 10, 10), running), r => r.Kind == ReminderKind.YearEndDocs);
    }

    [Fact]
    public void A_deposit_report_does_not_replace_the_annual_one_and_a_skipped_document_is_not_asked_for()
    {
        var onlyDeposits = new[] { Doc("form106", 2025), Doc("pension_report", 2025, "deposits") };
        var review = Case("Fired", new DateOnly(2025, 1, 1), new DateOnly(2025, 12, 31), DateTimeOffset.Parse("2026-01-01T00:00:00Z"), onlyDeposits);
        var skipped = Case("Fired", new DateOnly(2025, 1, 1), new DateOnly(2025, 12, 31), DateTimeOffset.Parse("2026-01-01T00:00:00Z"), onlyDeposits,
            """[{"documentType":"pension_annual","year":2025,"month":null}]""");

        var asked = ReminderPlanner.Plan(new DateOnly(2026, 3, 5), review).Single(r => r.Kind == ReminderKind.YearEndDocs);

        Assert.Equal(new[] { "pension_annual" }, asked.Missing);
        Assert.DoesNotContain(ReminderPlanner.Plan(new DateOnly(2026, 3, 5), skipped), r => r.Kind == ReminderKind.YearEndDocs);
    }

    [Fact]
    public void Someone_still_working_is_asked_to_check_again_once_a_quarter_after_a_quiet_spell()
    {
        var review = Case("Ongoing", new DateOnly(2024, 1, 1), new DateOnly(2026, 6, 30), DateTimeOffset.Parse("2026-05-01T00:00:00Z"));

        var soon = ReminderPlanner.Plan(new DateOnly(2026, 6, 1), review);
        var later = ReminderPlanner.Plan(new DateOnly(2026, 10, 10), review);

        Assert.DoesNotContain(soon, r => r.Kind == ReminderKind.RegularCheck);
        Assert.Contains(later, r => r.Kind == ReminderKind.RegularCheck && r.RefKey == "check:2026-Q4");
    }

    [Fact]
    public void A_case_that_ended_is_not_sent_the_regular_check()
    {
        var review = Case("Fired", new DateOnly(2024, 1, 1), new DateOnly(2025, 6, 30), DateTimeOffset.Parse("2025-07-01T00:00:00Z"));

        Assert.DoesNotContain(ReminderPlanner.Plan(new DateOnly(2026, 10, 10), review), r => r.Kind == ReminderKind.RegularCheck);
    }
}
