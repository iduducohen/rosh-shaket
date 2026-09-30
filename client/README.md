# יוצאים בראש שקט — לקוח

אפליקציית Ionic + Angular + Capacitor בעברית. העובד מתחבר (או ממשיך בלי חשבון), מצלם תלוש או ממלא פרטים ידנית, בוחר סיבת עזיבה, ומקבל הערכת זכויות, צ'קליסט, וקישורים למקורות רשמיים.

> הערכה בלבד, לא ייעוץ משפטי.

הלקוח לא מחשב זכויות בעצמו. כל החישוב, קריאת התלוש, ההתחברות והתוכן מגיעים משרת ה-API (`http://localhost:5080` בפיתוח).

## דרישות

- Node.js 18.19 ומעלה
- שרת ה-API רץ מקומית (ראו את ה-README בשורש הריפו)
- לאפליקציות: Android Studio, ו-Xcode עם CocoaPods (ל-iOS, על Mac בלבד)

## הרצה

```bash
npm install
npm start
```

האפליקציה עולה ב-[http://localhost:5051](http://localhost:5051). `npm start` משחרר קודם את פורט 5051 אם שרת ישן עדיין תופס אותו.

## סקריפטים

| פקודה | מה עושה |
| --- | --- |
| `npm start` | שרת פיתוח על פורט 5051 |
| `npm run build` | בילד production לתיקיית `www` |
| `npm test` | בדיקות יחידה (Karma) עם כיסוי קוד |
| `npm run test:ci` | אותן בדיקות ב-Chrome headless, לשרת CI או לקונטיינר |
| `npm run e2e` | בדיקות Cypress מקצה לקצה (צריך את הלקוח ואת ה-API רצים) |
| `npm run cap:sync` | בילד production, `npx cap sync`, ואז הגדרת הפרויקטים הנייטיב |
| `npm run native:setup` | רק הגדרת הפרויקטים הנייטיב (הרשאות, התחברות). בטוח להריץ שוב ושוב |
| `npm run android` / `npm run ios` | פותח ב-Android Studio / Xcode |

## זרימת המסכים

1. **כניסה** (`/login`): Google, Apple, Microsoft, קוד חד-פעמי במייל, או "להמשיך בלי חשבון". בצד השני של המסך רצה אנימציה שמראה איך ערימת מסמכים הופכת לתשובה אחת.
2. **פתיחה** (`/start`): צילום תלוש (עד 5 תמונות), בחירה מהגלריה, או מילוי ידני.
3. **סיבה** (`/reason`): פיטורים, התפטרות בדין מפוטר, התפטרות, סיום חוזה, או "עוד שוקל" (השוואה).
4. **פרטים** (`/details`): רק אם חסרים נתונים. שדות שחולצו מהתלוש מסומנים לאישור.
5. **תוצאות** (`/results`): סיכום הסכומים, צ'קליסט לפי הסיבה, ומקורות רשמיים.

כל המסכים אחרי הכניסה פתוחים גם למי שבחר להמשיך בלי חשבון.

## התחברות

| ספק | דפדפן | אנדרואיד | iOS |
| --- | --- | --- | --- |
| Google | חלון Google | בוחר החשבונות של המערכת | GoogleSignIn (צריך `googleIosClientId`) |
| Apple | Sign in with Apple JS | לא מוצג | התחברות המערכת (Face ID) |
| Microsoft | MSAL popup | MSAL (צריך `microsoftAndroidKeyHash`) | MSAL |
| מייל | קוד בן 6 ספרות, בכל הפלטפורמות | קוד בן 6 ספרות, בכל הפלטפורמות | קוד בן 6 ספרות, בכל הפלטפורמות |

כפתור מוצג רק כשיש לו תהליך שעובד בפלטפורמה. המזהים הציבוריים מגיעים מהשרת (`/api/auth/providers`). סודות נשארים בשרת. ספק שלא מולא מציג הודעה, והכניסה באימייל נשארת זמינה.

ההגדרה ב-`server/src/RoshShaket.Api/appsettings.json`, במפתח `Auth`. אפשר גם משתני סביבה באותם שמות, עם `__` במקום `:`.

| מפתח | מה שמים |
| --- | --- |
| `RedirectOrigin` | כתובת הדפדפן בלי סלאש בסוף, למשל `http://127.0.0.1:5051`. Apple ו-Microsoft חוזרים אל `{RedirectOrigin}/login`. |
| `Google:ClientId` | OAuth client מסוג Web. |
| `Google:ClientSecret` | הסוד של אותו client. בלי שניהם Google לא נדלק. |
| `Google:IosClientId` | OAuth client מסוג iOS, Bundle ID `il.roshshaket.app`. אותו ערך ב-`src/environments/native-auth.json` בשדה `googleIosClientId`. |
| `Apple:ClientId` | Services ID של האתר. |
| `Apple:BundleId` | ברירת מחדל `il.roshshaket.app`. זה קהל היעד של הטוקן ב-iOS. |
| `Microsoft:ClientId` | Application (client) ID מ-Azure. |
| `Microsoft:TenantId` | `common` לכל חשבון, או מזהה דייר אחד. |

אצל Google רושמים JavaScript origin שהוא `RedirectOrigin`, והזרימה בדפדפן משתמשת ב-`postmessage`. אצל Apple רושמים Return URL `{RedirectOrigin}/login`. אצל Microsoft רושמים SPA redirect `{RedirectOrigin}/login`.

באנדרואיד, Google מחזיר טוקן שמיועד ל-web client id, ולכן צריך גם client מסוג Android ב-Google Cloud, עם ה-SHA-1 של מפתח החתימה. `microsoftAndroidKeyHash` ב-`native-auth.json` הוא ה-hash של אותו מפתח: `keytool -exportcert -alias androiddebugkey -keystore ~/.android/debug.keystore | openssl sha1 -binary | openssl base64`. ב-Azure מוסיפים פלטפורמת Android עם package `il.roshshaket.app` ואותו hash, ופלטפורמת iOS עם Bundle ID `il.roshshaket.app`.

## כתובת השרת

מוגדרת ב-`src/environments`:

- `environment.ts`: פיתוח, ברירת מחדל `http://localhost:5080`
- `environment.prod.ts`: production. יש לעדכן את `apiBaseUrl` לפני שחרור

באמולטור אנדרואיד משתמשים ב-`http://10.0.2.2:5080`. בטלפון אמיתי, ב-IP של המחשב ברשת המקומית.

## אנדרואיד ו-iOS

פעם אחת, אחרי `npm install`:

```bash
npx cap add android
npx cap add ios
npm run cap:sync
```

`cap:sync` מריץ בסוף את `scripts/native-setup.mjs`, שמגדיר אוטומטית:

- **iOS:** הרשאות מצלמה וגלריה ב-`Info.plist`, URL schemes ל-Microsoft ול-Google, קובץ entitlements ל-Sign in with Apple שמחובר לפרויקט, וטיפול בחזרה מ-Microsoft ב-`AppDelegate.swift`.
- **אנדרואיד:** הרשאות גלריה ב-`AndroidManifest.xml`, ה-activity של MSAL, וה-repository של MSAL ב-`build.gradle`.

לפיתוח מול שרת http מקומי באנדרואיד מריצים `npm run native:setup -- --allow-http`. לא להשתמש בזה בבילד לחנות.

ב-Xcode צריך לבחור Team תחת Signing & Capabilities. Sign in with Apple כבר מופעל דרך קובץ ה-entitlements. אחר כך מריצים `cd ios/App && pod install`, אם `cap sync` לא עשה זאת.

תמונות התלוש מקודדות מחדש ל-JPEG (עד 2000px) לפני השליחה, מה שמסיר גם נתוני EXIF כמו מיקום. התמונות לא נשמרות באפליקציה.

## Docker

```bash
docker build -t rosh-shaket-client .
docker run -p 5051:5051 rosh-shaket-client
```

## מבנה

```text
src/
  main.ts                                bootstrap, Ionic, HTTP + interceptor, מצלמה בדפדפן, Vercel Analytics (web בלבד)
  app/app.routes.ts                      ניתוב + guards
  app/core/auth/                         התחברות: service, interceptor, guards
  app/core/auth/social/                  תהליך לכל ספק ופלטפורמה (web popup / native SDK)
  app/core/logo.component.ts             הלוגו
  app/core/api.service.ts                קריאות ל-API
  app/core/wizard.store.ts               מצב הזרימה
  app/core/calculation.facade.ts         חישוב אחד או השוואה
  app/core/photo.service.ts              מצלמה וגלריה
  app/pages/                             מסכי הזרימה (login.page.* = מסך הכניסה והאנימציה)
  environments/                          כתובת ה-API + native-auth.json
scripts/native-setup.mjs                 הגדרת הפרויקטים הנייטיב (idempotent)
scripts/free-port.js                     שחרור פורט לפני npm start
cypress/                                 בדיקות e2e
capacitor.config.ts                      app id: il.roshshaket.app
```
