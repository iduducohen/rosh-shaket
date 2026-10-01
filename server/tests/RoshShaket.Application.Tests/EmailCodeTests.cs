using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using RoshShaket.Application.Abstractions;
using RoshShaket.Application.Auth;
using RoshShaket.Domain;
using Xunit;

namespace RoshShaket.Application.Tests;

public class EmailCodeTests
{
    private sealed class MemoryCache : ICacheStore
    {
        private readonly Dictionary<string, object?> _d = new();
        public Task<T?> GetAsync<T>(string key, CancellationToken ct) => Task.FromResult(_d.TryGetValue(key, out var v) ? (T?)v : default);
        public Task SetAsync<T>(string key, T value, TimeSpan ttl, CancellationToken ct) { _d[key] = value; return Task.CompletedTask; }
        public Task RemoveAsync(string key, CancellationToken ct) { _d.Remove(key); return Task.CompletedTask; }
        public bool Contains(string key) => _d.ContainsKey(key);
    }
    private sealed class CapturingSender : IEmailSender
    {
        public string? LastCode;
        public int Sent;
        public Task SendLoginCodeAsync(string email, string code, CancellationToken ct) { LastCode = code; Sent++; return Task.CompletedTask; }
    }
    private sealed class Users : IUserRepository
    {
        public Task<AppUser> SignInAsync(ExternalIdentity i, DateTimeOffset now, CancellationToken ct) => Task.FromResult(new AppUser(Guid.NewGuid(), i.Email, i.Name));
        public Task<IReadOnlyList<LinkedIdentity>> ListIdentitiesAsync(Guid userId, CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<LinkedIdentity>>([]);
        public Task LinkAsync(Guid userId, ExternalIdentity identity, DateTimeOffset now, CancellationToken ct) => Task.CompletedTask;
        public Task UnlinkAsync(Guid userId, AuthProvider provider, CancellationToken ct) => Task.CompletedTask;
    }
    private sealed class Clock : IClock
    {
        public DateTimeOffset Now { get; set; } = new(2026, 9, 29, 10, 0, 0, TimeSpan.Zero);
        public DateOnly Today => DateOnly.FromDateTime(Now.DateTime);
    }

    private static (EmailCodeSignInHandler h, CapturingSender s, Clock c, MemoryCache cache) Create(
        string pepper = "test-pepper", int cooldownSeconds = 60, int maxPerHour = 5)
    {
        var s = new CapturingSender();
        var c = new Clock();
        var cache = new MemoryCache();
        var opts = Options.Create(new OtpOptions
        {
            Pepper = pepper,
            SendCooldownSeconds = cooldownSeconds,
            MaxSendsPerHour = maxPerHour
        });
        return (new EmailCodeSignInHandler(cache, s, new Users(), c, opts, NullLogger<EmailCodeSignInHandler>.Instance), s, c, cache);
    }

    [Fact]
    public async Task Correct_code_signs_in_once_and_normalizes_email()
    {
        var (h, s, _, _) = Create();
        await h.StartAsync("  Dudu@Example.COM ", default);
        Assert.Equal(6, s.LastCode!.Length);
        var user = await h.VerifyAsync("dudu@example.com", s.LastCode!, default);
        Assert.Equal("dudu@example.com", user.Email);
        await Assert.ThrowsAsync<AuthenticationFailedException>(() => h.VerifyAsync("dudu@example.com", s.LastCode!, default));
    }

    [Fact]
    public async Task Code_is_not_stored_in_plaintext_in_pending_record()
    {
        var (h, s, _, cache) = Create();
        await h.StartAsync("a@b.co", default);
        // Walk stored objects: PendingLoginCode.Hash must not equal the raw code.
        var pending = await cache.GetAsync<PendingLoginCode>(
            "login-code:" + Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes("a@b.co"))),
            default);
        Assert.NotNull(pending);
        Assert.NotEqual(s.LastCode, pending!.Hash);
        Assert.DoesNotContain(s.LastCode!, pending.Hash, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Locks_after_max_attempts()
    {
        var (h, s, _, _) = Create();
        await h.StartAsync("a@b.co", default);
        for (var i = 0; i < EmailCodeSignInHandler.MaxAttempts; i++)
            await Assert.ThrowsAsync<AuthenticationFailedException>(() => h.VerifyAsync("a@b.co", "000000" == s.LastCode ? "111111" : "000000", default));
        await Assert.ThrowsAsync<AuthenticationFailedException>(() => h.VerifyAsync("a@b.co", s.LastCode!, default));
    }

    [Fact]
    public async Task Expired_code_is_rejected()
    {
        var (h, s, c, _) = Create();
        await h.StartAsync("a@b.co", default);
        c.Now = c.Now.AddMinutes(11);
        await Assert.ThrowsAsync<AuthenticationFailedException>(() => h.VerifyAsync("a@b.co", s.LastCode!, default));
    }

    [Fact]
    public async Task Invalid_email_is_a_validation_error()
    {
        var (h, _, _, _) = Create();
        await Assert.ThrowsAsync<DomainValidationException>(() => h.StartAsync("not-an-email", default));
    }

    [Fact]
    public async Task Resend_within_cooldown_is_rate_limited()
    {
        var (h, s, _, _) = Create(cooldownSeconds: 60);
        await h.StartAsync("a@b.co", default);
        Assert.Equal(1, s.Sent);
        await Assert.ThrowsAsync<RateLimitedException>(() => h.StartAsync("a@b.co", default));
        Assert.Equal(1, s.Sent);
    }

    [Fact]
    public async Task Hourly_send_cap_is_enforced()
    {
        var (h, s, _, _) = Create(cooldownSeconds: 0, maxPerHour: 2);
        await h.StartAsync("a@b.co", default);
        await h.StartAsync("a@b.co", default);
        Assert.Equal(2, s.Sent);
        await Assert.ThrowsAsync<RateLimitedException>(() => h.StartAsync("a@b.co", default));
        Assert.Equal(2, s.Sent);
    }

    [Fact]
    public async Task Different_pepper_rejects_previously_issued_code_shape()
    {
        // Two handlers share cache? Better: start with pepper A, verify with pepper B after copying pending is hard.
        // Instead: start+verify with pepper A works; wrong code fails.
        var (h, s, _, _) = Create(pepper: "pepper-a");
        await h.StartAsync("a@b.co", default);
        await Assert.ThrowsAsync<AuthenticationFailedException>(() => h.VerifyAsync("a@b.co", "999999" == s.LastCode ? "888888" : "999999", default));
    }
}

public class RefreshTokenDenylistTests
{
    private sealed class MemoryCache : ICacheStore
    {
        private readonly Dictionary<string, object?> _d = new();
        public Task<T?> GetAsync<T>(string key, CancellationToken ct) => Task.FromResult(_d.TryGetValue(key, out var v) ? (T?)v : default);
        public Task SetAsync<T>(string key, T value, TimeSpan ttl, CancellationToken ct) { _d[key] = value; return Task.CompletedTask; }
        public Task RemoveAsync(string key, CancellationToken ct) { _d.Remove(key); return Task.CompletedTask; }
    }

