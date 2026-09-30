using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using RoshShaket.Application.Workspaces;

namespace RoshShaket.Infrastructure.Postgres;

public sealed class PostgresWorkspaceRepository(RightsDbContext db) : IWorkspaceRepository
{
    public async Task<IReadOnlyList<WorkspaceSummary>> ListAsync(Guid userId, CancellationToken ct)
    {
        var rows = await db.Workspaces.AsNoTracking()
            .Where(w => w.UserId == userId && w.DeletedAt == null)
            .OrderByDescending(w => w.LastAccessedAt)
            .Select(w => new { w, Docs = w.Documents.Count(d => d.DeletedAt == null) })
            .ToListAsync(ct);
        return rows.Select(x => WorkspaceMapping.ToSummary(x.w, x.Docs)).ToList();
    }

    public async Task<UserWorkspace?> GetAsync(Guid userId, Guid workspaceId, CancellationToken ct)
    {
        var row = await db.Workspaces.AsNoTracking()
            .Include(w => w.Workflow)
            .Include(w => w.Documents)
            .FirstOrDefaultAsync(w => w.Id == workspaceId && w.UserId == userId && w.DeletedAt == null, ct);
        return row is null ? null : WorkspaceMapping.ToModel(row);
    }

    public async Task<UserWorkspace?> GetActiveAsync(Guid userId, CancellationToken ct)
    {
        var row = await db.Workspaces.AsNoTracking()
            .Include(w => w.Workflow)
            .Include(w => w.Documents)
            .Where(w => w.UserId == userId && w.DeletedAt == null && w.IsActive)
            .OrderByDescending(w => w.LastAccessedAt)
            .FirstOrDefaultAsync(ct);
        return row is null ? null : WorkspaceMapping.ToModel(row);
    }

    public async Task<UserWorkspace> CreateAsync(Guid userId, string name, CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        await db.Workspaces.Where(w => w.UserId == userId && w.IsActive)
            .ExecuteUpdateAsync(s => s.SetProperty(w => w.IsActive, false), ct);

        var id = Guid.NewGuid();
        var snap = new WizardSnapshot(null, "{}", null, null, false, null, null, 0, "/start", "start", WorkspaceHandlers.CurrentStateVersion);
        var row = new WorkspaceRow
        {
            Id = id,
            UserId = userId,
            Name = name,
            Status = nameof(WorkspaceStatus.Active),
            CurrentStep = "start",
            CurrentRoute = "/start",
            IsActive = true,
            Version = 1,
            CreatedAt = now,
            UpdatedAt = now,
            LastAccessedAt = now,
            Workflow = new WorkflowStateRow
            {
                WorkspaceId = id,
                CurrentStep = "start",
                Status = nameof(WorkflowStatus.InProgress),
                ProgressPercentage = 0,
                StateJson = JsonSerializer.Serialize(snap, WizardSnapshotJson.Options),
                Version = 1,
                StateSchemaVersion = WorkspaceHandlers.CurrentStateVersion,
                StartedAt = now,
                LastUpdatedAt = now
            }
        };
        db.Workspaces.Add(row);
        await TouchUserAsync(userId, now, ct);
        await db.SaveChangesAsync(ct);
        return (await GetAsync(userId, id, ct))!;
    }

    public async Task<UserWorkspace> UpsertWorkflowAsync(Guid userId, Guid workspaceId, UpsertWorkflowCommand cmd, CancellationToken ct)
    {
        var row = await db.Workspaces.Include(w => w.Workflow)
            .FirstOrDefaultAsync(w => w.Id == workspaceId && w.UserId == userId && w.DeletedAt == null, ct)
            ?? throw new NotFoundException("Workspace not found");

        if (cmd.ExpectedVersion is { } expected && expected != row.Version)
            throw new ConcurrencyConflictException($"Expected version {expected}, actual {row.Version}");

        var now = DateTimeOffset.UtcNow;
        row.Name = string.IsNullOrWhiteSpace(cmd.Name) ? row.Name : cmd.Name.Trim();
        row.CurrentStep = cmd.CurrentStep;
        row.CurrentRoute = cmd.CurrentRoute;
        row.UpdatedAt = now;
        row.LastAccessedAt = now;
        row.Version += 1;
        if (cmd.Status == WorkflowStatus.Completed)
        {
            row.Status = nameof(WorkspaceStatus.Completed);
            row.CompletedAt = now;
        }

        row.Workflow ??= new WorkflowStateRow
        {
            WorkspaceId = row.Id,
            StartedAt = now,
            Version = 0
        };
        row.Workflow.PreviousStep = cmd.PreviousStep ?? row.Workflow.CurrentStep;
        row.Workflow.CurrentStep = cmd.CurrentStep;
        row.Workflow.Status = cmd.Status.ToString();
        row.Workflow.ProgressPercentage = Math.Clamp(cmd.ProgressPercentage, 0, 100);
        row.Workflow.StateJson = JsonSerializer.Serialize(cmd.Snapshot, WizardSnapshotJson.Options);
        row.Workflow.StateSchemaVersion = cmd.Snapshot.StateVersion;
        row.Workflow.Version += 1;
        row.Workflow.LastUpdatedAt = now;
        if (cmd.Status is WorkflowStatus.Completed or WorkflowStatus.Calculated)
            row.Workflow.CompletedAt ??= now;

        await TouchUserAsync(userId, now, ct);
        await db.SaveChangesAsync(ct);
        return (await GetAsync(userId, workspaceId, ct))!;
    }

