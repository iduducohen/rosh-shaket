import { Component, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonList,
  IonSegment, IonSegmentButton, IonSpinner, IonToggle, IonToolbar, IonLabel
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';
import { DateFieldComponent } from '../core/date-field.component';
import { DeskHeaderComponent } from '../core/desk-header.component';
import { describeError } from '../core/api.service';
import { CalculationFacade } from '../core/calculation.facade';
import { FundKind, FundLine, ProfileDto } from '../core/models';
import { WizardStore } from '../core/wizard.store';

@Component({
  selector: 'app-details',
  standalone: true,
  imports: [DateFieldComponent, DeskHeaderComponent, FormsModule, IonHeader, IonToolbar, IonButtons, IonBackButton, IonContent, IonList, IonItem, IonInput,
    IonSegment, IonSegmentButton, IonButton, IonIcon, IonSpinner, IonToggle, IonLabel],
  styles: [`
    ion-item {
      --background: var(--rs-field);
      --border-width: 0;
      --inner-padding-end: 12px;
      --padding-start: 14px;
      border: 1px solid var(--rs-line);
      border-radius: 12px;
      margin-bottom: 10px;
    }
    ion-item.filled {
      --background: var(--rs-soft);
      border-color: color-mix(in srgb, var(--ion-color-primary) 28%, var(--rs-line));
    }
    ion-item.filled ion-input, ion-item.filled ion-select { --background: transparent; }
    ion-item.field-invalid { border-color: var(--ion-color-danger); border-width: 1.5px; }
    ion-item.field-valid { border-color: var(--ion-color-primary); border-width: 1.5px; }
    .details-lead { color: var(--ion-color-medium); font-weight: 500; margin: 0 0 10px; font-size: 15px; }
    .slip-note { margin: 0 0 18px; line-height: 1.45; }
    .field-hint {
      margin: -2px 0 10px; padding: 0 4px;
      font-size: 13px; color: var(--ion-color-medium); line-height: 1.35;
    }
    .days-card {
      background: var(--rs-field); border: 1px solid var(--rs-line); border-radius: 12px;
      padding: 10px 12px 12px; margin-bottom: 10px;
    }
    .days-card.filled {
      background: var(--rs-soft);
      border-color: color-mix(in srgb, var(--ion-color-primary) 28%, var(--rs-line));
    }
    .days-card .lbl { display: block; font-size: 12.5px; color: var(--ion-color-medium); margin-bottom: 8px; }
    .days-row { display: flex; gap: 6px; }
    .days-row button {
      flex: 1; height: 38px; border-radius: 10px; border: 1px solid var(--rs-line); background: transparent;
      color: inherit; font: inherit; font-weight: 700; cursor: pointer;
    }
    .days-row button.on { background: var(--ion-color-primary); border-color: var(--ion-color-primary); color: var(--ion-color-primary-contrast); }
    .days-row button:hover:not(.on) { background: var(--rs-soft); }
    .days-row button:focus-visible { outline: 3px solid var(--ion-color-primary); outline-offset: 2px; }
    .s14 {
      margin-top: 14px; padding: 4px 0 0;
      border: 1px solid transparent; border-radius: 14px;
    }
    .s14.filled {
      background: var(--rs-soft);
      border-color: color-mix(in srgb, var(--ion-color-primary) 28%, var(--rs-line));
      padding: 8px 12px 12px;
    }
    .s14-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
    .seg-label { font-weight: 600; margin: 12px 0 6px; display: block; }
    .s14-note { display: block; margin: 0 0 8px; font-size: 13px; color: var(--ion-color-medium); }
    .more {
      background: none; border: 0; padding: 0; cursor: pointer;
      color: var(--ion-color-primary); font: inherit; font-weight: 650; font-size: 14px;
      text-decoration: underline; text-underline-offset: 3px;
    }
    .fund-row {
      display: flex; align-items: center; justify-content: space-between; gap: 16px;
      margin-top: 18px; padding: 14px 16px; border: 1px solid var(--rs-line); border-radius: 14px;
      background: var(--rs-field);
    }
    .fund-row.filled {
      background: var(--rs-soft);
      border-color: color-mix(in srgb, var(--ion-color-primary) 28%, var(--rs-line));
    }
    .fund-row span { font-weight: 600; }
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
    .funds { margin-top: 22px; display: grid; gap: 10px; }
    .funds h3 { margin: 0; font-family: var(--ion-font-family); font-size: 18px; }
    .fund-card {
      background: var(--rs-soft);
      border: 1px solid color-mix(in srgb, var(--ion-color-primary) 22%, var(--rs-line));
      border-radius: 14px; padding: 12px 14px;
    }
    .fund-card header { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
    .fund-card header b { font-size: 16px; }
    .fund-card p { margin: 6px 0 0; }
    .fund-name { font-weight: 700; }
    @media (min-width: 992px) {
      ion-list.desk-grid-2 { background: transparent; align-items: start; gap: 14px 18px; }
      ion-list.desk-grid-2 ion-item { margin-bottom: 0; }
      ion-list.desk-grid-2 app-date-field { margin-bottom: 0; }
      .days-card { margin-bottom: 0; }
      .field-hint { margin: 6px 0 0; }
      .sheet-backdrop { align-items: center; }
    }
  `],
  template: `
    <ion-header class="ion-no-border mobile-only"><ion-toolbar><ion-buttons slot="start"><ion-back-button defaultHref="/reason" text="חזרה"></ion-back-button></ion-buttons></ion-toolbar></ion-header>
    <ion-content>
      <app-desk-header [step]="3"></app-desk-header>
      <div class="page narrow ion-padding">
        <h2>פרטי ההעסקה</h2>
        <p class="details-lead">{{ store.fromPayslip() ? 'שדות שסומנו «מהתלוש» נקראו אוטומטית — כדאי לוודא לפני שממשיכים.' : 'הכל מופיע בתלוש השכר האחרון.' }}</p>
        @if (store.fromPayslip()) {
          <p class="slip-note muted small">תלוש אחרון מספיק להערכה של שכר, חופשה והבראה. הפקדות לאורך השנים בודקים בדוח מהמסלקה הפנסיונית.</p>
        }

        <ion-list lines="none" class="desk-grid-2">
          <app-date-field label="תאריך התחלה" [value]="form.startDate" [max]="today" [filled]="isFilled('startDate')"
                          [state]="fieldState('startDate')" [error]="fieldErrors()['startDate'] ?? ''"
                          (valueChange)="setDate('startDate', $event)"></app-date-field>
          <app-date-field label="תאריך סיום" [value]="form.endDate" [filled]="isFilled('endDate')"
                          [state]="fieldState('endDate')" [error]="fieldErrors()['endDate'] ?? ''"
                          (valueChange)="setDate('endDate', $event)"></app-date-field>
          <div>
            <ion-item [class.filled]="isFilled('monthlySalary')" [class.field-invalid]="fieldState('monthlySalary') === 'invalid'" [class.field-valid]="fieldState('monthlySalary') === 'valid'">
              <ion-input [label]="slipLabel('שכר חודשי ברוטו (₪)', 'monthlySalary')" labelPlacement="stacked" type="text" inputmode="numeric" [ngModel]="salaryText" name="salary"
                         [class.ion-invalid]="!!fieldErrors()['monthlySalary']" [class.ion-touched]="!!fieldErrors()['monthlySalary']"
                         [errorText]="fieldErrors()['monthlySalary'] ?? ''" (ngModelChange)="onSalary($event)"></ion-input>
            </ion-item>
            <p class="field-hint">שכר יסוד בלבד — בלי שעות נוספות והחזרים</p>
          </div>
          <ion-item [class.filled]="isFilled('jobPercent')">
            <ion-input [label]="slipLabel('היקף משרה (%)', 'jobPercent')" labelPlacement="stacked" type="number" inputmode="numeric" [(ngModel)]="form.jobPercent" name="pct"></ion-input>
          </ion-item>
          <div class="days-card" [class.filled]="isFilled('workWeek')">
            <span class="lbl" id="work-days-label">ימי עבודה בשבוע @if (isFilled('workWeek')) { <span class="from-slip">· מהתלוש</span> }</span>
            <div class="days-row" role="group" aria-labelledby="work-days-label">
              @for (day of workDays; track day) {
                <button type="button" [class.on]="form.workDaysPerWeek === day" [attr.aria-pressed]="form.workDaysPerWeek === day" (click)="form.workDaysPerWeek = day">{{ day }}</button>
              }
            </div>
          </div>
          <ion-item [class.filled]="isFilled('vacationBalanceDays')">
            <ion-input [label]="slipLabel('יתרת ימי חופשה', 'vacationBalanceDays')" labelPlacement="stacked" type="text" inputmode="decimal" [ngModel]="vacationText" name="vac"
                       helperText="היתרה, לא המכסה השנתית"
                       (ngModelChange)="onVacation($event)"></ion-input>
          </ion-item>
          <ion-item [class.filled]="isFilled('recuperationDaysPaidLastYear')">
            <ion-input [label]="slipLabel('ימי הבראה ששולמו בשנה האחרונה', 'recuperationDaysPaidLastYear')" labelPlacement="stacked" type="text" inputmode="decimal"
                       [ngModel]="recText" name="rec" helperText="מה ששולם בפועל, לא המכסה"
                       (ngModelChange)="onRec($event)"></ion-input>
          </ion-item>
        </ion-list>

        <div class="s14" [class.filled]="isFilled('section14')">
          <div class="s14-head">
            <span class="seg-label">יש לכם סעיף 14? @if (isFilled('section14')) { <span class="from-slip">· מהתלוש</span> }</span>
            <button type="button" class="more" (click)="sectionInfo.set(true)">מידע נוסף</button>
          </div>
          @if (isFilled('section14')) { <span class="s14-note">לפי שיעור הפיצויים בתלוש — כדאי לאמת בחוזה</span> }
          <ion-segment [(ngModel)]="form.section14" name="s14">
            <ion-segment-button value="Full"><ion-label>8.33%</ion-label></ion-segment-button>
            <ion-segment-button value="Partial6"><ion-label>6%</ion-label></ion-segment-button>
            <ion-segment-button value="None"><ion-label>אין</ion-label></ion-segment-button>
            <ion-segment-button value="Unknown"><ion-label>לא יודע</ion-label></ion-segment-button>
          </ion-segment>
        </div>

        <div class="fund-row" [class.filled]="isFilled('hasStudyFund')">
          <span>קרן השתלמות דרך העבודה @if (isFilled('hasStudyFund')) { <span class="from-slip">· מהתלוש</span> }</span>
          <ion-toggle [(ngModel)]="form.hasStudyFund" name="fund" aria-label="קרן השתלמות דרך העבודה"></ion-toggle>
        </div>

        @if (store.fromPayslip() && store.funds(); as rows) {
          <section class="funds">
            <h3>קופות מהתלוש</h3>
            @if (rows.length === 0) {
              <p class="muted small">לא זיהינו בתלוש שורות של פנסיה, פיצויים, אובדן כושר עבודה או קרן השתלמות. הן מופיעות בטבלת ההפרשות: שם הקופה, הפרשת עובד והפרשת מעסיק.</p>
            } @else {
              @for (card of fundCards(rows); track card.kind) {
                <article class="fund-card">
                  <header>
                    <b>{{ card.title }}</b>
                    <span class="from-slip">מהתלוש</span>
                  </header>
                  @for (line of card.lines; track $index) {
                    <p class="fund-name">{{ line.name || 'שם הקופה לא מופיע' }}</p>
                    <p>עובד {{ fundAmount(line.employee, line.unit) }} · מעסיק {{ fundAmount(line.employer, line.unit) }}</p>
                    @if (line.detail) { <p class="muted small">{{ line.detail }}</p> }
                  }
                </article>
              }
              @if (missingFunds(rows); as missing) {
                @if (missing) { <p class="muted small">לא זוהה בתלוש: {{ missing }}</p> }
              }
            }
          </section>
        }

        @if (error()) { <div class="note">{{ error() }}</div> }
        <div class="desk-actions">
          <ion-button fill="outline" (click)="back()">חזרה</ion-button>
          <ion-button [disabled]="busy()" (click)="submit()">
            @if (busy()) { <ion-spinner name="crescent"></ion-spinner> } @else { מה מגיע לי }
          </ion-button>
        </div>
      </div>
    </ion-content>

    @if (sectionInfo()) {
      <div class="sheet-backdrop" (click)="sectionInfo.set(false)">
        <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="s14-title" (click)="$event.stopPropagation()">
          <div class="sheet-head">
            <h2 id="s14-title">סעיף 14</h2>
            <button type="button" class="sheet-close" (click)="sectionInfo.set(false)" aria-label="סגירה">
              <ion-icon name="close-outline" aria-hidden="true"></ion-icon>
            </button>
          </div>
          @for (section of sectionHelp; track section.title) {
            <section class="term">
              <h3>{{ section.title }}</h3>
              @for (paragraph of section.paragraphs; track paragraph) { <p>{{ paragraph }}</p> }
            </section>
          }
          <p><a href="https://www.kolzchut.org.il/he/סעיף_14_לחוק_פיצויי_פיטורים" target="_blank" rel="noopener noreferrer">עוד על סעיף 14</a></p>
          <p class="sheet-note note">הסבר לבחירה במחשבון. זו הערכה, לא ייעוץ משפטי. הנוסח הקובע הוא בחוזה העבודה.</p>
        </div>
      </div>
    }
  `
})
export class DetailsPage {
  readonly store = inject(WizardStore);
  private readonly facade = inject(CalculationFacade);
  private readonly router = inject(Router);

  form: ProfileDto = { ...this.store.profile() };
  readonly workDays = [1, 2, 3, 4, 5, 6] as const;
  salaryText = displayGrouped(this.form.monthlySalary, false);
  vacationText = displayGrouped(this.form.vacationBalanceDays, true);
  recText = recDisplay(this.form.recuperationDaysPaidLastYear, this.store.filledFields().includes('recuperationDaysPaidLastYear'));
  readonly today = localToday();
  readonly busy = signal(false);
  readonly error = signal('');
  readonly fieldErrors = signal<Partial<Record<string, string>>>({});
  readonly checked = signal(false);
  readonly sectionInfo = signal(false);

  readonly sectionHelp = [
    {
      title: 'מה זה',
      paragraphs: [
        'סעיף 14 לחוק פיצויי פיטורים אומר שההפרשה החודשית של המעסיק לחלק הפיצויים בפנסיה באה במקום תשלום פיצויים בסוף העבודה.',
        'זה נקבע בחוזה. התלוש רק מראה כמה הופרש בפועל.'
      ]
    },
    {
      title: 'איך בוחרים',
      paragraphs: [
        '8.33% אם בתלוש, בשורת הפנסיה, ההפרשה של המעסיק לפיצויים היא 8.33% מהשכר. זה הסעיף המלא. בדרך כלל לא מגיעים פיצויים נוספים בסיום, כי הם כבר הופרשו כל חודש.',
        '6% אם ההפרשה לפיצויים היא 6%. זה סעיף חלקי: חלק מהפיצויים כבר בקופה, והיתרה עשויה להגיע בסיום לפי סיבת העזיבה.',
        'אין אם בחוזה אין סעיף 14, או שאין הפרשת מעסיק לפיצויים. אם מגיעים פיצויים, הם משולמים בסיום העבודה.',
        'לא יודע אם לא מצאתם את האחוז. עדיף לא לנחש 8.33%. החישוב יסמן שצריך לבדוק בחוזה.'
      ]
    },
    {
      title: 'איפה רואים את זה',
      paragraphs: [
        'בתלוש, באזור הפנסיה, בשורה כמו «פיצויים» או «הפרשת מעסיק לפיצויים», ליד אחוז.',
        'אם התלוש והחוזה לא אומרים את אותו דבר, החוזה הוא שקובע.'
      ]
    }
  ];

  constructor() {
    addIcons({ closeOutline });
  }

  /** Ionic keeps pages alive; re-sync local form after "התחל מחדש" cleared the store. */
  ionViewWillEnter(): void {
    this.syncFromStore();
  }

  private syncFromStore(): void {
    this.form = { ...this.store.profile() };
    this.salaryText = displayGrouped(this.form.monthlySalary, false);
    this.vacationText = displayGrouped(this.form.vacationBalanceDays, true);
    this.recText = recDisplay(
      this.form.recuperationDaysPaidLastYear,
      this.store.filledFields().includes('recuperationDaysPaidLastYear')
    );
    this.fieldErrors.set({});
    this.checked.set(false);
    this.error.set('');
    this.busy.set(false);
    this.sectionInfo.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.sectionInfo.set(false);
  }

  isFilled(field: string): boolean {
    return this.store.filledFields().includes(field);
  }

  slipLabel(text: string, field: string): string {
    return this.isFilled(field) ? `${text} · מהתלוש` : text;
  }

  fundCards(rows: FundLine[]): { kind: FundKind; title: string; lines: FundLine[] }[] {
    return FUND_KINDS
      .map(kind => ({ kind, title: FUND_TITLES[kind], lines: rows.filter(row => row.kind === kind) }))
      .filter(card => card.lines.length > 0);
  }

  missingFunds(rows: FundLine[]): string {
    const present = new Set(rows.map(row => row.kind));
    return FUND_KINDS.filter(kind => !present.has(kind)).map(kind => FUND_TITLES[kind]).join(', ');
  }

  fundAmount(value: number | null, unit: FundLine['unit']): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return 'לא מופיע';
    return formatFundValue(Number(value), unit);
  }

  setDate(field: 'startDate' | 'endDate', value: string): void {
    this.form[field] = value;
    this.refreshMarks();
  }

  onSalary(raw: string): void {
    const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
    this.form.monthlySalary = digits ? Number(digits) : 0;
    this.salaryText = groupDigits(digits);
    this.refreshMarks();
  }

  onVacation(raw: string): void {
    const cleaned = sanitizeAmount(raw, true);
    this.vacationText = cleaned.text;
    this.form.vacationBalanceDays = cleaned.value;
  }

  onRec(raw: string): void {
    const cleaned = sanitizeAmount(raw, true);
    this.recText = cleaned.text;
    this.form.recuperationDaysPaidLastYear = cleaned.value;
  }

  fieldState(field: 'startDate' | 'endDate' | 'monthlySalary'): 'valid' | 'invalid' | '' {
    if (!this.checked()) return '';
    return this.problem(field) ? 'invalid' : 'valid';
  }

  refreshMarks(): void {
    if (!this.checked()) return;
    const errors = this.collectErrors();
    this.fieldErrors.set(errors);
    this.error.set('');
  }

  back(): void {
    this.saveForm();
    void this.router.navigateByUrl('/reason');
  }

  private saveForm(): void {
    const f = this.form;
    this.store.profile.set({
      ...f,
      monthlySalary: Number(f.monthlySalary) || 0,
      jobPercent: Number(f.jobPercent) || 100,
      vacationBalanceDays: Number(f.vacationBalanceDays) || 0,
      recuperationDaysPaidLastYear: Number(f.recuperationDaysPaidLastYear) || 0,
      hasStudyFund: !!f.hasStudyFund
    });
  }

  private problem(field: 'startDate' | 'endDate' | 'monthlySalary'): string | null {
    const f = this.form;
    if (field === 'startDate') {
      if (!f.startDate) return 'חסר תאריך התחלה.';
      if (f.startDate > this.today) return START_IN_FUTURE;
    }
    if (field === 'endDate' && !f.endDate) return 'חסר תאריך סיום.';
    if (field === 'monthlySalary' && !(Number(f.monthlySalary) > 0)) return 'חסר שכר.';
    return null;
  }

  private collectErrors(): Partial<Record<string, string>> {
    const errors: Partial<Record<string, string>> = {};
    for (const field of ['startDate', 'endDate', 'monthlySalary'] as const) {
      const message = this.problem(field);
      if (message) errors[field] = message;
    }
    return errors;
  }

  async submit(): Promise<void> {
    this.checked.set(true);
    const errors = this.collectErrors();
    this.fieldErrors.set(errors);
    if (Object.keys(errors).length > 0) {
      this.error.set('');
      return;
    }
    const f = this.form;
    this.store.profile.set({
      ...f,
      monthlySalary: Number(f.monthlySalary),
      jobPercent: Number(f.jobPercent) || 100,
      vacationBalanceDays: Number(f.vacationBalanceDays) || 0,
      recuperationDaysPaidLastYear: Number(f.recuperationDaysPaidLastYear) || 0
    });
    this.busy.set(true);
    this.error.set('');
    this.fieldErrors.set({});
    try {
      await this.facade.calculate();
      await this.router.navigateByUrl('/results/summary');
    } catch (err) {
      const e = describeError(err);
      this.error.set(e.message);
      this.fieldErrors.set(e.fields);
    } finally {
      this.busy.set(false);
    }
  }
}

