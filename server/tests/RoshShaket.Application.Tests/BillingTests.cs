using Microsoft.Extensions.Options;
using RoshShaket.Application.Abstractions;
using RoshShaket.Application.Billing;
using RoshShaket.Application.Documents;
using RoshShaket.Application.Payslips;
using RoshShaket.Application.UseCases;
using Xunit;

namespace RoshShaket.Application.Tests;

public class BillingTests
{
    private sealed class MemoryBilling : IBillingStore
    {
        public readonly Dictionary<Guid, int> Balance = new();
        public readonly List<ApiUsageRecord> Usage = new();
        public int Refunds;

        public Task EnsureAccountAsync(Guid userId, int freeDocuments, CancellationToken ct)
        {
            Balance.TryAdd(userId, freeDocuments);
            return Task.CompletedTask;
        }
        public Task<bool> TryConsumeAsync(Guid userId, string documentType, int? year, int? month, CancellationToken ct)
        {
            if (Balance[userId] <= 0) return Task.FromResult(false);
            Balance[userId]--;
            return Task.FromResult(true);
        }
        public Task RefundAsync(Guid userId, string documentType, int? year, int? month, CancellationToken ct)
        {
            Balance[userId]++;
            Refunds++;
            return Task.CompletedTask;
        }
        public Task<BillingPurchase> AddPurchaseAsync(Guid userId, BillingPlan plan, string provider, string status, CancellationToken ct)
        {
            Balance[userId] += plan.Documents;
            return Task.FromResult(new BillingPurchase(Guid.NewGuid(), plan.Id, plan.Name, plan.Documents, plan.PriceIls, status, provider, DateTimeOffset.UtcNow));
        }
        public Task<BillingAccount> GetAccountAsync(Guid userId, CancellationToken ct) =>
            Task.FromResult(new BillingAccount(Balance[userId], 0, 0, 0, 0, 0, [], []));
        public Task RecordUsageAsync(ApiUsageRecord usage, CancellationToken ct)
        {
            Usage.Add(usage);
            return Task.CompletedTask;
        }
    }

    private sealed class FakeVerifier(bool fail) : IDocumentVerifier
    {
        public Task<DocumentExtraction> ExtractAsync(IReadOnlyList<PayslipImage> images, DocumentVerifyRequest expected, CancellationToken ct) =>
            fail
                ? throw new PayslipExtractionException("down")
                : Task.FromResult(new DocumentExtraction(true, "payslip", 2024, 3, null, null, Usage: new AiUsage("claude-sonnet-5", 6000, 4000)));
    }

    private static BillingHandlers Billing(MemoryBilling store, bool enabled = true, string provider = "None") =>
        new(store, Options.Create(new BillingOptions { Enabled = enabled, Provider = provider, FreeDocuments = 1 }));

    private static readonly IReadOnlyList<PayslipImage> OnePage = [new PayslipImage(new byte[10], "image/jpeg")];
    private static readonly DocumentVerifyRequest March2024 = new("payslip", 2024, 3);

    [Fact]
    public async Task Guests_cannot_run_a_paid_check()
    {
        var handler = new VerifyDocumentHandler(new FakeVerifier(false), new DocumentVerifyUploadPolicy(), Billing(new MemoryBilling()));
        await Assert.ThrowsAsync<SignInRequiredException>(() => handler.HandleAsync(OnePage, March2024, null, default));
    }

    [Fact]
    public async Task Free_credit_is_used_then_payment_is_required()
    {
        var store = new MemoryBilling();
        var user = Guid.NewGuid();
        var handler = new VerifyDocumentHandler(new FakeVerifier(false), new DocumentVerifyUploadPolicy(), Billing(store));

        await handler.HandleAsync(OnePage, March2024, user, default);
        Assert.Equal(0, store.Balance[user]);
        await Assert.ThrowsAsync<PaymentRequiredException>(() => handler.HandleAsync(OnePage, March2024, user, default));
    }

    [Fact]
    public async Task A_failed_ai_call_gives_the_credit_back()
    {
        var store = new MemoryBilling();
        var user = Guid.NewGuid();
        var handler = new VerifyDocumentHandler(new FakeVerifier(true), new DocumentVerifyUploadPolicy(), Billing(store));

        await Assert.ThrowsAsync<PayslipExtractionException>(() => handler.HandleAsync(OnePage, March2024, user, default));
        Assert.Equal(1, store.Balance[user]);
        Assert.Equal(1, store.Refunds);
    }

    [Fact]
    public async Task Usage_is_recorded_with_its_dollar_cost()
    {
        var store = new MemoryBilling();
        var handler = new VerifyDocumentHandler(new FakeVerifier(false), new DocumentVerifyUploadPolicy(), Billing(store, enabled: false));

        await handler.HandleAsync(OnePage, March2024, null, default);
        var usage = Assert.Single(store.Usage);
        // 6,000 input × $2/M + 4,000 output × $10/M = $0.052
        Assert.Equal(0.052m, usage.CostUsd);
    }

    [Fact]
    public async Task Checkout_is_refused_until_a_payment_provider_is_connected()
    {
        var store = new MemoryBilling();
        await Assert.ThrowsAsync<PaymentsUnavailableException>(() => Billing(store).CheckoutAsync(Guid.NewGuid(), "full", default));

        var user = Guid.NewGuid();
        var result = await Billing(store, provider: "Simulated").CheckoutAsync(user, "full", default);
        Assert.Equal(1 + 45, result.Balance);
    }
}
