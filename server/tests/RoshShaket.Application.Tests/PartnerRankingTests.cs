using RoshShaket.Domain;
using Xunit;

namespace RoshShaket.Application.Tests;

public class PartnerRankingTests
{
    [Fact]
    public void Cooperation_comes_first_then_the_larger_discount()
    {
        var ordered = PartnerRanking.ByPriority(
        [
            new PartnerOffer("small", "הנחה קטנה", "Lawyer", "", false, 5),
            new PartnerOffer("partner-low", "שותף", "Lawyer", "", true, 10),
            new PartnerOffer("big", "הנחה גדולה", "Lawyer", "", false, 40),
            new PartnerOffer("partner-high", "שותף עם הנחה", "Lawyer", "", true, 15)
        ]);

        Assert.Equal(["partner-high", "partner-low", "big", "small"], ordered.Select(o => o.Id));
    }
}
