using RoshShaket.Domain;

namespace RoshShaket.Application.Rules;

/// <summary>Things about the final settlement that change no amount but are easy to miss.</summary>
public sealed class SettlementAdvisoryRule : IAdvisoryRule
{
    /// <summary>Mandatory pension, and with it section 14 for most employees, started in 2008.</summary>
    private static readonly DateOnly MandatoryPensionStart = new(2008, 1, 1);

    public IEnumerable<string> Advise(RuleContext ctx)
    {
        var p = ctx.Profile;

        yield return "השכר האחרון, פדיון החופשה ודמי ההבראה צריכים להיות משולמים עד ה-9 בחודש שאחרי סיום העבודה.";

        // Severance Pay Law s. 3: a dismissal just before the first year ends is presumed to be meant to avoid severance.
        if (ctx.Reason == ExitReason.Fired && p.Seniority.Years < 1m && p.Seniority.Months >= 10m)
            yield return "פיטורים סמוך לסוף שנת העבודה הראשונה: החוק מניח שהם נועדו להתחמק מתשלום פיצויים, אלא אם המעסיק מוכיח אחרת. במקרה כזה ייתכן שמגיעים פיצויים גם בלי שנה מלאה. שווה להתייעץ עם עורך דין לדיני עבודה.";

        var hasSection14 = p.Section14 is Section14Arrangement.Full or Section14Arrangement.Partial6;
        if (hasSection14 && p.Section14From is null && p.StartDate < MandatoryPensionStart)
            yield return "התחלתם לעבוד לפני 2008. אצל רוב העובדים סעיף 14 חל רק מהמועד שבו התחילו ההפקדות לפנסיה או שההסדר נכנס לחוזה. על התקופה שלפני כן מגיעה השלמה מלאה של פיצויים. אם זה המצב, הזינו בפרטים ממתי חל סעיף 14.";

        if (p.UnpaidLeaveMonths > 0m)
            yield return "חל\"ת: בחודשי חופשה ללא תשלום לא נצברים ימי חופשה ודמי הבראה. יתרת החופשה שהזנתם מהתלוש כבר אמורה לשקף את זה.";
    }
}
