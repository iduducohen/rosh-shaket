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

**פרטיות:** בקריאת OCR תמונות התלושים נשארות בזיכרון למשך הבקשה. אורחים: לא נשמרים אחרי החילוץ. משתמשים מחוברים: מסמכי workspace עשויים להישמר באחסון מקומי מאובטח. לוגים לא כוללים מספרי חשבון. סטטיסטיקה אנונימית נשמרת רק בהסכמה.

**מסלולים:** הערכה מהירה (`/start`→`/results`) נשארת; בדיקת תקופת העסקה (`/review/*`) בונה Timeline חודשי, Expected/Reported/Actual, Health Score, סימולציית צבירה ודוח מסכם. כללי הפקדה ב-`ContributionRules` (תצורתיים לפי תאריך), מנועי Reconciliation/Simulation דטרמיניסטיים — AI רק לחילוץ.

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
npm start                     # http://localhost:5051
```

לאנדרואיד ו-iOS:

```bash
npx cap add android && npx cap add ios   # פעם אחת
npm run cap:sync
npm run android                          # או: npm run ios
```

**הרשאות מצלמה וגלריה:**
- **iOS:** ב-`ios/App/App/Info.plist` צריך להוסיף את `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription` ו-`NSPhotoLibraryAddUsageDescription`, לדוגמה "כדי לצלם את תלוש השכר".
- **אנדרואיד:** הרשאות הגלריה נוספות אוטומטית ב-`npm run cap:sync` (הסקריפט `scripts/native-setup.mjs`).
- **כתובת השרת:** נקבעת ב-`src/environments`. באמולטור אנדרואיד צריך להשתמש ב-`http://10.0.2.2:5080`, ובטלפון אמיתי ב-IP של המחשב ברשת.

## התחברות

אפשר להיכנס עם Google, עם Apple, עם Microsoft, או עם קוד חד-פעמי במייל, בלי סיסמה. חשבון לא חובה: "להמשיך בלי חשבון" פותח את כל המחשבון, והחשבון רק שומר תוצאות.

**איך זה עובד:**
- **בדפדפן:** הלקוח פותח את החלון של הספק, מקבל ממנו ID token (בגוגל: authorization code), ושולח אותו ל-`/api/auth/external`.
- **בשרת:** השרת מאמת את החתימה מול המפתחות הציבוריים של הספק (RS256), ובודק issuer, audience ותוקף. זה ממומש בקריפטוגרפיה של ה-framework, בלי ספריות צד שלישי.
- **משתמשים:** השרת יוצר או מאתר את המשתמש ב-Postgres (הטבלאות `users` ו-`user_identities`). קישור לחשבון קיים לפי מייל קורה רק כשהספק אישר את המייל. מיקרוסופט לעולם לא מקשרת לפי מייל.
- **טוקנים:** השרת מנפיק bearer token לשעה ו-refresh token ל-30 יום. הלקוח מרענן אותם אוטומטית כשמתקבל 401.
- **קוד במייל:** נשמר ב-Redis כ-hash, תקף ל-10 דקות, מוגבל ל-5 ניסיונות, וחד-פעמי. בלי SMTP מוגדר, הקוד נכתב ללוג של ה-API. זה מיועד לפיתוח.

**הגדרת הספקים:** ממלאים את הערכים ב-`.env`. ספק שהערך שלו ריק מציג הודעה ידידותית, ומייל תמיד עובד.

| ספק | מה צריך | הערך ב-`.env` |
| --- | --- | --- |
| Google | ב-Google Cloud Console יוצרים OAuth Client מסוג Web application. ב-Authorized JavaScript origins מוסיפים את כתובת הלקוח, למשל `http://localhost:5051` ואת כתובת ה-Vercel. | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Apple | ב-Apple Developer יוצרים Services ID עם Sign in with Apple. מגדירים domain, ו-Return URL שהוא `https://<domain>/login`. Apple דורשת HTTPS, כך שב-localhost זה לא יעבוד. | `APPLE_SERVICES_ID` |
| Microsoft | ב-Azure (Entra ID) יוצרים App registration, בוחרים Supported accounts: Personal + work, ומוסיפים פלטפורמת SPA עם Redirect URI שהוא `<client>/login`. | `MICROSOFT_CLIENT_ID` |
| מייל | שרת SMTP, למשל SendGrid, Mailgun או Amazon SES. | `SMTP_*` |

**באפליקציות:** ההתחברות נייטיב, דרך `@capgo/capacitor-social-login` (Google ו-Apple) ו-`@recognizebv/capacitor-plugin-msauth` (Microsoft). הם מחזירים ID token לאותו endpoint. באייפון Google מנפיק טוקן עם ה-iOS client id, ולכן השרת מקבל גם את `GOOGLE_IOS_CLIENT_ID`. ההגדרה המלאה נמצאת ב-`client/README.md`.

**שדרוג מגרסה קודמת:** הוספו טבלאות חדשות, ו-`EnsureCreated` לא מוסיף טבלאות למסד שכבר קיים. לכן בפיתוח צריך להריץ פעם אחת `docker compose down -v`. לפרודקשן עוברים ל-EF migrations.

## API

| שיטה | נתיב | מה עושה |
| --- | --- | --- |
| POST | `/api/calculations` | חישוב לסיבת עזיבה אחת |
| POST | `/api/calculations/compare` | פיטורים מול התפטרות, למי שעוד שוקל |
| POST | `/api/payslips/extract` | multipart, עד 5 תמונות, מחזיר טיוטת פרופיל לאישור. מוגבל ל-10 בקשות בדקה לכל IP |
| GET | `/api/checklist?reason=Fired` | צ'קליסט לפי נסיבות |
| GET | `/api/sources` | מקורות רשמיים |
| GET | `/api/auth/providers` | אילו ספקים מופעלים, ו-client ids ציבוריים |
| POST | `/api/auth/external` | `{provider, idToken?, code?, name?}` → טוקנים |
| POST | `/api/auth/email/start` | שולח קוד למייל |
| POST | `/api/auth/email/verify` | `{email, code}` → טוקנים |
| POST | `/api/auth/refresh` | `{refreshToken}` → טוקנים חדשים |
| GET | `/api/auth/me` | המשתמש המחובר (דורש טוקן) |
| GET | `/health` | בדיקת חיות |

השגיאות מוחזרות כ-ProblemDetails, עם כותרות בעברית שאפשר להציג למשתמש כמו שהן, ועם `errors` לפי שדה.

## מה נבדק ומה לא

**נבדק:**
- **Domain ו-Application:** מתקמפלים בלי אזהרות.
- **בדיקות היחידה:** כל 21 הבדיקות עוברות, כולל קוד המייל (תוקף, ניסיונות, שימוש חוזר).
- **אימות טוקנים:** 12 תרחישים, כולל חתימה מזויפת, `alg: none`, payload ששונה, audience ו-issuer שגויים, טוקן שפג תוקפו, ו-kid לא מוכר.
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
