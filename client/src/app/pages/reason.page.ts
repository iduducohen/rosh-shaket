import { Component, HostListener, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';
import { DeskHeaderComponent } from '../core/desk-header.component';
import { ExitChoice } from '../core/models';
import { WizardStore } from '../core/wizard.store';

interface InfoSection { title: string; paragraphs: string[]; }
interface Option {
  value: ExitChoice;
  label: string;
  hint: string;
  sections: InfoSection[];
  link?: { href: string; label: string };
}

@Component({
  selector: 'app-reason',
  standalone: true,
  imports: [DeskHeaderComponent, IonHeader, IonToolbar, IonButtons, IonBackButton, IonContent, IonButton, IonIcon],
  styles: [`
    .reason-lead { color: var(--ion-color-primary); font-weight: 700; margin: 0 0 14px; }
    .option {
      background: var(--ion-item-background, var(--ion-background-color)); color: var(--ion-text-color);
      border: 1.5px solid var(--rs-line); border-radius: 14px; padding: 14px 16px 10px; margin: 0 0 10px;
    }
    .option.selected { border-color: var(--ion-color-primary); background: var(--rs-soft); }
    .pick {
      display: block; width: 100%; text-align: start; font: inherit; color: inherit;
      background: none; border: 0; padding: 0; cursor: pointer;
    }
    .pick b { display: block; font-weight: 700; }
    .pick span { display: block; color: var(--ion-color-medium); font-size: 14px; margin-top: 4px; }
    .more {
      background: none; border: 0; padding: 8px 0 2px; cursor: pointer;
      color: var(--ion-color-primary); font: inherit; font-weight: 700; font-size: 14.5px;
      text-decoration: underline; text-underline-offset: 3px;
    }
    @media (min-width: 992px) {
      .option:hover { border-color: var(--ion-color-primary); }
    }
    .sheet-backdrop {
      position: fixed; inset: 0; z-index: 20; background: rgba(11, 31, 38, .48);
      display: flex; align-items: flex-end; justify-content: center; padding: 12px;
    }
    .sheet {
      width: min(560px, 100%); max-height: min(85vh, 720px); overflow: auto;
      background: var(--ion-background-color); color: var(--ion-text-color);
      border-radius: 18px; padding: 16px 18px calc(16px + env(safe-area-inset-bottom, 0px));
      box-shadow: 0 18px 50px rgba(0, 0, 0, .28);
    }
    .sheet-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .sheet-head h2 { margin: 0; font-size: 22px; }
    .sheet-close {
      background: none; border: 0; color: var(--ion-color-medium); cursor: pointer;
      width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; flex: none;
    }
    .sheet-close ion-icon { font-size: 24px; }
    .term { margin-top: 18px; }
    .term h3 {
      margin: 0 0 8px; padding-bottom: 4px;
      font-family: var(--ion-font-family); font-size: 14px; font-weight: 700;
      color: var(--ion-color-primary); letter-spacing: .01em;
      border-bottom: 1px solid var(--rs-soft);
    }
    .term p { margin: 0 0 8px; }
    .sheet a { font-weight: 700; }
    .sheet-note { margin: 18px 0 0; }
    @media (min-width: 992px) {
      .sheet-backdrop { align-items: center; }
    }
  `],
  template: `
    <ion-header class="ion-no-border mobile-only"><ion-toolbar><ion-buttons slot="start"><ion-back-button defaultHref="/" text="חזרה"></ion-back-button></ion-buttons></ion-toolbar></ion-header>
    <ion-content>
      <app-desk-header [step]="2"></app-desk-header>
      <div class="page narrow ion-padding">
        @if (store.fromPayslip()) {
          <p class="small" style="color: var(--ion-color-primary)">זיהינו {{ store.filledFields().length }} נתונים מהתלוש. נשארה שאלה אחת.</p>
        }
        <h2>למה אתם עוזבים?</h2>
        <p class="reason-lead">הסיבה קובעת כמעט את כל הזכויות.</p>
        <div class="desk-grid-2">
        @for (o of options; track o.value) {
          <div class="option" [class.selected]="store.choice() === o.value">
            <button type="button" class="pick" [attr.aria-pressed]="store.choice() === o.value" (click)="store.choice.set(o.value)">
              <b>{{ o.label }}</b>
              <span>{{ o.hint }}</span>
            </button>
            <button type="button" class="more" (click)="info.set(o)">מידע נוסף</button>
          </div>
        }
        </div>
        <div class="desk-actions">
          <ion-button fill="outline" (click)="back()">חזרה</ion-button>
          <ion-button [disabled]="!store.choice()" (click)="next()">המשך</ion-button>
        </div>
      </div>
    </ion-content>

    @if (info(); as current) {
      <div class="sheet-backdrop" (click)="info.set(null)">
        <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="info-title" (click)="$event.stopPropagation()">
          <div class="sheet-head">
            <h2 id="info-title">{{ current.label }}</h2>
            <button type="button" class="sheet-close" (click)="info.set(null)" aria-label="סגירה">
              <ion-icon name="close-outline" aria-hidden="true"></ion-icon>
            </button>
          </div>
          @for (section of current.sections; track section.title) {
            <section class="term">
              <h3>{{ section.title }}</h3>
              @for (paragraph of section.paragraphs; track paragraph) { <p>{{ paragraph }}</p> }
            </section>
          }
          @if (current.link) {
            <p><a [href]="current.link.href" target="_blank" rel="noopener noreferrer">{{ current.link.label }}</a></p>
          }
          <p class="sheet-note note">הסבר על איך המחשבון מחלק את המקרים. זו הערכה, לא ייעוץ משפטי. חוזה אישי או הסכם קיבוצי יכולים לשנות את התוצאה.</p>
        </div>
      </div>
    }
  `
})
export class ReasonPage {
  readonly store = inject(WizardStore);
  private readonly router = inject(Router);
  readonly info = signal<Option | null>(null);

  constructor() {
    addIcons({ closeOutline });
  }

  readonly options: Option[] = [
    {
      value: 'Fired',
      label: 'פוטרתי',
      hint: 'המעסיק סיים את העבודה',
      link: { href: 'https://www.kolzchut.org.il/he/שימוע_לפני_פיטורים', label: 'עוד על שימוע לפני פיטורים' },
      sections: [
        {
          title: 'מה זה',
          paragraphs: [
            'המעסיק הוא שסיים את העבודה. זו לא החלטה שלכם לעזוב.'
          ]
        },
        {
          title: 'שימוע',
          paragraphs: [
            'שימוע הוא שיחה לפני פיטורים. המעסיק מציג את הכוונה לסיים את העבודה, ולכם יש הזדמנות להגיב.',
            'זימון לשימוע הוא לא פיטורים. פיטורים הם ההחלטה שאחרי השימוע, אם המעסיק בכל זאת מסיים את העבודה.',
            'הזכות לשימוע נקבעה בפסיקת בתי הדין לעבודה. היא לא מוסיפה סכום לחישוב. החישוב מתחיל כשהעבודה נגמרת.'
          ]
        },
        {
          title: 'מה זה משנה בחישוב',
          paragraphs: [
            'פיצויי פיטורים מגיעים בדרך כלל אחרי שנת עבודה. הודעה מוקדמת היא חובה של המעסיק: או שעובדים אותה, או שמשלמים אותה.',
            'פדיון חופשה ודמי הבראה מגיעים לפי היתרה, כמעט בלי קשר לסיבה.',
            'אם בחוזה יש סעיף 14, חלק מהפיצויים כבר הופרש לפנסיה. את זה בודקים במסך הפרטים.'
          ]
        },
        {
          title: 'אם רק זומנתם לשימוע',
          paragraphs: [
            'אתם עוד עובדים. אפשר לבחור כאן כדי לראות מה מגיע אם הפיטורים ייצאו לפועל, או «עוד לא החלטתי» כדי להשוות לפיטורים ולהתפטרות.'
          ]
        }
      ]
    },
    {
      value: 'Resigned',
      label: 'התפטרתי',
      hint: 'בחרתי לעזוב',
      sections: [
        {
          title: 'מה זה',
          paragraphs: [
            'בחרתם לעזוב, למשל בגלל עבודה חדשה. אין צורך לכתוב את הסיבה האישית.'
          ]
        },
        {
          title: 'מה זה משנה בחישוב',
          paragraphs: [
            'זו התפטרות רגילה. בדרך כלל אין פיצויי פיטורים.',
            'הודעה מוקדמת היא חובה של העובד כלפי המעסיק. פדיון חופשה ודמי הבראה עדיין מגיעים לפי היתרה.',
            'אם הנסיבה היא אחת שהחוק מונה, כמו הרעת תנאים, זו לא התפטרות רגילה. בוחרים «התפטרתי בדין מפוטר».'
          ]
        }
      ]
    },
    {
      value: 'ResignedJustified',
      label: 'התפטרתי בדין מפוטר',
      hint: 'החוק משווה את זה לפיטורים',
      link: { href: 'https://www.kolzchut.org.il/he/התפטרות_בדין_מפוטר', label: 'עוד על התפטרות בדין מפוטר' },
      sections: [
        {
          title: 'מה זה',
          paragraphs: [
            '«מוצדקת» הוא לא שיפוט של המעסיק או שלכם. זה הכינוי של החוק למקרים שבהם מי שמתפטר זכאי לפיצויים כאילו פוטר.'
          ]
        },
        {
          title: 'אילו נסיבות',
          paragraphs: [
            'החוק מונה נסיבות, למשל הרעת תנאים מוחשית, מצב בריאות של העובד או של בן משפחה, ומעבר דירה במרחק שהחוק קובע.',
            'נסיבה שלא ברשימה היא התפטרות רגילה, גם אם היא מרגישה מוצדקת.'
          ]
        },
        {
          title: 'מה זה משנה בחישוב',
          paragraphs: [
            'החישוב מתייחס לפיצויים כמו בפיטורים. פדיון חופשה והבראה נשארים לפי היתרה.',
            'ההתאמה לנסיבה עצמה לא נבדקת כאן. אם יש ספק, כדאי לבדוק מול המקור או מול איש מקצוע לפני שמסתמכים על הסכום.'
          ]
        }
      ]
    },
    {
      value: 'ContractEnded',
      label: 'נגמר חוזה העבודה ולא חידשו',
      hint: 'עבודה עם תאריך סיום',
      sections: [
        {
          title: 'מה זה',
          paragraphs: [
            'עובד בשכר שעבד לפי חוזה עם תאריך סיום, והמעסיק לא הציע לחדש את ההעסקה.'
          ]
        },
        {
          title: 'מה זה לא',
          paragraphs: [
            'זו עדיין העסקה, עם יחסי עובד-מעסיק. פרילנס, עוסק או קבלן בלי יחסי עובד-מעסיק לא נכנסים לכאן, והמחשבון לא מיועד להם.'
          ]
        },
        {
          title: 'מה זה משנה בחישוב',
          paragraphs: [
            'כשחוזה עבודה של שנה לפחות נגמר בלי חידוש, חוק פיצויי פיטורים יכול להשוות את זה לפיטורים.',
            'פדיון חופשה והבראה מגיעים לפי היתרה, כמו בשאר המסלולים.'
          ]
        }
      ]
    },
    {
      value: 'Considering',
      label: 'עוד לא החלטתי',
      hint: 'השוואה בין שני מסלולים',
      sections: [
        {
          title: 'מה זה',
          paragraphs: [
            'זה למי שעוד לא יודע אם יפטרו אותו או שהוא יתפטר. החישוב מציג את שני המסלולים זה לצד זה.'
          ]
        },
        {
          title: 'מה רואים',
          paragraphs: [
            'מסלול אחד הוא פיטורים, והשני התפטרות. כך אפשר לראות את ההפרש לפני שמחליטים.',
            'ההשוואה לא כוללת התפטרות בדין מפוטר וסיום חוזה. אלה אפשרויות נפרדות, עם מידע משלהן.'
          ]
        }
      ]
    }
  ];

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.info.set(null);
  }

  back(): void {
    void this.router.navigateByUrl('/start');
  }

  async next(): Promise<void> {
    await this.router.navigateByUrl('/details');
  }
}