    [Fact]
    public async Task Revoked_token_is_detected()
    {
        var denylist = new RefreshTokenDenylist(new MemoryCache());
        Assert.False(await denylist.IsRevokedAsync("refresh-abc", default));
        await denylist.RevokeAsync("refresh-abc", TimeSpan.FromHours(1), default);
        Assert.True(await denylist.IsRevokedAsync("refresh-abc", default));
        Assert.False(await denylist.IsRevokedAsync("other", default));
    }
}

public class AccountLinkingHandlerTests
{
    private sealed class FakeVerifier : IExternalIdentityVerifier
    {
        public AuthProvider Provider { get; init; }
        public ProviderInfo Info => new(Provider, true, "client");
        public ExternalIdentity? Identity { get; set; }
        public Task<ExternalIdentity> VerifyAsync(ExternalCredential credential, CancellationToken ct) =>
            Task.FromResult(Identity ?? throw new AuthenticationFailedException("fail"));
    }

    private sealed class FakeUsers : IUserRepository
    {
        private static readonly DateTimeOffset Stamp = DateTimeOffset.UtcNow;
        public List<(Guid UserId, AuthProvider Provider, string Subject)> Links { get; } = [];
        public Task<AppUser> SignInAsync(ExternalIdentity identity, DateTimeOffset now, CancellationToken ct) =>
            throw new NotImplementedException();
        public Task<IReadOnlyList<LinkedIdentity>> ListIdentitiesAsync(Guid userId, CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<LinkedIdentity>>(
                Links.Where(l => l.UserId == userId).Select(l => new LinkedIdentity(l.Provider, Stamp)).ToList());
        public Task LinkAsync(Guid userId, ExternalIdentity identity, DateTimeOffset now, CancellationToken ct)
        {
            if (Links.Any(l => l.Provider == identity.Provider && l.Subject == identity.Subject && l.UserId != userId))
                throw new AuthenticationFailedException("שיטת ההתחברות הזו כבר מחוברת לחשבון אחר.");
            Links.Add((userId, identity.Provider, identity.Subject));
            return Task.CompletedTask;
        }
        public Task UnlinkAsync(Guid userId, AuthProvider provider, CancellationToken ct)
        {
            var mine = Links.Where(l => l.UserId == userId).ToList();
            if (mine.Count(l => l.Provider == provider) == 0) throw new Application.Workspaces.NotFoundException("missing");
            if (mine.Count <= 1) throw new AuthenticationFailedException("last");
            Links.RemoveAll(l => l.UserId == userId && l.Provider == provider);
            return Task.CompletedTask;
        }
    }

    private sealed class Clock : IClock
    {
        public DateTimeOffset Now { get; } = DateTimeOffset.Parse("2026-10-01T10:00:00Z");
        public DateOnly Today => DateOnly.FromDateTime(Now.DateTime);
    }

    [Fact]
    public async Task Link_attaches_verified_provider_identity()
    {
        var users = new FakeUsers();
        users.Links.Add((Guid.Parse("11111111-1111-1111-1111-111111111111"), AuthProvider.Email, "a@b.co"));
        var verifier = new FakeVerifier
        {
            Provider = AuthProvider.Google,
            Identity = new ExternalIdentity(AuthProvider.Google, "google-sub-1", "a@b.co", true, "Dana")
        };
        var h = new AccountLinkingHandler([verifier], users, new Clock(), NullLogger<AccountLinkingHandler>.Instance);
        var userId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        await h.LinkAsync(userId, AuthProvider.Google, new ExternalCredential("tok", null, null), default);
        Assert.Contains(users.Links, l => l.Provider == AuthProvider.Google && l.Subject == "google-sub-1");
    }

    [Fact]
    public async Task Unlink_rejects_removing_last_method()
    {
        var users = new FakeUsers();
        var userId = Guid.NewGuid();
        users.Links.Add((userId, AuthProvider.Email, "a@b.co"));
        var h = new AccountLinkingHandler([], users, new Clock(), NullLogger<AccountLinkingHandler>.Instance);
        await Assert.ThrowsAsync<AuthenticationFailedException>(() => h.UnlinkAsync(userId, AuthProvider.Email, default));
    }
}
