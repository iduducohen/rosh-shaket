using System.Net;
using Microsoft.AspNetCore.DataProtection;
using RoshShaket.Infrastructure.Postgres;
using RoshShaket.Infrastructure.Reminders;

namespace RoshShaket.Api.Endpoints;

public static class ReminderEndpoints
{
    public static IEndpointRouteBuilder MapReminderEndpoints(this IEndpointRouteBuilder app)
    {
        // The link in every reminder email. A GET that works without signing in, because it is opened from a mailbox.
        app.MapGet("/api/reminders/unsubscribe", async (string? token, IDataProtectionProvider protection, IReminderOptOut optOut, CancellationToken ct) =>
        {
            var email = ReminderToken.Read(protection, token);
            if (email is null)
                return Results.Content(Page("הקישור לא תקין", "הקישור פג או שאינו תקין. אפשר לבקש להפסיק תזכורות מהמייל האחרון שקיבלתם."), "text/html; charset=utf-8", statusCode: 400);

            await optOut.OptOutAsync(email, ct);
            return Results.Content(
                Page("לא נשלח אליכם תזכורות", $"הכתובת {WebUtility.HtmlEncode(email)} הוסרה מרשימת התזכורות. אפשר להמשיך להשתמש באתר כרגיל."),
                "text/html; charset=utf-8");
        }).WithTags("Reminders").ExcludeFromDescription();

        return app;
    }

    private static string Page(string title, string body) => $$"""
        <!DOCTYPE html>
        <html dir="rtl" lang="he"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
        <title>{{title}}</title>
        <style>body{margin:0;background:#f4f2ec;font-family:'Heebo','Segoe UI',Arial,sans-serif;color:#1f2a2a}
        main{max-width:520px;margin:12vh auto;padding:32px;background:#fff;border:1px solid #e4e1d8;border-radius:16px}
        h1{margin:0 0 12px;font-size:24px}p{margin:0;font-size:16px;line-height:1.7;color:#3a4544}</style></head>
        <body><main><h1>{{title}}</h1><p>{{body}}</p></main></body></html>
        """;
}
