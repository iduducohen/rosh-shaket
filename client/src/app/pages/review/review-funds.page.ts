import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonButton, IonInput, IonItem, IonList, IonSelect, IonSelectOption } from '@ionic/angular/standalone';
import { FundAccount, FundKind } from '../../core/review.models';
import { ReviewStore } from '../../core/review.store';

@Component({
  selector: 'app-review-funds',
  standalone: true,
  imports: [FormsModule, IonButton, IonInput, IonItem, IonList, IonSelect, IonSelectOption],
  styles: [`.card { border:1px solid var(--rs-line,#ddd); border-radius:12px; padding:12px; margin:8px 0; }`],
  template: `
    <h2>מצב נוכחי בקופות</h2>
    <p class="muted">הזינו יתרות מדוחות הקופות. זה <b>לא</b> מחליף את בדיקת ההפקדות החודשיות.</p>
    <ion-list>
      <ion-item>
        <ion-select label="סוג קופה" labelPlacement="stacked" [(ngModel)]="kind" interface="popover">
          <ion-select-option value="Pension">פנסיה</ion-select-option>
          <ion-select-option value="Severance">פיצויים בקופה</ion-select-option>
          <ion-select-option value="Study">קרן השתלמות</ion-select-option>
          <ion-select-option value="Managers">ביטוח מנהלים</ion-select-option>
        </ion-select>
      </ion-item>
      <ion-item><ion-input label="גוף מנהל" labelPlacement="stacked" [(ngModel)]="provider"></ion-input></ion-item>
      <ion-item><ion-input type="number" label="יתרה נוכחית" labelPlacement="stacked" [(ngModel)]="balance"></ion-input></ion-item>
      <ion-item><ion-input type="date" label="תאריך הדוח" labelPlacement="stacked" [(ngModel)]="asOf"></ion-input></ion-item>
      <ion-item><ion-input type="number" label="דמי ניהול שנתיים %" labelPlacement="stacked" [(ngModel)]="fee"></ion-input></ion-item>
      <ion-item><ion-input type="number" label="תשואה שנתית % (אם ידועה)" labelPlacement="stacked" [(ngModel)]="ret"></ion-input></ion-item>
      <ion-item><ion-input label="מסלול" labelPlacement="stacked" [(ngModel)]="track"></ion-input></ion-item>
    </ion-list>
    <ion-button (click)="add()">הוספת קופה</ion-button>

    @for (f of store.review()?.funds ?? []; track f.id) {
      <div class="card">
        <b>{{ f.kind }}</b> · {{ f.provider || '—' }}
        <div>יתרה: {{ store.fmt(f.balance) }} ({{ f.asOf || 'ללא תאריך' }})</div>
        <div class="muted small">דמי ניהול {{ f.feeAnnualPercent ?? '—' }}% · תשואה {{ f.returnAnnualPercent ?? '—' }}% · ביטחון {{ f.confidence }}</div>
      </div>
    }

    <ion-button expand="block" class="ion-margin-top" (click)="next()">ללוח המצב</ion-button>
  `
})
export class ReviewFundsPage {
  readonly store = inject(ReviewStore);
  private readonly router = inject(Router);

  kind: FundKind = 'Pension';
  provider = '';
  balance: number | null = null;
  asOf = '';
  fee: number | null = 0.5;
  ret: number | null = null;
  track = '';

  add(): void {
    const r = this.store.review();
    if (!r) return;
    const fund: FundAccount = {
      id: crypto.randomUUID(),
      workspaceId: r.workspaceId,
      kind: this.kind,
      balance: this.balance,
      asOf: this.asOf || null,
      provider: this.provider || null,
      feeAnnualPercent: this.fee,
      returnAnnualPercent: this.ret,
      track: this.track || null,
      confidence: this.balance != null ? 'Medium' : 'Low'
    };
    this.store.setFunds([...(r.funds.filter(f => f.kind !== fund.kind)), fund]);
  }

  async next(): Promise<void> {
    await this.store.fillExpectedFromServer();
    await this.store.analyze();
    await this.router.navigateByUrl('/review/dashboard');
  }
}
