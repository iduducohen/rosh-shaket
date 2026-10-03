using System.Security.Claims;
using RoshShaket.Domain;
using RoshShaket.Infrastructure.Postgres;

namespace RoshShaket.Api.Endpoints;

/// <summary>Saved passwords for the user's protected PDFs, so no device asks for them twice. Signed-in users only.</summary>
public static class PdfPasswordEndpoints
{
    public sealed record PdfPasswordBody(string Password);
    public sealed record PdfPasswordsResponse(IReadOnlyList<string> Passwords);

    public static IEndpointRouteBuilder MapPdfPasswordEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/pdf-passwords").WithTags("PdfPasswords").RequireAuthorization();

        group.MapGet("/", async (ClaimsPrincipal user, IPdfPasswordStore store, CancellationToken ct) =>
            TypedResults.Ok(new PdfPasswordsResponse(await store.ListAsync(BillingEndpoints.UserId(user)!.Value, ct))));

        group.MapPost("/", async (PdfPasswordBody body, ClaimsPrincipal user, IPdfPasswordStore store, CancellationToken ct) =>
        {
            if (string.IsNullOrEmpty(body.Password) || body.Password.Length > PostgresPdfPasswordStore.MaxLength)
                throw new DomainValidationException(new Dictionary<string, string> { ["password"] = "סיסמה לא תקינה" });
            await store.AddAsync(BillingEndpoints.UserId(user)!.Value, body.Password, ct);
            return TypedResults.NoContent();
        });

        group.MapDelete("/", async (ClaimsPrincipal user, IPdfPasswordStore store, CancellationToken ct) =>
        {
            await store.DeleteAllAsync(BillingEndpoints.UserId(user)!.Value, ct);
            return TypedResults.NoContent();
        });

        return app;
    }
}
