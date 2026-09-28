import { DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonLabel, IonSegment, IonSegmentButton } from '@ionic/angular/standalone';
import { WizardStore } from '../core/wizard.store';

@Component({
  selector: 'app-summary',
  standalone: true,
  imports: [DecimalPipe, IonContent, IonSegment, IonSegmentButton, IonLabel, IonButton],
  styles: [`
    .total { margin: 8px 0 18px; padding: 18px 0 16px; border-top: 2px solid var(--ion-text-color); border-bottom: 1px solid var(--rs-line); }
    .num { font-family: var(--rs-serif); font-size: 50px; font-weight: 700; line-height: 1; }
    .num small { font-size: 26px; }
    .item { padding: 14px 0; border-bottom: 1px solid var(--rs-line); }
    .top { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
    .name { font-weight: 700; }
    .amt { font-family: var(--rs-serif); font-size: 21px; white-space: nowrap; }
    .how { font-size: 14px; color: var(--ion-color-medium); margin-top: 2px; }
    .basis { margin: 18px 0 6px; padding: 12px 14px; border-radius: 12px; background: var(--rs-soft); font-size: 14.5px; }
  `],
  template: `
    <ion-content class="ion-padding">
      <div class="page">
        @if (store.results().length > 1) {
          <ion-segment [value]="store.activeIndex()" (ionChange)="store.activeIndex.set(+($any($event).detail.value))">
            <ion-segment-button [value]="0"><ion-label>אם אפוטר</ion-label></ion-segment-button>
            <ion-segment-button [value]="1"><ion-label>אם אתפטר</ion-label></ion-segment-button>
          </ion-segment>
        }
        @if (store.active(); as r) {
          <h2>{{ store.results().length > 1 ? (store.activeIndex() === 0 ? 'אם תפוטרו' : 'אם תתפטרו') : 'מה מגיע לכם' }}</h2>
          <div class="total">
            <div class="muted small">סה"כ משוער מהמעסיק בגמר החשבון</div>
            <div class="num"><small>₪</small>{{ r.estimatedTotal | number:'1.0-0' }}</div>
            <div class="muted small">ותק: {{ r.seniorityYears | number:'1.1-1' }} שנים</div>
          </div>

          @for (c of r.components; track c.code) {
            <div class="item">
              <div class="top">
                <span class="name">{{ c.title }}</span>
                <span class="amt">{{ c.amount !== null ? '₪' + (c.amount | number:'1.0-0') : c.displayValue }}</span>
              </div>
              <div class="how">{{ c.explanation }}</div>
              @if (c.flag) { <span class="flag">{{ c.flag }}</span> }
            </div>
          }
          @for (a of r.advisories; track a) { <div class="note">{{ a }}</div> }

          <div class="basis">
            <b>{{ store.fromPayslip() ? 'חישוב ראשוני לפי התלוש' + (store.payslipMonth() ? ' (' + store.payslipMonth() + ')' : '') : 'החישוב לפי הנתונים שהזנתם' }}</b><br>
            שכר ₪{{ store.profile().monthlySalary | number:'1.0-0' }}, משרה {{ store.profile().jobPercent }}%,
            התחלה {{ store.profile().startDate }}, סיום {{ store.profile().endDate }}, חופשה {{ store.profile().vacationBalanceDays }} ימים
            <ion-button fill="clear" size="small" (click)="edit()">משהו לא נכון? לתקן נתונים</ion-button>
          </div>
          <p class="muted small">ערך יום הבראה: ₪{{ r.recuperationDayValue }} (בתוקף מ-{{ r.valuesValidFrom }}). ברוטו, לפני מס. הערכה, לא ייעוץ משפטי.</p>
        } @else {
          <p>עוד אין חישוב. <ion-button fill="clear" (click)="restart()">להתחיל</ion-button></p>
        }
      </div>
    </ion-content>
  `
})
export class SummaryPage {
  readonly store = inject(WizardStore);
  private readonly router = inject(Router);

  edit(): void { this.router.navigateByUrl('/details'); }
  restart(): void { this.store.reset(); this.router.navigateByUrl('/'); }
}
