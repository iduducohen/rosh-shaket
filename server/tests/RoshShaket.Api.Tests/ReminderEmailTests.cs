using Microsoft.AspNetCore.DataProtection;
using RoshShaket.Infrastructure.Auth;
using RoshShaket.Infrastructure.Reminders;
using Xunit;

namespace RoshShaket.Api.Tests;

public class ReminderEmailTests
{
    [Fact]
    public void The_regular_check_email_fills_every_placeholder_and_links_to_the_app()
    {
        var m = EmailContent.ReviewReminder("a@b.co", "https://app.example/review/documents", "https://api.example/u?token=x", "check:2026-Q4");

        Assert.Equal(EmailContent.ReviewReminderKind, m.Kind);
        Assert.Equal("check:2026-Q4", m.RefKey);
        Assert.DoesNotContain("{{{", m.Html);
        Assert.Contains("https://app.example/review/documents", m.Html);
        Assert.Contains("להפסקת קבלת תזכורות", m.Html);
    }

    [Fact]
    public void The_year_end_email_names_the_missing_documents_and_changes_tone_the_second_time()
    {
        var first = EmailContent.YearEndDocsReminder("a@b.co", 2025, ["form106", "pension_annual"], false, "https://app/x", "https://api/u", "yearend:2025:1");
        var second = EmailContent.YearEndDocsReminder("a@b.co", 2025, ["form106"], true, "https://app/x", "https://api/u", "yearend:2025:2");

        Assert.DoesNotContain("{{{", first.Html);
        Assert.Contains("טופס 106", first.Html);
        Assert.Contains("הדוח השנתי המפורט לעמיתים", first.Html);
        Assert.Contains("2025", first.Subject);
        Assert.Contains("אמורים להגיע", first.Html);
        Assert.Contains("עדיין לא הועלו", second.Html);
        Assert.DoesNotContain("הדוח השנתי המפורט לעמיתים", second.Html.Split("מה עוד חסר")[1].Split("טופס 106 מגיע")[0]);
    }

    [Fact]
    public void The_unsubscribe_token_returns_the_address_and_rejects_tampering()
    {
        var provider = new EphemeralDataProtectionProvider();

        var token = ReminderToken.Create(provider, "Someone@Example.com ");

        Assert.Equal("someone@example.com", ReminderToken.Read(provider, token));
        Assert.Null(ReminderToken.Read(provider, token + "x"));
        Assert.Null(ReminderToken.Read(provider, null));
        Assert.Null(ReminderToken.Read(new EphemeralDataProtectionProvider(), token));
    }
}
