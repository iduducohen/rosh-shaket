<div dir="rtl" lang="he">

<h1>יוצאים בראש שקט</h1>

<p>אפליקציה היברידית (Ionic + Capacitor) ושרת C# ‏.NET 8 שמחשבים לעובדים שעוזבים עבודה את הזכויות שלהם: פיצויים, הודעה מוקדמת, פדיון חופשה והבראה. האפליקציה נותנת גם צ'קליסט שמותאם לסיבת העזיבה. אפשר לצלם תלוש, והמערכת קוראת ממנו את הנתונים ומחשבת הערכה ראשונית.</p>

<blockquote>הערכה בלבד, לא ייעוץ משפטי. את הכללים והערכים השנתיים חובה לאמת מול עורך דין לדיני עבודה לפני השקה.</blockquote>

<h2>מבנה</h2>
<pre dir="ltr"><code>server/
  src/RoshShaket.Domain          ישויות, value objects, מדיניות חוקית טהורה (בלי I/O)
  src/RoshShaket.Application     כללים, מקרי שימוש, ports (ממשקים)
  src/RoshShaket.Infrastructure  Postgres, Mongo, Redis, קריאת תלושים עם Claude
  src/RoshShaket.Api             Minimal APIs, חוזים, טיפול בשגיאות, composition root
  tests/                         בדיקות יחידה לכללים
  db/mongo-init.js               תוכן התחלתי: צ'קליסט ומקורות
client/                          Ionic 8 + Angular 18 standalone + Capacitor 6
docker-compose.yml               postgres, mongo, redis, api</code></pre>
<p>התלויות זורמות פנימה בלבד: <span dir="ltr">Api → Infrastructure → Application → Domain</span>. ה-Domain וה-Application לא מכירים אף מסד נתונים.</p>

<h2>SOLID בפועל</h2>
<table dir="rtl">
  <thead>
    <tr><th>עיקרון</th><th>איפה</th></tr>
  </thead>
  <tbody>
    <tr>
      <td dir="ltr">Single Responsibility</td>
      <td>כל כלל בקובץ משלו (<code>SeveranceRule</code>, <code>NoticePeriodRule</code>...). כל מקרה שימוש במחלקה משלו. המדיניות החוקית (<code>Policies.cs</code>) מופרדת מהניסוח.</td>
    </tr>
    <tr>
      <td dir="ltr">Open/Closed</td>
      <td>כדי להוסיף זכות כותבים מחלקה חדשה שמממשת את <code>IRightsRule</code>, ומוסיפים שורה אחת ב-<code>ApplicationModule</code>. <code>RightsCalculator</code> לא משתנה.</td>
    </tr>
    <tr>
      <td dir="ltr">Liskov</td>
      <td>ה-decorators של המטמון (<code>CachedAnnualValuesProvider</code>, <code>CachedContentRepository</code>) מחליפים את המקור בלי שהקוד שקורא להם יודע.</td>
    </tr>
    <tr>
      <td dir="ltr">Interface Segregation</td>
      <td><code>IRightsRule</code> (כסף) ו-<code>IAdvisoryRule</code> (עצות) הם ממשקים נפרדים. ה-ports קטנים וממוקדים.</td>
    </tr>
    <tr>
      <td dir="ltr">Dependency Inversion</td>
      <td>ה-Application מגדיר ports (<code>IAnnualValuesProvider</code>, <code>IContentRepository</code>, <code>IPayslipExtractor</code>, <code>ICalculationLog</code>, <code>ICacheStore</code>), וה-Infrastructure מממש אותם.</td>
    </tr>
  </tbody>
</table>

<h2>למה שלושה מסדי נתונים</h2>
<ul>
  <li><strong>Postgres:</strong> ערכים שנתיים (יום הבראה, תקרת פטור) עם תאריך תוקף, וסטטיסטיקה אנונימית. אלה נתונים יחסיים שצריך לשמור עליהם היסטוריה.</li>
  <li><strong>Mongo:</strong> תוכן עריכתי, כלומר פריטי צ'קליסט ומקורות. אלה מסמכים גמישים שקל לערוך ובהמשך לתרגם לשפות נוספות.</li>
  <li><strong>Redis:</strong> מטמון לשני הנ"ל. אם Redis לא זמין, הבקשה עוברת ישר למקור ולא נכשלת. בלי connection string לרדיס, המערכת משתמשת במטמון בזיכרון.</li>
</ul>
<p><strong>פרטיות:</strong> תמונות התלושים נשארות רק בזיכרון, לכל אורך הבקשה, ולא נשמרות ולא נרשמות בלוג. נתוני עובד לא נשמרים. סטטיסטיקה אנונימית (סיבה, שנות ותק מעוגלות, סכום מעוגל) נשמרת רק בהסכמה מפורשת (<code dir="ltr">consentToAnonymousStats</code>).</p>

