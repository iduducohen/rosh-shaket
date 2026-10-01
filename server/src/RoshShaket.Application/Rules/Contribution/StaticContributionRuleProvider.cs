using RoshShaket.Application.EmploymentReview;
using RoshShaket.Domain.Employment;

namespace RoshShaket.Application.Rules.Contribution;

public sealed class StaticContributionRuleProvider : IContributionRuleProvider
{
    /// <summary>
    /// Configurable seed rates (Estimate until legal review). Not hardcoded inside formulas —
    /// formulas read these values by effective date.
    /// </summary>
    public static IReadOnlyList<ContributionRule> Seed { get; } =
    [
        new(Guid.Parse("11111111-1111-1111-1111-111111111101"),
            new DateOnly(2008, 1, 1), new DateOnly(2016, 12, 31),
            5.0m, 6.5m, 6.0m, 2.5m, 7.5m, null,
            "ערכי הערכה היסטוריים לפיתוח — לאמת מול דין/הסכם", true),
        new(Guid.Parse("11111111-1111-1111-1111-111111111102"),
            new DateOnly(2017, 1, 1), null,
            6.0m, 6.5m, 8.33m, 2.5m, 7.5m, null,
            "ערכי הערכה לפיתוח (פנסיה חובה / פיצויים / השתלמות) — לאמת לפני ייצור", true)
    ];

    public Task<IReadOnlyList<ContributionRule>> GetAllAsync(CancellationToken ct) =>
        Task.FromResult(Seed);
}

/// <summary>In-memory store for unit tests and ephemeral demo builds.</summary>
public sealed class InMemoryEmploymentReviewStore : IEmploymentReviewStore
{
    private readonly Dictionary<Guid, EmploymentReviewCase> _data = new();

    public Task<EmploymentReviewCase?> GetAsync(Guid workspaceId, CancellationToken ct) =>
        Task.FromResult(_data.TryGetValue(workspaceId, out var v) ? v : null);

    public Task SaveAsync(EmploymentReviewCase review, CancellationToken ct)
    {
        _data[review.WorkspaceId] = review;
        return Task.CompletedTask;
    }
}
