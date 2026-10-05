using RoshShaket.Domain;
using RoshShaket.Domain.Policies;
using static RoshShaket.Application.Rules.Format;

namespace RoshShaket.Application.Rules;

public sealed class RecuperationRule : IRightsRule
{
    public int Order => 40;

    public IEnumerable<RightsComponent> Evaluate(RuleContext ctx)
    {
        var p = ctx.Profile;
        if (!RecuperationPolicy.IsEntitled(p.Seniority))
        {
            yield return new RightsComponent("recuperation", "דמי הבראה", null, "לא מגיע",
                "זכאות להבראה מתחילה אחרי שנת עבודה.", Certainty.Estimate, false, SourceKeys.Recuperation);
            yield break;
        }

        var year = p.Seniority.CurrentYearOfWork;
        var daysByLaw = RecuperationPolicy.DaysForYearOfWork(year);
        var owedDays = Math.Max(0m, daysByLaw * p.JobFraction - p.RecuperationDaysPaidLastYear);
        var amount = owedDays * ctx.Values.RecuperationDayValue;

        yield return new RightsComponent("recuperation", "דמי הבראה", amount, null,
            $"{daysByLaw} ימים בשנת עבודה {year} × היקף משרה {Num(p.JobPercent, 0)}%{(p is { PayType: PayType.Hourly, AverageMonthlyHours: { } h } ? $" ({Num(h)} שעות בחודש מתוך {Num(HourlyPolicy.FullTimeMonthlyHours)})" : "")} פחות {Num(p.RecuperationDaysPaidLastYear)} ששולמו, × {Ils(ctx.Values.RecuperationDayValue)}.",
            Certainty.Estimate, true, SourceKeys.Recuperation, "אפשר לבדוק גם שנתיים אחורה");
    }
}
