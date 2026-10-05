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
        if (p.PayType == PayType.Hourly)
        {
            // By law the daily value comes from the fullest quarter of the last 12 months; the average is the floor of that.
            yield return new RightsComponent("vacation", "פדיון חופשה", amount, null,
                $"{Num(p.VacationBalanceDays)} ימים × שכר יומי ממוצע {Ils(daily)} (לפי השכר החודשי הממוצע).",
                Certainty.Estimate, true, SourceKeys.Vacation,
                "אצל עובד שעתי מחשבים לפי שלושת החודשים המלאים ביותר בשנה האחרונה — ייתכן שמגיע יותר");
            yield break;
        }

        yield return new RightsComponent("vacation", "פדיון חופשה", amount, null,
            $"{Num(p.VacationBalanceDays)} ימים × שכר יומי {Ils(daily)}.",
            Certainty.Estimate, true, SourceKeys.Vacation);
    }
}
