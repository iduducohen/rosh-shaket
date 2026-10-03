using Microsoft.AspNetCore.Mvc;
using RoshShaket.Application.Payslips;
using RoshShaket.Application.UseCases;
using RoshShaket.Domain;

namespace RoshShaket.Api.Endpoints;

public static class PayslipEndpoints
{
    public const string RateLimitPolicy = "payslip";

    public static IEndpointRouteBuilder MapPayslipEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/payslips/extract", async (IFormFileCollection files, System.Security.Claims.ClaimsPrincipal user, ExtractPayslipHandler handler, CancellationToken ct) =>
            {
                var images = new List<PayslipImage>(files.Count);
                foreach (var file in files)
                {
                    if (file.Length > PayslipUploadPolicy.MaxBytesPerImage)
                        throw new DomainValidationException(new Dictionary<string, string> { ["size"] = "כל תמונה עד 10MB" });

                    using var buffer = new MemoryStream((int)file.Length);
                    await file.CopyToAsync(buffer, ct);
                    images.Add(new PayslipImage(buffer.ToArray(), file.ContentType));
                }
                // Images live only in memory for this request; nothing is persisted.
                return TypedResults.Ok(await handler.HandleAsync(images, BillingEndpoints.UserId(user), ct));
            })
            .WithTags("Payslips")
            .DisableAntiforgery()
            .RequireRateLimiting(RateLimitPolicy)
            .WithMetadata(new RequestSizeLimitAttribute(PayslipUploadPolicy.MaxImages * PayslipUploadPolicy.MaxBytesPerImage + 1024 * 1024));

        return app;
    }
}
