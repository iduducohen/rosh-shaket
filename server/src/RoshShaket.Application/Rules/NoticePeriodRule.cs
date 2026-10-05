using RoshShaket.Domain;
using RoshShaket.Domain.Policies;
using static RoshShaket.Application.Rules.Format;

namespace RoshShaket.Application.Rules;

public sealed class NoticePeriodRule : IRightsRule
{
    public int Order => 20;

    public IEnumerable<RightsComponent> Evaluate(RuleContext ctx)
    {
        var p = ctx.Profile;
        var notice = NoticePeriodPolicy.For(p.PayType, p.Seniority);
        var display = notice.IsFullMonth ? "חודש" : $"{notice.Days} ימים";

        if (ctx.Reason is ExitReason.Fired or ExitReason.ContractEnded)
        {
            var inLieu = notice.IsFullMonth ? p.MonthlySalary : p.MonthlySalary / 30m * notice.Days;
            yield return new RightsComponent("notice", "הודעה מוקדמת", inLieu, display,
                $"אם המעסיק לא רוצה שתעבוד בתקופה הזו, הוא משלם תמורתה: כ-{Ils(inLieu)}."
                    + (p.PayType == PayType.Hourly ? " חושב לפי הכללים לעובד בשכר שעתי, ולפי השכר החודשי הממוצע." : ""),
                Certainty.NeedsVerification, IncludedInTotal: false, SourceKeys.Notice);
        }
        else
        {
            yield return new RightsComponent("notice", "הודעה מוקדמת שאתה נותן", null, display,
                "לפני התפטרות חייבים לתת הודעה מוקדמת בכתב. בלי הודעה, המעסיק רשאי לקזז את התמורה.",
                Certainty.Informational, false, SourceKeys.Notice);
        }
    }
}
