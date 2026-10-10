import { Location } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { IonBackButton, IonButtons, IonCheckbox, IonContent, IonHeader, IonToolbar } from '@ionic/angular/standalone';
import { DeskHeaderComponent } from '../core/desk-header.component';
import { PaidHelpComponent } from '../core/paid-help.component';
import { ReviewStore } from '../core/review.store';
import {
  assessTaxRefund, REFUND_QUESTIONS, REFUND_YEARS_BACK, RefundAnswerKey, RefundAnswers, RefundInput
} from '../core/tax-refund';
import { WizardStore } from '../core/wizard.store';
import { WorkspaceService } from '../core/workspace.service';

/** One-time amounts the employer pays in the final settlement. */
const LUMP_SUM_CODES = ['severance', 'vacation', 'recuperation'];

const kz = (path: string) => `https://www.kolzchut.org.il/he/${path}`;

const STEPS: Array<{ title: string; text: string }> = [
  {
    title: 'אוספים את המסמכים',
    text: 'טופס 106 מכל מעסיק, לכל שנה שבודקים. המעסיק חייב לתת אותו עד סוף מרץ של השנה שאחרי. מוסיפים אישורים לפי המצב: אישור מביטוח לאומי על דמי אבטלה או דמי לידה, קבלות על תרומות, אישורי הפקדה לפנסיה ולביטוח, וטופס 161 אם קיבלתם פיצויים.'
  },
  {
    title: 'בודקים לפני שמגישים',
    text: 'מזינים את הנתונים מטופס 106 במחשבון של רשות המסים ורואים אם יוצא החזר או חוב. הבדיקה לא מחייבת להגיש. אם יוצא חוב, אין חובה להגיש בקשה להחזר.'
  },
  {
    title: 'מגישים בקשה מקוונת (טופס 135)',
    text: 'נכנסים לאזור האישי באתר רשות המסים, ממלאים בקשה נפרדת לכל שנת מס ומצרפים את המסמכים. צריך פרטי חשבון בנק שרשום על שמכם. ההגשה בלי עלות ואפשר לעשות אותה לבד.'
  },
  {
    title: 'עוקבים',
    text: 'אחרי ההגשה אפשר לראות את מצב הבקשה באזור האישי. אם רשות המסים מבקשת מסמך נוסף, היא פונה אליכם. ההחזר מועבר ישירות לחשבון הבנק.'
  }
];

const LINKS: Array<{ title: string; desc: string; url: string }> = [
  { title: 'בקשה להחזר מס – טופס 135', desc: 'השירות המקוון של רשות המסים להגשת הבקשה', url: 'https://www.gov.il/he/service/itc135' },
  { title: 'הקלות, פטורים והחזרי מס', desc: 'מחשבונים, הסברים וטפסים באתר רשות המסים', url: 'https://www.gov.il/he/departments/topics/income-taxe-relife/govil-landing-page' },
  { title: 'מחשבון נקודות זיכוי', desc: 'כמה נקודות זיכוי מגיעות לכם לפי המצב המשפחתי', url: 'https://www.gov.il/he/service/tax-credit' },
  { title: 'חישוב מס הכנסה שנתי לשכירים', desc: 'איך מחושב המס על כל השנה, ולמה נוצר הפרש', url: kz('חישוב_מס_הכנסה_שנתי_לשכירים') },
  { title: 'נקודות זיכוי ממס הכנסה', desc: 'מי זכאי לנקודות נוספות ואיך מקבלים אותן', url: kz('נקודות_זיכוי_ממס_הכנסה') },
  { title: 'פטור ממס על פיצויי פיטורים', desc: 'כמה מהפיצויים פטור ממס ומה נדרש', url: kz('פטור_ממס_הכנסה_על_פיצויי_פיטורים_וכספים_אחרים_המשולמים_לעובד_בסיום_העסקתו') },
  { title: 'פריסת מס על פיצויים ומענקים', desc: 'חלוקת המס על כמה שנים כדי לשלם פחות', url: kz('פריסת_מס_הכנסה_על_פיצויי_פיטורים_וכספים_אחרים_המשולמים_לעובד_בסיום_העסקתו') },
  { title: 'זיכוי ממס בשל תרומה', desc: 'תרומות למוסדות מוכרים לפי סעיף 46', url: kz('זיכוי_ממס_הכנסה_בשל_תרומה_(סעיף_46)') }
];

