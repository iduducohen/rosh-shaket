# יוצאים בראש שקט

אפליקציה היברידית (Ionic + Capacitor) ושרת C# ‏.NET 8 שמחשבים לעובדים שעוזבים עבודה את הזכויות שלהם: פיצויים, הודעה מוקדמת, פדיון חופשה והבראה. האפליקציה נותנת גם צ'קליסט שמותאם לסיבת העזיבה. אפשר לצלם תלוש, והמערכת קוראת ממנו את הנתונים ומחשבת הערכה ראשונית.

> הערכה בלבד, לא ייעוץ משפטי. את הכללים והערכים השנתיים חובה לאמת מול עורך דין לדיני עבודה לפני השקה.

## מבנה

```
server/
  src/RoshShaket.Domain          ישויות, value objects, מדיניות חוקית טהורה (בלי I/O)
  src/RoshShaket.Application     כללים, מקרי שימוש, ports (ממשקים)
  src/RoshShaket.Infrastructure  Postgres, Mongo, Redis, קריאת תלושים עם Claude
  src/RoshShaket.Api             Minimal APIs, חוזים, טיפול בשגיאות, composition root
  tests/                         בדיקות יחידה לכללים
  db/mongo-init.js               תוכן התחלתי: צ'קליסט ומקורות
client/                          Ionic 8 + Angular 18 standalone + Capacitor 6
docker-compose.yml               postgres, mongo, redis, api
```

התלויות זורמות פנימה בלבד: Api → Infrastructure → Application → Domain. ה-Domain וה-Application לא מכירים אף מסד נתונים.

## SOLID בפועל

| עיקרון | איפה |
| --- | --- |
| Single Responsibility | כל כלל בקובץ משלו (`SeveranceRule`, `NoticePeriodRule`...). כל מקרה שימוש במחלקה משלו. המדיניות החוקית (`Policies.cs`) מופרדת מהניסוח. |
| Open/Closed | כדי להוסיף זכות כותבים מחלקה חדשה שמממשת את `IRightsRule`, ומוסיפים שורה אחת ב-`ApplicationModule`. `RightsCalculator` לא משתנה. |
| Liskov | ה-decorators של המטמון (`CachedAnnualValuesProvider`, `CachedContentRepository`) מחליפים את המקור בלי שהקוד שקורא להם יודע. |
| Interface Segregation | `IRightsRule` (כסף) ו-`IAdvisoryRule` (עצות) הם ממשקים נפרדים. ה-ports קטנים וממוקדים. |
| Dependency Inversion | ה-Application מגדיר ports (`IAnnualValuesProvider`, `IContentRepository`, `IPayslipExtractor`, `ICalculationLog`, `ICacheStore`), וה-Infrastructure מממש אותם. |

## למה שלושה מסדי נתונים

- **Postgres:** ערכים שנתיים (יום הבראה, תקרת פטור) עם תאריך תוקף, וסטטיסטיקה אנונימית. אלה נתונים יחסיים שצריך לשמור עליהם היסטוריה.
- **Mongo:** תוכן עריכתי, כלומר פריטי צ'קליסט ומקורות. אלה מסמכים גמישים שקל לערוך ובהמשך לתרגם לשפות נוספות.
- **Redis:** מטמון לשני הנ"ל. אם Redis לא זמין, הבקשה עוברת ישר למקור ולא נכשלת. בלי connection string לרדיס, המערכת משתמשת במטמון בזיכרון.

**פרטיות:** תמונות התלושים נשארות רק בזיכרון, לכל אורך הבקשה, ולא נשמרות ולא נרשמות בלוג. נתוני עובד לא נשמרים. סטטיסטיקה אנונימית (סיבה, שנות ותק מעוגלות, סכום מעוגל) נשמרת רק בהסכמה מפורשת (`consentToAnonymousStats`).

## הרצה

```bash
cp .env.example .env          # להכניס ANTHROPIC_API_KEY לקריאת תלושים
docker compose up --build     # API על http://localhost:5080
```

בלי Docker, אחרי שהמסדים רצים:

```bash
cd server && dotnet run --project src/RoshShaket.Api
dotnet test                   # בדיקות יחידה
```

`server/src/RoshShaket.Api/RoshShaket.Api.http` מכיל בקשות מוכנות לדוגמה.

### הלקוח

```bash
cd client
npm install
npm start                     # http://localhost:8100
```

לאנדרואיד ו-iOS:

```bash
npx cap add android && npx cap add ios   # פעם אחת
npm run cap:sync
npm run android                          # או: npm run ios
```

**הרשאות מצלמה וגלריה:**
- **iOS:** ב-`ios/App/App/Info.plist` צריך להוסיף את `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription` ו-`NSPhotoLibraryAddUsageDescription`, לדוגמה "כדי לצלם את תלוש השכר".
- **אנדרואיד:** פלאגין המצלמה מוסיף את ההרשאות בעצמו.
- **כתובת השרת:** נקבעת ב-`src/environments`. באמולטור אנדרואיד צריך להשתמש ב-`http://10.0.2.2:5080`, ובטלפון אמיתי ב-IP של המחשב ברשת.

## API

| שיטה | נתיב | מה עושה |
| --- | --- | --- |
| POST | `/api/calculations` | חישוב לסיבת עזיבה אחת |
| POST | `/api/calculations/compare` | פיטורים מול התפטרות, למי שעוד שוקל |
| POST | `/api/payslips/extract` | multipart, עד 5 תמונות, מחזיר טיוטת פרופיל לאישור. מוגבל ל-10 בקשות בדקה לכל IP |
| GET | `/api/checklist?reason=Fired` | צ'קליסט לפי נסיבות |
| GET | `/api/sources` | מקורות רשמיים |
| GET | `/health` | בדיקת חיות |

השגיאות מוחזרות כ-ProblemDetails, עם כותרות בעברית שאפשר להציג למשתמש כמו שהן, ועם `errors` לפי שדה.

## מה נבדק ומה לא

**נבדק:**
- **Domain ו-Application:** מתקמפלים בלי אזהרות.
- **בדיקות היחידה:** כל 17 הבדיקות עוברות.
- **ה-API:** הורץ ונבדק מקצה לקצה מול מימושים בזיכרון (חישוב, השוואה, ולידציה, צ'קליסט, העלאת תלוש, health).
- **קורא התלושים וה-decorators של המטמון:** מתקמפלים.
- **הלקוח:** נבנה עם `ng build` בלי שגיאות ובלי אזהרות.

**לא נבדק:**
- **המתאמים של Postgres, Mongo ו-Redis:** לא קומפלו, כי לא הייתה גישה לחבילות NuGet. צריך להריץ `dotnet build` בסביבה רגילה.

## לפני פרודקשן

- EF migrations במקום `EnsureCreated`.
- אימות הערכים השנתיים שבקובץ ה-seed (ב-`RightsDbContext`).
- עובדים שעתיים, והבראה עד שנתיים אחורה.
- 10 מקרי בוחן אמיתיים שעורך דין או חשבת שכר מאשרים.
- ניטור, ושרת HTTPS בפרודקשן.
