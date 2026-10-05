using RoshShaket.Domain;
using RoshShaket.Domain.Policies;
using static RoshShaket.Application.Rules.Format;

namespace RoshShaket.Application.Rules;

public sealed class SeveranceRule : IRightsRule
{
    public int Order => 10;

    public IEnumerable<RightsComponent> Evaluate(RuleContext ctx)
    {
        var p = ctx.Profile;
        var s = p.Seniority;
        var full = SeverancePolicy.FullEntitlement(p.MonthlySalary, s);
        // Hourly: the determining salary is the last rate × average monthly hours over the whole employment.
        var basis = p is { PayType: PayType.Hourly, HourlyRate: { } rate, AverageMonthlyHours: { } hours }
            ? $"שכר קובע: תעריף {Ils(rate)} לשעה × {Num(Math.Min(hours, HourlyPolicy.FullTimeMonthlyHours))} שעות בחודש בממוצע = {Ils(p.MonthlySalary)}. × {Num(s.Years)} שנות ותק = {Ils(full)}."
            : $"שכר {Ils(p.MonthlySalary)} × {Num(s.Years)} שנות ותק = {Ils(full)}.";

        if (s.Years < 1m)
        {
            yield return Line(null, "לא מגיע", "זכאות לפיצויים מתחילה אחרי שנת עבודה אחת.", Certainty.Estimate, false, SourceKeys.Severance);
            yield break;
        }

        if (!SeverancePolicy.IsEntitled(ctx.Reason, s))
        {
            var hasFunds = p.Section14 is Section14Arrangement.Full or Section14Arrangement.Partial6;
            yield return hasFunds
                ? Line(null, "בקופה", "בהתפטרות רגילה אין פיצויים מהמעסיק, אבל עם סעיף 14 הכספים שהופקדו בקופה שייכים לך.",
                    Certainty.Informational, false, SourceKeys.Section14)
                : Line(null, "לא מגיע", "בהתפטרות רגילה אין פיצויים. בהרעת תנאים, מצב בריאותי או מעבר דירה ייתכן שזו התפטרות בדין מפוטר.",
                    Certainty.Estimate, false, SourceKeys.ResignedJustified);
            yield break;
        }

        switch (p.Section14)
        {
            case Section14Arrangement.Unknown:
                yield return Line(null, "עד " + Ils(full), basis + " כמה מזה ישלם המעסיק תלוי בסעיף 14.",
                    Certainty.NeedsVerification, false, SourceKeys.Section14, "לבדוק סעיף 14 בחוזה");
                break;
            case Section14Arrangement.Full:
                yield return Line(null, "בקופה", basis + " מכוסה בכספי הפיצויים שהופקדו לפי סעיף 14 (8.33%), ומשתחרר דרך טופס 161.",
                    Certainty.Informational, false, SourceKeys.Section14);
                break;
            default:
                var share = SeverancePolicy.EmployerTopUpShare(p.Section14, ctx.Values.FullSeveranceRatePercent);
                var amount = full * share;
                var title = p.Section14 == Section14Arrangement.Partial6 ? "השלמת פיצויים" : "פיצויי פיטורים";
                var how = p.Section14 == Section14Arrangement.Partial6
                    ? basis + $" הפקדה של 6% מכסה כ-{Num((1 - share) * 100, 0)}%, והמעסיק משלים את השאר."
                    : basis + " אם הופקדו פיצויים לקופה, הם מקוזזים מהסכום.";
                yield return new RightsComponent("severance", title, amount, null, how, Certainty.Estimate, true, SourceKeys.Severance);
                break;
        }
    }

    private static RightsComponent Line(decimal? amount, string display, string how, Certainty certainty, bool inTotal, string source, string? flag = null) =>
        new("severance", "פיצויי פיטורים", amount, display, how, certainty, inTotal, source, flag);
}
