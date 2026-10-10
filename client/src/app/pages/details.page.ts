import { DecimalPipe } from '@angular/common';
import { Component, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonList,
  IonSegment, IonSegmentButton, IonSpinner, IonToggle, IonToolbar, IonLabel
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';
import { DateFieldComponent, END_TOO_FAR, END_TOO_SOON, earliestEndDate, latestEndDate, latestStartDate } from '../core/date-field.component';
import { DeskHeaderComponent } from '../core/desk-header.component';
import { describeError } from '../core/api.service';
import { CalculationFacade } from '../core/calculation.facade';
import { FundKind, FundLine, PayType, ProfileDto, hourlyMonthly } from '../core/models';
import { WizardStore } from '../core/wizard.store';
import { SiteFooterComponent } from '../core/site-footer.component';

type CheckedField = 'startDate' | 'endDate' | 'monthlySalary' | 'hourlyRate' | 'averageMonthlyHours';

@Component({
  selector: 'app-details',
  standalone: true,
  imports: [SiteFooterComponent, DateFieldComponent, DeskHeaderComponent, FormsModule, IonHeader, IonToolbar, IonButtons, IonBackButton, IonContent, IonList, IonItem, IonInput,
    IonSegment, IonSegmentButton, IonButton, IonIcon, IonSpinner, IonToggle, IonLabel, DecimalPipe],
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
    .pay-type { margin: 0 0 14px; }
    .s14-from { margin-top: 10px; max-width: 420px; }
    .pay-type ion-segment { max-width: 520px; }
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
    /* The title and close button stay in view; only .sheet-body scrolls. */
    .sheet {
      width: min(560px, 100%); max-height: min(85vh, 720px);
      display: flex; flex-direction: column; overflow: hidden;
      background: var(--ion-background-color); color: var(--ion-text-color);
      border-radius: 18px; box-shadow: 0 18px 50px rgba(0, 0, 0, .28);
    }
    .sheet-head {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      flex: none; padding: 14px 18px 10px; border-bottom: 1px solid var(--rs-line);
    }
    .sheet-body {
      flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
      padding: 0 18px calc(16px + env(safe-area-inset-bottom, 0px));
    }
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

        <div class="pay-type" [class.filled]="isFilled('hourlyRate') || isFilled('globalOvertime')">
          <span class="seg-label" id="pay-type-label">איך משולם השכר? @if (isFilled('hourlyRate') || isFilled('globalOvertime')) { <span class="from-slip">· מהתלוש</span> }</span>
          <ion-segment [(ngModel)]="payType" name="payType" aria-labelledby="pay-type-label" (ionChange)="refreshMarks()">
            <ion-segment-button value="Monthly"><ion-label>שכר חודשי קבוע</ion-label></ion-segment-button>
            <ion-segment-button value="Global"><ion-label>גלובלי</ion-label></ion-segment-button>
            <ion-segment-button value="Hourly"><ion-label>לפי שעות</ion-label></ion-segment-button>
          </ion-segment>
          @if (payType === 'Hourly') {
            <p class="field-hint">אצל עובד שעתי החוק קובע חישוב אחר להודעה המוקדמת, לשכר הקובע לפיצויים ולהיקף המשרה.</p>
          }
          @if (payType === 'Global') {
            <p class="field-hint">שכר גלובלי הוא שכר חודשי קבוע שכולל תשלום על שעות נוספות, בלי קשר למספר השעות בפועל. הפיצויים, החופשה וההפרשות מחושבים לפי שכר היסוד בלבד, ולכן מפרידים בין השניים.</p>
          }
        </div>

        <ion-list lines="none" class="desk-grid-2">
          <app-date-field label="תאריך התחלה" [value]="form.startDate" [max]="latestStart" [filled]="isFilled('startDate')"
                          [state]="fieldState('startDate')" [error]="fieldErrors()['startDate'] ?? ''"
                          (valueChange)="setDate('startDate', $event)"></app-date-field>
          <app-date-field label="תאריך סיום" [value]="form.endDate" [min]="earliestEnd()" [max]="latestEnd" [filled]="isFilled('endDate')"
                          [state]="fieldState('endDate')" [error]="fieldErrors()['endDate'] ?? ''"
                          (valueChange)="setDate('endDate', $event)"></app-date-field>
          @if (payType === 'Hourly') {
            <div>
              <ion-item [class.filled]="isFilled('hourlyRate')" [class.field-invalid]="fieldState('hourlyRate') === 'invalid'" [class.field-valid]="fieldState('hourlyRate') === 'valid'">
                <ion-input [label]="slipLabel('תעריף לשעה (₪)', 'hourlyRate')" labelPlacement="stacked" type="number" inputmode="decimal" min="0" step="0.01"
                           [(ngModel)]="form.hourlyRate" name="rate"
                           [class.ion-invalid]="!!fieldErrors()['hourlyRate']" [class.ion-touched]="!!fieldErrors()['hourlyRate']"
                           [errorText]="fieldErrors()['hourlyRate'] ?? ''" (ngModelChange)="refreshMarks()"></ion-input>
              </ion-item>
              <p class="field-hint">התעריף האחרון, כפי שמופיע בתלוש האחרון</p>
            </div>
            <div>
              <ion-item [class.filled]="isFilled('averageMonthlyHours')" [class.field-invalid]="fieldState('averageMonthlyHours') === 'invalid'" [class.field-valid]="fieldState('averageMonthlyHours') === 'valid'">
                <ion-input [label]="slipLabel('ממוצע שעות בחודש', 'averageMonthlyHours')" labelPlacement="stacked" type="number" inputmode="decimal" min="0" max="300"
                           [(ngModel)]="form.averageMonthlyHours" name="hours"
                           [class.ion-invalid]="!!fieldErrors()['averageMonthlyHours']" [class.ion-touched]="!!fieldErrors()['averageMonthlyHours']"
                           [errorText]="fieldErrors()['averageMonthlyHours'] ?? ''" (ngModelChange)="refreshMarks()"></ion-input>
              </ion-item>
              <p class="field-hint">
                ממוצע על כל תקופת העבודה, בלי שעות נוספות. משרה מלאה היא 182 שעות.
                @if (isFilled('averageMonthlyHours')) { בתלוש מופיעות השעות של חודש אחד — עדכנו אם הממוצע שונה. }
                @if (hourlySummary(); as h) { <b>שכר חודשי ממוצע: ₪{{ h.monthlySalary | number:'1.0-0' }} · היקף משרה {{ h.jobPercent | number:'1.0-0' }}%</b> }
              </p>
            </div>
          } @else {
            <div>
              <ion-item [class.filled]="isFilled('monthlySalary')" [class.field-invalid]="fieldState('monthlySalary') === 'invalid'" [class.field-valid]="fieldState('monthlySalary') === 'valid'">
                <ion-input [label]="slipLabel('שכר חודשי ברוטו (₪)', 'monthlySalary')" labelPlacement="stacked" type="text" inputmode="numeric" [ngModel]="salaryText" name="salary"
                           [class.ion-invalid]="!!fieldErrors()['monthlySalary']" [class.ion-touched]="!!fieldErrors()['monthlySalary']"
                           [errorText]="fieldErrors()['monthlySalary'] ?? ''" (ngModelChange)="onSalary($event)"></ion-input>
              </ion-item>
              <p class="field-hint">
                השכר הקובע: שכר היסוד ועוד תוספות קבועות (ותק, יוקר, משפחה, משמרות). בעמלות קבועות מזינים ממוצע של 12 החודשים האחרונים.
                בלי שעות נוספות, בונוסים חד-פעמיים והחזרי הוצאות.
                @if (isFilled('monthlySalary')) { מהתלוש נקרא שכר היסוד בלבד — הוסיפו תוספות קבועות אם יש. }
              </p>
            </div>
            @if (payType === 'Global') {
              <div>
                <ion-item [class.filled]="isFilled('globalOvertime')">
                  <ion-input [label]="slipLabel('שעות נוספות גלובליות בחודש (₪)', 'globalOvertime')" labelPlacement="stacked" type="number" inputmode="decimal" min="0"
                             [(ngModel)]="form.globalOvertime" name="globalOvertime"></ion-input>
                </ion-item>
                <p class="field-hint">
                  הסכום בשורה «שעות נוספות גלובליות» או «תוספת גלובלית» בתלוש. אם בתלוש יש רק שורת שכר אחת, בלי הפרדה, השאירו 0 והזינו את כל השכר בשדה שכר היסוד.
                  @if (globalTotal(); as total) { <b>סך הכל בחודש: ₪{{ total | number:'1.0-0' }}</b> }
                </p>
              </div>
            }
            <ion-item [class.filled]="isFilled('jobPercent')">
              <ion-input [label]="slipLabel('היקף משרה (%)', 'jobPercent')" labelPlacement="stacked" type="number" inputmode="numeric" [(ngModel)]="form.jobPercent" name="pct"></ion-input>
            </ion-item>
          }
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
          <ion-item [class.field-invalid]="!!fieldErrors()['lastRecuperationPaid']">
            <ion-input label="מתי שולמה ההבראה בפעם האחרונה? (לא חובה)" labelPlacement="stacked" type="month" name="recPaid"
                       [max]="form.endDate.slice(0, 7)" [ngModel]="recPaidMonth()" (ngModelChange)="onRecPaid($event)"
                       [class.ion-invalid]="!!fieldErrors()['lastRecuperationPaid']" [class.ion-touched]="!!fieldErrors()['lastRecuperationPaid']"
                       [errorText]="fieldErrors()['lastRecuperationPaid'] ?? ''"
                       helperText="החודש שבו הופיעה בתלוש. נחשב את החלק היחסי שמגיע מאז, במקום לפי ימים"></ion-input>
          </ion-item>
          <ion-item [class.field-invalid]="!!fieldErrors()['unpaidLeaveMonths']">
            <ion-input label='חודשי חל"ת בתקופת העבודה (לא חובה)' labelPlacement="stacked" type="number" inputmode="decimal" min="0" step="0.5"
                       [(ngModel)]="form.unpaidLeaveMonths" name="unpaidLeave"
                       [class.ion-invalid]="!!fieldErrors()['unpaidLeaveMonths']" [class.ion-touched]="!!fieldErrors()['unpaidLeaveMonths']"
                       [errorText]="fieldErrors()['unpaidLeaveMonths'] ?? ''" (ngModelChange)="refreshMarks()"
                       helperText="חופשה ללא תשלום. מעבר ל-14 יום בשנה היא לא נספרת בוותק לפיצויים"></ion-input>
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
          @if (form.section14 === 'Full' || form.section14 === 'Partial6') {
            <ion-item class="s14-from" [class.field-invalid]="!!fieldErrors()['section14From']">
              <ion-input label="ממתי חל סעיף 14? (לא חובה)" labelPlacement="stacked" type="month" name="s14From"
                         [min]="form.startDate.slice(0, 7)" [max]="form.endDate.slice(0, 7)"
                         [ngModel]="section14FromMonth()" (ngModelChange)="onSection14From($event)"
                         [class.ion-invalid]="!!fieldErrors()['section14From']" [class.ion-touched]="!!fieldErrors()['section14From']"
                         [errorText]="fieldErrors()['section14From'] ?? ''"
                         helperText="ממלאים רק אם ההסדר התחיל אחרי תחילת העבודה, למשל למי שהתחיל לפני 2008. על התקופה שלפני כן מגיעים פיצויים מלאים"></ion-input>
            </ion-item>
          }
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
        <div class="desk-actions sticky-actions">
          <ion-button fill="outline" (click)="back()">חזרה</ion-button>
          <ion-button [disabled]="busy()" (click)="submit()">
            @if (busy()) { <ion-spinner name="crescent"></ion-spinner> } @else { חישוב מה מגיע לי }
          </ion-button>
        </div>
      </div>
      <app-site-footer></app-site-footer>
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
          <div class="sheet-body">
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
      </div>
    }
  `
})
export class DetailsPage {
  readonly store = inject(WizardStore);
  private readonly facade = inject(CalculationFacade);
  private readonly router = inject(Router);

  form: ProfileDto = { ...this.store.profile() };
  /** Monthly salary, or hourly ("עובד בשכר") — the law computes notice, severance salary and job scope differently. */
  payType: PayType = this.form.payType ?? 'Monthly';
  readonly workDays = [1, 2, 3, 4, 5, 6] as const;
  salaryText = displayGrouped(this.form.monthlySalary, false);
  vacationText = displayGrouped(this.form.vacationBalanceDays, true);
  recText = recDisplay(this.form.recuperationDaysPaidLastYear, this.store.filledFields().includes('recuperationDaysPaidLastYear'));
  readonly today = localToday();
  readonly latestEnd = latestEndDate();
  readonly latestStart = latestStartDate();
  earliestEnd(): string | null { return earliestEndDate(this.form.startDate); }
  section14FromMonth(): string { return this.form.section14From?.slice(0, 7) ?? ''; }
  onSection14From(month: string | null): void {
    this.form.section14From = month ? month + '-01' : null;
    if (this.checked()) this.fieldErrors.set(this.collectErrors());
  }
  recPaidMonth(): string { return this.form.lastRecuperationPaid?.slice(0, 7) ?? ''; }
  onRecPaid(month: string | null): void {
    this.form.lastRecuperationPaid = month ? month + '-01' : null;
    if (this.checked()) this.fieldErrors.set(this.collectErrors());
  }
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
    this.payType = this.form.payType ?? 'Monthly';
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

  /** Base salary plus the global-overtime component, once both are filled. */
  globalTotal(): number | null {
    const base = Number(this.form.monthlySalary);
    const overtime = Number(this.form.globalOvertime);
    return base > 0 && overtime > 0 ? base + overtime : null;
  }

  /** What the rate and hours come to per month — shown under the hours field so the user can sanity-check it. */
  hourlySummary(): { monthlySalary: number; jobPercent: number } | null {
    const rate = Number(this.form.hourlyRate);
    const hours = Number(this.form.averageMonthlyHours);
    return rate > 0 && hours > 0 ? hourlyMonthly(rate, hours) : null;
  }

  fieldState(field: CheckedField): 'valid' | 'invalid' | '' {
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
    const hourly = this.payType === 'Hourly' ? this.hourlySummary() : null;
    this.store.profile.set({
      ...f,
      payType: this.payType,
      hourlyRate: this.payType === 'Hourly' ? Number(f.hourlyRate) || null : null,
      averageMonthlyHours: this.payType === 'Hourly' ? Number(f.averageMonthlyHours) || null : null,
      globalOvertime: this.payType === 'Global' ? Math.max(0, Number(f.globalOvertime) || 0) : null,
      // Hourly: the monthly figures are derived, so the screens that show a salary keep working.
      monthlySalary: hourly?.monthlySalary ?? (Number(f.monthlySalary) || 0),
      jobPercent: hourly?.jobPercent ?? (Number(f.jobPercent) || 100),
      vacationBalanceDays: Number(f.vacationBalanceDays) || 0,
      recuperationDaysPaidLastYear: Number(f.recuperationDaysPaidLastYear) || 0,
      lastRecuperationPaid: f.lastRecuperationPaid || null,
      unpaidLeaveMonths: Math.max(0, Number(f.unpaidLeaveMonths) || 0),
      section14From: (f.section14 === 'Full' || f.section14 === 'Partial6') && f.section14From ? f.section14From : null,
      hasStudyFund: !!f.hasStudyFund
    });
  }

  private problem(field: CheckedField): string | null {
    const f = this.form;
    if (field === 'startDate') {
      if (!f.startDate) return 'חסר תאריך התחלה.';
      if (f.startDate > this.today) return START_IN_FUTURE;
    }
    if (field === 'endDate') {
      if (!f.endDate) return 'חסר תאריך סיום.';
      if (f.endDate > this.latestEnd) return END_TOO_FAR;
      const earliest = earliestEndDate(f.startDate);
      if (earliest && f.endDate < earliest) return END_TOO_SOON;
    }
    const hourly = this.payType === 'Hourly';
    if (field === 'monthlySalary' && !hourly && !(Number(f.monthlySalary) > 0)) return 'חסר שכר.';
    if (field === 'hourlyRate' && hourly && !(Number(f.hourlyRate) > 0)) return 'חסר תעריף לשעה.';
    if (field === 'averageMonthlyHours' && hourly) {
      const hours = Number(f.averageMonthlyHours);
      if (!(hours > 0)) return 'חסר ממוצע שעות בחודש.';
      if (hours > 300) return 'עד 300 שעות בחודש.';
    }
    return null;
  }

  private collectErrors(): Partial<Record<string, string>> {
    const errors: Partial<Record<string, string>> = {};
    for (const field of ['startDate', 'endDate', 'monthlySalary', 'hourlyRate', 'averageMonthlyHours'] as const) {
      const message = this.problem(field);
      if (message) errors[field] = message;
    }
    const recPaid = this.form.lastRecuperationPaid;
    if (recPaid && this.form.endDate && recPaid > this.form.endDate) errors['lastRecuperationPaid'] = 'החודש צריך להיות לפני תאריך הסיום.';
    const leave = Number(this.form.unpaidLeaveMonths) || 0;
    if (leave < 0) errors['unpaidLeaveMonths'] = 'מספר החודשים לא יכול להיות שלילי.';
    else if (leave > 0 && this.form.startDate && this.form.endDate && leave > monthsBetween(this.form.startDate, this.form.endDate)) {
      errors['unpaidLeaveMonths'] = 'החל"ת ארוך מתקופת העבודה.';
    }
    const s14From = this.form.section14From;
    if (s14From && this.form.endDate && s14From > this.form.endDate) errors['section14From'] = 'החודש צריך להיות לפני תאריך הסיום.';
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
    this.saveForm();
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

/** Whole and partial months between two yyyy-MM-dd dates. */
function monthsBetween(start: string, end: string): number {
  return (Date.parse(end) - Date.parse(start)) / (1000 * 60 * 60 * 24 * 30.4375);
}
