using Microsoft.Extensions.Logging.Abstractions;
using RoshShaket.Application.Workspaces;
using Xunit;

namespace RoshShaket.Application.Tests;

/// <summary>Starting over and coming back: what is deleted, and what the audit log records.</summary>
public class WorkspaceLifecycleTests
{
    private static readonly Guid User = Guid.NewGuid();

    private sealed class Workspaces : IWorkspaceRepository
    {
        public readonly List<UserWorkspace> All = [];
        public readonly List<Guid> Archived = [];
        public UserWorkspace Add(DateTimeOffset lastAccessed)
        {
            var ws = new UserWorkspace(Guid.NewGuid(), User, "חישוב זכויות", WorkspaceStatus.Active, "start", "/start", true, 1,
                lastAccessed, lastAccessed, lastAccessed, null, null, []);
            for (var i = 0; i < All.Count; i++) All[i] = All[i] with { IsActive = false };
            All.Add(ws);
            return ws;
        }
        public Task<UserWorkspace?> GetActiveAsync(Guid userId, CancellationToken ct) =>
            Task.FromResult(All.LastOrDefault(w => w.IsActive && !Archived.Contains(w.Id)));
        public Task<UserWorkspace?> GetAsync(Guid userId, Guid workspaceId, CancellationToken ct) =>
            Task.FromResult(All.FirstOrDefault(w => w.Id == workspaceId));
        public Task<UserWorkspace> CreateAsync(Guid userId, string name, CancellationToken ct) => Task.FromResult(Add(DateTimeOffset.UtcNow));
        public Task TouchAsync(Guid userId, Guid workspaceId, CancellationToken ct) => Task.CompletedTask;
        public Task SoftDeleteAsync(Guid userId, Guid workspaceId, CancellationToken ct) { Archived.Add(workspaceId); return Task.CompletedTask; }
        public Task<IReadOnlyList<WorkspaceSummary>> ListAsync(Guid userId, CancellationToken ct) => throw new NotSupportedException();
        public Task<UserWorkspace> UpsertWorkflowAsync(Guid userId, Guid workspaceId, UpsertWorkflowCommand cmd, CancellationToken ct) => throw new NotSupportedException();
        public Task SetActiveAsync(Guid userId, Guid workspaceId, CancellationToken ct) => throw new NotSupportedException();
    }

    private sealed class Documents : IDocumentRepository
    {
        public readonly List<DocumentInfo> All = [];
        public DocumentInfo Add(Guid workspaceId, string name)
        {
            var id = Guid.NewGuid();
            var doc = new DocumentInfo(id, workspaceId, User, "payslip", name, "application/pdf", 10, "s3",
                $"{User:N}/{workspaceId:N}/{id:N}/{name}", "hash", 1, "Ready", DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, null, null);
            All.Add(doc);
            return doc;
        }
        public Task<IReadOnlyList<DocumentInfo>> ListAsync(Guid userId, Guid workspaceId, CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<DocumentInfo>>(All.Where(d => d.WorkspaceId == workspaceId && d.DeletedAt == null).ToList());
        public Task<DocumentInfo?> GetAsync(Guid userId, Guid documentId, CancellationToken ct) => Task.FromResult(All.FirstOrDefault(d => d.Id == documentId));
        public Task SoftDeleteAsync(Guid userId, Guid documentId, CancellationToken ct)
        {
            var i = All.FindIndex(d => d.Id == documentId);
            All[i] = All[i] with { DeletedAt = DateTimeOffset.UtcNow };
            return Task.CompletedTask;
        }
        public Task<DocumentInfo> AddAsync(DocumentInfo draft, CancellationToken ct) => throw new NotSupportedException();
        public Task MarkReadyAsync(Guid userId, Guid documentId, string storageKey, string hash, CancellationToken ct) => throw new NotSupportedException();
    }

    private sealed class Files : IFileStorage
    {
        public readonly List<string> Deleted = [];
        public string ProviderName => "s3";
        public Task DeleteAsync(string storageKey, CancellationToken ct) { Deleted.Add(storageKey); return Task.CompletedTask; }
        public Task SaveAsync(string storageKey, Stream content, string contentType, CancellationToken ct) => throw new NotSupportedException();
        public Task<Stream> OpenReadAsync(string storageKey, CancellationToken ct) => throw new NotSupportedException();
        public Task<bool> ExistsAsync(string storageKey, CancellationToken ct) => throw new NotSupportedException();
    }

    private sealed class Audit : IWorkspaceAudit
    {
        public readonly List<string> Actions = [];
        public Task RecordAsync(Guid userId, Guid? workspaceId, string action, string? entityType, Guid? entityId,
            string? previousValue, string? newValue, string? metadataJson, CancellationToken ct)
        { Actions.Add(action); return Task.CompletedTask; }
    }

    private static (WorkspaceHandlers h, Workspaces ws, Documents docs, Files files, Audit audit) Build()
    {
        var ws = new Workspaces();
        var docs = new Documents();
        var files = new Files();
        var audit = new Audit();
        return (new WorkspaceHandlers(ws, docs, files, audit, NullLogger<WorkspaceHandlers>.Instance), ws, docs, files, audit);
    }

    [Fact]
    public async Task Starting_over_deletes_the_old_cases_documents_and_files_and_archives_it()
    {
        var (h, ws, docs, files, _) = Build();
        var old = ws.Add(DateTimeOffset.UtcNow);
        var a = docs.Add(old.Id, "a.pdf");
        var b = docs.Add(old.Id, "b.pdf");

        var fresh = await h.CreateAsync(User, null, default, discardPrevious: true);

        Assert.NotEqual(old.Id, fresh.Id);
        Assert.All(docs.All, d => Assert.NotNull(d.DeletedAt));
        Assert.Equal(new[] { a.StorageKey, b.StorageKey }, files.Deleted);
        Assert.Contains(old.Id, ws.Archived);
    }

    [Fact]
    public async Task A_plain_new_case_keeps_the_previous_documents()
    {
        var (h, ws, docs, files, _) = Build();
        var old = ws.Add(DateTimeOffset.UtcNow);
        docs.Add(old.Id, "a.pdf");

        await h.CreateAsync(User, null, default);

        Assert.Empty(files.Deleted);
        Assert.Null(docs.All[0].DeletedAt);
    }

    [Fact]
    public async Task Loading_the_case_counts_as_a_resume_only_after_a_real_break()
    {
        var (h, ws, _, _, audit) = Build();
        ws.Add(DateTimeOffset.UtcNow.AddMinutes(-2));
        await h.GetOrCreateActiveAsync(User, default);
        Assert.DoesNotContain("WORKFLOW_RESUMED", audit.Actions);

        ws.All[0] = ws.All[0] with { LastAccessedAt = DateTimeOffset.UtcNow - WorkspaceHandlers.ResumeAfterIdle - TimeSpan.FromMinutes(1) };
        await h.GetOrCreateActiveAsync(User, default);
        Assert.Contains("WORKFLOW_RESUMED", audit.Actions);
    }
}
