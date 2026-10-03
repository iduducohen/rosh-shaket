using RoshShaket.Api.Contracts;
using RoshShaket.Application.Reports;

namespace RoshShaket.Api.Endpoints;

public static class ReportEndpoints
{
    public static IEndpointRouteBuilder MapReportEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/reports").WithTags("Reports");

        group.MapPost("/", async (BuildReportRequest req, BuildReportHandler handler, CancellationToken ct) =>
        {
            var report = await handler.HandleAsync(ToCommand(req), ct);
            return TypedResults.Ok(RightsReportDto.From(report));
        });

        group.MapPost("/export", async (BuildReportRequest req, string? format, BuildReportHandler handler, CancellationToken ct) =>
        {
            var report = await handler.HandleAsync(ToCommand(req), ct);
            var kind = (format ?? "html").Trim().ToLowerInvariant();
            return kind switch
            {
                "json" => FileResult(ReportExporter.ToJson(report), "application/json; charset=utf-8", "rosh-shaket-report.json"),
                "csv" => FileResult(ReportExporter.ToCsv(report), "text/csv; charset=utf-8", "rosh-shaket-report.csv"),
                _ => FileResult(ReportExporter.ToHtml(report), "text/html; charset=utf-8", "rosh-shaket-report.html")
            };
        });

        return app;
    }

    private static BuildReportCommand ToCommand(BuildReportRequest req) =>
        new(
            req.Profile.ToDomain(),
            req.Reason,
            req.Compare,
            req.FromPayslip,
            req.PayslipMonth,
            (req.Funds ?? []).Select(f => new ReportFundInput(f.Kind, f.Name, f.Employee, f.Employer, f.Unit, f.Detail)).ToList(),
            string.IsNullOrWhiteSpace(req.EmployerName) ? null : req.EmployerName.Trim());

    private static IResult FileResult(byte[] bytes, string contentType, string fileName) =>
        Results.File(bytes, contentType, fileName);
}