    public async Task TouchAsync(Guid userId, Guid workspaceId, CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        var n = await db.Workspaces
            .Where(w => w.Id == workspaceId && w.UserId == userId && w.DeletedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(w => w.LastAccessedAt, now), ct);
        if (n == 0) throw new NotFoundException("Workspace not found");
        await TouchUserAsync(userId, now, ct);
        await db.SaveChangesAsync(ct);
    }

    public async Task SoftDeleteAsync(Guid userId, Guid workspaceId, CancellationToken ct)
    {
        var row = await db.Workspaces.FirstOrDefaultAsync(w => w.Id == workspaceId && w.UserId == userId && w.DeletedAt == null, ct)
            ?? throw new NotFoundException("Workspace not found");
        var now = DateTimeOffset.UtcNow;
        row.DeletedAt = now;
        row.IsActive = false;
        row.Status = nameof(WorkspaceStatus.Archived);
        row.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
    }

    public async Task SetActiveAsync(Guid userId, Guid workspaceId, CancellationToken ct)
    {
        var row = await db.Workspaces.FirstOrDefaultAsync(w => w.Id == workspaceId && w.UserId == userId && w.DeletedAt == null, ct)
            ?? throw new NotFoundException("Workspace not found");
        var now = DateTimeOffset.UtcNow;
        await db.Workspaces.Where(w => w.UserId == userId && w.IsActive)
            .ExecuteUpdateAsync(s => s.SetProperty(w => w.IsActive, false), ct);
        row.IsActive = true;
        row.LastAccessedAt = now;
        await TouchUserAsync(userId, now, ct);
        await db.SaveChangesAsync(ct);
    }

    private async Task TouchUserAsync(Guid userId, DateTimeOffset now, CancellationToken ct)
    {
        await db.Users.Where(u => u.Id == userId)
            .ExecuteUpdateAsync(s => s
                .SetProperty(u => u.LastActiveAt, now)
                .SetProperty(u => u.UpdatedAt, now), ct);
    }
}

public sealed class PostgresDocumentRepository(RightsDbContext db) : IDocumentRepository
{
    public async Task<IReadOnlyList<DocumentInfo>> ListAsync(Guid userId, Guid workspaceId, CancellationToken ct)
    {
        var owned = await db.Workspaces.AnyAsync(w => w.Id == workspaceId && w.UserId == userId && w.DeletedAt == null, ct);
        if (!owned) throw new NotFoundException("Workspace not found");

        var rows = await db.Documents.AsNoTracking()
            .Where(d => d.WorkspaceId == workspaceId && d.UserId == userId && d.DeletedAt == null)
            .OrderByDescending(d => d.UploadedAt)
            .ToListAsync(ct);
        return rows.Select(WorkspaceMapping.ToDocument).ToList();
    }

    public async Task<DocumentInfo?> GetAsync(Guid userId, Guid documentId, CancellationToken ct)
    {
        var row = await db.Documents.AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == documentId && d.UserId == userId, ct);
        return row is null ? null : WorkspaceMapping.ToDocument(row);
    }

    public async Task<DocumentInfo> AddAsync(DocumentInfo draft, CancellationToken ct)
    {
        var owned = await db.Workspaces.AnyAsync(w => w.Id == draft.WorkspaceId && w.UserId == draft.UserId && w.DeletedAt == null, ct);
        if (!owned) throw new NotFoundException("Workspace not found");

        var row = new DocumentRow
        {
            Id = draft.Id,
            WorkspaceId = draft.WorkspaceId,
            UserId = draft.UserId,
            DocumentType = draft.DocumentType,
            OriginalFileName = draft.OriginalFileName,
            StoredFileName = Path.GetFileName(draft.StorageKey),
            ContentType = draft.ContentType,
            FileSize = draft.FileSize,
            StorageProvider = draft.StorageProvider,
            StorageKey = draft.StorageKey,
            HashSha256 = draft.HashSha256,
            Version = draft.Version,
            Status = draft.Status,
            MetadataJson = draft.MetadataJson,
            UploadedAt = draft.UploadedAt,
            UpdatedAt = draft.UpdatedAt
        };
        db.Documents.Add(row);
        await db.SaveChangesAsync(ct);
        return WorkspaceMapping.ToDocument(row);
    }

    public async Task MarkReadyAsync(Guid userId, Guid documentId, string storageKey, string hash, CancellationToken ct)
    {
        var row = await db.Documents.FirstOrDefaultAsync(d => d.Id == documentId && d.UserId == userId, ct)
            ?? throw new NotFoundException("Document not found");
        row.Status = "Ready";
        row.StorageKey = storageKey;
        row.HashSha256 = hash;
        row.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    public async Task SoftDeleteAsync(Guid userId, Guid documentId, CancellationToken ct)
    {
        var row = await db.Documents.FirstOrDefaultAsync(d => d.Id == documentId && d.UserId == userId && d.DeletedAt == null, ct)
            ?? throw new NotFoundException("Document not found");
        row.DeletedAt = DateTimeOffset.UtcNow;
        row.Status = "Deleted";
        row.UpdatedAt = row.DeletedAt.Value;
        await db.SaveChangesAsync(ct);
    }
}

public sealed class PostgresWorkspaceAudit(RightsDbContext db) : IWorkspaceAudit
{
    public async Task RecordAsync(Guid userId, Guid? workspaceId, string action, string? entityType, Guid? entityId,
        string? previousValue, string? newValue, string? metadataJson, CancellationToken ct)
    {
        db.WorkspaceAudits.Add(new WorkspaceAuditRow
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            WorkspaceId = workspaceId,
            Action = action,
            EntityType = entityType,
            EntityId = entityId,
            PreviousValue = previousValue,
            NewValue = newValue,
            MetadataJson = metadataJson,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
    }
}
