using RoshShaket.Api.Contracts;
using RoshShaket.Application.UseCases;

namespace RoshShaket.Api.Endpoints;

public static class CalculationEndpoints
{
    public static IEndpointRouteBuilder MapCalculationEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/calculations").WithTags("Calculations");

        group.MapPost("/", async (CalculateRequest req, CalculateRightsHandler handler, CancellationToken ct) =>
        {
            var command = new CalculateRightsCommand(req.Profile.ToDomain(), req.Reason, req.FromPayslip, req.ConsentToAnonymousStats);
            return TypedResults.Ok(CalculationResponse.From(await handler.HandleAsync(command, ct)));
        });

        group.MapPost("/compare", async (CompareRequest req, CompareScenariosHandler handler, CancellationToken ct) =>
        {
            var results = await handler.HandleAsync(req.Profile.ToDomain(), req.FromPayslip, ct);
            return TypedResults.Ok(results.Select(CalculationResponse.From).ToList());
        });

        return app;
    }
}
