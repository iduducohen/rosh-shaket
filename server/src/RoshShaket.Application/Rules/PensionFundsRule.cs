using RoshShaket.Domain;

namespace RoshShaket.Application.Rules;

public sealed class PensionFundsRule : IRightsRule
{
    public int Order => 50;

    public IEnumerable<RightsComponent> Evaluate(RuleContext ctx)
    {
        var title = ctx.Profile.HasStudyFund ? "פנסיה וקרן השתלמות" : "פנסיה";
        yield return new RightsComponent("funds", title, null, "לבדוק",
            "החישוב לא כולל את הקופות. כדאי להזמין דוח מהמסלקה ולוודא שכל ההפקדות הגיעו.",
            Certainty.NeedsVerification, false, SourceKeys.PensionClearing);
    }
}
