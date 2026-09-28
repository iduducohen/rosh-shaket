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
        if (ctx.Profile.PayType == PayType.Hourly)
            yield return "החישוב מותאם לעובד בשכר חודשי. אצל עובד שעתי ההודעה המוקדמת, השכר היומי והפיצויים מחושבים אחרת.";
    }
}