<h2>הרצה</h2>
<pre dir="ltr"><code>cp .env.example .env          # להכניס ANTHROPIC_API_KEY לקריאת תלושים
docker compose up --build     # API על http://localhost:5080</code></pre>
<p>בלי Docker, אחרי שהמסדים רצים:</p>
<pre dir="ltr"><code>cd server && dotnet run --project src/RoshShaket.Api
dotnet test                   # בדיקות יחידה</code></pre>
<p><code dir="ltr">server/src/RoshShaket.Api/RoshShaket.Api.http</code> מכיל בקשות מוכנות לדוגמה.</p>

<h3>הלקוח</h3>
<pre dir="ltr"><code>cd client
npm install
npm start                     # http://localhost:8100</code></pre>
<p>לאנדרואיד ו-iOS:</p>
<pre dir="ltr"><code>npx cap add android && npx cap add ios   # פעם אחת
npm run cap:sync
npm run android                          # או: npm run ios</code></pre>
<p><strong>הרשאות מצלמה וגלריה:</strong></p>
<ul>
  <li><strong>iOS:</strong> ב-<code dir="ltr">ios/App/App/Info.plist</code> צריך להוסיף את <code dir="ltr">NSCameraUsageDescription</code>, <code dir="ltr">NSPhotoLibraryUsageDescription</code> ו-<code dir="ltr">NSPhotoLibraryAddUsageDescription</code>, לדוגמה "כדי לצלם את תלוש השכר".</li>
  <li><strong>אנדרואיד:</strong> פלאגין המצלמה מוסיף את ההרשאות בעצמו.</li>
  <li><strong>כתובת השרת:</strong> נקבעת ב-<code dir="ltr">src/environments</code>. באמולטור אנדרואיד צריך להשתמש ב-<code dir="ltr">http://10.0.2.2:5080</code>, ובטלפון אמיתי ב-IP של המחשב ברשת.</li>
</ul>

<h2>API</h2>
<table dir="rtl">
  <thead>
    <tr><th>שיטה</th><th>נתיב</th><th>מה עושה</th></tr>
  </thead>
  <tbody>
    <tr><td dir="ltr">POST</td><td dir="ltr"><code>/api/calculations</code></td><td>חישוב לסיבת עזיבה אחת</td></tr>
    <tr><td dir="ltr">POST</td><td dir="ltr"><code>/api/calculations/compare</code></td><td>פיטורים מול התפטרות, למי שעוד שוקל</td></tr>
    <tr><td dir="ltr">POST</td><td dir="ltr"><code>/api/payslips/extract</code></td><td>multipart, עד 5 תמונות, מחזיר טיוטת פרופיל לאישור. מוגבל ל-10 בקשות בדקה לכל IP</td></tr>
    <tr><td dir="ltr">GET</td><td dir="ltr"><code>/api/checklist?reason=Fired</code></td><td>צ'קליסט לפי נסיבות</td></tr>
    <tr><td dir="ltr">GET</td><td dir="ltr"><code>/api/sources</code></td><td>מקורות רשמיים</td></tr>
    <tr><td dir="ltr">GET</td><td dir="ltr"><code>/health</code></td><td>בדיקת חיות</td></tr>
  </tbody>
</table>
<p>השגיאות מוחזרות כ-ProblemDetails, עם כותרות בעברית שאפשר להציג למשתמש כמו שהן, ועם <code dir="ltr">errors</code> לפי שדה.</p>

<h2>מה נבדק ומה לא</h2>
<p><strong>נבדק:</strong></p>
<ul>
  <li><strong>Domain ו-Application:</strong> מתקמפלים בלי אזהרות.</li>
  <li><strong>בדיקות היחידה:</strong> כל 17 הבדיקות עוברות.</li>
  <li><strong>ה-API:</strong> הורץ ונבדק מקצה לקצה מול מימושים בזיכרון (חישוב, השוואה, ולידציה, צ'קליסט, העלאת תלוש, health).</li>
  <li><strong>קורא התלושים וה-decorators של המטמון:</strong> מתקמפלים.</li>
  <li><strong>הלקוח:</strong> נבנה עם <code dir="ltr">ng build</code> בלי שגיאות ובלי אזהרות.</li>
</ul>
<p><strong>לא נבדק:</strong></p>
<ul>
  <li><strong>המתאמים של Postgres, Mongo ו-Redis:</strong> לא קומפלו, כי לא הייתה גישה לחבילות NuGet. צריך להריץ <code dir="ltr">dotnet build</code> בסביבה רגילה.</li>
</ul>

<h2>לפני פרודקשן</h2>
<ul>
  <li>EF migrations במקום <code>EnsureCreated</code>.</li>
  <li>אימות הערכים השנתיים שבקובץ ה-seed (ב-<code>RightsDbContext</code>).</li>
  <li>עובדים שעתיים, והבראה עד שנתיים אחורה.</li>
  <li>10 מקרי בוחן אמיתיים שעורך דין או חשבת שכר מאשרים.</li>
  <li>ניטור, ושרת HTTPS בפרודקשן.</li>
</ul>

</div>
