using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using RoshShaket.Application.Abstractions;
using RoshShaket.Application.Auth;
using RoshShaket.Application.Billing;
using RoshShaket.Application.Documents;
using RoshShaket.Application.Payslips;
using Xunit;

namespace RoshShaket.Api.Tests;

/// <summary>
/// Runs the real API in memory — routing, auth, rate limits, error mapping and billing rules —
/// with only the outside world replaced: Claude, Postgres, Mongo, Redis and email.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    public MemoryBilling Billing { get; } = new();
    public FakeVerifier Verifier { get; } = new();
    public CapturingEmail Email { get; } = new();
    public MemoryPdfPasswords PdfPasswords { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("Database:InitializeOnStartup", "false");
        builder.UseSetting("ConnectionStrings:Postgres", "");
        builder.UseSetting("ConnectionStrings:Redis", "");
        builder.UseSetting("Billing:Enabled", "true");
        builder.UseSetting("Billing:Provider", "Simulated");
        builder.UseSetting("Billing:FreeDocuments", "3");
        builder.UseSetting("Billing:QuickCheckBurst", "2");
        builder.UseSetting("Billing:QuickCheckPerHour", "1");
        builder.UseSetting("Authentication:Otp:Pepper", "test-pepper-test-pepper-test-pepper");

        builder.ConfigureServices(s =>
        {
            s.RemoveAll<IBillingStore>();
            s.AddSingleton<IBillingStore>(Billing);
            s.RemoveAll<IDocumentVerifier>();
            s.AddSingleton<IDocumentVerifier>(Verifier);
            s.RemoveAll<IPayslipExtractor>();
            s.AddSingleton<IPayslipExtractor, FakeExtractor>();
            s.RemoveAll<IUserRepository>();
            s.AddSingleton<IUserRepository, MemoryUsers>();
            s.RemoveAll<IEmailSender>();
            s.AddSingleton<IEmailSender>(Email);
            s.RemoveAll<RoshShaket.Infrastructure.Postgres.IPdfPasswordStore>();
            s.AddSingleton<RoshShaket.Infrastructure.Postgres.IPdfPasswordStore>(PdfPasswords);
        });
    }
}

public sealed class MemoryBilling : IBillingStore
{
    private readonly ConcurrentDictionary<Guid, int> _balance = new();
    public readonly ConcurrentBag<ApiUsageRecord> Usage = new();
    private readonly ConcurrentDictionary<Guid, List<BillingPurchase>> _purchases = new();
    private readonly ConcurrentDictionary<Guid, (int Free, int Bought, int Used, int Refunded)> _totals = new();

    public Task EnsureAccountAsync(Guid userId, int freeDocuments, CancellationToken ct)
    {
        if (_balance.TryAdd(userId, freeDocuments)) _totals[userId] = (freeDocuments, 0, 0, 0);
        return Task.CompletedTask;
    }
    public Task<bool> TryConsumeAsync(Guid userId, string documentType, int? year, int? month, CancellationToken ct)
    {
        lock (_balance)
        {
            if (_balance[userId] <= 0) return Task.FromResult(false);
            _balance[userId]--;
            var t = _totals[userId];
            _totals[userId] = t with { Used = t.Used + 1 };
            return Task.FromResult(true);
        }
    }
    public Task RefundAsync(Guid userId, string documentType, int? year, int? month, CancellationToken ct)
    {
        lock (_balance)
        {
            _balance[userId]++;
            var t = _totals[userId];
            _totals[userId] = t with { Used = t.Used - 1, Refunded = t.Refunded + 1 };
        }
        return Task.CompletedTask;
    }
    public Task<BillingPurchase> AddPurchaseAsync(Guid userId, BillingPlan plan, string provider, string status, CancellationToken ct)
    {
        var p = new BillingPurchase(Guid.NewGuid(), plan.Id, plan.Name, plan.Documents, plan.PriceIls, status, provider, DateTimeOffset.UtcNow);
        lock (_balance)
        {
            _balance[userId] += plan.Documents;
            var t = _totals[userId];
            _totals[userId] = t with { Bought = t.Bought + plan.Documents };
        }
        _purchases.GetOrAdd(userId, _ => []).Add(p);
        return Task.FromResult(p);
    }
    public Task<BillingAccount> GetAccountAsync(Guid userId, CancellationToken ct)
    {
        var t = _totals[userId];
        var purchases = _purchases.TryGetValue(userId, out var list) ? list : [];
        return Task.FromResult(new BillingAccount(_balance[userId], t.Free, t.Bought, t.Used, t.Refunded, purchases.Sum(p => p.AmountIls), purchases, []));
    }
    public Task RecordUsageAsync(ApiUsageRecord usage, CancellationToken ct)
    {
        Usage.Add(usage);
        return Task.CompletedTask;
    }
}

