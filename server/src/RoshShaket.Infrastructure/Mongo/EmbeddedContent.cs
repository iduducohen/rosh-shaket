using RoshShaket.Domain.Content;

namespace RoshShaket.Infrastructure.Mongo;

/// <summary>
/// Built-in editorial copy matching server/db/mongo-init.js.
/// Used when Mongo is down or empty so checklist/sources never 500 in production.
/// </summary>
internal static class EmbeddedContent
{
    private static string Kz(string path) => "https://www.kolzchut.org.il/he/" + path;

    public static IReadOnlyList<RightsSource> Sources { get; } =
    [
        new("severance", "פיצויי פיטורים", Kz("פיצויי_פיטורים"), "מי זכאי, איך מחשבים ומתי משלמים"),
        new("section14", "סעיף 14", Kz("סעיף_14_לחוק_פיצויי_פיטורים"), "כשהפקדות לקופה מחליפות פיצויים"),
        new("notice", "הודעה מוקדמת", Kz("הודעה_מוקדמת_לפני_פיטורים"), "כמה ימים ומה קורה אם לא עובדים בתקופה"),
        new("vacation", "פדיון חופשה", Kz("פדיון_חופשה"), "תשלום על ימי חופשה שלא נוצלו"),
        new("recuperation", "דמי הבראה", Kz("דמי_הבראה"), "ימים לפי ותק, ותשלום בסיום העבודה"),
        new("unemployment", "דמי אבטלה", Kz("דמי_אבטלה"), "תנאי זכאות וימי המתנה"),
        new("resigned-justified", "התפטרות בדין מפוטר", Kz("התפטרות_בדין_מפוטר"), "מתי התפטרות מזכה בפיצויים"),
        new("hearing", "שימוע לפני פיטורים", Kz("שימוע_לפני_פיטורים"), "הזכות להשמיע טענות לפני ההחלטה"),
        new("form161", "טופס 161", Kz("טופס_161"), "הודעת המעסיק על פרישה, ומיסוי הפיצויים"),
        new("pension-clearing", "המסלקה הפנסיונית", Kz("מידע_על_החשבונות_הפנסיוניים_וקרנות_השתלמות_באמצעות_המסלקה_הפנסיונית"), "כל החסכונות הפנסיוניים במקום אחד"),
        new("har-hakesef", "הר הכסף", Kz("הר_הכסף"), "איתור חסכונות שנשכחו")
    ];

    public static IReadOnlyList<ChecklistItem> Checklist { get; } =
    [
        Item("keep-docs", "לפני העזיבה", 1, "לשמור עותקים של כל התלושים, החוזה ודוחות הנוכחות", ["all"]),
        Item("check-balances", "לפני העזיבה", 2, "לבדוק בתלוש האחרון יתרת חופשה והבראה ששולמה", ["all"], "vacation"),
        Item("hearing", "לפני העזיבה", 3, "לבקש זימון לשימוע בכתב ולהגיע עם טיעונים או מלווה", ["fired"], "hearing"),
        Item("give-notice", "לפני העזיבה", 4, "לתת הודעה מוקדמת בכתב, עם תאריך", ["resigned", "justified"], "notice"),
        Item("document-reason", "לפני העזיבה", 5, "לתעד את הסיבה ולתת למעסיק הזדמנות לתקן", ["justified"], "resigned-justified"),
        Item("section14", "לפני העזיבה", 6, "לברר אם יש סעיף 14 ובאיזה שיעור", ["all"], "section14"),
        Item("negotiate", "לפני העזיבה", 7, "לנסות לבקש יותר מהמינימום: הודעה מוקדמת בתשלום בלי עבודה, בונוס יחסי, מכתב המלצה", ["fired", "contract"]),
        Item("termination-letter", "ביום האחרון", 8, "לקבל מכתב סיום העסקה עם תאריכים וסיבת העזיבה", ["all"]),
        Item("form161", "ביום האחרון", 9, "לוודא שהמעסיק ממלא טופס 161", ["all"], "form161"),
        Item("final-payslip", "ביום האחרון", 10, "לבקש את התלוש הסופי עם פירוט גמר החשבון", ["all"]),
        Item("unemployment", "אחרי העזיבה", 11, "להירשם בשירות התעסוקה ולהגיש תביעה לדמי אבטלה", ["all"], "unemployment"),
        Item("severance-15-days", "אחרי העזיבה", 12, "לוודא שהפיצויים שולמו בתוך 15 יום", ["fired", "justified", "contract"], "severance"),
        Item("withdraw-or-continue", "אחרי העזיבה", 13, "להחליט: משיכת כספי הפיצויים או רציפות, ולבדוק את המס", ["all"], "form161"),
        Item("clearing-report", "אחרי העזיבה", 14, "להזמין דוח מהמסלקה ולוודא שכל ההפקדות הגיעו", ["all"], "pension-clearing"),
        Item("har-hakesef", "אחרי העזיבה", 15, "לבדוק בהר הכסף אם יש חסכונות שנשכחו", ["all"], "har-hakesef"),
        Item("insurance", "אחרי העזיבה", 16, "לבדוק רציפות של ביטוח חיים ואובדן כושר עבודה שהיו דרך המעסיק", ["all"])
    ];

    private static ChecklistItem Item(string key, string group, int order, string text, string[] tags, string? sourceKey = null) =>
        new(key, group, order, text, tags, sourceKey);
}
