// Seed for editorial content. Runs once, when the Mongo volume is created.
db = db.getSiblingDB('rosh_shaket');

db.sources.createIndex({ key: 1 }, { unique: true });
db.checklist_items.createIndex({ key: 1 }, { unique: true });

const kz = p => 'https://www.kolzchut.org.il/he/' + p;

db.sources.insertMany([
  { key: 'severance', order: 1, title: 'פיצויי פיטורים', url: kz('פיצויי_פיטורים'), description: 'מי זכאי, איך מחשבים ומתי משלמים' },
  { key: 'section14', order: 2, title: 'סעיף 14', url: kz('סעיף_14_לחוק_פיצויי_פיטורים'), description: 'כשהפקדות לקופה מחליפות פיצויים' },
  { key: 'notice', order: 3, title: 'הודעה מוקדמת', url: kz('הודעה_מוקדמת_לפני_פיטורים'), description: 'כמה ימים ומה קורה אם לא עובדים בתקופה' },
  { key: 'vacation', order: 4, title: 'פדיון חופשה', url: kz('פדיון_חופשה'), description: 'תשלום על ימי חופשה שלא נוצלו' },
  { key: 'recuperation', order: 5, title: 'דמי הבראה', url: kz('דמי_הבראה'), description: 'ימים לפי ותק, ותשלום בסיום העבודה' },
  { key: 'unemployment', order: 6, title: 'דמי אבטלה', url: kz('דמי_אבטלה'), description: 'תנאי זכאות וימי המתנה' },
  { key: 'resigned-justified', order: 7, title: 'התפטרות בדין מפוטר', url: kz('התפטרות_בדין_מפוטר'), description: 'מתי התפטרות מזכה בפיצויים' },
  { key: 'hearing', order: 8, title: 'שימוע לפני פיטורים', url: kz('שימוע_לפני_פיטורים'), description: 'הזכות להשמיע טענות לפני ההחלטה' },
  { key: 'form161', order: 9, title: 'טופס 161', url: kz('טופס_161'), description: 'הודעת המעסיק על פרישה, ומיסוי הפיצויים' },
  { key: 'pension-clearing', order: 10, title: 'המסלקה הפנסיונית', url: kz('מידע_על_החשבונות_הפנסיוניים_וקרנות_השתלמות_באמצעות_המסלקה_הפנסיונית'), description: 'כל החסכונות הפנסיוניים במקום אחד' },
  { key: 'har-hakesef', order: 11, title: 'הר הכסף', url: kz('הר_הכסף'), description: 'איתור חסכונות שנשכחו' },
  { key: 'waiver', order: 12, title: 'כתב ויתור וסילוק', url: kz('עובד_זכאי_לפיצויי_פיטורים_גם_אם_חתם_על_הצהרת_ויתור_זכויות'), description: 'חתימה על ויתור לא שוללת זכויות שמגיעות לפי חוק' },
  { key: 'tax-refund', order: 13, title: 'החזר מס לשכירים', url: 'https://www.gov.il/he/service/itc135', description: 'בקשה מקוונת להחזר מס הכנסה (טופס 135), עד 6 שנים אחורה' }
]);

let o = 0;
const item = (key, group, text, tags, sourceKey) => ({ key, group, order: ++o, text, tags, sourceKey: sourceKey || null });

db.checklist_items.insertMany([
  item('keep-docs', 'לפני העזיבה', 'לשמור עותקים של כל התלושים, החוזה ודוחות הנוכחות', ['all']),
  item('check-balances', 'לפני העזיבה', 'לבדוק בתלוש האחרון יתרת חופשה והבראה ששולמה', ['all'], 'vacation'),
  item('hearing', 'לפני העזיבה', 'לבקש זימון לשימוע בכתב ולהגיע עם טיעונים או מלווה', ['fired'], 'hearing'),
  item('give-notice', 'לפני העזיבה', 'לתת הודעה מוקדמת בכתב, עם תאריך', ['resigned', 'justified'], 'notice'),
  item('document-reason', 'לפני העזיבה', 'לתעד את הסיבה ולתת למעסיק הזדמנות לתקן', ['justified'], 'resigned-justified'),
  item('section14', 'לפני העזיבה', 'לברר אם יש סעיף 14 ובאיזה שיעור', ['all'], 'section14'),
  item('negotiate', 'לפני העזיבה', 'לנסות לבקש יותר מהמינימום: הודעה מוקדמת בתשלום בלי עבודה, בונוס יחסי, מכתב המלצה', ['fired', 'contract']),
  item('termination-letter', 'ביום האחרון', 'לקבל אישור על תקופת העסקה: מכתב עם תאריך ההתחלה, תאריך הסיום והתפקיד. המעסיק חייב לתת אותו בתוך 14 יום, והוא נדרש בביטוח לאומי ואצל מעסיקים בעתיד', ['all']),
  item('form161', 'ביום האחרון', 'לוודא שהמעסיק ממלא טופס 161', ['all'], 'form161'),
  item('release-letter', 'ביום האחרון', 'לקבל מכתב שחרור לקופות: אישור מהמעסיק להעביר על שמכם את קרן הפנסיה, ביטוח המנהלים וקרן ההשתלמות. בלי המכתב הקופה לא תשחרר את כספי הפיצויים', ['all'], 'section14'),
  item('final-payslip', 'ביום האחרון', 'לבדוק את התלוש האחרון (גמר חשבון): שכר על כל ימי העבודה עד יום העזיבה, שעות נוספות, בונוסים שהובטחו, פדיון חופשה ודמי הבראה', ['all'], 'vacation'),
  item('waiver', 'ביום האחרון', 'לא לחתום על כתב ויתור וסילוק לפני שבדקתם שקיבלתם הכל. אסור למעסיק להתנות את התשלום בחתימה. אם חותמים, אפשר להוסיף ליד החתימה: «חתימה זו מאשרת קבלת הסכום המצוין בלבד ואינה ויתור על זכויותיי על פי דין»', ['all'], 'waiver'),
  item('unemployment', 'אחרי העזיבה', 'להירשם בשירות התעסוקה ולהגיש תביעה לדמי אבטלה', ['all'], 'unemployment'),
  item('severance-15-days', 'אחרי העזיבה', 'לוודא שהפיצויים שולמו בתוך 15 יום', ['fired', 'justified', 'contract'], 'severance'),
  item('withdraw-or-continue', 'אחרי העזיבה', 'להחליט: משיכת כספי הפיצויים או רציפות, ולבדוק את המס', ['all'], 'form161'),
  item('clearing-report', 'אחרי העזיבה', 'להזמין דוח מהמסלקה ולוודא שכל ההפקדות הגיעו. ההפקדה של החודש האחרון יכולה להתעכב חודש עד חודשיים, אז כדאי לבדוק שוב עד שהיא נקלטת', ['all'], 'pension-clearing'),
  item('har-hakesef', 'אחרי העזיבה', 'לבדוק בהר הכסף אם יש חסכונות שנשכחו', ['all'], 'har-hakesef'),
  item('tax-refund', 'אחרי העזיבה', 'לבדוק אם מגיע החזר מס: מי שמסיים לעבוד באמצע השנה שילם לרוב יותר מס הכנסה ממה שמגיע. אפשר לבקש החזר מרשות המסים עד 6 שנים אחורה, בלי עלות', ['all'], 'tax-refund'),
  item('insurance', 'אחרי העזיבה', 'לבדוק רציפות של ביטוח חיים ואובדן כושר עבודה שהיו דרך המעסיק', ['all'])
]);
