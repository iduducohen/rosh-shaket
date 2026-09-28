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
        yield return new RightsComponent("vacation", "פדיון חופשה", amount, null,
            $"{Num(p.VacationBalanceDays)} ימים × שכר יומי {Ils(daily)}.",
            Certainty.Estimate, true, SourceKeys.Vacation);
    }
}
