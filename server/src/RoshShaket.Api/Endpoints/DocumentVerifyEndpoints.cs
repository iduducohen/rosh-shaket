using Microsoft.AspNetCore.Mvc;
using RoshShaket.Application.Documents;
using RoshShaket.Application.Payslips;
using RoshShaket.Application.UseCases;
using RoshShaket.Domain;

namespace RoshShaket.Api.Endpoints;

public static class DocumentVerifyEndpoints
{
    public const string RateLimitPolicy = "document-verify";

    public static IEndpointRouteBuilder MapDocumentVerifyEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/documents/verify", async (
                HttpRequest http,
                System.Security.Claims.ClaimsPrincipal user,
                VerifyDocumentHandler handler,
                CancellationToken ct) =>
            {
                if (!http.HasFormContentType)
                    throw new DomainValidationException(new Dictionary<string, string> { ["form"] = "נדרש multipart/form-data" });

                var form = await http.ReadFormAsync(ct);
                var files = form.Files;
                var expectedType = form["expectedType"].ToString();
                if (!int.TryParse(form["expectedYear"], out var expectedYear))
                    throw new DomainValidationException(new Dictionary<string, string> { ["expectedYear"] = "שנה לא תקינה" });

                int? expectedMonth = null;
                var monthRaw = form["expectedMonth"].ToString();
                if (!string.IsNullOrWhiteSpace(monthRaw))
                {
                    if (!int.TryParse(monthRaw, out var m) || m is < 1 or > 12)
                        throw new DomainValidationException(new Dictionary<string, string> { ["expectedMonth"] = "חודש לא תקין" });
                    expectedMonth = m;
                }

                var images = new List<PayslipImage>(files.Count);
                foreach (var file in files)
                {
                    if (file.Length > DocumentVerifyUploadPolicy.MaxBytesPerImage)
                        throw new DomainValidationException(new Dictionary<string, string> { ["size"] = "כל תמונה עד 10MB" });

                    using var buffer = new MemoryStream((int)file.Length);
                    await file.CopyToAsync(buffer, ct);
                    var media = string.IsNullOrWhiteSpace(file.ContentType) ? "image/jpeg" : file.ContentType;
                    images.Add(new PayslipImage(buffer.ToArray(), media));
                }

                var request = new DocumentVerifyRequest(expectedType, expectedYear, expectedMonth);
                return TypedResults.Ok(await handler.HandleAsync(images, request, BillingEndpoints.UserId(user), ct));
            })
            .WithTags("Documents")
            .DisableAntiforgery()
            .RequireRateLimiting(RateLimitPolicy)
            .WithMetadata(new RequestSizeLimitAttribute(
                DocumentVerifyUploadPolicy.MaxImages * DocumentVerifyUploadPolicy.MaxBytesPerImage + 1024 * 1024));

        return app;
    }
}
