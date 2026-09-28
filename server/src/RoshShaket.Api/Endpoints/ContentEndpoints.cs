using RoshShaket.Application.UseCases;
using RoshShaket.Domain;

namespace RoshShaket.Api.Endpoints;

public static class ContentEndpoints
{
    public static IEndpointRouteBuilder MapContentEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api").WithTags("Content");

        group.MapGet("/checklist", async (ExitReason reason, GetChecklistHandler handler, CancellationToken ct) =>
            TypedResults.Ok(await handler.HandleAsync(reason, ct)));

        group.MapGet("/sources", async (GetSourcesHandler handler, CancellationToken ct) =>
            TypedResults.Ok(await handler.HandleAsync(ct)));

        return app;
    }
}
