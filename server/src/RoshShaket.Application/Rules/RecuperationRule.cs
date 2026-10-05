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
        var scope = $"היקף משרה {Num(p.JobPercent, 0)}%{(p is { PayType: PayType.Hourly, AverageMonthlyHours: { } h } ? $" ({Num(h)} שעות בחודש מתוך {Num(HourlyPolicy.FullTimeMonthlyHours)})" : "")}";

        if (p.LastRecuperationPaid is { } lastPaid)
        {
            // The relative part: the months worked since the last payment, out of a 12-month year.
            var months = RecuperationPolicy.MonthsOwed(p.StartDate, lastPaid, p.EndDate);
            var relativeDays = daysByLaw * p.JobFraction * months / 12m;
            yield return new RightsComponent("recuperation", "דמי הבראה", relativeDays * ctx.Values.RecuperationDayValue, null,
                $"החלק היחסי מאז התשלום האחרון ({lastPaid:MM/yyyy}): {daysByLaw} ימים בשנת עבודה {year} × {scope} × {months} חודשים מתוך 12 = {Num(relativeDays)} ימים, × ₪{Num(ctx.Values.RecuperationDayValue)}.",
                Certainty.Estimate, true, SourceKeys.Recuperation,
                months >= RecuperationPolicy.MaxMonthsOwed ? "אפשר לדרוש עד שנתיים אחורה בלבד" : null);
            yield break;
        }

        var owedDays = Math.Max(0m, daysByLaw * p.JobFraction - p.RecuperationDaysPaidLastYear);
        var amount = owedDays * ctx.Values.RecuperationDayValue;

        yield return new RightsComponent("recuperation", "דמי הבראה", amount, null,
            $"{daysByLaw} ימים בשנת עבודה {year} × {scope} פחות {Num(p.RecuperationDaysPaidLastYear)} ששולמו, × ₪{Num(ctx.Values.RecuperationDayValue)}.",
            Certainty.Estimate, true, SourceKeys.Recuperation, "אפשר לבדוק גם שנתיים אחורה");
    }
}
