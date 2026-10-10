using RoshShaket.Domain;
using RoshShaket.Domain.Policies;
using static RoshShaket.Application.Rules.Format;

namespace RoshShaket.Application.Rules;

/// <summary>
/// How much of the statutory severance is exempt from income tax (Income Tax Ordinance s. 9(7a)):
/// up to one month's salary per year of work, and no more than the yearly ceiling.
/// A line for information only — the amounts above stay gross, and the tax itself depends on the employee's bracket.
/// </summary>
public sealed class SeveranceTaxRule : IRightsRule
{
    public int Order => 15;

    public IEnumerable<RightsComponent> Evaluate(RuleContext ctx)
    {
        var p = ctx.Profile;
        var s = p.Seniority;
        var inFund = p.Section14 is Section14Arrangement.Full or Section14Arrangement.Partial6;
        // Tax matters only when there is severance money: owed by the employer, or already in the fund.
        if (s.Years < 1m || (!SeverancePolicy.IsEntitled(ctx.Reason, s) && !inFund)) yield break;

        var years = SeverancePolicy.CountedYears(s, p.UnpaidLeaveMonths);
        var full = SeverancePolicy.FullEntitlement(p.MonthlySalary, years);
        var ceiling = ctx.Values.SeveranceTaxExemptCapPerYear;
        var exempt = SeverancePolicy.TaxExempt(p.MonthlySalary, years, ceiling);
        var taxable = full - exempt;
        var rule = $"פיצויים עד משכורת חודש לכל שנת עבודה פטורים ממס, עד תקרה של {Ils(ceiling)} לשנה.";

        if (taxable <= 0m)
        {
            yield return new RightsComponent("severance-tax", "מס על הפיצויים", null, "פטור ממס",
                rule + $" השכר שלכם לא עובר את התקרה, ולכן פיצויים לפי החוק ({Ils(full)}) פטורים במלואם. הפטור ניתן דרך טופס 161 שהמעסיק ממלא.",
                Certainty.Informational, false, SourceKeys.SeveranceTax);
            yield break;
        }

        yield return new RightsComponent("severance-tax", "מס על הפיצויים", null, $"כ-{Ils(taxable)} חייבים במס",
            rule + $" מתוך {Ils(full)}, {Ils(exempt)} פטורים וכ-{Ils(taxable)} חייבים במס לפי מדרגת המס שלכם."
                + " אפשר להקטין את המס: לפרוס אותו על עד 6 שנים, להשאיר את הכסף בקופה לקצבה (רצף קצבה), או לדחות את ההתחשבנות למעסיק הבא (רצף פיצויים). הבחירה נרשמת בטופס 161א.",
            Certainty.Informational, false, SourceKeys.SeveranceTax, "כדאי להתייעץ לפני שמושכים את הכסף");
    }
}
