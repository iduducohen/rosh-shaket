import { Component, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonButton, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';
import { DateFieldComponent } from '../../core/date-field.component';
import { ReviewStore } from '../../core/review.store';
import { ReviewStepNavComponent } from './review-step-nav.component';

interface InfoSection { title: string; paragraphs: string[]; }
interface ReasonOption {
  value: string;
  label: string;
  hint: string;
  sections: InfoSection[];
  link?: { href: string; label: string };
}

interface FlagOption {
  key: 'sameEmployer' | 'hadBreak' | 'multiple';
  label: string;
  hint: string;
  ifOn: string;
  ifOff: string;
}

@Component({
  selector: 'app-review-employment',
  standalone: true,
  imports: [FormsModule, IonButton, IonIcon, DateFieldComponent, ReviewStepNavComponent],
  styles: [`
    .field { margin-bottom: 14px; }
    .field label { display:block; font-size:12.5px; color:var(--ion-color-medium); margin-bottom:6px; }
    .field input {
      width:100%; box-sizing:border-box; font:inherit; color:inherit;
      background:var(--ion-item-background); border:1px solid var(--rs-line); border-radius:12px;
      padding:12px 14px;
    }
    .date-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 12px;
      margin-bottom: 6px;
      align-items: start;
    }
    @media (max-width: 480px) {
      .date-row { grid-template-columns: 1fr; }
    }
    .structure-intro {
      background: var(--rs-soft);
      border: 1px solid var(--rs-line);
      border-radius: 14px;
      padding: 14px 16px;
      margin: 0 0 14px;
      font-size: 14.5px;
      line-height: 1.5;
    }
    .structure-intro p { margin: 0 0 8px; }
    .structure-intro p:last-child { margin: 0; font-size: 13.5px; color: var(--ion-color-medium); }
    .option {
      background: var(--ion-item-background, var(--ion-background-color)); color: var(--ion-text-color);
      border: 1.5px solid var(--rs-line); border-radius: 14px; padding: 14px 16px 10px; margin: 0;
      height: 100%;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
    }
    .option.selected { border-color: var(--ion-color-primary); background: var(--rs-soft); }
    .pick {
      display: block; width: 100%; text-align: start; font: inherit; color: inherit;
      background: none; border: 0; padding: 0; cursor: pointer;
      flex: 1 1 auto;
    }
    .pick b { display: block; font-weight: 700; }
    .pick span { display: block; color: var(--ion-color-medium); font-size: 14px; margin-top: 4px; }
    .more {
      background: none; border: 0; padding: 8px 0 2px; cursor: pointer;
      color: var(--ion-color-primary); font: inherit; font-weight: 700; font-size: 14.5px;
      text-decoration: underline; text-underline-offset: 3px;
      align-self: flex-start;
      margin-top: auto;
    }
    .flag-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
      margin: 0 0 4px;
      align-items: stretch;
    }
    @media (min-width: 640px) {
      .flag-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    }
    .flag {
      border: 1.5px solid var(--rs-line); border-radius: 14px; padding: 14px 16px 12px; margin: 0;
      background: var(--ion-item-background);
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }
    .flag.selected { border-color: var(--ion-color-primary); background: var(--rs-soft); }
    .flag-top {
      display:flex; gap:12px; align-items:flex-start; width:100%; text-align:start;
      background:none; border:0; padding:0; cursor:pointer; font:inherit; color:inherit;
      flex: 1 1 auto;
    }
    .tick {
      width:22px; height:22px; border-radius:7px; border:1.5px solid var(--rs-line);
      display:grid; place-items:center; flex:none; margin-top:2px; background:#fff;
    }
    .flag.selected .tick { background: var(--ion-color-primary); border-color: var(--ion-color-primary); color:#fff; }
    .flag-copy { min-width: 0; }
    .flag-copy b { display:block; font-weight:700; }
    .flag-copy span { display:block; color: var(--ion-color-medium); font-size: 14px; margin-top: 4px; line-height:1.45; }
    .flag-effect {
      margin: 10px 0 0; padding: 10px 12px; border-radius: 10px;
      background: rgba(var(--ion-color-primary-rgb), .06); font-size: 13.5px; line-height: 1.45;
      min-height: 4.2em;
      box-sizing: border-box;
      margin-top: auto;
    }
    .flag-effect strong {
      display: inline; font-size: 12.5px; color: var(--ion-color-primary);
      margin-inline-end: 4px;
    }
    .section-title { margin: 22px 0 8px; font-size: 18px; }
    .lead { color: var(--ion-color-primary); font-weight: 700; margin: 0 0 14px; }
    .err { color: var(--ion-color-danger); }
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
      font-size: 14px; font-weight: 700; color: var(--ion-color-primary);
      border-bottom: 1px solid var(--rs-soft);
    }
    .term p { margin: 0 0 8px; }
    .sheet a { font-weight: 700; }
    .sheet-note { margin: 18px 0 0; color: var(--ion-color-medium); font-size: 13.5px; }
    @media (min-width: 992px) {
      .option:hover, .flag:hover { border-color: var(--ion-color-primary); }
      .sheet-backdrop { align-items: center; }
      .desk-grid-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        align-items: stretch;
      }
    }
  `],
  template: `
    <h2>ספרו לנו על תקופת העבודה</h2>
    <p class="lead">נתחיל מהתאריכים והסיבה — בלי מספרים כבדים עדיין.</p>

    <div class="field">
      <label for="employer">שם המעסיק (אופציונלי)</label>
      <input id="employer" [(ngModel)]="employerName" placeholder="למשל: חברת דוגמה בע״מ" />
    </div>

    <div class="date-row">
      <app-date-field
        class="in-row"
        label="תחילת עבודה"
        [value]="startDate"
        [max]="today"
        [state]="dateState('start')"
        [error]="dateError('start')"
        (valueChange)="startDate = $event">
      </app-date-field>
      <app-date-field
        class="in-row"
        label="סיום / מתוכנן"
        [value]="endDate"
        [state]="dateState('end')"
        [error]="dateError('end')"
        (valueChange)="endDate = $event">
      </app-date-field>
    </div>

    <h3 class="section-title">סיבת סיום</h3>
    <p class="muted">הסיבה משפיעה על אומדן הזכויות בסיום — לא על חישוב ההפקדות החודשיות.</p>
    <div class="desk-grid-2">
      @for (o of reasons; track o.value) {
        <div class="option" [class.selected]="exitReason === o.value">
          <button type="button" class="pick" [attr.aria-pressed]="exitReason === o.value" (click)="exitReason = o.value">
            <b>{{ o.label }}</b>
            <span>{{ o.hint }}</span>
          </button>
          <button type="button" class="more" (click)="info.set(o)">מידע נוסף</button>
        </div>
      }
    </div>

    <h3 class="section-title">איך הייתה העבודה בפועל?</h3>
    <div class="structure-intro">
      <p><b>סמנו ✓ רק מה שמתאים לכם.</b> לא חובה לסמן הכל — רוב העובדים משאירים הכל לא מסומן חוץ מהשורה הראשונה.</p>
      <p>התשובות עוזרות לנו להבין אם חודש בלי הפקדה הוא «חשוד» או «הגיוני» (למשל אחרי הפסקה).</p>
    </div>

    <div class="flag-grid">
      @for (f of flags; track f.key) {
        <div class="flag" [class.selected]="isOn(f.key)">
          <button type="button" class="flag-top" (click)="toggle(f.key)" [attr.aria-pressed]="isOn(f.key)">
            <span class="tick" aria-hidden="true">@if (isOn(f.key)) { ✓ }</span>
            <span class="flag-copy">
              <b>{{ f.label }}</b>
              <span>{{ f.hint }}</span>
            </span>
          </button>
          <div class="flag-effect" aria-live="polite">
            <strong>משמעות:</strong>{{ isOn(f.key) ? f.ifOn : f.ifOff }}
          </div>
        </div>
      }
    </div>

    @if (err) { <p class="err">{{ err }}</p> }
    <app-review-step-nav nextLabel="המשך למסמכים" (next)="save()" />

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
          <p class="sheet-note">הסבר כללי להערכת זכויות בסיום. זו הערכה, לא ייעוץ משפטי.</p>
        </div>
      </div>
    }
  `
})
export class ReviewEmploymentPage {
  private readonly store = inject(ReviewStore);
  private readonly router = inject(Router);

  readonly today = new Date().toISOString().slice(0, 10);
  readonly info = signal<ReasonOption | null>(null);

  employerName = this.store.review()?.period?.employerName ?? '';
  startDate = this.store.review()?.period?.startDate ?? '';
  endDate = this.store.review()?.period?.endDate ?? '';
  exitReason = this.store.review()?.period?.exitReason ?? 'Fired';
  sameEmployer = this.store.review()?.period?.sameEmployerThroughout ?? true;
  hadBreak = this.store.review()?.period?.hadWorkBreak ?? false;
  multiple = this.store.review()?.period?.multiplePeriods ?? false;
  err = '';

  readonly reasons: ReasonOption[] = [
    {
      value: 'Fired',
      label: 'פוטרתי',
      hint: 'המעסיק סיים את העבודה',
      link: { href: 'https://www.kolzchut.org.il/he/שימוע_לפני_פיטורים', label: 'עוד על שימוע לפני פיטורים' },
      sections: [
        { title: 'מה זה', paragraphs: ['המעסיק הוא שסיים את העבודה. זו לא החלטה שלכם לעזוב.'] },
        { title: 'מה זה משנה כאן', paragraphs: [
          'באומדן סיום העסקה נבדוק פיצויי פיטורים, הודעה מוקדמת, פדיון חופשה והבראה.',
          'בדיקת ההפקדות החודשיות (פנסיה / השתלמות) נשארת זהה — הסיבה לא משנה כמה היה צריך להפקיד בכל חודש.'
        ]}
      ]
    },
    {
      value: 'Resigned',
      label: 'התפטרתי',
      hint: 'בחרתי לעזוב',
      sections: [
        { title: 'מה זה', paragraphs: ['בחרתם לעזוב, למשל בגלל עבודה חדשה.'] },
        { title: 'מה זה משנה כאן', paragraphs: [
          'בדרך כלל אין פיצויי פיטורים בהתפטרות רגילה. עדיין נבדוק פדיון חופשה, הבראה, והפקדות לאורך השנים.',
          'אם הנסיבה היא מהחוק (הרעת תנאים וכו׳) — בחרו «התפטרתי בדין מפוטר».'
        ]}
      ]
    },
    {
      value: 'ResignedJustified',
      label: 'התפטרתי בדין מפוטר',
      hint: 'החוק משווה את זה לפיטורים',
      link: { href: 'https://www.kolzchut.org.il/he/התפטרות_בדין_מפוטר', label: 'עוד על התפטרות בדין מפוטר' },
      sections: [
        { title: 'מה זה', paragraphs: ['מקרים שבהם מי שמתפטר זכאי לפיצויים כאילו פוטר, לפי נסיבות שהחוק מונה.'] },
        { title: 'מה זה משנה כאן', paragraphs: ['אומדן הפיצויים בסיום יתייחס כמו בפיטורים. בדיקת ההפקדות החודשיות לא משתנה.'] }
      ]
    },
    {
      value: 'ContractEnded',
      label: 'נגמר חוזה ולא חידשו',
      hint: 'עבודה עם תאריך סיום',
      sections: [
        { title: 'מה זה', paragraphs: ['חוזה עם תאריך סיום, והמעסיק לא חידש את ההעסקה.'] },
        { title: 'מה זה משנה כאן', paragraphs: ['ייתכן שסיום חוזה יושווה לפיטורים לצורך פיצויים. עדיין נבנה Timeline של הפקדות לכל חודשי החוזה.'] }
      ]
    },
    {
      value: 'Retirement',
      label: 'פרישה',
      hint: 'יציאה לפנסיה / פרישה',
      sections: [
        { title: 'מה זה', paragraphs: ['סיום העסקה עקב פרישה לגיל פרישה או פרישה מוסכמת.'] },
        { title: 'מה זה משנה כאן', paragraphs: [
          'דגש על מצב הקופות והצבירה לאורך השנים, יותר מאשר על פיצויי פיטורים קלאסיים.',
          'עדיין חשוב לוודא שההפקדות לאורך השנים בוצעו.'
        ]}
      ]
    },
    {
      value: 'Other',
      label: 'אחר',
      hint: 'סיבה שלא ברשימה',
      sections: [
        { title: 'מה זה', paragraphs: ['למשל הסכמה לסיום, חל״ת ארוך שהפך לסיום, או מקרה מורכב.'] },
        { title: 'מה זה משנה כאן', paragraphs: [
          'נבנה את היסטוריית השכר וההפקדות כמו תמיד.',
          'אומדן הזכויות בסיום יוצג בזהירות רבה יותר — ייתכן שתידרש בדיקה אנושית.'
        ]}
      ]
    }
  ];

  readonly flags: FlagOption[] = [
    {
      key: 'sameEmployer',
      label: 'עבדתי אצל מעסיק אחד בלבד',
      hint: 'כל הזמן בין התאריכים שבחרתם — אותו שם מעסיק.',
      ifOn: 'נבדוק את כל החודשים כהעסקה אחת אצל אותו מעסיק.',
      ifOff: 'ייתכן שהחלפתם מעסיק. נבקש לפצל תקופות או מסמכים לפי מעסיק.'
    },
    {
      key: 'hadBreak',
      label: 'היו חודשים בלי עבודה',
      hint: 'חל״ת, חופשה ללא תשלום, או הפסקה — בלי שכר באותם חודשים.',
      ifOn: 'חודש בלי הפקדה לא יסומן אוטומטית כחוסר — אולי פשוט לא עבדתם.',
      ifOff: 'נניח עבודה רציפה; חודש בלי הפקדה יסומן לבדיקה.'
    },
    {
      key: 'multiple',
      label: 'היו כמה תקופות נפרדות',
      hint: 'לא רצף אחד — למשל חזרתם לאותו מקום אחרי הפסקה, או כמה חוזים.',
      ifOn: 'נציין שצריך לפצל לכמה מקטעי העסקה (בהמשך).',
      ifOff: 'נתייחס לכל הטווח כתקופה אחת — מתאים לרוב המקרים.'
    }
  ];

  constructor() {
    addIcons({ closeOutline });
  }

  isOn(key: FlagOption['key']): boolean {
    if (key === 'sameEmployer') return this.sameEmployer;
    if (key === 'hadBreak') return this.hadBreak;
    return this.multiple;
  }

  toggle(key: FlagOption['key']): void {
    if (key === 'sameEmployer') this.sameEmployer = !this.sameEmployer;
    else if (key === 'hadBreak') this.hadBreak = !this.hadBreak;
    else this.multiple = !this.multiple;
  }

  dateState(which: 'start' | 'end'): 'valid' | 'invalid' | '' {
    const err = this.dateError(which);
    if (err) return 'invalid';
    const v = which === 'start' ? this.startDate : this.endDate;
    return v ? 'valid' : '';
  }

  dateError(which: 'start' | 'end'): string {
    if (which === 'start') {
      if (!this.startDate) return '';
      if (this.startDate > this.today) return 'תאריך התחלה לא יכול להיות בעתיד.';
    }
    if (which === 'end') {
      if (!this.endDate) return '';
      if (this.startDate && this.endDate < this.startDate) return 'תאריך הסיום לפני ההתחלה.';
    }
    return '';
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.info.set(null);
  }

  save(): void {
    this.err = '';
    if (!this.startDate || !this.endDate) {
      this.err = 'בחרו תאריך התחלה ותאריך סיום.';
      return;
    }
    if (this.endDate < this.startDate) {
      this.err = 'תאריך הסיום לפני ההתחלה.';
      return;
    }
    if (!this.exitReason) {
      this.err = 'בחרו סיבת סיום.';
      return;
    }
    this.store.setPeriod({
      employerName: this.employerName,
      startDate: this.startDate,
      endDate: this.endDate,
      sameEmployerThroughout: this.sameEmployer,
      exitReason: this.exitReason,
      hadWorkBreak: this.hadBreak,
      multiplePeriods: this.multiple
    });
    void this.router.navigateByUrl('/review/documents');
  }
}
