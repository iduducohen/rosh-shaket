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
        // Unpaid leave beyond 14 days a year keeps the continuity but is not counted in the seniority.
        var years = SeverancePolicy.CountedYears(s, p.UnpaidLeaveMonths);
        var full = SeverancePolicy.FullEntitlement(p.MonthlySalary, years);
        var counted = years < s.Years
            ? $"{Num(years)} שנות ותק (מתוך {Num(s.Years)}, בלי חל\"ת שלא נספר)"
            : $"{Num(years)} שנות ותק";
        // Hourly: the determining salary is the last rate × average monthly hours over the whole employment.
        var basis = p is { PayType: PayType.Hourly, HourlyRate: { } rate, AverageMonthlyHours: { } hours }
            ? $"שכר קובע: תעריף {Ils(rate)} לשעה × {Num(Math.Min(hours, HourlyPolicy.FullTimeMonthlyHours))} שעות בחודש בממוצע = {Ils(p.MonthlySalary)}. × {counted} = {Ils(full)}."
            : p is { PayType: PayType.Global, GlobalOvertime: > 0 }
                ? $"שכר יסוד {Ils(p.MonthlySalary)}, בלי השעות הנוספות הגלובליות, × {counted} = {Ils(full)}."
                : $"שכר {Ils(p.MonthlySalary)} × {counted} = {Ils(full)}.";

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

        // The part of the employment before section 14 applied: the employer owes full severance for it.
        var before = SeverancePolicy.ShareBeforeSection14(p.StartDate, p.EndDate, p.Section14From);

        switch (p.Section14)
        {
            case Section14Arrangement.Unknown:
                yield return Line(null, "עד " + Ils(full), basis + " כמה מזה ישלם המעסיק תלוי בסעיף 14.",
                    Certainty.NeedsVerification, false, SourceKeys.Section14, "לבדוק סעיף 14 בחוזה");
                break;
            case Section14Arrangement.Full when before == 0m:
                yield return Line(null, "בקופה", basis + " מכוסה בכספי הפיצויים שהופקדו לפי סעיף 14 (8.33%), ומשתחרר דרך טופס 161.",
                    Certainty.Informational, false, SourceKeys.Section14);
                break;
            case Section14Arrangement.None:
                yield return new RightsComponent("severance", "פיצויי פיטורים", full, null,
                    basis + " אם הופקדו פיצויים לקופה, הם מקוזזים מהסכום.", Certainty.Estimate, true, SourceKeys.Severance);
                break;
            default:
                var share = SeverancePolicy.EmployerTopUpShare(p.Section14, ctx.Values.FullSeveranceRatePercent);
                if (before == 0m)
                {
                    yield return new RightsComponent("severance", "השלמת פיצויים", full * share, null,
                        basis + $" הפקדה של 6% מכסה כ-{Num((1 - share) * 100, 0)}%, והמעסיק משלים את השאר.",
                        Certainty.Estimate, true, SourceKeys.Severance);
                    break;
                }

                var owedBefore = full * before;
                var owedAfter = full * (1m - before) * share;
                var after = share > 0m
                    ? $"על התקופה שאחריו ההפקדה של 6% מכסה כ-{Num((1 - share) * 100, 0)}%, והמעסיק משלים {Ils(owedAfter)}."
                    : "התקופה שאחריו מכוסה בכספים שבקופה.";
                yield return new RightsComponent("severance", "השלמת פיצויים", owedBefore + owedAfter, null,
                    basis + $" סעיף 14 חל מ-{p.Section14From:MM/yyyy}: על {Num(years * before)} השנים שלפניו המעסיק משלם פיצויים מלאים, {Ils(owedBefore)}. "
                        + after + " פיצויים שהופקדו לקופה על התקופה הראשונה מקוזזים מהסכום.",
                    Certainty.Estimate, true, SourceKeys.Section14, "כדאי לוודא בחוזה ממתי חל סעיף 14");
                break;
        }
    }

    private static RightsComponent Line(decimal? amount, string display, string how, Certainty certainty, bool inTotal, string source, string? flag = null) =>
        new("severance", "פיצויי פיטורים", amount, display, how, certainty, inTotal, source, flag);
}
