using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using RoshShaket.Application.Auth;
using RoshShaket.Infrastructure.Auth;
using Xunit;

namespace RoshShaket.Api.Tests;

public class IdTokenValidatorTests
{
    private sealed class FixedJwks(IReadOnlyList<SigningKey> keys) : IJwksSource
    {
        public Task<IReadOnlyList<SigningKey>> GetKeysAsync(string jwksUri, bool forceRefresh, CancellationToken ct) =>
            Task.FromResult(keys);
    }

    private static (RSA rsa, SigningKey key, IdTokenValidator validator) Setup()
    {
        var rsa = RSA.Create(2048);
        var p = rsa.ExportParameters(false);
        var key = new SigningKey("test-kid", "RSA", Base64Url(p.Modulus!), Base64Url(p.Exponent!));
        var time = TimeProvider.System;
        var validator = new IdTokenValidator(new FixedJwks([key]), time);
        return (rsa, key, validator);
    }

    private static string Mint(RSA rsa, object header, object payload)
    {
        var h = Base64Url(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(header)));
        var p = Base64Url(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(payload)));
        var input = Encoding.ASCII.GetBytes(h + "." + p);
        var sig = rsa.SignData(input, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        return h + "." + p + "." + Base64Url(sig);
    }

    private static string Base64Url(byte[] data) =>
        Convert.ToBase64String(data).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    [Fact]
    public async Task Accepts_valid_rs256_token()
    {
        var (rsa, _, validator) = Setup();
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var token = Mint(rsa,
            new { alg = "RS256", kid = "test-kid", typ = "JWT" },
            new { iss = "https://accounts.google.com", aud = "web-client", sub = "user-1", exp = now + 3600, iat = now, email = "a@b.co", email_verified = true });

        var payload = await validator.ValidateAsync(token, new TokenRules(
            "https://example/jwks",
            ["web-client"],
            (iss, _) => iss == "https://accounts.google.com"), default);

        Assert.Equal("user-1", IdTokenValidator.GetString(payload, "sub"));
        Assert.Equal("a@b.co", IdTokenValidator.GetString(payload, "email"));
        Assert.True(IdTokenValidator.GetBool(payload, "email_verified"));
    }

    [Fact]
    public async Task Rejects_wrong_audience()
    {
        var (rsa, _, validator) = Setup();
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var token = Mint(rsa,
            new { alg = "RS256", kid = "test-kid" },
            new { iss = "https://accounts.google.com", aud = "other", sub = "user-1", exp = now + 3600 });

        await Assert.ThrowsAsync<AuthenticationFailedException>(() => validator.ValidateAsync(token, new TokenRules(
            "https://example/jwks",
            ["web-client"],
            (iss, _) => iss == "https://accounts.google.com"), default));
    }

    [Fact]
    public async Task Rejects_expired_token()
    {
        var (rsa, _, validator) = Setup();
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var token = Mint(rsa,
            new { alg = "RS256", kid = "test-kid" },
            new { iss = "https://accounts.google.com", aud = "web-client", sub = "user-1", exp = now - 600 });

        await Assert.ThrowsAsync<AuthenticationFailedException>(() => validator.ValidateAsync(token, new TokenRules(
            "https://example/jwks",
            ["web-client"],
            (iss, _) => true), default));
    }

    [Fact]
    public async Task Rejects_alg_none()
    {
        var (rsa, _, validator) = Setup();
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var token = Mint(rsa,
            new { alg = "none", kid = "test-kid" },
            new { iss = "https://accounts.google.com", aud = "web-client", sub = "user-1", exp = now + 3600 });

        await Assert.ThrowsAsync<AuthenticationFailedException>(() => validator.ValidateAsync(token, new TokenRules(
            "https://example/jwks",
            ["web-client"],
            (iss, _) => true), default));
    }
}
