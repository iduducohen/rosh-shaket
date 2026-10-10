import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { map } from 'rxjs';
import { SITE_NAME } from '../core/seo';
import { SiteFooterComponent } from '../core/site-footer.component';

/** Public explanation pages: how the service works, and who is behind it. */
interface InfoSection {
  heading: string;
  paragraphs?: string[];
  /** Numbered steps, each with a short title and one sentence. */
  steps?: Array<{ title: string; text: string }>;
  bullets?: string[];
  link?: { label: string; path: string };
}

interface InfoDoc {
  title: string;
  lead: string;
  sections: InfoSection[];
}

const HOW: InfoDoc = {
  title: 'איך זה עובד',
  lead: `${SITE_NAME} עוזר לבדוק מה מגיע לכם כשעוזבים עבודה, ואם ההפרשות לפנסיה לאורך השנים היו כמו שצריך. יש שני מסלולים, ואפשר להתחיל בכל אחד מהם.`,
  sections: [
    {
      heading: 'בדיקה מהירה: מה מגיע לי',
      paragraphs: ['כמה דקות, בלי תשלום, ואפשר גם בלי חשבון.'],
      steps: [
        { title: 'מעלים את התלוש האחרון', text: 'צילום, תמונה או PDF. המערכת קוראת ממנו את השכר, תאריך ההתחלה, יתרת החופשה וההפרשות. אפשר גם למלא ידנית.' },
        { title: 'בוחרים את סיבת העזיבה', text: 'פיטורים, התפטרות, התפטרות בדין מפוטר או סיום חוזה. אם עוד לא החלטתם, אפשר להשוות בין פיטורים להתפטרות.' },
        { title: 'מאשרים את הפרטים', text: 'רואים מה נקרא מהתלוש, מתקנים ומשלימים: שכר חודשי, גלובלי או לפי שעות, סעיף 14, חל"ת ועוד.' },
        { title: 'מקבלים הערכה מוסברת', text: 'פיצויים, הודעה מוקדמת, פדיון חופשה ודמי הבראה, עם הסבר איך כל סכום חושב, קישור למקור הרשמי, דוחות להורדה וצ\'קליסט מותאם.' }
      ]
    },
    {
      heading: 'בדיקה מלאה: האם הכול הופקד',
      paragraphs: ['בדיקה של כל תקופת ההעסקה, חודש אחרי חודש. היא בתשלום לפי מספר המסמכים שנבדקים.'],
      steps: [
        { title: 'מגדירים את תקופת ההעסקה', text: 'תאריך התחלה, תאריך סיום וסיבת הסיום.' },
        { title: 'מעלים את המסמכים', text: 'תלושי שכר, טופסי 106 ודוחות מקופות הפנסיה. כל מסמך נקרא ונבדק: האם הוא מהסוג הנכון, מאיזה חודש ושנה, ומה כתוב בו.' },
        { title: 'בודקים חודש אחרי חודש', text: 'משווים את מה שהיה צריך להיות מופרש לפי החוק למה שמופיע בתלושים ולמה שהגיע לקופות, ועוקבים אחרי יתרת ימי החופשה.' },
        { title: 'מקבלים ממצאים מוסברים', text: 'כל פער מוסבר במילים פשוטות: מה ראינו, למה זה יכול לקרות ומה כדאי לעשות. אפשר להוריד דוח ולהראות אותו למעסיק או לאיש מקצוע.' }
      ]
    },
    {
      heading: 'מה עוד תמצאו כאן',
      bullets: [
        'צ\'קליסט לסיום עבודה: מה לעשות לפני העזיבה, ביום האחרון ואחריה.',
        'הערכה אם כדאי לבדוק זכאות להחזר מס, עם הנחיות להגשה.',
        'מילון מונחים ומקורות רשמיים לכל נושא.',
        'רשימה של אנשי מקצוע ועורכי דין לדיני עבודה, עם דירוגים של משתמשים.'
      ]
    },
    {
      heading: 'מה קורה עם המסמכים',
      paragraphs: [
        'בבדיקה המהירה בלי חשבון, התלוש נקרא ולא נשמר. אצל משתמש מחובר המסמכים נשמרים בחשבון, באחסון מוצפן בישראל, כדי שאפשר יהיה לחזור לבדיקה מכל מכשיר. אפשר למחוק מסמך בכל רגע.',
        'המסמכים נקראים בעזרת בינה מלאכותית. היא משמשת לקריאת הנתונים בלבד. החישובים עצמם נעשים לפי כללים קבועים שנשענים על החוק.'
      ],
      link: { label: 'מדיניות הפרטיות', path: '/privacy' }
    },
    {
      heading: 'חשוב לדעת',
      paragraphs: [
        'התוצאה היא הערכה והמלצה בלבד. היא לא מחליפה ייעוץ משפטי, ייעוץ מס או ייעוץ פנסיוני, והיא לא מחייבת את המעסיק או את הרשויות. לפני שפועלים לפיה, כדאי לבדוק מול המקורות הרשמיים או מול איש מקצוע.'
      ],
      link: { label: 'תקנון ותנאי שימוש', path: '/terms' }
    }
  ]
};