@Component({
  selector: 'app-tax-refund',
  standalone: true,
  imports: [DeskHeaderComponent, PaidHelpComponent, IonHeader, IonToolbar, IonButtons, IonBackButton, IonContent, IonCheckbox],
  styles: [`
    .title-row { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin: 0 0 6px; }
    .title-row h2 { margin: 0; }
    .back-to {
      flex: none; font: inherit; font-size: 15px; font-weight: 700; cursor: pointer;
      background: none; border: 0; padding: 0; color: var(--ion-color-primary); white-space: nowrap;
    }
    .back-to:hover { text-decoration: underline; text-underline-offset: 3px; }
    .lead { margin: 0 0 18px; }
    .verdict {
      margin: 0 0 22px; padding: 18px 20px; border-radius: 16px;
      border: 1px solid var(--rs-line); border-top: 4px solid var(--ion-color-medium);
      background: var(--ion-item-background); box-shadow: var(--rs-card-shadow);
    }
    .verdict.likely { border-top-color: var(--ion-color-success, #2daa5a); }
    .verdict.worthChecking { border-top-color: var(--ion-color-warning, #ffc409); }
    .verdict h3 { margin: 0 0 6px; font-family: var(--rs-serif); font-size: 23px; line-height: 1.25; }
    .verdict p { margin: 0; line-height: 1.5; }
    .sec { margin: 0 0 26px; }
    .sec h3 { margin: 0 0 4px; font-size: 18px; }
    .sec > .muted { margin: 0 0 10px; }
    .signals, .steps, .link-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--rs-line); }
    .signals li { padding: 13px 0; border-bottom: 1px solid var(--rs-line); }
    .signals b { display: block; line-height: 1.35; }
    .signals span.why { display: block; margin-top: 3px; font-size: 14.5px; color: var(--ion-color-medium); line-height: 1.45; }
    .tag { display: inline-block; margin-inline-start: 8px; font-size: 12.5px; font-weight: 800; padding: 1px 9px; border-radius: 999px; background: var(--rs-soft); color: var(--ion-color-medium-shade, #5E6F73); }
    .tag.strong { background: rgba(var(--ion-color-success-rgb, 45, 170, 90), .12); color: var(--ion-color-success-shade, #1a7a3c); }
    .questions { display: grid; gap: 0; border-top: 1px solid var(--rs-line); }
    .questions label {
      display: flex; align-items: flex-start; gap: 12px; padding: 12px 0; cursor: pointer;
      border-bottom: 1px solid var(--rs-line); line-height: 1.4;
    }
    .questions ion-checkbox { flex: none; margin-top: 2px; }
    .years { padding: 14px 16px; border-radius: 12px; background: var(--rs-soft); line-height: 1.55; }
    .years b { white-space: nowrap; }
    .steps { counter-reset: step; }
    .steps li { counter-increment: step; display: grid; grid-template-columns: 34px 1fr; gap: 0 10px; padding: 14px 0; border-bottom: 1px solid var(--rs-line); }
    .steps li::before {
      content: counter(step); grid-row: span 2; width: 28px; height: 28px; border-radius: 50%;
      display: grid; place-items: center; font-weight: 800; font-size: 14px;
      background: var(--ion-color-primary); color: var(--ion-color-primary-contrast, #fff);
    }
    .steps b { line-height: 1.35; }
    .steps span { font-size: 14.5px; color: var(--ion-color-medium); line-height: 1.5; }
    .link-list a { display: grid; gap: 3px; padding: 13px 0; border-bottom: 1px solid var(--rs-line); color: inherit; text-decoration: none; }
    .link-list .title { font-weight: 700; display: flex; justify-content: space-between; gap: 12px; }
    .link-list .title::after { content: "↗"; font-size: 13px; font-weight: 500; color: var(--ion-color-medium); flex: none; }
    .link-list a:hover .title { color: var(--ion-color-primary); }
    .link-list .desc { font-size: 14px; color: var(--ion-color-medium); }
    @media (min-width: 992px) {
      .link-list { display: grid; grid-template-columns: 1fr 1fr; column-gap: 40px; border-top: 0; }
      .link-list li:nth-child(1), .link-list li:nth-child(2) { border-top: 1px solid var(--rs-line); }
    }
  `],
  template: `
    <ion-header class="ion-no-border mobile-only">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/results/summary" text="חזרה"></ion-back-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <app-desk-header [step]="4" [tabs]="!!wizard.results().length"></app-desk-header>
      <div class="page narrow ion-padding">
        <div class="title-row">
          <h2>החזר מס</h2>
          <button type="button" class="back-to" (click)="back()">חזרה</button>
        </div>
        <p class="lead muted small">
          שכירים רבים משלמים יותר מס הכנסה ממה שמגיע, בעיקר בשנה שבה מסיימים עבודה. אפשר לבקש את ההפרש בחזרה מרשות המסים, עד {{ yearsBack }} שנים אחורה.
        </p>

        <section class="verdict" [class]="result().verdict" aria-live="polite">
          <h3>{{ result().headline }}</h3>
          <p>{{ result().summary }}</p>
        </section>
        @for (c of result().cautions; track c) { <div class="note">{{ c }}</div> }

        @if (dataSignals().length) {
          <section class="sec" aria-labelledby="refund-data-title">
            <h3 id="refund-data-title">מה מצאנו בנתונים שלכם</h3>
            <ul class="signals">
              @for (s of dataSignals(); track s.key) {
                <li>
                  <b>{{ s.title }}<span class="tag" [class.strong]="s.strength === 'strong'">{{ s.strength === 'strong' ? 'סיבה חזקה' : 'סיבה אפשרית' }}</span></b>
                  <span class="why">{{ s.why }}</span>
                </li>
              }
            </ul>
          </section>
        } @else if (!hasData()) {
          <div class="note">עוד לא הזנתם תאריכי עבודה ושכר, אז ההערכה נשענת רק על מה שתסמנו כאן.</div>
        }

        <section class="sec" aria-labelledby="refund-questions-title">
          <h3 id="refund-questions-title">דברים שרק אתם יודעים</h3>
          <p class="muted small">סמנו מה נכון לגביכם באחת מהשנים האחרונות. {{ savedWhere }}</p>
          <div class="questions">
            @for (q of questions; track q.key) {
              <label>
                <ion-checkbox [checked]="!!answers()[q.key]" (ionChange)="toggle(q.key, $any($event).detail.checked)" [attr.aria-label]="q.text"></ion-checkbox>
                <span>
                  {{ q.text }}
                  @if (answers()[q.key]) { <span class="why muted small"><br>{{ q.why }}</span> }
                </span>
              </label>
            }
          </div>
        </section>

        <section class="sec" aria-labelledby="refund-years-title">
          <h3 id="refund-years-title">על אילו שנים אפשר להגיש</h3>
          <div class="years">
            @if (result().openYears.length) {
              בתקופת העבודה שלכם אפשר להגיש היום על השנים <b>{{ yearsLabel() }}</b>. מגישים בקשה נפרדת לכל שנה.
            } @else {
              אפשר להגיש על {{ yearsBack }} שנות המס האחרונות שהסתיימו. מגישים בקשה נפרדת לכל שנה.
            }
            @if (result().closingYear; as y) { <br>שימו לב: על שנת <b>{{ y }}</b> אפשר להגיש רק עד סוף השנה הנוכחית. }
            @if (result().pendingYear; as y) { <br>על שנת <b>{{ y }}</b>, שבה העבודה מסתיימת, אפשר להגיש רק אחרי שהשנה נגמרת ומתקבל טופס 106. }
          </div>
        </section>

        <section class="sec" aria-labelledby="refund-steps-title">
          <h3 id="refund-steps-title">איך מגישים, שלב אחרי שלב</h3>
          <ol class="steps">
            @for (s of steps; track s.title) {
              <li><b>{{ s.title }}</b><span>{{ s.text }}</span></li>
            }
          </ol>
        </section>

        <section class="sec" aria-labelledby="refund-links-title">
          <h3 id="refund-links-title">קישורים רשמיים</h3>
          <ul class="link-list">
            @for (l of links; track l.url) {
              <li>
                <a [href]="l.url" target="_blank" rel="noopener">
                  <span class="title">{{ l.title }}</span>
                  <span class="desc">{{ l.desc }}</span>
                </a>
              </li>
            }
          </ul>
        </section>

        <p class="muted small">
          זו הערכה כללית לפי הנתונים שהזנתם, לא חישוב מס ולא ייעוץ מס. הסכום נקבע רק לפי טופס 106 ובדיקת רשות המסים, ובמקרים מסוימים החשבון השנתי מראה חוב ולא החזר.
        </p>
        <app-paid-help></app-paid-help>
      </div>
    </ion-content>
  `
})
export class TaxRefundPage {
  readonly wizard = inject(WizardStore);
  private readonly review = inject(ReviewStore);
  private readonly location = inject(Location);
  private readonly workspaces = inject(WorkspaceService);

