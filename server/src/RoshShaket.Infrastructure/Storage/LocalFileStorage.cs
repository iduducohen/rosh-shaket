using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using RoshShaket.Application.Workspaces;

namespace RoshShaket.Infrastructure.Storage;

public sealed class FileStorageOptions
{
    public const string Section = "FileStorage";
    public string Provider { get; set; } = "local";
    public string LocalRoot { get; set; } = "/data/documents";
}

public sealed class LocalFileStorage(IOptions<FileStorageOptions> options, ILogger<LocalFileStorage> log) : IFileStorage
{
    public string ProviderName => "local";
    private readonly string _root = options.Value.LocalRoot;

    public async Task SaveAsync(string storageKey, Stream content, string contentType, CancellationToken ct)
    {
        var path = Resolve(storageKey);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var temp = path + ".tmp";
        await using (var fs = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None, 64 * 1024, useAsync: true))
        {
            await content.CopyToAsync(fs, ct);
            await fs.FlushAsync(ct);
        }
        File.Move(temp, path, overwrite: true);
        log.LogInformation("Stored file {StorageKey} ({ContentType})", storageKey, contentType);
    }

    public Task<Stream> OpenReadAsync(string storageKey, CancellationToken ct)
    {
        var path = Resolve(storageKey);
        if (!File.Exists(path)) throw new FileNotFoundException("File missing", storageKey);
        Stream stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 64 * 1024, useAsync: true);
        return Task.FromResult(stream);
    }

    public Task DeleteAsync(string storageKey, CancellationToken ct)
    {
        var path = Resolve(storageKey);
        if (File.Exists(path)) File.Delete(path);
        var tmp = path + ".tmp";
        if (File.Exists(tmp)) File.Delete(tmp);
        return Task.CompletedTask;
    }

    public Task<bool> ExistsAsync(string storageKey, CancellationToken ct) =>
        Task.FromResult(File.Exists(Resolve(storageKey)));

    private string Resolve(string storageKey)
    {
        if (string.IsNullOrWhiteSpace(storageKey) || storageKey.Contains("..", StringComparison.Ordinal))
            throw new InvalidOperationException("Invalid storage key");
        var full = Path.GetFullPath(Path.Combine(_root, storageKey.Replace('/', Path.DirectorySeparatorChar)));
        var rootFull = Path.GetFullPath(_root);
        if (!full.StartsWith(rootFull, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Invalid storage key");
        return full;
    }
}
