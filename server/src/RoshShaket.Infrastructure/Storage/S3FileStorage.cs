using System.Net;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using RoshShaket.Application.Workspaces;

namespace RoshShaket.Infrastructure.Storage;

public sealed class S3StorageOptions
{
    public string Bucket { get; set; } = "";
    /// <summary>AWS region of the bucket, e.g. il-central-1 (Tel Aviv).</summary>
    public string Region { get; set; } = "il-central-1";
    /// <summary>Optional folder inside the bucket, e.g. "documents/". Empty keeps keys at the root.</summary>
    public string KeyPrefix { get; set; } = "";
}

/// <summary>
/// User documents in a private AWS S3 bucket. Credentials come from the standard AWS chain
/// (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY locally, an IAM role when running on AWS).
/// Objects are encrypted at rest (SSE-S3) and never public; downloads go through the API.
/// </summary>
public sealed class S3FileStorage(IAmazonS3 s3, IOptions<FileStorageOptions> options, ILogger<S3FileStorage> log) : IFileStorage
{
    public string ProviderName => "s3";

    private S3StorageOptions O => options.Value.S3;

    public async Task SaveAsync(string storageKey, Stream content, string contentType, CancellationToken ct)
    {
        var key = ObjectKey(storageKey);
        await s3.PutObjectAsync(new PutObjectRequest
        {
            BucketName = O.Bucket,
            Key = key,
            InputStream = content,
            AutoCloseStream = false, // the caller owns the buffer
            ContentType = contentType,
            ServerSideEncryptionMethod = ServerSideEncryptionMethod.AES256
        }, ct);
        log.LogInformation("Stored file {StorageKey} in S3 bucket {Bucket} ({ContentType})", storageKey, O.Bucket, contentType);
    }

    public async Task<Stream> OpenReadAsync(string storageKey, CancellationToken ct)
    {
        try
        {
            using var response = await s3.GetObjectAsync(new GetObjectRequest { BucketName = O.Bucket, Key = ObjectKey(storageKey) }, ct);
            // Documents are at most 10MB: buffering frees the HTTP connection before the API streams the file back.
            var buffer = new MemoryStream();
            await response.ResponseStream.CopyToAsync(buffer, ct);
            buffer.Position = 0;
            return buffer;
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            throw new FileNotFoundException("File missing", storageKey, ex);
        }
    }

    public Task DeleteAsync(string storageKey, CancellationToken ct) =>
        s3.DeleteObjectAsync(new DeleteObjectRequest { BucketName = O.Bucket, Key = ObjectKey(storageKey) }, ct);

    public async Task<bool> ExistsAsync(string storageKey, CancellationToken ct)
    {
        try
        {
            await s3.GetObjectMetadataAsync(new GetObjectMetadataRequest { BucketName = O.Bucket, Key = ObjectKey(storageKey) }, ct);
            return true;
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return false;
        }
    }

    private string ObjectKey(string storageKey)
    {
        if (string.IsNullOrWhiteSpace(storageKey) || storageKey.Contains("..", StringComparison.Ordinal)
            || storageKey.StartsWith('/') || storageKey.Contains('\\'))
            throw new InvalidOperationException("Invalid storage key");
        var prefix = O.KeyPrefix.Trim().Trim('/');
        return prefix.Length == 0 ? storageKey : $"{prefix}/{storageKey}";
    }
}
