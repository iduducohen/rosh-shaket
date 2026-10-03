using System.Security.Claims;
using RoshShaket.Application.Abstractions;
using RoshShaket.Domain;
using RoshShaket.Infrastructure.Postgres;

namespace RoshShaket.Api.Endpoints;

/// <summary>Ratings and reviews of the professionals and law firms, so users can choose by others' experience.</summary>
public static class PartnerReviewEndpoints
{
    public sealed record ReviewBody(int Rating, string? Text);

    public static IEndpointRouteBuilder MapPartnerReviewEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/partners/{partnerId}/reviews").WithTags("PartnerReviews");

        // Public: anyone choosing a professional can read what others wrote.
        group.MapGet("/", async (string partnerId, ClaimsPrincipal user, IPartnerReviewStore reviews, CancellationToken ct) =>
            TypedResults.Ok(await reviews.ListAsync(partnerId, BillingEndpoints.UserId(user), ct)));

        // Writing needs an account: one review per user per partner, which they can change or remove.
        group.MapPut("/me", async (string partnerId, ReviewBody body, ClaimsPrincipal user, IPartnerCatalog catalog,
            IPartnerReviewStore reviews, CancellationToken ct) =>
        {
            var errors = new Dictionary<string, string>();
            if (!(await catalog.GetAsync(ct)).Any(p => p.Id == partnerId)) errors["partnerId"] = "הגורם לא נמצא";
            if (body.Rating is < 1 or > 5) errors["rating"] = "בחרו דירוג בין 1 ל־5";
            if (body.Text is { Length: > PostgresPartnerReviewStore.MaxTextLength }) errors["text"] = "עד 1000 תווים";
            if (errors.Count > 0) throw new DomainValidationException(errors);
            await reviews.SaveAsync(BillingEndpoints.UserId(user)!.Value, partnerId, body.Rating, body.Text, ct);
            return TypedResults.NoContent();
        }).RequireAuthorization().RequireRateLimiting(HelpEndpoints.RateLimitPolicy);

        group.MapDelete("/me", async (string partnerId, ClaimsPrincipal user, IPartnerReviewStore reviews, CancellationToken ct) =>
        {
            await reviews.DeleteAsync(BillingEndpoints.UserId(user)!.Value, partnerId, ct);
            return TypedResults.NoContent();
        }).RequireAuthorization();

        return app;
    }
}
