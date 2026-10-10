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
                yield return "לפני פיטורים חובה לערוך שימוע. את הפיצויים משלמים ביום סיום העבודה. איחור של יותר מ-15 יום מזכה בהפרשי הצמדה, ומהיום ה-31 בפיצויי הלנה של 20% לחודש.";
                break;
        }
    }
}

public sealed class PayTypeAdvisoryRule : IAdvisoryRule
{
    public IEnumerable<string> Advise(RuleContext ctx)
    {
        var p = ctx.Profile;
        if (p.PayType == PayType.Global)
        {
            if (p.GlobalOvertime is > 0 and var overtime)
            {
                yield return $"שכר גלובלי: הפיצויים, פדיון החופשה וההפרשות חושבו לפי שכר היסוד ({Format.Ils(p.MonthlySalary)}), בלי רכיב השעות הנוספות הגלובליות ({Format.Ils(overtime)}). גמול שעות נוספות אינו חלק מהשכר הקובע.";
                yield return $"אם התוספת הגלובלית שולמה כל חודש בלי קשר לשעות שעבדתם בפועל, בתי הדין לעבודה רואים בה לעיתים חלק מהשכר הרגיל. במקרה כזה השכר הקובע הוא {Format.Ils(p.MonthlySalary + overtime)}, והפיצויים וההפרשות לפנסיה גבוהים יותר. שווה לבדוק עם עורך דין לדיני עבודה.";
                yield return "התוספת הגלובלית מכסה מספר שעות נוספות שנקבע בחוזה. על שעות שעבדתם מעבר לכך מגיע תשלום נוסף, ולכן כדאי לשמור את דוחות הנוכחות.";
            }
            else
            {
                yield return "שכר גלובלי בלי הפרדה: כשהתלוש והחוזה לא מפרידים בין שכר היסוד לבין התשלום על שעות נוספות, זה «שכר כולל» שחוק הגנת השכר אוסר. במקרה כזה כל השכר נחשב שכר רגיל: לפיו מחשבים את הפיצויים וההפרשות, ועל השעות הנוספות שעבדתם מגיע גמול בנוסף.";
                yield return "ודאו שהשכר שהזנתם הוא כל השכר החודשי, ושמרו את דוחות הנוכחות. שווה לבדוק את הזכאות לגמול שעות נוספות עם עורך דין לדיני עבודה.";
            }
            yield break;
        }
        if (p.PayType != PayType.Hourly) yield break;

        yield return "עובד בשכר שעתי: הפיצויים מחושבים לפי התעריף האחרון כפול ממוצע השעות החודשי בכל תקופת העבודה. אם השעות השתנו מאוד לאורך השנים, חשבו את הממוצע על כל התקופה ולא רק על השנה האחרונה.";
        if (p.AverageMonthlyHours > Domain.Policies.HourlyPolicy.FullTimeMonthlyHours)
            yield return $"שעות מעבר ל-{Domain.Policies.HourlyPolicy.FullTimeMonthlyHours:0} בחודש הן שעות נוספות. הן לא נכללות בשכר הקובע לפיצויים, אבל מגיע עליהן גמול של 125% ו-150%.";
    }
}
