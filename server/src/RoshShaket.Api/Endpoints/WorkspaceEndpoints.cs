using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using RoshShaket.Application.Workspaces;

namespace RoshShaket.Api.Endpoints;

public sealed record WorkspaceSummaryDto(
    Guid Id, string Name, string Status, string CurrentStep, string CurrentRoute,
    int DocumentCount, DateTimeOffset UpdatedAt, DateTimeOffset LastAccessedAt, int Version);

public sealed record WizardSnapshotDto(
    string? Choice,
    object? Profile,
    object? Funds,
    string[]? FilledFields,
    bool FromPayslip,
    string? PayslipMonth,
    object? Results,
    int ActiveIndex,
    string CurrentRoute,
    string CurrentStep,
    int StateVersion = 1);

public sealed record WorkflowStateDto(
    string CurrentStep, string? PreviousStep, string Status, int ProgressPercentage,
    WizardSnapshotDto Snapshot, int Version, DateTimeOffset StartedAt, DateTimeOffset LastUpdatedAt, DateTimeOffset? CompletedAt);

public sealed record DocumentDto(
    Guid Id, Guid WorkspaceId, string DocumentType, string OriginalFileName, string ContentType,
    long FileSize, int Version, string Status, DateTimeOffset UploadedAt, string? MetadataJson);

public sealed record WorkspaceDto(
    Guid Id, string Name, string Status, string CurrentStep, string CurrentRoute, bool IsActive,
    int Version, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, DateTimeOffset LastAccessedAt,
    DateTimeOffset? CompletedAt, WorkflowStateDto? Workflow, IReadOnlyList<DocumentDto> Documents);

public sealed record CreateWorkspaceRequest(string? Name);

public sealed record SaveWorkspaceStateRequest(
    string? Name,
    string CurrentStep,
    string? PreviousStep,
    string CurrentRoute,
    string Status,
    int ProgressPercentage,
    WizardSnapshotDto Snapshot,
    int? ExpectedVersion);

public static class WorkspaceEndpoints
{
    public static IEndpointRouteBuilder MapWorkspaceEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/workspaces").WithTags("Workspaces").RequireAuthorization();

        group.MapGet("/", async (ClaimsPrincipal user, WorkspaceHandlers handler, CancellationToken ct) =>
        {
            var list = await handler.ListAsync(UserId(user), ct);
            return TypedResults.Ok(list.Select(MapSummary));
        });

        group.MapGet("/current", async (ClaimsPrincipal user, WorkspaceHandlers handler, CancellationToken ct) =>
            TypedResults.Ok(Map(await handler.GetOrCreateActiveAsync(UserId(user), ct))));

        group.MapPost("/", async (CreateWorkspaceRequest req, ClaimsPrincipal user, WorkspaceHandlers handler, CancellationToken ct) =>
            TypedResults.Created($"/api/workspaces", Map(await handler.CreateAsync(UserId(user), req.Name, ct))));

        group.MapGet("/{workspaceId:guid}", async (Guid workspaceId, ClaimsPrincipal user, WorkspaceHandlers handler, CancellationToken ct) =>
            TypedResults.Ok(Map(await handler.GetAsync(UserId(user), workspaceId, ct))));

        group.MapPut("/{workspaceId:guid}/state", async (Guid workspaceId, SaveWorkspaceStateRequest req, ClaimsPrincipal user, WorkspaceHandlers handler, CancellationToken ct) =>
        {
            var status = Enum.TryParse<WorkflowStatus>(req.Status, true, out var s) ? s : WorkflowStatus.InProgress;
            var snap = ToSnapshot(req.Snapshot);
            var cmd = new UpsertWorkflowCommand(req.Name, req.CurrentStep, req.PreviousStep, req.CurrentRoute, status,
                req.ProgressPercentage, snap, req.ExpectedVersion);
            return TypedResults.Ok(Map(await handler.SaveStateAsync(UserId(user), workspaceId, cmd, ct)));
        });

        group.MapPost("/{workspaceId:guid}/activate", async (Guid workspaceId, ClaimsPrincipal user, WorkspaceHandlers handler, CancellationToken ct) =>
        {
            await handler.ActivateAsync(UserId(user), workspaceId, ct);
            return TypedResults.NoContent();
        });

        group.MapDelete("/{workspaceId:guid}", async (Guid workspaceId, ClaimsPrincipal user, WorkspaceHandlers handler, CancellationToken ct) =>
        {
            await handler.SoftDeleteWorkspaceAsync(UserId(user), workspaceId, ct);
            return TypedResults.NoContent();
        });

        group.MapGet("/{workspaceId:guid}/documents", async (Guid workspaceId, ClaimsPrincipal user, WorkspaceHandlers handler, CancellationToken ct) =>
            TypedResults.Ok((await handler.ListDocumentsAsync(UserId(user), workspaceId, ct)).Select(MapDoc)));

