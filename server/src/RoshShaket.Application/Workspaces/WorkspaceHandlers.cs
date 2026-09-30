using System.Security.Cryptography;
using Microsoft.Extensions.Logging;
using RoshShaket.Domain;

namespace RoshShaket.Application.Workspaces;

public sealed class WorkspaceHandlers(
    IWorkspaceRepository workspaces,
    IDocumentRepository documents,
    IFileStorage files,
    IWorkspaceAudit audit,
    ILogger<WorkspaceHandlers> log)
{
    public const int CurrentStateVersion = 1;
    public const long MaxDocumentBytes = 10 * 1024 * 1024;
    private static readonly HashSet<string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg", "image/png", "image/webp", "application/pdf"
    };

    public Task<IReadOnlyList<WorkspaceSummary>> ListAsync(Guid userId, CancellationToken ct) =>
        workspaces.ListAsync(userId, ct);

    public async Task<UserWorkspace> GetOrCreateActiveAsync(Guid userId, CancellationToken ct)
    {
        var existing = await workspaces.GetActiveAsync(userId, ct);
        if (existing is not null)
        {
            await workspaces.TouchAsync(userId, existing.Id, ct);
            await audit.RecordAsync(userId, existing.Id, "WORKFLOW_RESUMED", "Workspace", existing.Id, null, null, null, ct);
            return (await workspaces.GetAsync(userId, existing.Id, ct))!;
        }

        var created = await workspaces.CreateAsync(userId, "חישוב זכויות", ct);
        await audit.RecordAsync(userId, created.Id, "WORKFLOW_STARTED", "Workspace", created.Id, null, null, null, ct);
        log.LogInformation("Workspace {WorkspaceId} created for user {UserId}", created.Id, userId);
        return created;
    }

    public async Task<UserWorkspace> GetAsync(Guid userId, Guid workspaceId, CancellationToken ct)
    {
        var ws = await workspaces.GetAsync(userId, workspaceId, ct)
            ?? throw new NotFoundException("Workspace not found");
        await workspaces.TouchAsync(userId, workspaceId, ct);
        return ws;
    }

    public async Task<UserWorkspace> CreateAsync(Guid userId, string? name, CancellationToken ct)
    {
        var created = await workspaces.CreateAsync(userId, string.IsNullOrWhiteSpace(name) ? "חישוב זכויות" : name.Trim(), ct);
        await audit.RecordAsync(userId, created.Id, "WORKFLOW_STARTED", "Workspace", created.Id, null, null, null, ct);
        return created;
    }

    public async Task<UserWorkspace> SaveStateAsync(Guid userId, Guid workspaceId, UpsertWorkflowCommand cmd, CancellationToken ct)
    {
        try
        {
            var updated = await workspaces.UpsertWorkflowAsync(userId, workspaceId, cmd with
            {
                Snapshot = cmd.Snapshot with { StateVersion = Math.Max(cmd.Snapshot.StateVersion, CurrentStateVersion) }
            }, ct);
            await audit.RecordAsync(userId, workspaceId, "FORM_UPDATED", "WorkflowState", workspaceId,
                null, cmd.CurrentStep, null, ct);
            log.LogInformation("Workspace {WorkspaceId} state saved (v{Version})", workspaceId, updated.Version);
            return updated;
        }
        catch (ConcurrencyConflictException)
        {
            log.LogWarning("Concurrency conflict saving workspace {WorkspaceId} for user {UserId}", workspaceId, userId);
            throw;
        }
    }

    public async Task SoftDeleteWorkspaceAsync(Guid userId, Guid workspaceId, CancellationToken ct)
    {
        await workspaces.SoftDeleteAsync(userId, workspaceId, ct);
        await audit.RecordAsync(userId, workspaceId, "WORKSPACE_ARCHIVED", "Workspace", workspaceId, null, null, null, ct);
    }

    public async Task ActivateAsync(Guid userId, Guid workspaceId, CancellationToken ct)
    {
        await workspaces.SetActiveAsync(userId, workspaceId, ct);
        await audit.RecordAsync(userId, workspaceId, "WORKFLOW_RESUMED", "Workspace", workspaceId, null, null, null, ct);
    }

    public Task<IReadOnlyList<DocumentInfo>> ListDocumentsAsync(Guid userId, Guid workspaceId, CancellationToken ct) =>
        documents.ListAsync(userId, workspaceId, ct);

    public async Task<DocumentInfo> UploadDocumentAsync(
        Guid userId, Guid workspaceId, string documentType, string originalFileName, string contentType,
        Stream content, long? declaredLength, string? metadataJson, CancellationToken ct)
    {
        _ = await workspaces.GetAsync(userId, workspaceId, ct)
            ?? throw new NotFoundException("Workspace not found");

        if (!AllowedContentTypes.Contains(contentType))
            throw new DomainValidationException(new Dictionary<string, string> { ["contentType"] = "סוג קובץ לא נתמך" });

        // Buffer to memory for hash + size (max 10MB).
        await using var buffer = new MemoryStream();
        await content.CopyToAsync(buffer, ct);
        if (buffer.Length == 0 || buffer.Length > MaxDocumentBytes)
            throw new DomainValidationException(new Dictionary<string, string> { ["size"] = "כל קובץ עד 10MB" });
        if (declaredLength is > 0 && declaredLength != buffer.Length)
            throw new DomainValidationException(new Dictionary<string, string> { ["size"] = "גודל הקובץ לא תואם" });

        buffer.Position = 0;
        var hash = Convert.ToHexString(await SHA256.HashDataAsync(buffer, ct)).ToLowerInvariant();
        buffer.Position = 0;

        var docId = Guid.NewGuid();
        var safeName = SanitizeFileName(originalFileName);
        var storageKey = $"{userId:N}/{workspaceId:N}/{docId:N}-{safeName}";

        var pending = new DocumentInfo(
            docId, workspaceId, userId, documentType, safeName, contentType, buffer.Length,
            files.ProviderName, storageKey, hash, 1, "Pending", DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, null, metadataJson);

        // Reliable upload: store file first, then DB. If DB fails, delete the file.
        await files.SaveAsync(storageKey, buffer, contentType, ct);
        try
        {
            var saved = await documents.AddAsync(pending with { Status = "Ready" }, ct);
            await audit.RecordAsync(userId, workspaceId, "DOCUMENT_UPLOADED", "Document", docId, null, safeName, null, ct);
            log.LogInformation("Document {DocumentId} uploaded to workspace {WorkspaceId}", docId, workspaceId);
            return saved;
        }
        catch
        {
            try { await files.DeleteAsync(storageKey, ct); }
            catch (Exception cleanupEx)
            {
                log.LogError(cleanupEx, "Orphan file cleanup failed for {StorageKey}", storageKey);
            }
            throw;
        }
    }

    public async Task<(DocumentInfo Info, Stream Content)> DownloadAsync(Guid userId, Guid documentId, CancellationToken ct)
    {
        var info = await documents.GetAsync(userId, documentId, ct)
            ?? throw new NotFoundException("Document not found");
        if (info.DeletedAt is not null || info.Status != "Ready")
            throw new NotFoundException("Document not found");
        var stream = await files.OpenReadAsync(info.StorageKey, ct);
        return (info, stream);
    }

    public async Task DeleteDocumentAsync(Guid userId, Guid documentId, CancellationToken ct)
    {
        var info = await documents.GetAsync(userId, documentId, ct)
            ?? throw new NotFoundException("Document not found");
        await documents.SoftDeleteAsync(userId, documentId, ct);
        await audit.RecordAsync(userId, info.WorkspaceId, "DOCUMENT_DELETED", "Document", documentId, null, null, null, ct);
        // Soft-delete keeps the blob for recovery; a later purge job removes orphans.
    }

    private static string SanitizeFileName(string name)
    {
        var baseName = Path.GetFileName(name);
        if (string.IsNullOrWhiteSpace(baseName)) baseName = "file";
        var cleaned = new string(baseName.Select(ch =>
            char.IsLetterOrDigit(ch) || ch is '.' or '-' or '_' ? ch : '_').ToArray());
        return cleaned.Length > 120 ? cleaned[..120] : cleaned;
    }
}
