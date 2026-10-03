namespace RoshShaket.Application.Billing;

/// <summary>
/// Full-review billing: one credit = one document read by the AI check.
/// The quick check (last payslip) stays free and does not touch credits.
/// </summary>
public sealed class BillingOptions
{
    public const string Section = "Billing";

    /// <summary>When false, document checks are free and only usage is recorded (local testing).</summary>
    public bool Enabled { get; set; }

    /// <summary>"None" = checkout not connected yet; "Simulated" = credits granted without charging (testing only).</summary>
    public string Provider { get; set; } = "None";

    /// <summary>Credits granted once to every signed-in account.</summary>
    /// <summary>Documents granted on a new account. 0: the full review is paid from the first document.</summary>
    public int FreeDocuments { get; set; } = 0;

    /// <summary>Claude list prices, used to log the real cost of each call.</summary>
    public decimal InputUsdPerMTok { get; set; } = 2m;
    public decimal OutputUsdPerMTok { get; set; } = 10m;
}

public sealed record BillingPlan(
    string Id,
    string Name,
    string Tagline,
    int Documents,
    decimal PriceIls,
    bool Recommended = false,
    bool TopUp = false);

public static class BillingCatalog
{
    /// <summary>Prices include VAT. Sized so even a worst-case AI cost per document leaves a margin.</summary>
    public static IReadOnlyList<BillingPlan> Plans { get; } =
    [
        new("year", "שנה אחת", "עד 12 תלושים, טופס 106 ודוח קופה", 15, 29m),
        new("full", "בדיקה מלאה", "עד 3 שנים — המסלול של רוב המשתמשים", 45, 59m, Recommended: true),
        new("long", "תקופה ארוכה", "עד 8 שנים של מסמכים", 120, 99m),
        new("topup", "תוספת מסמכים", "להשלמה בלי לקנות חבילה חדשה", 10, 19m, TopUp: true)
    ];

    public static BillingPlan? Find(string id) => Plans.FirstOrDefault(p => p.Id == id);
}

public sealed record BillingPurchase(Guid Id, string PlanId, string PlanName, int Documents, decimal AmountIls, string Status, string Provider, DateTimeOffset CreatedAt);

public sealed record BillingLedgerEntry(int Delta, string Kind, string? DocumentType, int? Year, int? Month, DateTimeOffset CreatedAt);

public sealed record BillingAccount(
    int Balance,
    int FreeGranted,
    int Purchased,
    int Used,
    int Refunded,
    decimal SpentIls,
    IReadOnlyList<BillingPurchase> Purchases,
    IReadOnlyList<BillingLedgerEntry> RecentActivity);

public sealed record ApiUsageRecord(Guid? UserId, string Kind, string Model, int InputTokens, int OutputTokens, decimal CostUsd);

public interface IBillingStore
{
    /// <summary>Creates the account with the free credits the first time; no-op afterwards.</summary>
    Task EnsureAccountAsync(Guid userId, int freeDocuments, CancellationToken ct);
    /// <summary>Atomically takes one credit. False when the balance is empty.</summary>
    Task<bool> TryConsumeAsync(Guid userId, string documentType, int? year, int? month, CancellationToken ct);
    Task RefundAsync(Guid userId, string documentType, int? year, int? month, CancellationToken ct);
    Task<BillingPurchase> AddPurchaseAsync(Guid userId, BillingPlan plan, string provider, string status, CancellationToken ct);
    Task<BillingAccount> GetAccountAsync(Guid userId, CancellationToken ct);
    Task RecordUsageAsync(ApiUsageRecord usage, CancellationToken ct);
}

/// <summary>Thrown when a paid check is requested without credits; mapped to HTTP 402.</summary>
public sealed class PaymentRequiredException(string message) : Exception(message);

/// <summary>Thrown when a paid check is requested by a guest; mapped to HTTP 401.</summary>
public sealed class SignInRequiredException(string message) : Exception(message);

/// <summary>Thrown when checkout is called before a payment provider is connected; mapped to HTTP 503.</summary>
public sealed class PaymentsUnavailableException(string message) : Exception(message);

public sealed record CheckoutResult(string Status, BillingPurchase Purchase, int Balance);

public sealed class BillingHandlers(IBillingStore store, Microsoft.Extensions.Options.IOptions<BillingOptions> options)
{
    private BillingOptions O => options.Value;

    public bool Enabled => O.Enabled;
    public string Provider => O.Provider;
    public int FreeDocuments => O.FreeDocuments;

    public async Task<BillingAccount> GetAccountAsync(Guid userId, CancellationToken ct)
    {
        await store.EnsureAccountAsync(userId, O.FreeDocuments, ct);
        return await store.GetAccountAsync(userId, ct);
    }

    /// <summary>Called before an AI document check. No-op when billing is off.</summary>
    public async Task ChargeDocumentAsync(Guid? userId, string documentType, int? year, int? month, CancellationToken ct)
    {
        if (!O.Enabled) return;
        if (userId is not Guid id)
            throw new SignInRequiredException("הבדיקה המלאה זמינה למשתמשים מחוברים. התחברו ובחרו חבילת מסמכים כדי להתחיל.");
        await store.EnsureAccountAsync(id, O.FreeDocuments, ct);
        if (!await store.TryConsumeAsync(id, documentType, year, month, ct))
            throw new PaymentRequiredException("נגמרו המסמכים בחבילה. אפשר להוסיף מסמכים ולהמשיך מאותה נקודה.");
    }

    /// <summary>The AI check failed on our side — the user should not pay for it.</summary>
    public Task RefundDocumentAsync(Guid? userId, string documentType, int? year, int? month, CancellationToken ct) =>
        O.Enabled && userId is Guid id ? store.RefundAsync(id, documentType, year, month, ct) : Task.CompletedTask;

    public async Task<CheckoutResult> CheckoutAsync(Guid userId, string planId, CancellationToken ct)
    {
        var plan = BillingCatalog.Find(planId)
            ?? throw new Domain.DomainValidationException(new Dictionary<string, string> { ["planId"] = "חבילה לא קיימת" });
        if (!string.Equals(O.Provider, "Simulated", StringComparison.OrdinalIgnoreCase))
            throw new PaymentsUnavailableException("התשלום באתר עוד לא מחובר. נעדכן כשאפשר יהיה לרכוש.");

        await store.EnsureAccountAsync(userId, O.FreeDocuments, ct);
        var purchase = await store.AddPurchaseAsync(userId, plan, "Simulated", "simulated", ct);
        var account = await store.GetAccountAsync(userId, ct);
        return new CheckoutResult("simulated", purchase, account.Balance);
    }

    public Task RecordUsageAsync(Guid? userId, string kind, string model, int inputTokens, int outputTokens, CancellationToken ct)
    {
        var cost = inputTokens * O.InputUsdPerMTok / 1_000_000m + outputTokens * O.OutputUsdPerMTok / 1_000_000m;
        return store.RecordUsageAsync(new ApiUsageRecord(userId, kind, model, inputTokens, outputTokens, Math.Round(cost, 6)), ct);
    }
}
