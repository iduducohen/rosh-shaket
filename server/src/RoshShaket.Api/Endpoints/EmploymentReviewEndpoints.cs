using RoshShaket.Application.EmploymentReview;
using RoshShaket.Application.Reconciliation;
using RoshShaket.Application.Reports;
using RoshShaket.Application.Rules.Contribution;
using RoshShaket.Application.Simulation;
using RoshShaket.Domain.Employment;

namespace RoshShaket.Api.Endpoints;

public static class EmploymentReviewEndpoints
{
    public static IEndpointRouteBuilder MapEmploymentReviewEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/employment-review").WithTags("EmploymentReview");

        group.MapGet("/rules", async (IContributionRuleProvider rules, CancellationToken ct) =>
            TypedResults.Ok(await rules.GetAllAsync(ct)));

        group.MapGet("/assumptions", () => TypedResults.Ok(DefaultSimulationAssumptions.Current));

        group.MapPost("/analyze", (AnalyzeRequest body) =>
        {
            var summary = ReconciliationEngine.Summarize(body.Months);
            var anomalies = ReconciliationEngine.DetectAnomalies(body.WorkspaceId, body.Months);
            var matrix = ReconciliationEngine.BuildSourceMatrix(body.Months);
            var (contrib, usedEstimates) = SimulationEngine.FromMonths(body.Months);
            var sims = SimulationEngine.RunScenarios(contrib, body.Assumptions ?? DefaultSimulationAssumptions.Current);
            return TypedResults.Ok(new AnalyzeResponse(summary, anomalies, matrix, sims, usedEstimates));
        });

        group.MapPost("/report", (ReportRequest body, ReconciliationReportBuilder builder) =>
        {
            var review = body.Review;
            var summary = ReconciliationEngine.Summarize(review.Months);
            var anomalies = ReconciliationEngine.DetectAnomalies(review.WorkspaceId, review.Months);
            var matrix = ReconciliationEngine.BuildSourceMatrix(review.Months);
            var (contrib, _) = SimulationEngine.FromMonths(review.Months);
            var sims = SimulationEngine.RunScenarios(contrib, body.Assumptions ?? DefaultSimulationAssumptions.Current);
            var report = builder.Build(review, summary, anomalies, sims, matrix);
            var format = (body.Format ?? "json").ToLowerInvariant();
            return format switch
            {
                "html" => Results.Content(builder.ToHtml(report), "text/html; charset=utf-8"),
                "csv" => Results.Text(builder.ToCsv(report), "text/csv; charset=utf-8"),
                _ => Results.Json(report)
            };
        });

        group.MapGet("/demo", async (EmploymentReviewHandlers handlers, ContributionRulesEngine rules, CancellationToken ct) =>
        {
            var demo = await DemoEmploymentDataset.BuildAsync(handlers, rules, Guid.NewGuid(), ct);
            return TypedResults.Ok(demo);
        });

        // Workspace UUID acts as a capability token so guests also persist across steps.
        group.MapGet("/{workspaceId:guid}", async (Guid workspaceId, EmploymentReviewHandlers handlers, CancellationToken ct) =>
            TypedResults.Ok(await handlers.GetOrCreateAsync(workspaceId, ct)));

        group.MapPut("/{workspaceId:guid}", async (Guid workspaceId, EmploymentReviewCase body, EmploymentReviewHandlers handlers, CancellationToken ct) =>
        {
            if (body.WorkspaceId != workspaceId && body.WorkspaceId != Guid.Empty)
                return Results.BadRequest(new { error = "workspaceId mismatch" });
            var fixedCase = body with { WorkspaceId = workspaceId };
            return TypedResults.Ok(await handlers.SaveCaseAsync(fixedCase, ct));
        });

        group.MapPut("/{workspaceId:guid}/step", async (Guid workspaceId, StepBody body, EmploymentReviewHandlers handlers, CancellationToken ct) =>
            TypedResults.Ok(await handlers.SetCurrentStepAsync(workspaceId, body.Step, ct)));

        group.MapPut("/{workspaceId:guid}/period", async (Guid workspaceId, PeriodBody body, EmploymentReviewHandlers handlers, CancellationToken ct) =>
        {
            var saved = await handlers.SetPeriodAsync(new UpsertPeriodRequest(
                workspaceId, body.EmployerName, body.StartDate, body.EndDate,
                body.SameEmployerThroughout, body.ExitReason, body.HadWorkBreak, body.MultiplePeriods, body.Notes), ct);
            return TypedResults.Ok(saved);
        });

        group.MapPut("/{workspaceId:guid}/salary", async (Guid workspaceId, List<SalarySegmentDto> segments, EmploymentReviewHandlers handlers, CancellationToken ct) =>
            TypedResults.Ok(await handlers.ApplySalaryAsync(workspaceId, segments, ct)));

        group.MapPost("/{workspaceId:guid}/expected", async (Guid workspaceId, EmploymentReviewHandlers handlers, CancellationToken ct) =>
            TypedResults.Ok(await handlers.RecalculateExpectedAsync(workspaceId, ct)));

        group.MapPatch("/{workspaceId:guid}/months", async (Guid workspaceId, List<PatchMonthRequest> patches, EmploymentReviewHandlers handlers, CancellationToken ct) =>
            TypedResults.Ok(await handlers.PatchMonthsAsync(workspaceId, patches, ct)));

        group.MapPut("/{workspaceId:guid}/funds", async (Guid workspaceId, List<FundAccount> funds, EmploymentReviewHandlers handlers, CancellationToken ct) =>
            TypedResults.Ok(await handlers.SetFundsAsync(workspaceId, funds, ct)));

        group.MapPost("/{workspaceId:guid}/documents/meta", async (Guid workspaceId, ReviewDocumentMeta meta, EmploymentReviewHandlers handlers, CancellationToken ct) =>
            TypedResults.Ok(await handlers.AddDocumentMetaAsync(workspaceId, meta, ct)));

        group.MapPut("/{workspaceId:guid}/documents/{documentId:guid}", async (Guid workspaceId, Guid documentId, ReviewDocumentMeta meta, EmploymentReviewHandlers handlers, CancellationToken ct) =>
            TypedResults.Ok(await handlers.UpdateDocumentMetaAsync(workspaceId, documentId, meta, ct)));

        group.MapDelete("/{workspaceId:guid}/documents/{documentId:guid}", async (Guid workspaceId, Guid documentId, EmploymentReviewHandlers handlers, CancellationToken ct) =>
            TypedResults.Ok(await handlers.RemoveDocumentMetaAsync(workspaceId, documentId, ct)));

        return app;
    }

    public sealed record StepBody(string? Step);

    public sealed record PeriodBody(
        string? EmployerName,
        DateOnly StartDate,
        DateOnly EndDate,
        bool SameEmployerThroughout,
        string? ExitReason,
        bool HadWorkBreak,
        bool MultiplePeriods,
        string? Notes);

    public sealed record AnalyzeRequest(
        Guid WorkspaceId,
        IReadOnlyList<EmploymentMonth> Months,
        SimulationAssumptions? Assumptions);

    public sealed record AnalyzeResponse(
        ReconciliationSummary Summary,
        IReadOnlyList<Anomaly> Anomalies,
        SourceMatrix Matrix,
        IReadOnlyList<SimulationResult> Simulations,
        bool UsedEstimates);

    public sealed record ReportRequest(
        EmploymentReviewCase Review,
        SimulationAssumptions? Assumptions,
        string? Format);
}
