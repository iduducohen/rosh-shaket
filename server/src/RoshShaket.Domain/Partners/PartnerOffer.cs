using System.Globalization;

namespace RoshShaket.Domain;

public sealed record PartnerOffer(
    string Id,
    string Name,
    string Kind,
    string Summary,
    bool Cooperation,
    int DiscountPercent,
    string? Email = null,
    string? Whatsapp = null,
    string? Website = null,
    string? Specialty = null,
    IReadOnlyList<string>? Recommendations = null);

/// <summary>
/// A cooperation agreement is shown before everyone else.
/// Inside each group, a larger discount is shown first.
/// </summary>
public static class PartnerRanking
{
    public static IReadOnlyList<PartnerOffer> ByPriority(IEnumerable<PartnerOffer> offers) =>
        offers
            .OrderByDescending(o => o.Cooperation)
            .ThenByDescending(o => o.DiscountPercent)
            .ThenBy(o => o.Name, StringComparer.Create(CultureInfo.GetCultureInfo("he-IL"), ignoreCase: false))
            .ToList();
}
