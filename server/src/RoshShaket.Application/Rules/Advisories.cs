using RoshShaket.Domain;

namespace RoshShaket.Application.Rules;

public sealed class ExitReasonAdvisoryRule : IAdvisoryRule
{
    public IEnumerable<string> Advise(RuleContext ctx)
    {
        switch (ctx.Reason)
        {
            case ExitReason.Resigned:
                yield return "דמי אבטלה: בהתפטרות רגילה יש 90 ימי המתנה עד תחילת התשלום.";
                break;
            case ExitReason.ResignedJustified:
                yield return "התפטרות בדין מפוטר: כדאי שהסיבה תהיה מתועדת בכתב ושהמעסיק קיבל הזדמנות לתקן. ביטוח לאומי בודק את הסיבה בנפרד.";
                break;
            case ExitReason.Fired:
                yield return "לפני פיטורים חובה לערוך שימוע. הפיצויים צריכים להיות משולמים בתוך 15 יום, אחרת יש פיצויי הלנה.";
                break;
        }
    }
}

public sealed class PayTypeAdvisoryRule : IAdvisoryRule
{
    public IEnumerable<string> Advise(RuleContext ctx)
    {
        var p = ctx.Profile;
        if (p.PayType != PayType.Hourly) yield break;

        yield return "עובד בשכר שעתי: הפיצויים מחושבים לפי התעריף האחרון כפול ממוצע השעות החודשי בכל תקופת העבודה. אם השעות השתנו מאוד לאורך השנים, חשבו את הממוצע על כל התקופה ולא רק על השנה האחרונה.";
        if (p.AverageMonthlyHours > Domain.Policies.HourlyPolicy.FullTimeMonthlyHours)
            yield return $"שעות מעבר ל-{Domain.Policies.HourlyPolicy.FullTimeMonthlyHours:0} בחודש הן שעות נוספות. הן לא נכללות בשכר הקובע לפיצויים, אבל מגיע עליהן גמול של 125% ו-150%.";
    }
}
