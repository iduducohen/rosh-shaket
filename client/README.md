# יוצאים בראש שקט — לקוח

אפליקציית Ionic + Angular + Capacitor בעברית (RTL). העובד מצלם תלוש או ממלא פרטים ידנית, בוחר סיבת עזיבה, ומקבל הערכת זכויות, צ'קליסט, וקישורים למקורות רשמיים.

> הערכה בלבד, לא ייעוץ משפטי.

הלקוח לא מחשב זכויות בעצמו. כל החישוב, קריאת התלוש והתוכן מגיעים משרת ה-API (`http://localhost:5080` בפיתוח).

## דרישות

- Node.js 18.19 ומעלה
- שרת ה-API רץ מקומית (ראו את ה-README בשורש הריפו)

## הרצה

```bash
npm install
npm start
```

האפליקציה עולה ב-[http://localhost:8100](http://localhost:8100).

## סקריפטים

| פקודה | מה עושה |
| --- | --- |
| `npm start` | שרת פיתוח על פורט 8100 |
| `npm run build` | בילד production לתיקיית `www` |
| `npm run build:prod` | אותו בילד, עם קונפיגורציית production מפורשת |
| `npm run cap:sync` | בילד production ואז `npx cap sync` |
| `npm run android` | פותח את פרויקט האנדרואיד ב-Android Studio |
| `npm run ios` | פותח את פרויקט ה-iOS ב-Xcode |

## זרימת המסכים

1. **פתיחה** (`/`) — צילום תלוש (עד 5 תמונות), בחירה מהגלריה, או מילוי ידני.
2. **סיבה** (`/reason`) — פיטורים, התפטרות בדין מפוטר, התפטרות, סיום חוזה, או "עוד שוקל" (השוואה).
3. **פרטים** (`/details`) — רק אם חסרים נתונים. שדות שחולצו מהתלוש מסומנים לאישור.
4. **תוצאות** (`/results`) — שלושה טאבים: סיכום הסכומים, צ'קליסט לפי הסיבה, ומקורות רשמיים.

## כתובת השרת

מוגדרת ב-`src/environments`:

- `environment.ts` — פיתוח, ברירת מחדל `http://localhost:5080`
- `environment.prod.ts` — production. יש לעדכן את `apiBaseUrl` לפני שחרור

באמולטור אנדרואיד משתמשים ב-`http://10.0.2.2:5080`. בטלפון אמיתי, ב-IP של המחשב ברשת המקומית.

## אנדרואיד ו-iOS

פעם אחת, אחרי `npm install`:

```bash
npx cap add android
npx cap add ios
```

אחר כך:

```bash
npm run cap:sync
npm run android
```

**הרשאות מצלמה וגלריה:**

- **iOS:** ב-`ios/App/App/Info.plist` להוסיף `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription` ו-`NSPhotoLibraryAddUsageDescription`.
- **אנדרואיד:** פלאגין המצלמה מוסיף את ההרשאות בעצמו.

תמונות התלוש מקודדות מחדש ל-JPEG (עד 2000px) לפני השליחה, מה שמסיר גם נתוני EXIF כמו מיקום. התמונות לא נשמרות באפליקציה.

## מבנה

```
src/
  main.ts                      bootstrap, Ionic, HTTP, נפילת מצלמה לדפדפן
  app/app.routes.ts            ניתוב המסכים
  app/core/api.service.ts      קריאות ל-API
  app/core/wizard.store.ts     מצב הזרימה
  app/core/calculation.facade.ts  חישוב אחד או השוואה
  app/core/photo.service.ts    מצלמה וגלריה
  app/core/models.ts           חוזים שמשקפים את השרת
  app/pages/                   מסכי הזרימה
  environments/                כתובת ה-API
capacitor.config.ts            app id: il.roshshaket.app
```
