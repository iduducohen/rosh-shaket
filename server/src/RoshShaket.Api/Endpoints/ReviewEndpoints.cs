namespace RoshShaket.Api.Endpoints;

public static class ReviewEndpoints
{
    public const string RateLimitPolicy = "reviews";

    public sealed record ReviewDto(int SystemRating, int ExperienceRating, string? Text);

    public static IEndpointRouteBuilder MapReviewEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/reviews", (ReviewDto body, ILoggerFactory logs) =>
            {
                var text = string.IsNullOrWhiteSpace(body.Text) ? null : body.Text.Trim();
                Validate(body.SystemRating, body.ExperienceRating, text);
                logs.CreateLogger("Reviews").LogInformation(
                    "Experience review. System {SystemRating}/5, experience {ExperienceRating}/5. Text: {Text}",
                    body.SystemRating, body.ExperienceRating, text);
                return TypedResults.Accepted("/api/reviews");
            })
            .WithTags("Reviews")
            .RequireRateLimiting(RateLimitPolicy);

        return app;
    }

    private static void Validate(int systemRating, int experienceRating, string? text)
    {
        var errors = new Dictionary<string, string>();
        if (systemRating is < 1 or > 5) errors["systemRating"] = "דרגו את המערכת מ-1 עד 5.";
        if (experienceRating is < 1 or > 5) errors["experienceRating"] = "דרגו את החוויה מ-1 עד 5.";
        if (text is { Length: > 2000 }) errors["text"] = "הביקורת ארוכה מדי.";
        if (errors.Count > 0) throw new Domain.DomainValidationException(errors);
    }
}
