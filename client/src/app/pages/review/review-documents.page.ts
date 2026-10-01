import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonButton, IonCheckbox, IonInput, IonItem, IonList, IonSelect, IonSelectOption } from '@ionic/angular/standalone';
import { DOC_CHECKLIST } from '../../core/review.models';
import { ReviewStore } from '../../core/review.store';

@Component({
  selector: 'app-review-documents',
  standalone: true,
  imports: [FormsModule, IonButton, IonInput, IonItem, IonList, IonSelect, IonSelectOption, IonCheckbox],
  styles: [`
    .card { border: 1px solid var(--rs-line, #ddd); border-radius: 12px; padding: 12px; margin: 10px 0; }
    .miss { color: var(--ion-color-warning-shade); }
    .ok { color: var(--ion-color-success); }
  `],
  template: `
    <h2>מרכז מסמכים</h2>
    <p class="muted">העלו או סמנו מה יש לכם. אפשר להמשיך גם עם מידע חלקי — נסמן במפורש מה חסר.</p>

    <h3>מה עדיין חסר</h3>
    <ul>
      @for (d of missing(); track d.key) {
        <li class="miss">☐ {{ d.label }}</li>
      }
      @for (d of present(); track d.key) {
        <li class="ok">☑ {{ d.label }}</li>
      }
    </ul>

    <div class="card">
      <h3>הוספת מסמך</h3>
      <ion-list>
        <ion-item>
          <ion-select label="סוג" labelPlacement="stacked" [(ngModel)]="docType" interface="popover">
            <ion-select-option value="payslip">תלוש שכר</ion-select-option>
            <ion-select-option value="form106">טופס 106</ion-select-option>
            <ion-select-option value="pension_report">דוח פנסיה</ion-select-option>
            <ion-select-option value="study_report">דוח השתלמות</ion-select-option>
            <ion-select-option value="managers_report">ביטוח מנהלים</ion-select-option>
            <ion-select-option value="balance_report">יתרות</ion-select-option>
            <ion-select-option value="termination">סיום העסקה</ion-select-option>
            <ion-select-option value="fees">דמי ניהול</ion-select-option>
            <ion-select-option value="returns">תשואות</ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item><ion-input type="number" label="שנה" labelPlacement="stacked" [(ngModel)]="year"></ion-input></ion-item>
        <ion-item><ion-input type="number" label="חודש (אופציונלי)" labelPlacement="stacked" [(ngModel)]="month"></ion-input></ion-item>
        <ion-item><ion-input label="סיכום שחולץ / הערה" labelPlacement="stacked" [(ngModel)]="summary"></ion-input></ion-item>
        <ion-item><ion-checkbox [(ngModel)]="parsedOk">נקרא בהצלחה</ion-checkbox></ion-item>
        <ion-item><ion-checkbox [(ngModel)]="needsManual">נדרשת בדיקה ידנית</ion-checkbox></ion-item>
      </ion-list>
      <ion-button (click)="add()">שמירת מטא־דאטה</ion-button>
    </div>

    <h3>מסמכים שנקלטו</h3>
    @for (d of store.review()?.documents ?? []; track d.id) {
      <div class="card">
        <b>{{ d.documentType }}</b>
        <div class="muted small">{{ d.year }}{{ d.month ? '/' + d.month : '' }} · {{ d.parsedOk ? 'נקרא' : 'לא נקרא' }}
          {{ d.needsManualReview ? '· לבדיקה ידנית' : '' }}</div>
        <div>{{ d.extractedSummary || '—' }}</div>
      </div>
    }

    <ion-button expand="block" class="ion-margin-top" (click)="next()">המשך להיסטוריית שכר</ion-button>
  `
})
export class ReviewDocumentsPage {
  readonly store = inject(ReviewStore);
  private readonly router = inject(Router);

  docType = 'payslip';
  year: number | null = 2024;
  month: number | null = null;
  summary = '';
  parsedOk = true;
  needsManual = false;

  readonly present = computed(() => {
    const types = new Set((this.store.review()?.documents ?? []).map(d => d.documentType));
    return DOC_CHECKLIST.filter(d => types.has(d.key));
  });
  readonly missing = computed(() => {
    const types = new Set((this.store.review()?.documents ?? []).map(d => d.documentType));
    return DOC_CHECKLIST.filter(d => !types.has(d.key));
  });

  add(): void {
    if (!this.store.review()) {
      // ensure shell period exists
      this.store.setPeriod({
        employerName: '',
        startDate: '2016-01-01',
        endDate: '2025-12-31',
        sameEmployerThroughout: true,
        exitReason: 'Fired',
        hadWorkBreak: false,
        multiplePeriods: false
      });
    }
    this.store.addDocument({
      documentType: this.docType,
      year: this.year,
      month: this.month,
      source: 'manual',
      parsedOk: this.parsedOk,
      extractedSummary: this.summary || null,
      needsManualReview: this.needsManual
    });
    this.summary = '';
  }

  next(): void {
    void this.router.navigateByUrl('/review/salary');
  }
}
