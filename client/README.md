<div dir="rtl" lang="he">

<h1>יוצאים בראש שקט — לקוח</h1>

<p>אפליקציית Ionic + Angular + Capacitor בעברית. העובד מצלם תלוש או ממלא פרטים ידנית, בוחר סיבת עזיבה, ומקבל הערכת זכויות, צ'קליסט, וקישורים למקורות רשמיים.</p>

<blockquote>הערכה בלבד, לא ייעוץ משפטי.</blockquote>

<p>הלקוח לא מחשב זכויות בעצמו. כל החישוב, קריאת התלוש והתוכן מגיעים משרת ה-API (<code dir="ltr">http://localhost:5080</code> בפיתוח).</p>

<h2>דרישות</h2>
<ul>
  <li>Node.js 18.19 ומעלה</li>
  <li>שרת ה-API רץ מקומית (ראו את ה-README בשורש הריפו)</li>
</ul>

<h2>הרצה</h2>
<pre dir="ltr"><code>npm install
npm start</code></pre>
<p>האפליקציה עולה ב-<a href="http://localhost:8100">http://localhost:8100</a>.</p>

<h2>סקריפטים</h2>
<table dir="rtl">
  <thead>
    <tr><th>פקודה</th><th>מה עושה</th></tr>
  </thead>
  <tbody>
    <tr><td dir="ltr"><code>npm start</code></td><td>שרת פיתוח על פורט 8100</td></tr>
    <tr><td dir="ltr"><code>npm run build</code></td><td>בילד production לתיקיית <code>www</code></td></tr>
    <tr><td dir="ltr"><code>npm run build:prod</code></td><td>אותו בילד, עם קונפיגורציית production מפורשת</td></tr>
    <tr><td dir="ltr"><code>npm run cap:sync</code></td><td>בילד production ואז <code>npx cap sync</code></td></tr>
    <tr><td dir="ltr"><code>npm run android</code></td><td>פותח את פרויקט האנדרואיד ב-Android Studio</td></tr>
    <tr><td dir="ltr"><code>npm run ios</code></td><td>פותח את פרויקט ה-iOS ב-Xcode</td></tr>
  </tbody>
</table>

<h2>זרימת המסכים</h2>
<ol>
  <li><strong>פתיחה</strong> (<code dir="ltr">/</code>) — צילום תלוש (עד 5 תמונות), בחירה מהגלריה, או מילוי ידני.</li>
  <li><strong>סיבה</strong> (<code dir="ltr">/reason</code>) — פיטורים, התפטרות בדין מפוטר, התפטרות, סיום חוזה, או "עוד שוקל" (השוואה).</li>
  <li><strong>פרטים</strong> (<code dir="ltr">/details</code>) — רק אם חסרים נתונים. שדות שחולצו מהתלוש מסומנים לאישור.</li>
  <li><strong>תוצאות</strong> (<code dir="ltr">/results</code>) — שלושה טאבים: סיכום הסכומים, צ'קליסט לפי הסיבה, ומקורות רשמיים.</li>
</ol>

<h2>כתובת השרת</h2>
<p>מוגדרת ב-<code dir="ltr">src/environments</code>:</p>
<ul>
  <li><code dir="ltr">environment.ts</code> — פיתוח, ברירת מחדל <code dir="ltr">http://localhost:5080</code></li>
  <li><code dir="ltr">environment.prod.ts</code> — production. יש לעדכן את <code dir="ltr">apiBaseUrl</code> לפני שחרור</li>
</ul>
<p>באמולטור אנדרואיד משתמשים ב-<code dir="ltr">http://10.0.2.2:5080</code>. בטלפון אמיתי, ב-IP של המחשב ברשת המקומית.</p>

<h2>אנדרואיד ו-iOS</h2>
<p>פעם אחת, אחרי <code dir="ltr">npm install</code>:</p>
<pre dir="ltr"><code>npx cap add android
npx cap add ios</code></pre>
<p>אחר כך:</p>
<pre dir="ltr"><code>npm run cap:sync
npm run android</code></pre>
<p><strong>הרשאות מצלמה וגלריה:</strong></p>
<ul>
  <li><strong>iOS:</strong> ב-<code dir="ltr">ios/App/App/Info.plist</code> להוסיף <code dir="ltr">NSCameraUsageDescription</code>, <code dir="ltr">NSPhotoLibraryUsageDescription</code> ו-<code dir="ltr">NSPhotoLibraryAddUsageDescription</code>.</li>
  <li><strong>אנדרואיד:</strong> פלאגין המצלמה מוסיף את ההרשאות בעצמו.</li>
</ul>
<p>תמונות התלוש מקודדות מחדש ל-JPEG (עד 2000px) לפני השליחה, מה שמסיר גם נתוני EXIF כמו מיקום. התמונות לא נשמרות באפליקציה.</p>

<h2>מבנה</h2>
<pre dir="ltr"><code>src/
  main.ts                         bootstrap, Ionic, HTTP, נפילת מצלמה לדפדפן
  app/app.routes.ts               ניתוב המסכים
  app/core/api.service.ts         קריאות ל-API
  app/core/wizard.store.ts        מצב הזרימה
  app/core/calculation.facade.ts  חישוב אחד או השוואה
  app/core/photo.service.ts       מצלמה וגלריה
  app/core/models.ts              חוזים שמשקפים את השרת
  app/pages/                      מסכי הזרימה
  environments/                   כתובת ה-API
capacitor.config.ts               app id: il.roshshaket.app</code></pre>

</div>
