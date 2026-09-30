namespace RoshShaket.Application.Workspaces;

public interface IWorkspaceRepository
{
    Task<IReadOnlyList<WorkspaceSummary>> ListAsync(Guid userId, CancellationToken ct);
    Task<UserWorkspace?> GetAsync(Guid userId, Guid workspaceId, CancellationToken ct);
    Task<UserWorkspace?> GetActiveAsync(Guid userId, CancellationToken ct);
    Task<UserWorkspace> CreateAsync(Guid userId, string name, CancellationToken ct);
    Task<UserWorkspace> UpsertWorkflowAsync(Guid userId, Guid workspaceId, UpsertWorkflowCommand cmd, CancellationToken ct);
    Task TouchAsync(Guid userId, Guid workspaceId, CancellationToken ct);
    Task SoftDeleteAsync(Guid userId, Guid workspaceId, CancellationToken ct);
    Task SetActiveAsync(Guid userId, Guid workspaceId, CancellationToken ct);
}

public interface IDocumentRepository
{
    Task<IReadOnlyList<DocumentInfo>> ListAsync(Guid userId, Guid workspaceId, CancellationToken ct);
    Task<DocumentInfo?> GetAsync(Guid userId, Guid documentId, CancellationToken ct);
    Task<DocumentInfo> AddAsync(DocumentInfo draft, CancellationToken ct);
    Task MarkReadyAsync(Guid userId, Guid documentId, string storageKey, string hash, CancellationToken ct);
    Task SoftDeleteAsync(Guid userId, Guid documentId, CancellationToken ct);
}

public interface IFileStorage
{
    string ProviderName { get; }
    Task SaveAsync(string storageKey, Stream content, string contentType, CancellationToken ct);
    Task<Stream> OpenReadAsync(string storageKey, CancellationToken ct);
    Task DeleteAsync(string storageKey, CancellationToken ct);
    Task<bool> ExistsAsync(string storageKey, CancellationToken ct);
}

public interface IWorkspaceAudit
{
    Task RecordAsync(Guid userId, Guid? workspaceId, string action, string? entityType, Guid? entityId,
        string? previousValue, string? newValue, string? metadataJson, CancellationToken ct);
}
