import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonButton, IonInput, IonItem, IonList, IonSelect, IonSelectOption } from '@ionic/angular/standalone';
import { FundAccount, FundKind } from '../../core/review.models';
import { ReviewStore } from '../../core/review.store';
import { ReviewStepNavComponent } from './review-step-nav.component';

const KIND_LABEL: Record<FundKind, string> = {
  Pension: 'פנסיה',
  Severance: 'פיצויים בקופה',
  Study: 'קרן השתלמות',
  Managers: 'ביטוח מנהלים'
};

@Component({
  selector: 'app-review-funds',
  standalone: true,
  imports: [FormsModule, IonButton, IonInput, IonItem, IonList, IonSelect, IonSelectOption, ReviewStepNavComponent],
  styles: [`
    .lead { color: var(--ion-color-primary); font-weight: 700; margin: 0 0 8px; }
    .hint { font-size: 13.5px; color: var(--ion-color-medium); margin: 0 0 14px; line-height: 1.45; }
    .card {
      border: 1.5px solid var(--rs-line); border-radius: 14px; padding: 14px 16px; margin: 0 0 10px;
      background: var(--ion-item-background);
    }
    .card.from-doc { border-color: color-mix(in srgb, var(--ion-color-success) 40%, var(--rs-line)); }
    .card.head { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
    .tag {
      font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px;
      background: rgba(var(--ion-color-success-rgb, 45, 170, 90), .12);
      color: var(--ion-color-success-shade, #1a7a3c); white-space: nowrap;
    }
    .tag.manual {
      background: rgba(var(--ion-color-primary-rgb, 14, 124, 107), .12);
      color: var(--ion-color-primary);
    }
    .tag.miss {
      background: rgba(var(--ion-color-danger-rgb, 235, 68, 90), .1);
      color: var(--ion-color-danger);
    }
    .meta { font-size: 13px; color: var(--ion-color-medium); margin-top: 6px; line-height: 1.4; }
    .gap-box {
      border: 1px dashed var(--rs-line); border-radius: 14px; padding: 14px; margin: 16px 0;
      background: var(--rs-soft);
    }
    .gap-box h3 { margin: 0 0 8px; font-size: 15px; }
  `],
  template: `
    <h2>מצב נוכחי בקופות</h2>
    <p class="lead">היתרות נשלפות מדוחות הפנסיה / הקופות שהועלו במסמכים.</p>
    <p class="hint">
      אם חסרה קופה — חזרו למסמכים והעלו דוח מתאים. מילוי ידני רק כשאין דוח.
    </p>

    @if (!fundRows().length) {
      <p class="hint">עדיין אין יתרות. העלו דוח פנסיה/קופות בשלב המסמכים, או מלאו ידנית למטה.</p>
    }

    @for (f of fundRows(); track f.id) {
      <div class="card" [class.from-doc]="f.source === 'document'">
        <div class="head">
          <div>
            <b>{{ kindLabel(f.kind) }}</b>
            @if (f.provider) { <span> · {{ f.provider }}</span> }
          </div>
          <span class="tag" [class.manual]="f.source === 'manual'">
            {{ f.source === 'document' ? 'מדוח' : 'ידני' }}
          </span>
        </div>
        <div>יתרה: <b>{{ store.fmt(f.balance) }}</b></div>
        <div class="meta">
          תאריך דוח: {{ f.asOf || '—' }}
          · דמי ניהול {{ f.feeAnnualPercent ?? '—' }}%
          · תשואה {{ f.returnAnnualPercent ?? '—' }}%
          @if (f.track) { · מסלול {{ f.track }} }
        </div>
      </div>
    }

    @if (missingKinds().length) {
      <div class="gap-box">
        <h3>חסרים (אין דוח שמילא אותם)</h3>
        <p class="hint" style="margin-top:0">
          מומלץ להעלות דוח בשלב המסמכים. אם אין דוח — אפשר להזין ידנית:
        </p>
        @for (k of missingKinds(); track k) {
          <span class="tag miss" style="margin-inline-end:6px">{{ kindLabel(k) }}</span>
        }

        @if (showManual()) {
          <ion-list style="margin-top:12px;background:transparent">
            <ion-item>
              <ion-select label="סוג קופה" labelPlacement="stacked" [(ngModel)]="kind" interface="popover">
                @for (k of missingKinds(); track k) {
                  <ion-select-option [value]="k">{{ kindLabel(k) }}</ion-select-option>
                }
              </ion-select>
            </ion-item>
            <ion-item><ion-input label="גוף מנהל" labelPlacement="stacked" [(ngModel)]="provider"></ion-input></ion-item>
            <ion-item><ion-input type="number" label="יתרה נוכחית" labelPlacement="stacked" [(ngModel)]="balance"></ion-input></ion-item>
            <ion-item><ion-input type="date" label="תאריך הדוח" labelPlacement="stacked" [(ngModel)]="asOf"></ion-input></ion-item>
            <ion-item><ion-input type="number" label="דמי ניהול שנתיים %" labelPlacement="stacked" [(ngModel)]="fee"></ion-input></ion-item>
            <ion-item><ion-input type="number" label="תשואה שנתית %" labelPlacement="stacked" [(ngModel)]="ret"></ion-input></ion-item>
          </ion-list>
          <ion-button (click)="addManual()">שמירת קופה ידנית</ion-button>
        } @else {
          <ion-button fill="outline" class="ion-margin-top" (click)="showManual.set(true)">הזנה ידנית לחוסר</ion-button>
        }
      </div>
    }

    <app-review-step-nav nextLabel="ללוח המצב" (next)="next()" />
  `
})
export class ReviewFundsPage implements OnInit {
  readonly store = inject(ReviewStore);
  private readonly router = inject(Router);

  readonly showManual = signal(false);
  readonly allKinds: FundKind[] = ['Pension', 'Severance', 'Study', 'Managers'];

  kind: FundKind = 'Pension';
  provider = '';
  balance: number | null = null;
  asOf = '';
  fee: number | null = null;
  ret: number | null = null;

  readonly fundRows = computed(() => this.store.review()?.funds ?? []);

  readonly missingKinds = computed(() => {
    const have = new Set((this.store.review()?.funds ?? []).map(f => f.kind));
    return this.allKinds.filter(k => !have.has(k));
  });

  ngOnInit(): void {
    this.store.syncFundsFromDocuments();
    const miss = this.missingKinds();
    if (miss.length) this.kind = miss[0];
  }

  kindLabel(kind: FundKind): string {
    return KIND_LABEL[kind] ?? kind;
  }

  addManual(): void {
    const r = this.store.review();
    if (!r || this.balance == null || this.balance <= 0) return;
    const fund: FundAccount = {
      id: crypto.randomUUID(),
      workspaceId: r.workspaceId,
      kind: this.kind,
      balance: this.balance,
      asOf: this.asOf || null,
      provider: this.provider || null,
      feeAnnualPercent: this.fee,
      returnAnnualPercent: this.ret,
      track: null,
      confidence: 'Medium',
      source: 'manual',
      sourceDocumentId: null
    };
    this.store.setFunds([...(r.funds.filter(f => f.kind !== fund.kind)), fund]);
    this.balance = null;
    this.provider = '';
    this.asOf = '';
    const miss = this.missingKinds();
    if (miss.length) this.kind = miss[0];
    else this.showManual.set(false);
  }

  async next(): Promise<void> {
    await this.store.fillExpectedFromServer();
    await this.store.analyze();
    await this.router.navigateByUrl('/review/dashboard');
  }
}