        group.MapPost("/{workspaceId:guid}/documents", async (Guid workspaceId, HttpRequest http, ClaimsPrincipal user, WorkspaceHandlers handler, CancellationToken ct) =>
        {
            if (!http.HasFormContentType) return Results.BadRequest();
            var form = await http.ReadFormAsync(ct);
            var file = form.Files.GetFile("file") ?? form.Files.FirstOrDefault();
            if (file is null) return Results.BadRequest();
            var type = form["documentType"].ToString();
            if (string.IsNullOrWhiteSpace(type)) type = "payslip";
            await using var stream = file.OpenReadStream();
            var saved = await handler.UploadDocumentAsync(UserId(user), workspaceId, type, file.FileName,
                file.ContentType ?? "application/octet-stream", stream, file.Length, null, ct);
            return TypedResults.Created($"/api/documents/{saved.Id}", MapDoc(saved));
        });

        var docs = app.MapGroup("/api/documents").WithTags("Documents").RequireAuthorization();
        docs.MapGet("/{documentId:guid}", async Task<Results<FileStreamHttpResult, NotFound>> (Guid documentId, ClaimsPrincipal user, WorkspaceHandlers handler, CancellationToken ct) =>
        {
            var (info, stream) = await handler.DownloadAsync(UserId(user), documentId, ct);
            return TypedResults.File(stream, info.ContentType, info.OriginalFileName);
        });
        docs.MapDelete("/{documentId:guid}", async (Guid documentId, ClaimsPrincipal user, WorkspaceHandlers handler, CancellationToken ct) =>
        {
            await handler.DeleteDocumentAsync(UserId(user), documentId, ct);
            return TypedResults.NoContent();
        });

        return app;
    }

    private static Guid UserId(ClaimsPrincipal user)
    {
        var raw = user.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new UnauthorizedAccessException();
        return Guid.Parse(raw);
    }

    private static WorkspaceSummaryDto MapSummary(WorkspaceSummary s) =>
        new(s.Id, s.Name, s.Status.ToString(), s.CurrentStep, s.CurrentRoute, s.DocumentCount, s.UpdatedAt, s.LastAccessedAt, s.Version);

    private static WorkspaceDto Map(UserWorkspace w) => new(
        w.Id, w.Name, w.Status.ToString(), w.CurrentStep, w.CurrentRoute, w.IsActive, w.Version,
        w.CreatedAt, w.UpdatedAt, w.LastAccessedAt, w.CompletedAt,
        w.Workflow is null ? null : new WorkflowStateDto(
            w.Workflow.CurrentStep, w.Workflow.PreviousStep, w.Workflow.Status.ToString(), w.Workflow.ProgressPercentage,
            FromSnapshot(w.Workflow.Snapshot), w.Workflow.Version, w.Workflow.StartedAt, w.Workflow.LastUpdatedAt, w.Workflow.CompletedAt),
        w.Documents.Select(MapDoc).ToList());

    private static DocumentDto MapDoc(DocumentInfo d) =>
        new(d.Id, d.WorkspaceId, d.DocumentType, d.OriginalFileName, d.ContentType, d.FileSize, d.Version, d.Status, d.UploadedAt, d.MetadataJson);

    private static WizardSnapshotDto FromSnapshot(WizardSnapshot s) =>
        new(s.Choice,
            ParseJson(s.ProfileJson),
            s.FundsJson is null ? null : ParseJson(s.FundsJson),
            s.FilledFieldsJson is null ? null : System.Text.Json.JsonSerializer.Deserialize<string[]>(s.FilledFieldsJson, WizardSnapshotJson.Options),
            s.FromPayslip, s.PayslipMonth,
            s.ResultsJson is null ? null : ParseJson(s.ResultsJson),
            s.ActiveIndex, s.CurrentRoute, s.CurrentStep, s.StateVersion);

    private static WizardSnapshot ToSnapshot(WizardSnapshotDto d) =>
        new(d.Choice,
            System.Text.Json.JsonSerializer.Serialize(d.Profile ?? new { }, WizardSnapshotJson.Options),
            d.Funds is null ? null : System.Text.Json.JsonSerializer.Serialize(d.Funds, WizardSnapshotJson.Options),
            d.FilledFields is null ? null : System.Text.Json.JsonSerializer.Serialize(d.FilledFields, WizardSnapshotJson.Options),
            d.FromPayslip, d.PayslipMonth,
            d.Results is null ? null : System.Text.Json.JsonSerializer.Serialize(d.Results, WizardSnapshotJson.Options),
            d.ActiveIndex, d.CurrentRoute, d.CurrentStep, d.StateVersion <= 0 ? WorkspaceHandlers.CurrentStateVersion : d.StateVersion);

    private static object? ParseJson(string json)
    {
        using var doc = System.Text.Json.JsonDocument.Parse(string.IsNullOrWhiteSpace(json) ? "null" : json);
        return doc.RootElement.Clone();
    }
}
