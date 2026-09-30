using RoshShaket.Application.UseCases;
using RoshShaket.Domain;

namespace RoshShaket.Api.Endpoints;

public static class ContentEndpoints
{
    public static IEndpointRouteBuilder MapContentEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api").WithTags("Content");

        group.MapGet("/checklist", async (ExitReason? reason, GetChecklistHandler handler, CancellationToken ct) =>
            TypedResults.Ok(await handler.HandleAsync(reason, ct)));

        group.MapGet("/sources", async (GetSourcesHandler handler, CancellationToken ct) =>
            TypedResults.Ok(await handler.HandleAsync(ct)));

        group.MapGet("/partners", async (string? kind, GetPartnersHandler handler, CancellationToken ct) =>
        {
            if (kind is not (null or "Professional" or "Lawyer"))
                throw new DomainValidationException(new Dictionary<string, string> { ["kind"] = "בחרו איש מקצוע או עורך דין." });
            return TypedResults.Ok(await handler.HandleAsync(kind, ct));
        });

        return app;
    }
}
