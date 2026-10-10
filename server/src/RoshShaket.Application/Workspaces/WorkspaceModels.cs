using System.Text.Json;

namespace RoshShaket.Application.Workspaces;

public enum WorkspaceStatus
{
    Active,
    Completed,
    Archived
}

public enum WorkflowStatus
{
    InProgress,
    Calculated,
    Completed
}

/// <summary>Persisted wizard snapshot. Mirrors client WizardStore transport shapes (not domain EmploymentProfile).</summary>
public sealed record WizardSnapshot(
    string? Choice,
    string ProfileJson,
    string? FundsJson,
    string? FilledFieldsJson,
    bool FromPayslip,
    string? PayslipMonth,
    string? ResultsJson,
    int ActiveIndex,
    string CurrentRoute,
    string CurrentStep,
    int StateVersion = 1,
    /// <summary>The user's own marks (checklist ticks, tax-refund answers), so another device shows the same.</summary>
    string? PrefsJson = null);

public sealed record UserWorkspace(
    Guid Id,
    Guid UserId,
    string Name,
    WorkspaceStatus Status,
    string CurrentStep,
    string CurrentRoute,
    bool IsActive,
    int Version,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    DateTimeOffset LastAccessedAt,
    DateTimeOffset? CompletedAt,
    WorkflowState? Workflow,
    IReadOnlyList<DocumentInfo> Documents);

public sealed record WorkflowState(
    Guid WorkspaceId,
    string CurrentStep,
    string? PreviousStep,
    WorkflowStatus Status,
    int ProgressPercentage,
    WizardSnapshot Snapshot,
    int Version,
    DateTimeOffset StartedAt,
    DateTimeOffset LastUpdatedAt,
    DateTimeOffset? CompletedAt);

public sealed record DocumentInfo(
    Guid Id,
    Guid WorkspaceId,
    Guid UserId,
    string DocumentType,
    string OriginalFileName,
    string ContentType,
    long FileSize,
    string StorageProvider,
    string StorageKey,
    string HashSha256,
    int Version,
    string Status,
    DateTimeOffset UploadedAt,
    DateTimeOffset UpdatedAt,
    DateTimeOffset? DeletedAt,
    string? MetadataJson);

public sealed record WorkspaceSummary(
    Guid Id,
    string Name,
    WorkspaceStatus Status,
    string CurrentStep,
    string CurrentRoute,
    int DocumentCount,
    DateTimeOffset UpdatedAt,
    DateTimeOffset LastAccessedAt,
    int Version);

public sealed record UpsertWorkflowCommand(
    string? Name,
    string CurrentStep,
    string? PreviousStep,
    string CurrentRoute,
    WorkflowStatus Status,
    int ProgressPercentage,
    WizardSnapshot Snapshot,
    int? ExpectedVersion);

public sealed class ConcurrencyConflictException(string message) : Exception(message);
public sealed class NotFoundException(string message) : Exception(message);
public sealed class ForbiddenException(string message) : Exception(message);

public static class WizardSnapshotJson
{
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };
}
