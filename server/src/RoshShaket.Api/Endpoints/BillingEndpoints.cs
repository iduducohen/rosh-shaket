using System.Security.Claims;
using RoshShaket.Application.Billing;

namespace RoshShaket.Api.Endpoints;

public static class BillingEndpoints
{
    public sealed record CheckoutRequest(string PlanId);

    public sealed record PlansResponse(IReadOnlyList<BillingPlan> Plans, int FreeDocuments, bool Enabled, bool CheckoutAvailable, bool Simulated);

    public static IEndpointRouteBuilder MapBillingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/billing").WithTags("Billing");

        group.MapGet("/plans", (BillingHandlers billing) =>
            TypedResults.Ok(new PlansResponse(
                BillingCatalog.Plans,
                billing.FreeDocuments,
                billing.Enabled,
                CheckoutAvailable: !billing.Provider.Equals("None", StringComparison.OrdinalIgnoreCase),
                Simulated: billing.Provider.Equals("Simulated", StringComparison.OrdinalIgnoreCase))));

        group.MapGet("/me", async (ClaimsPrincipal user, BillingHandlers billing, CancellationToken ct) =>
                TypedResults.Ok(await billing.GetAccountAsync(UserId(user)!.Value, ct)))
            .RequireAuthorization();

        group.MapPost("/checkout", async (CheckoutRequest req, ClaimsPrincipal user, BillingHandlers billing, CancellationToken ct) =>
                TypedResults.Ok(await billing.CheckoutAsync(UserId(user)!.Value, req.PlanId, ct)))
            .RequireAuthorization();

        return app;
    }

    /// <summary>Signed-in user id, or null for guests (endpoints that allow both).</summary>
    public static Guid? UserId(ClaimsPrincipal user) =>
        Guid.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;
}