public sealed class FakeVerifier : IDocumentVerifier
{
    public volatile bool Fail;
    public Task<DocumentExtraction> ExtractAsync(IReadOnlyList<PayslipImage> images, DocumentVerifyRequest expected, CancellationToken ct) =>
        Fail
            ? throw new PayslipExtractionException("שירות אימות המסמכים לא זמין כרגע.")
            : Task.FromResult(new DocumentExtraction(true, expected.ExpectedType, expected.ExpectedYear, expected.ExpectedMonth, null, null,
                GrossSalary: 38250m, Usage: new AiUsage("claude-sonnet-5", 6000, 2000)));
}

public sealed class FakeExtractor : IPayslipExtractor
{
    public Task<PayslipExtraction> ExtractAsync(IReadOnlyList<PayslipImage> images, CancellationToken ct) =>
        Task.FromResult(new PayslipExtraction(true, "2023-12", new DateOnly(2023, 10, 22), 34200m, 100m, 5, 4.25m, null, 8.33m, true,
            Usage: new AiUsage("claude-sonnet-5", 5000, 1500)));
}

public sealed class MemoryUsers : IUserRepository
{
    private readonly ConcurrentDictionary<string, AppUser> _byEmail = new();
    public Task<AppUser> SignInAsync(ExternalIdentity i, DateTimeOffset now, CancellationToken ct) =>
        Task.FromResult(_byEmail.GetOrAdd(i.Email ?? i.Subject, e => new AppUser(Guid.NewGuid(), i.Email, i.Name)));
    public Task<IReadOnlyList<LinkedIdentity>> ListIdentitiesAsync(Guid userId, CancellationToken ct) => Task.FromResult<IReadOnlyList<LinkedIdentity>>([]);
    public Task LinkAsync(Guid userId, ExternalIdentity identity, DateTimeOffset now, CancellationToken ct) => Task.CompletedTask;
    public Task UnlinkAsync(Guid userId, AuthProvider provider, CancellationToken ct) => Task.CompletedTask;
}

