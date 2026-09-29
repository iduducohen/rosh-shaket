using System.Net.Mail;
using RoshShaket.Application.Abstractions;
using RoshShaket.Domain;

namespace RoshShaket.Api.Endpoints;

public static class HelpEndpoints
{
    public const string RateLimitPolicy = "help";

    public sealed record HelpRequestDto(
        string Kind,
        string Name,
        string Phone,
        string Email,
        string? Note,
        string? Reason,
        decimal? EstimatedTotal,
        string? PartnerId,
        string? Channel);

    public static IEndpointRouteBuilder MapHelpEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/help-requests", async (HelpRequestDto body, IPartnerCatalog catalog, ILoggerFactory logs, CancellationToken ct) =>
            {
                var partners = await catalog.GetAsync(ct);
                var partner = Validate(body, partners);
                logs.CreateLogger("HelpRequests").LogInformation(
                    "Paid help request {Kind} via {Channel} from {Name}, phone {Phone}, email {Email}. Partner {Partner}. Reason {Reason}, estimate {Estimate}. Note: {Note}",
                    body.Kind, body.Channel, body.Name.Trim(), body.Phone.Trim(), body.Email.Trim(),
                    partner?.Name, body.Reason, body.EstimatedTotal, body.Note?.Trim());
                return TypedResults.Accepted("/api/help-requests");
            })
            .WithTags("Help")
            .RequireRateLimiting(RateLimitPolicy);

        return app;
    }

    private static PartnerOffer? Validate(HelpRequestDto body, IReadOnlyList<PartnerOffer> partners)
    {
        var errors = new Dictionary<string, string>();
        if (body.Kind is not ("Professional" or "Lawyer")) errors["kind"] = "בחרו איש מקצוע או עורך דין.";
        if (string.IsNullOrWhiteSpace(body.Name) || body.Name.Trim().Length < 2) errors["name"] = "הכניסו שם.";
        var digits = new string((body.Phone ?? "").Where(char.IsDigit).ToArray());
        if (digits.Length is < 9 or > 15) errors["phone"] = "הכניסו מספר טלפון.";
        if (string.IsNullOrWhiteSpace(body.Email) || !MailAddress.TryCreate(body.Email.Trim(), out _))
            errors["email"] = "הכניסו כתובת אימייל תקינה.";
        if (body.Note is { Length: > 1000 }) errors["note"] = "ההערה ארוכה מדי.";
        if (body.Channel is not (null or "" or "Email" or "WhatsApp")) errors["channel"] = "בחרו מייל או וואטסאפ.";

        PartnerOffer? partner = null;
        if (!string.IsNullOrWhiteSpace(body.PartnerId))
        {
            partner = partners.FirstOrDefault(p => p.Id == body.PartnerId.Trim());
            if (partner is null || partner.Kind != body.Kind) errors["partnerId"] = "בחרו איש מקצוע מהרשימה.";
        }

        if (errors.Count > 0) throw new DomainValidationException(errors);
        return partner;
    }
}
