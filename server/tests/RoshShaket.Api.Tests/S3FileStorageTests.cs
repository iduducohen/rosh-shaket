using System.Collections.Concurrent;
using System.Net;
using System.Reflection;
using Amazon.S3;
using Amazon.S3.Model;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using RoshShaket.Application.Workspaces;
using RoshShaket.Infrastructure;
using RoshShaket.Infrastructure.Storage;
using Xunit;

namespace RoshShaket.Api.Tests;

public class S3FileStorageTests
{
    /// <summary>In-memory stand-in for the four S3 calls the storage makes; anything else fails loudly.</summary>
    public class FakeS3 : DispatchProxy
    {
        public readonly ConcurrentDictionary<string, (byte[] Body, PutObjectRequest Request)> Objects = new();

        public static (IAmazonS3 Client, FakeS3 State) Create()
        {
            var client = Create<IAmazonS3, FakeS3>();
            return (client, (FakeS3)(object)client);
        }

        protected override object? Invoke(MethodInfo? method, object?[]? args) => method!.Name switch
        {
            nameof(IAmazonS3.PutObjectAsync) when args![0] is PutObjectRequest put => Put(put),
            nameof(IAmazonS3.GetObjectAsync) when args![0] is GetObjectRequest get => Task.FromResult(new GetObjectResponse
            {
                ResponseStream = new MemoryStream(Find(get.BucketName, get.Key).Body)
            }),
            nameof(IAmazonS3.GetObjectMetadataAsync) when args![0] is GetObjectMetadataRequest head =>
                Task.Run(() => { Find(head.BucketName, head.Key); return new GetObjectMetadataResponse(); }),
            nameof(IAmazonS3.DeleteObjectAsync) when args![0] is DeleteObjectRequest del =>
                Task.FromResult(Objects.TryRemove($"{del.BucketName}/{del.Key}", out _) ? new DeleteObjectResponse() : new DeleteObjectResponse()),
            nameof(IDisposable.Dispose) => null,
            _ => throw new NotSupportedException($"FakeS3 does not implement {method.Name}")
        };

        private Task<PutObjectResponse> Put(PutObjectRequest put)
        {
            using var copy = new MemoryStream();
            put.InputStream.CopyTo(copy);
            Objects[$"{put.BucketName}/{put.Key}"] = (copy.ToArray(), put);
            return Task.FromResult(new PutObjectResponse());
        }

        private (byte[] Body, PutObjectRequest Request) Find(string bucket, string key) =>
            Objects.TryGetValue($"{bucket}/{key}", out var o)
                ? o
                : throw new AmazonS3Exception("The specified key does not exist.") { StatusCode = HttpStatusCode.NotFound };
    }

    private static (S3FileStorage Storage, FakeS3 S3) Build(string prefix = "")
    {
        var (client, state) = FakeS3.Create();
        var options = Options.Create(new FileStorageOptions
        {
            Provider = "s3",
            S3 = new S3StorageOptions { Bucket = "rosh-shaket-dev-docs", Region = "il-central-1", KeyPrefix = prefix }
        });
        return (new S3FileStorage(client, options, NullLogger<S3FileStorage>.Instance), state);
    }

    [Fact]
    public async Task Saves_a_private_encrypted_object_under_the_storage_key()
    {
        var (storage, s3) = Build(prefix: "documents/");
        var body = new MemoryStream("%PDF-1.7 payslip"u8.ToArray());

        await storage.SaveAsync("user/ws/doc/תלוש_12.pdf", body, "application/pdf", default);

        var (stored, request) = s3.Objects["rosh-shaket-dev-docs/documents/user/ws/doc/תלוש_12.pdf"];
        stored.Should().Equal("%PDF-1.7 payslip"u8.ToArray());
        request.ContentType.Should().Be("application/pdf");
        request.Headers.ContentDisposition.Should().Be("inline; filename*=UTF-8''%D7%AA%D7%9C%D7%95%D7%A9_12.pdf");
        request.ServerSideEncryptionMethod.Should().Be(ServerSideEncryptionMethod.AES256);
        body.CanRead.Should().BeTrue("the caller owns the stream and disposes it");
        storage.ProviderName.Should().Be("s3");
    }

    [Fact]
    public async Task Reads_back_saves_and_deletes_a_file()
    {
        var (storage, _) = Build();
        await storage.SaveAsync("u/w/d-a.png", new MemoryStream([1, 2, 3]), "image/png", default);

        (await storage.ExistsAsync("u/w/d-a.png", default)).Should().BeTrue();
        await using (var read = await storage.OpenReadAsync("u/w/d-a.png", default))
        {
            var copy = new MemoryStream();
            await read.CopyToAsync(copy);
            copy.ToArray().Should().Equal(1, 2, 3);
        }

        await storage.DeleteAsync("u/w/d-a.png", default);
        (await storage.ExistsAsync("u/w/d-a.png", default)).Should().BeFalse();
    }

    [Fact]
    public async Task A_missing_object_reads_as_file_not_found_like_the_local_storage()
    {
        var (storage, _) = Build();

        await FluentActions.Awaiting(() => storage.OpenReadAsync("u/w/missing.pdf", default))
            .Should().ThrowAsync<FileNotFoundException>();
    }

    [Theory]
    [InlineData("../other-user/doc.pdf")]
    [InlineData("/absolute.pdf")]
    [InlineData("a\\b.pdf")]
    [InlineData(" ")]
    public async Task Rejects_keys_that_could_escape_the_user_folder(string key)
    {
        var (storage, s3) = Build();

        await FluentActions.Awaiting(() => storage.SaveAsync(key, new MemoryStream([1]), "image/png", default))
            .Should().ThrowAsync<InvalidOperationException>();
        s3.Objects.Should().BeEmpty();
    }

    private static IServiceCollection Services(Dictionary<string, string?> settings)
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
        return new ServiceCollection().AddLogging().AddInfrastructure(config);
    }

    [Fact]
    public void The_provider_setting_picks_s3_and_requires_a_bucket()
    {
        FluentActions.Invoking(() => Services(new() { ["FileStorage:Provider"] = "s3" }))
            .Should().Throw<InvalidOperationException>().WithMessage("*Bucket*");

        using var s3 = Services(new()
        {
            ["FileStorage:Provider"] = "S3",
            ["FileStorage:S3:Bucket"] = "rosh-shaket-dev-docs",
            ["FileStorage:S3:Region"] = "il-central-1"
        }).BuildServiceProvider();
        s3.GetRequiredService<IFileStorage>().Should().BeOfType<S3FileStorage>();
        s3.GetRequiredService<IAmazonS3>().Config.RegionEndpoint.SystemName.Should().Be("il-central-1");

        using var local = Services(new()).BuildServiceProvider();
        local.GetRequiredService<IFileStorage>().Should().BeOfType<LocalFileStorage>();
    }
}
