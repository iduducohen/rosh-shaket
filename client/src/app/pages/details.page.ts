import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonInput, IonItem, IonList,
  IonSegment, IonSegmentButton, IonSelect, IonSelectOption, IonSpinner, IonToolbar, IonLabel, IonNote
} from '@ionic/angular/standalone';
import { describeError } from '../core/api.service';
import { CalculationFacade } from '../core/calculation.facade';
import { ProfileDto } from '../core/models';
import { WizardStore } from '../core/wizard.store';

@Component({
  selector: 'app-details',
  standalone: true,
  imports: [FormsModule, IonHeader, IonToolbar, IonButtons, IonBackButton, IonContent, IonList, IonItem, IonInput,
    IonSelect, IonSelectOption, IonSegment, IonSegmentButton, IonButton, IonSpinner, IonLabel, IonNote],
  styles: [`
    ion-item { --background: transparent; }
    .seg-label { font-weight: 600; margin: 16px 0 6px; display: block; }
  `],
  template: `
    <ion-header class="ion-no-border"><ion-toolbar><ion-buttons slot="start"><ion-back-button defaultHref="/reason" text="חזרה"></ion-back-button></ion-buttons></ion-toolbar></ion-header>
    <ion-content class="ion-padding">
      <div class="page">
        <h2>פרטי ההעסקה</h2>
        <p class="muted small">{{ store.fromPayslip() ? 'השדות המסומנים מולאו מהתלוש. עברו עליהם ותקנו אם צריך.' : 'הכל מופיע בתלוש השכר האחרון.' }}</p>

        <ion-list lines="full">
          <ion-item [class.filled]="isFilled('startDate')">
            <ion-input label="תאריך התחלה" labelPlacement="stacked" type="date" [(ngModel)]="form.startDate" name="startDate"
                       [class.filled-label]="isFilled('startDate')" [errorText]="fieldErrors()['startDate'] ?? ''"></ion-input>
          </ion-item>
          <ion-item>
            <ion-input label="תאריך סיום" labelPlacement="stacked" type="date" [(ngModel)]="form.endDate" name="endDate"
                       [errorText]="fieldErrors()['endDate'] ?? ''"></ion-input>
          </ion-item>
          <ion-item [class.filled]="isFilled('monthlySalary')">
            <ion-input label="שכר חודשי ברוטו (₪)" labelPlacement="stacked" type="number" inputmode="numeric" [(ngModel)]="form.monthlySalary"
                       name="salary" helperText="שכר היסוד, בלי שעות נוספות והחזרים" [errorText]="fieldErrors()['monthlySalary'] ?? ''"></ion-input>
          </ion-item>
          <ion-item [class.filled]="isFilled('jobPercent')">
            <ion-input label="היקף משרה (%)" labelPlacement="stacked" type="number" inputmode="numeric" [(ngModel)]="form.jobPercent" name="pct"></ion-input>
          </ion-item>
          <ion-item [class.filled]="isFilled('workWeek')">
            <ion-select label="ימי עבודה בשבוע" labelPlacement="stacked" [(ngModel)]="form.workDaysPerWeek" name="days" interface="popover">
              <ion-select-option [value]="5">5</ion-select-option>
              <ion-select-option [value]="6">6</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item [class.filled]="isFilled('vacationBalanceDays')">
            <ion-input label="יתרת ימי חופשה" labelPlacement="stacked" type="number" inputmode="decimal" [(ngModel)]="form.vacationBalanceDays" name="vac"></ion-input>
          </ion-item>
          <ion-item [class.filled]="isFilled('recuperationDaysPaidLastYear')">
            <ion-input label="ימי הבראה ששולמו בשנה האחרונה" labelPlacement="stacked" type="number" inputmode="decimal"
                       [(ngModel)]="form.recuperationDaysPaidLastYear" name="rec"></ion-input>
          </ion-item>
        </ion-list>

        <span class="seg-label">יש לכם סעיף 14? @if (isFilled('section14')) { <ion-note color="primary">לפי שיעור הפיצויים בתלוש – לבדוק בחוזה</ion-note> }</span>
        <ion-segment [(ngModel)]="form.section14" name="s14">
          <ion-segment-button value="Full"><ion-label>8.33%</ion-label></ion-segment-button>
          <ion-segment-button value="Partial6"><ion-label>6%</ion-label></ion-segment-button>
          <ion-segment-button value="None"><ion-label>אין</ion-label></ion-segment-button>
          <ion-segment-button value="Unknown"><ion-label>לא יודע</ion-label></ion-segment-button>
        </ion-segment>

        <span class="seg-label">קרן השתלמות דרך העבודה?</span>
        <ion-segment [(ngModel)]="form.hasStudyFund" name="fund">
          <ion-segment-button [value]="true"><ion-label>כן</ion-label></ion-segment-button>
          <ion-segment-button [value]="false"><ion-label>לא</ion-label></ion-segment-button>
        </ion-segment>

        @if (error()) { <div class="note">{{ error() }}</div> }
        <ion-button expand="block" class="ion-margin-top" [disabled]="busy()" (click)="submit()">
          @if (busy()) { <ion-spinner name="crescent"></ion-spinner> } @else { מה מגיע לי }
        </ion-button>
      </div>
    </ion-content>
  `
})
export class DetailsPage {
  readonly store = inject(WizardStore);
  private readonly facade = inject(CalculationFacade);
  private readonly router = inject(Router);

  form: ProfileDto = { ...this.store.profile() };
  readonly busy = signal(false);
  readonly error = signal('');
  readonly fieldErrors = signal<Partial<Record<string, string>>>({});

  isFilled(field: string): boolean {
    return this.store.filledFields().includes(field);
  }

  async submit(): Promise<void> {
    const f = this.form;
    if (!f.startDate || !f.endDate || !(Number(f.monthlySalary) > 0)) {
      this.error.set('חסרים תאריך התחלה, תאריך סיום או שכר.');
      return;
    }
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
