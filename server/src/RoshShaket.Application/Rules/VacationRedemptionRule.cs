using RoshShaket.Domain;
using RoshShaket.Domain.Policies;
using static RoshShaket.Application.Rules.Format;

namespace RoshShaket.Application.Rules;

public sealed class VacationRedemptionRule : IRightsRule
{
    public int Order => 30;

    public IEnumerable<RightsComponent> Evaluate(RuleContext ctx)
    {
        var p = ctx.Profile;
        var daily = DailyWagePolicy.FromMonthly(p.MonthlySalary, p.WorkWeek);
        var amount = p.VacationBalanceDays * daily;
        // Unused vacation can be claimed for the last three years and the current one only.
        var ceiling = VacationPolicy.MaxRedeemableDays(p.Seniority, p.WorkWeek);
        var overCeiling = p.VacationBalanceDays > ceiling
            ? $"פדיון חופשה מוגבל לשלוש השנים האחרונות ולשנה השוטפת: כ-{ceiling} ימים לפי המינימום בחוק. ייתכן שלא כל היתרה תשולם, אלא אם החוזה נותן יותר ימים"
            : null;
        if (p.PayType == PayType.Hourly)
        {
            // By law the daily value comes from the fullest quarter of the last 12 months; the average is the floor of that.
            yield return new RightsComponent("vacation", "פדיון חופשה", amount, null,
                $"{Num(p.VacationBalanceDays)} ימים × שכר יומי ממוצע {Ils(daily)} (לפי השכר החודשי הממוצע).",
                overCeiling is null ? Certainty.Estimate : Certainty.NeedsVerification, true, SourceKeys.Vacation,
                overCeiling ?? "אצל עובד שעתי מחשבים לפי שלושת החודשים המלאים ביותר בשנה האחרונה — ייתכן שמגיע יותר");
            yield break;
        }

        yield return new RightsComponent("vacation", "פדיון חופשה", amount, null,
            $"{Num(p.VacationBalanceDays)} ימים × שכר יומי {Ils(daily)}.",
            overCeiling is null ? Certainty.Estimate : Certainty.NeedsVerification, true, SourceKeys.Vacation, overCeiling);
    }
}
