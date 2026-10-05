using RoshShaket.Domain.Content;

namespace RoshShaket.Infrastructure.Mongo;

/// <summary>
/// Built-in editorial copy matching server/db/mongo-init.js — the source of truth for the checklist and sources.
/// Used when Mongo is down or empty, and synced into Mongo on startup (see MongoContentSeed).
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
        new("har-hakesef", "הר הכסף", Kz("הר_הכסף"), "איתור חסכונות שנשכחו"),
        new("waiver", "כתב ויתור וסילוק", Kz("עובד_זכאי_לפיצויי_פיטורים_גם_אם_חתם_על_הצהרת_ויתור_זכויות"), "חתימה על ויתור לא שוללת זכויות שמגיעות לפי חוק"),
        new("tax-refund", "החזר מס לשכירים", "https://www.gov.il/he/service/itc135", "בקשה מקוונת להחזר מס הכנסה (טופס 135), עד 6 שנים אחורה")
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
        Item("termination-letter", "ביום האחרון", 8, "לקבל אישור על תקופת העסקה: מכתב עם תאריך ההתחלה, תאריך הסיום והתפקיד. המעסיק חייב לתת אותו בתוך 14 יום, והוא נדרש בביטוח לאומי ואצל מעסיקים בעתיד", ["all"]),
        Item("form161", "ביום האחרון", 9, "לוודא שהמעסיק ממלא טופס 161", ["all"], "form161"),
        Item("release-letter", "ביום האחרון", 10, "לקבל מכתב שחרור לקופות: אישור מהמעסיק להעביר על שמכם את קרן הפנסיה, ביטוח המנהלים וקרן ההשתלמות. בלי המכתב הקופה לא תשחרר את כספי הפיצויים", ["all"], "section14"),
        Item("final-payslip", "ביום האחרון", 11, "לבדוק את התלוש האחרון (גמר חשבון): שכר על כל ימי העבודה עד יום העזיבה, שעות נוספות, בונוסים שהובטחו, פדיון חופשה ודמי הבראה", ["all"], "vacation"),
        Item("waiver", "ביום האחרון", 12, "לא לחתום על כתב ויתור וסילוק לפני שבדקתם שקיבלתם הכל. אסור למעסיק להתנות את התשלום בחתימה. אם חותמים, אפשר להוסיף ליד החתימה: «חתימה זו מאשרת קבלת הסכום המצוין בלבד ואינה ויתור על זכויותיי על פי דין»", ["all"], "waiver"),
        Item("unemployment", "אחרי העזיבה", 13, "להירשם בשירות התעסוקה ולהגיש תביעה לדמי אבטלה", ["all"], "unemployment"),
        Item("severance-15-days", "אחרי העזיבה", 14, "לוודא שהפיצויים שולמו בתוך 15 יום", ["fired", "justified", "contract"], "severance"),
        Item("withdraw-or-continue", "אחרי העזיבה", 15, "להחליט: משיכת כספי הפיצויים או רציפות, ולבדוק את המס", ["all"], "form161"),
        Item("clearing-report", "אחרי העזיבה", 16, "להזמין דוח מהמסלקה ולוודא שכל ההפקדות הגיעו. ההפקדה של החודש האחרון יכולה להתעכב חודש עד חודשיים, אז כדאי לבדוק שוב עד שהיא נקלטת", ["all"], "pension-clearing"),
        Item("har-hakesef", "אחרי העזיבה", 17, "לבדוק בהר הכסף אם יש חסכונות שנשכחו", ["all"], "har-hakesef"),
        Item("tax-refund", "אחרי העזיבה", 18, "לבדוק אם מגיע החזר מס: מי שמסיים לעבוד באמצע השנה שילם לרוב יותר מס הכנסה ממה שמגיע. אפשר לבקש החזר מרשות המסים עד 6 שנים אחורה, בלי עלות", ["all"], "tax-refund"),
        Item("insurance", "אחרי העזיבה", 19, "לבדוק רציפות של ביטוח חיים ואובדן כושר עבודה שהיו דרך המעסיק", ["all"])
    ];

    private static ChecklistItem Item(string key, string group, int order, string text, string[] tags, string? sourceKey = null) =>
        new(key, group, order, text, tags, sourceKey);
}