const START_IN_FUTURE = 'תאריך ההתחלה לא יכול להיות אחרי היום.';

const FUND_TITLES: Record<FundKind, string> = {
  pension: 'פנסיה',
  severance: 'הפרשת פיצויים',
  disability: 'אובדן כושר עבודה',
  study: 'קרן השתלמות'
};
const FUND_KINDS = Object.keys(FUND_TITLES) as FundKind[];

function recDisplay(value: number, filled: boolean): string {
  if (value === 0 && filled) return '0';
  return displayGrouped(value, true);
}

function formatFundValue(value: number, unit: FundLine['unit']): string {
  const [whole, fraction] = String(value).split('.');
  const text = `${groupDigits(whole)}${fraction ? `.${fraction}` : ''}`;
  if (unit === 'percent') return `${text}%`;
  if (unit === 'amount') return `₪${text}`;
  return text;
}

function localToday(): string {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function displayGrouped(value: number, allowFraction: boolean): string {
  if (!(value > 0)) return '';
  const [whole, fraction] = String(value).split('.');
  const grouped = groupDigits(whole);
  return allowFraction && fraction ? `${grouped}.${fraction}` : grouped;
}

function sanitizeAmount(raw: string, allowFraction: boolean): { text: string; value: number } {
  let body = raw.replace(/[^\d.]/g, '');
  if (!allowFraction) body = body.replace(/\./g, '');
  const dot = body.indexOf('.');
  if (dot >= 0) body = body.slice(0, dot + 1) + body.slice(dot + 1).replace(/\./g, '');
  let [whole, fraction] = body.split('.');
  whole = whole.replace(/^0+(?=\d)/, '');
  if (!allowFraction) whole = whole.replace(/^0+/, '');
  if (fraction !== undefined) fraction = fraction.slice(0, 2);
  const text = fraction !== undefined ? `${groupDigits(whole) || '0'}.${fraction}` : groupDigits(whole);
  const value = text === '' || text === '.' ? 0 : Number(text.replace(/,/g, ''));
  return { text, value: Number.isFinite(value) ? value : 0 };
}
