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
    }
    private sealed class CapturingSender : IEmailSender
    {
        public string? LastCode;
        public Task SendLoginCodeAsync(string email, string code, CancellationToken ct) { LastCode = code; return Task.CompletedTask; }
    }
    private sealed class Users : IUserRepository
    {
        public Task<AppUser> SignInAsync(ExternalIdentity i, DateTimeOffset now, CancellationToken ct) => Task.FromResult(new AppUser(Guid.NewGuid(), i.Email, i.Name));
    }
    private sealed class Clock : IClock
    {
        public DateTimeOffset Now { get; set; } = new(2026, 9, 29, 10, 0, 0, TimeSpan.Zero);
        public DateOnly Today => DateOnly.FromDateTime(Now.DateTime);
    }

    private static (EmailCodeSignInHandler h, CapturingSender s, Clock c) Create()
    {
        var s = new CapturingSender(); var c = new Clock();
        return (new EmailCodeSignInHandler(new MemoryCache(), s, new Users(), c), s, c);
    }

    [Fact]
    public async Task Correct_code_signs_in_once_and_normalizes_email()
    {
        var (h, s, _) = Create();
        await h.StartAsync("  Dudu@Example.COM ", default);
        var user = await h.VerifyAsync("dudu@example.com", s.LastCode!, default);
        Assert.Equal("dudu@example.com", user.Email);
        await Assert.ThrowsAsync<AuthenticationFailedException>(() => h.VerifyAsync("dudu@example.com", s.LastCode!, default));
    }

    [Fact]
    public async Task Locks_after_max_attempts()
    {
        var (h, s, _) = Create();
        await h.StartAsync("a@b.co", default);
        for (var i = 0; i < EmailCodeSignInHandler.MaxAttempts; i++)
            await Assert.ThrowsAsync<AuthenticationFailedException>(() => h.VerifyAsync("a@b.co", "000000" == s.LastCode ? "111111" : "000000", default));
        await Assert.ThrowsAsync<AuthenticationFailedException>(() => h.VerifyAsync("a@b.co", s.LastCode!, default));
    }

    [Fact]
    public async Task Expired_code_is_rejected()
    {
        var (h, s, c) = Create();
        await h.StartAsync("a@b.co", default);
        c.Now = c.Now.AddMinutes(11);
        await Assert.ThrowsAsync<AuthenticationFailedException>(() => h.VerifyAsync("a@b.co", s.LastCode!, default));
    }

    [Fact]
    public async Task Invalid_email_is_a_validation_error()
    {
        var (h, _, _) = Create();
        await Assert.ThrowsAsync<DomainValidationException>(() => h.StartAsync("not-an-email", default));
    }
}