public sealed class MemoryPdfPasswords : RoshShaket.Infrastructure.Postgres.IPdfPasswordStore
{
    private readonly ConcurrentDictionary<Guid, List<string>> _byUser = new();
    public Task<IReadOnlyList<string>> ListAsync(Guid userId, CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<string>>(_byUser.TryGetValue(userId, out var l) ? l.ToList() : []);
    public Task AddAsync(Guid userId, string password, CancellationToken ct)
    {
        var list = _byUser.GetOrAdd(userId, _ => []);
        lock (list) if (!list.Contains(password)) list.Add(password);
        return Task.CompletedTask;
    }
    public Task<int> DeleteAllAsync(Guid userId, CancellationToken ct) =>
        Task.FromResult(_byUser.TryRemove(userId, out var l) ? l.Count : 0);
}

public sealed class CapturingEmail : IEmailSender
{
    public readonly ConcurrentDictionary<string, string> Codes = new();
    public Task SendLoginCodeAsync(string email, string code, CancellationToken ct)
    {
        Codes[email] = code;
        return Task.CompletedTask;
    }
}

public class BillingEndToEndTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private async Task<HttpClient> SignedInClient(string email)
    {
        var client = factory.CreateClient();
        (await client.PostAsJsonAsync("/api/auth/email/start", new { email })).EnsureSuccessStatusCode();
        var verify = await client.PostAsJsonAsync("/api/auth/email/verify", new { email, code = factory.Email.Codes[email] });
        verify.EnsureSuccessStatusCode();
        var token = (await verify.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("accessToken").GetString();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    private static MultipartFormDataContent Document(string type = "payslip", int year = 2024, int? month = 3)
    {
        var form = new MultipartFormDataContent();
        var image = new ByteArrayContent(new byte[64]);
        image.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        form.Add(image, "files", "page-1.jpg");
        form.Add(new StringContent(type), "expectedType");
        form.Add(new StringContent(year.ToString()), "expectedYear");
        if (month is int m) form.Add(new StringContent(m.ToString()), "expectedMonth");
        return form;
    }

    private static async Task<int> Balance(HttpClient client) =>
        (await client.GetFromJsonAsync<JsonElement>("/api/billing/me")).GetProperty("balance").GetInt32();

    [Fact]
    public async Task Health_and_public_plans_are_reachable_without_signing_in()
    {
        var client = factory.CreateClient();
        (await client.GetAsync("/health")).StatusCode.Should().Be(HttpStatusCode.OK);

        var plans = await client.GetFromJsonAsync<JsonElement>("/api/billing/plans");
        plans.GetProperty("plans").GetArrayLength().Should().Be(BillingCatalog.Plans.Count);
        plans.GetProperty("freeDocuments").GetInt32().Should().Be(3);
        plans.GetProperty("simulated").GetBoolean().Should().BeTrue();
    }

    [Fact]
    public async Task Account_endpoints_require_a_signed_in_user()
    {
        var client = factory.CreateClient();
        (await client.GetAsync("/api/billing/me")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await client.PostAsJsonAsync("/api/billing/checkout", new { planId = "full" })).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task A_guest_cannot_run_a_paid_document_check()
    {
        var response = await factory.CreateClient().PostAsync("/api/documents/verify", Document());
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await response.Content.ReadAsStringAsync()).Should().Contain("התחברו");
    }

    [Fact]
    public async Task Free_documents_run_out_then_a_purchase_lets_the_review_continue()
    {
        var client = await SignedInClient("credits@example.com");
        (await Balance(client)).Should().Be(3);

        for (var i = 0; i < 3; i++)
            (await client.PostAsync("/api/documents/verify", Document(month: i + 1))).StatusCode.Should().Be(HttpStatusCode.OK);
        (await Balance(client)).Should().Be(0);

        var refused = await client.PostAsync("/api/documents/verify", Document(month: 4));
        refused.StatusCode.Should().Be(HttpStatusCode.PaymentRequired);
        (await refused.Content.ReadAsStringAsync()).Should().Contain("נגמרו המסמכים");

        var checkout = await client.PostAsJsonAsync("/api/billing/checkout", new { planId = "topup" });
        checkout.StatusCode.Should().Be(HttpStatusCode.OK);
        (await checkout.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("balance").GetInt32().Should().Be(10);

        (await client.PostAsync("/api/documents/verify", Document(month: 4))).StatusCode.Should().Be(HttpStatusCode.OK);
        var account = await client.GetFromJsonAsync<JsonElement>("/api/billing/me");
        account.GetProperty("balance").GetInt32().Should().Be(9);
        account.GetProperty("used").GetInt32().Should().Be(4);
        account.GetProperty("purchased").GetInt32().Should().Be(10);
        account.GetProperty("spentIls").GetDecimal().Should().Be(19m);
    }

    [Fact]
    public async Task A_failed_ai_call_returns_the_credit()
    {
        var client = await SignedInClient("refund@example.com");
        factory.Verifier.Fail = true;
        try
        {
            var response = await client.PostAsync("/api/documents/verify", Document());
            response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
        }
        finally
        {
            factory.Verifier.Fail = false;
        }
        var account = await client.GetFromJsonAsync<JsonElement>("/api/billing/me");
        account.GetProperty("balance").GetInt32().Should().Be(3);
        account.GetProperty("refunded").GetInt32().Should().Be(1);
    }

    [Fact]
    public async Task Unknown_plan_is_rejected()
    {
        var client = await SignedInClient("plan@example.com");
        (await client.PostAsJsonAsync("/api/billing/checkout", new { planId = "nope" })).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Quick_check_is_free_records_its_cost_and_is_rate_limited()
    {
        var client = factory.CreateClient();
        HttpResponseMessage Last = null!;
        for (var i = 0; i < 3; i++)
        {
            var form = new MultipartFormDataContent();
            var image = new ByteArrayContent(new byte[64]);
            image.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
            form.Add(image, "files", "payslip.jpg");
            Last = await client.PostAsync("/api/payslips/extract", form);
            if (i < 2) Last.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        Last.StatusCode.Should().Be(HttpStatusCode.TooManyRequests, "the burst is 2 per IP in this test");
        factory.Billing.Usage.Should().Contain(u => u.Kind == "quick_check" && u.CostUsd == 0.025m);
    }

    [Fact]
    public async Task Pdf_passwords_are_saved_per_account_and_closed_to_guests()
    {
        (await factory.CreateClient().GetAsync("/api/pdf-passwords")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        var owner = await SignedInClient("pdf-owner@example.com");
        (await owner.PostAsJsonAsync("/api/pdf-passwords", new { password = "123456789" })).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await owner.PostAsJsonAsync("/api/pdf-passwords", new { password = new string('x', 200) })).StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var listed = await owner.GetFromJsonAsync<JsonElement>("/api/pdf-passwords");
        listed.GetProperty("passwords").EnumerateArray().Select(p => p.GetString()).Should().Equal("123456789");

        var other = await SignedInClient("pdf-other@example.com");
        (await other.GetFromJsonAsync<JsonElement>("/api/pdf-passwords")).GetProperty("passwords").GetArrayLength().Should().Be(0, "another account never sees them");

        (await owner.DeleteAsync("/api/pdf-passwords")).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await owner.GetFromJsonAsync<JsonElement>("/api/pdf-passwords")).GetProperty("passwords").GetArrayLength().Should().Be(0);
    }
}
