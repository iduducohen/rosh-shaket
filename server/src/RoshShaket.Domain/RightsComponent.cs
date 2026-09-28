namespace RoshShaket.Domain;

/// <summary>One line in the result: an amount (or a textual value), how it was computed, and where the law is explained.</summary>
public sealed record RightsComponent(
    string Code,
    string Title,
    decimal? Amount,
    string? DisplayValue,
    string Explanation,
    Certainty Certainty,
    bool IncludedInTotal,
    string? SourceKey,
    string? Flag = null);

public sealed record CalculationResult(
    ExitReason Reason,
    Seniority Seniority,
    IReadOnlyList<RightsComponent> Components,
    IReadOnlyList<string> Advisories,
    AnnualValues ValuesUsed)
{
    public decimal EstimatedTotal =>
        Components.Where(c => c.IncludedInTotal && c.Amount.HasValue).Sum(c => c.Amount!.Value);
}