const ABOUT: InfoDoc = {
  title: 'אודות',
  lead: `${SITE_NAME} נבנה כדי שמי שעוזב עבודה יידע מה מגיע לו, בלי להיות מומחה לדיני עבודה ובלי לשלם על בירור ראשוני.`,
  sections: [
    {
      heading: 'למה בנינו את זה',
      paragraphs: [
        'סיום עבודה הוא רגע שבו מתקבלות החלטות כספיות גדולות בזמן קצר: פיצויים, הודעה מוקדמת, פדיון חופשה, דמי הבראה, כספי הפנסיה והמס עליהם. רוב העובדים פוגשים את הנושאים האלה פעמים ספורות בחיים, והמידע מפוזר בין חוקים, תקנות, צווי הרחבה ואתרים שונים.',
        'התוצאה היא שאנשים חותמים על גמר חשבון בלי לדעת אם הוא נכון, או מגלים שנים אחר כך שחלק מההפרשות לפנסיה לא הופקדו.'
      ]
    },
    {
      heading: 'מה אנחנו מאמינים',
      bullets: [
        'כל עובד זכאי לדעת מה מגיע לו, בשפה שהוא מבין.',
        'מספר בלי הסבר לא שווה הרבה. לכן כל סכום מוצג עם הדרך שבה חושב ועם קישור למקור הרשמי.',
        'עדיף לומר "לא בטוח, כדאי לבדוק" מאשר להציג מספר מדויק לכאורה שנשען על ניחוש.'
      ]
    },
    {
      heading: 'איך המערכת בנויה',
      paragraphs: [
        'החישובים נעשים לפי כללים קבועים שנשענים על חוק פיצויי פיטורים, חוק הודעה מוקדמת, חוק חופשה שנתית, צו ההרחבה לפנסיה חובה וצו ההרחבה לדמי הבראה. סכומים שמתעדכנים מדי שנה, כמו ערך יום הבראה ותקרת הפטור ממס על פיצויים, נשמרים עם תאריך התחולה שלהם.',
        'בינה מלאכותית משמשת לקריאת המסמכים בלבד: היא מזהה את סוג המסמך ואת הנתונים שבו. היא לא קובעת מה מגיע לכם.'
      ],
      link: { label: 'איך זה עובד, שלב אחרי שלב', path: '/how-it-works' }
    },
    {
      heading: 'מה אנחנו לא',
      paragraphs: [
        'אנחנו לא משרד עורכי דין, לא יועצי מס ולא יועצים פנסיוניים. מה שמוצג כאן הוא הערכה והמלצה בלבד, והוא לא מכסה את כל המקרים: חוזה אישי, הסכם קיבוצי או נסיבות מיוחדות יכולים לשנות את התמונה.',
        'כשצריך בדיקה מעמיקה או ייצוג, אפשר לפנות מכאן לאנשי מקצוע ולעורכי דין עצמאיים. ההתקשרות איתם היא ישירה, ולא דרכנו.'
      ],
      link: { label: 'אנשי מקצוע', path: '/help/professionals' }
    },
    {
      heading: 'המחיר',
      paragraphs: [
        'הבדיקה המהירה בלי תשלום. הבדיקה המלאה בתשלום לפי מספר המסמכים שנבדקים, כי קריאה של כל מסמך עולה כסף. המחיר מוצג לפני הרכישה.'
      ],
      link: { label: 'מחירון', path: '/pricing' }
    },
    {
      heading: 'פרטיות',
      paragraphs: [
        'תלוש שכר הוא מסמך אישי. אנחנו אוספים רק את מה שנדרש לחישוב, לא מוכרים מידע ולא משתמשים בו לפרסום. המסמכים של משתמש מחובר נשמרים מוצפנים, ואפשר למחוק אותם.'
      ],
      link: { label: 'מדיניות הפרטיות', path: '/privacy' }
    },
    {
      heading: 'ממשיכים לשפר',
      paragraphs: [
        'החוק והסכומים מתעדכנים, ואנחנו מעדכנים איתם. אם מצאתם טעות, מקרה שלא מכוסה או הסבר לא ברור, נשמח לשמוע: בסוף כל חישוב אפשר לדרג ולכתוב לנו.'
      ]
    }
  ]
};

