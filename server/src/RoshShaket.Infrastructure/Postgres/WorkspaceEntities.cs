using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using RoshShaket.Application.Workspaces;

namespace RoshShaket.Infrastructure.Postgres;

public sealed class WorkspaceRow
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public UserRow? User { get; set; }
    public string Name { get; set; } = "";
    public string Status { get; set; } = nameof(WorkspaceStatus.Active);
    public string CurrentStep { get; set; } = "start";
    public string CurrentRoute { get; set; } = "/start";
    public bool IsActive { get; set; } = true;
    public int Version { get; set; } = 1;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset LastAccessedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
    public WorkflowStateRow? Workflow { get; set; }
    public List<DocumentRow> Documents { get; set; } = [];
}

public sealed class WorkflowStateRow
{
    public Guid WorkspaceId { get; set; }
    public WorkspaceRow? Workspace { get; set; }
    public string CurrentStep { get; set; } = "start";
    public string? PreviousStep { get; set; }
    public string Status { get; set; } = nameof(WorkflowStatus.InProgress);
    public int ProgressPercentage { get; set; }
    public string StateJson { get; set; } = "{}";
    public int Version { get; set; } = 1;
    public int StateSchemaVersion { get; set; } = 1;
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset LastUpdatedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
}

public sealed class DocumentRow
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public WorkspaceRow? Workspace { get; set; }
    public Guid UserId { get; set; }
    public string DocumentType { get; set; } = "payslip";
    public string OriginalFileName { get; set; } = "";
    public string StoredFileName { get; set; } = "";
    public string ContentType { get; set; } = "";
    public long FileSize { get; set; }
    public string StorageProvider { get; set; } = "local";
    public string StorageKey { get; set; } = "";
    public string HashSha256 { get; set; } = "";
    public int Version { get; set; } = 1;
    public string Status { get; set; } = "Pending";
    public string? MetadataJson { get; set; }
    public DateTimeOffset UploadedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
}

public sealed class WorkspaceAuditRow
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid? WorkspaceId { get; set; }
    public string Action { get; set; } = "";
    public string? EntityType { get; set; }
    public Guid? EntityId { get; set; }
    public string? PreviousValue { get; set; }
    public string? NewValue { get; set; }
    public string? MetadataJson { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public static class WorkspaceMapping
{
    public static WorkspaceSummary ToSummary(WorkspaceRow w, int docCount) => new(
        w.Id, w.Name, Enum.Parse<WorkspaceStatus>(w.Status), w.CurrentStep, w.CurrentRoute,
        docCount, w.UpdatedAt, w.LastAccessedAt, w.Version);

    public static UserWorkspace ToModel(WorkspaceRow w)
    {
        var docs = (w.Documents ?? [])
            .Where(d => d.DeletedAt is null)
            .Select(ToDocument)
            .ToList();
        return new UserWorkspace(
            w.Id, w.UserId, w.Name, Enum.Parse<WorkspaceStatus>(w.Status),
            w.CurrentStep, w.CurrentRoute, w.IsActive, w.Version,
            w.CreatedAt, w.UpdatedAt, w.LastAccessedAt, w.CompletedAt,
            w.Workflow is null ? null : ToWorkflow(w.Workflow), docs);
    }

    public static WorkflowState ToWorkflow(WorkflowStateRow r)
    {
        var snap = JsonSerializer.Deserialize<WizardSnapshot>(r.StateJson, WizardSnapshotJson.Options)
            ?? new WizardSnapshot(null, "{}", null, null, false, null, null, 0, "/start", "start");
        return new WorkflowState(
            r.WorkspaceId, r.CurrentStep, r.PreviousStep, Enum.Parse<WorkflowStatus>(r.Status),
            r.ProgressPercentage, snap, r.Version, r.StartedAt, r.LastUpdatedAt, r.CompletedAt);
    }

    public static DocumentInfo ToDocument(DocumentRow d) => new(
        d.Id, d.WorkspaceId, d.UserId, d.DocumentType, d.OriginalFileName, d.ContentType, d.FileSize,
        d.StorageProvider, d.StorageKey, d.HashSha256, d.Version, d.Status,
        d.UploadedAt, d.UpdatedAt, d.DeletedAt, d.MetadataJson);
}