  readonly questions = REFUND_QUESTIONS;
  readonly steps = STEPS;
  readonly links = LINKS;
  readonly yearsBack = REFUND_YEARS_BACK;
  readonly answers = computed<RefundAnswers>(() => this.wizard.prefs().taxRefund ?? {});
  get savedWhere(): string {
    return this.workspaces.workspace() ? 'הסימונים נשמרים בחשבון שלכם.' : 'הסימונים נשמרים במכשיר בלבד.';
  }

  /** The quick check's details when filled, otherwise the full review's employment period. */
  private readonly input = computed<RefundInput>(() => {
    const today = new Date().toISOString().slice(0, 10);
    const p = this.wizard.profile();
    if (p.startDate) {
      const lumpSum = (this.wizard.active()?.components ?? [])
        .filter(c => c.includedInTotal && LUMP_SUM_CODES.includes(c.code))
        .reduce((sum, c) => sum + (c.amount ?? 0), 0);
      return { startDate: p.startDate, endDate: p.endDate, monthlySalary: p.monthlySalary, hourly: p.payType === 'Hourly', lumpSum, today };
    }
    const r = this.review.review();
    const lastSalary = [...(r?.months ?? [])]
      .sort((a, b) => b.year - a.year || b.month - a.month)
      .find(m => (m.grossSalary ?? 0) > 0)?.grossSalary ?? 0;
    return {
      startDate: r?.period?.startDate ?? '', endDate: r?.period?.endDate ?? '',
      monthlySalary: lastSalary, hourly: false, lumpSum: 0, today
    };
  });

  readonly hasData = computed(() => !!this.input().startDate);
  readonly result = computed(() => assessTaxRefund(this.input(), this.answers()));
  readonly dataSignals = computed(() => this.result().signals.filter(s => s.fromData));
  readonly yearsLabel = computed(() => {
    const years = this.result().openYears;
    return years.length > 1 ? `${years[years.length - 1]}–${years[0]}` : String(years[0] ?? '');
  });

  toggle(key: RefundAnswerKey, value: boolean): void {
    this.wizard.setPref('taxRefund', { ...this.answers(), [key]: value });
    this.workspaces.scheduleSave();
  }

  back(): void { this.location.back(); }
}