@Component({
  selector: 'app-info',
  standalone: true,
  imports: [IonContent, RouterLink, SiteFooterComponent],
  styles: [`
    article { max-width: 760px; margin: 0 auto; padding-bottom: 24px; }
    h1 { font-family: var(--rs-serif); font-size: 36px; margin: 8px 0 8px; }
    .lead { font-size: 17px; line-height: 1.6; color: var(--ion-color-medium-shade, #5E6F73); margin: 0 0 8px; }
    h2 { font-size: 21px; margin: 30px 0 8px; }
    p { line-height: 1.7; margin: 0 0 10px; }
    .back { font-weight: 700; }
    ol.steps { list-style: none; counter-reset: step; margin: 12px 0 0; padding: 0; display: grid; gap: 10px; }
    ol.steps li {
      counter-increment: step; display: grid; grid-template-columns: 36px 1fr; gap: 0 12px; align-content: start;
      padding: 14px 16px; border: 1px solid var(--rs-line); border-radius: 14px; background: var(--ion-item-background);
    }
    ol.steps li::before {
      content: counter(step); grid-row: span 2; width: 30px; height: 30px; border-radius: 50%;
      display: grid; place-items: center; font-weight: 800; font-size: 15px;
      background: var(--ion-color-primary); color: var(--ion-color-primary-contrast, #fff);
    }
    ol.steps b { line-height: 1.35; }
    ol.steps span { font-size: 15px; color: var(--ion-color-medium-shade, #5E6F73); line-height: 1.55; }
    ul.points { margin: 0 0 10px; padding-inline-start: 20px; display: grid; gap: 6px; line-height: 1.6; }
    .more { display: inline-block; font-weight: 700; margin-top: 2px; }
    .cta {
      margin: 34px 0 0; padding: 18px 20px; border-radius: 16px; background: var(--rs-soft);
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px;
    }
    .cta b { font-size: 17px; }
    .cta a {
      padding: 10px 18px; border-radius: 10px; font-weight: 800; text-decoration: none;
      background: var(--ion-color-primary); color: var(--ion-color-primary-contrast, #fff);
    }
    @media (min-width: 720px) { ol.steps.two { grid-template-columns: 1fr 1fr; } }
  `],
  template: `
    <ion-content>
      <article class="ion-padding">
        <a class="back" routerLink="/">לדף הבית</a>
        <h1>{{ doc().title }}</h1>
        <p class="lead">{{ doc().lead }}</p>
        @for (section of doc().sections; track section.heading) {
          <h2>{{ section.heading }}</h2>
          @for (paragraph of section.paragraphs ?? []; track $index) { <p>{{ paragraph }}</p> }
          @if (section.steps; as steps) {
            <ol class="steps two">
              @for (s of steps; track s.title) { <li><b>{{ s.title }}</b><span>{{ s.text }}</span></li> }
            </ol>
          }
          @if (section.bullets; as bullets) {
            <ul class="points">@for (b of bullets; track b) { <li>{{ b }}</li> }</ul>
          }
          @if (section.link; as link) { <a class="more" [routerLink]="link.path">{{ link.label }}</a> }
        }
        <div class="cta">
          <b>רוצים לבדוק מה מגיע לכם?</b>
          <a routerLink="/start">להתחיל בבדיקה</a>
        </div>
      </article>
      <app-site-footer></app-site-footer>
    </ion-content>
  `
})
export class InfoPage {
  private readonly route = inject(ActivatedRoute);
  private readonly kind = toSignal(this.route.data.pipe(map(data => data['doc'] as string)), { initialValue: 'how' });
  readonly doc = computed(() => (this.kind() === 'about' ? ABOUT : HOW));
}
