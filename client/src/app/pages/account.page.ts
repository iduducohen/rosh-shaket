import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton, IonContent, IonSpinner } from '@ionic/angular/standalone';
import { describeError } from '../core/api.service';
import { AuthService } from '../core/auth/auth.service';
import { BillingLedgerEntry, BillingService, PlansResponse } from '../core/billing.service';
import { DeskHeaderComponent } from '../core/desk-header.component';

const DOC_LABELS: Record<string, string> = { payslip: 'תלוש', form106: 'טופס 106', pension_report: 'דוח קופה' };
const LOW_BALANCE = 3;

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [IonContent, IonButton, IonSpinner, RouterLink, DeskHeaderComponent, DecimalPipe, DatePipe],
  styles: [`
    .hello { color: var(--ion-color-medium); margin: 0 0 20px; font-size: 16px; }
    .notice { padding: 12px 14px; border-radius: 12px; background: var(--rs-warn-bg); color: var(--rs-warn); font-size: 14.5px; margin: 0 0 16px; }

    .hero {
      display: grid; gap: 16px; align-items: center; grid-template-columns: 1fr auto;
      padding: 20px 22px; border-radius: 18px; margin: 0 0 16px;
      background: var(--ion-item-background); border: 1px solid var(--rs-line); box-shadow: var(--rs-card-shadow);
    }
    .hero .k { font-size: 14px; color: var(--ion-color-medium); }
    .hero .v { font-family: var(--rs-serif); font-size: 52px; font-weight: 700; line-height: 1; margin: 4px 0; }
    .hero .v small { font-size: 18px; font-family: var(--ion-font-family); color: var(--ion-color-medium); font-weight: 600; margin-inline-start: 6px; }
    .bar { height: 8px; border-radius: 8px; background: var(--rs-soft); overflow: hidden; margin-top: 10px; }
    .bar i { display: block; height: 100%; background: var(--ion-color-primary); border-radius: 8px; transition: width .3s ease; }
    .bar-label { font-size: 13px; color: var(--ion-color-medium); margin-top: 6px; }
    .hero .actions { display: grid; gap: 8px; }
    .hero.low { border-color: color-mix(in srgb, var(--rs-accent) 70%, var(--rs-line)); }
    @media (max-width: 640px) { .hero { grid-template-columns: 1fr; } }

    .tiles { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); margin: 0 0 24px; }
    .tile { padding: 14px 16px; border-radius: 14px; background: var(--ion-item-background); border: 1px solid var(--rs-line); }
    .tile span { display: block; font-size: 13.5px; color: var(--ion-color-medium); }
    .tile b { font-size: 24px; }

    h2.section { font-size: 22px; margin: 26px 0 10px; }
    .list { list-style: none; margin: 0; padding: 0; border-radius: 14px; overflow: hidden; border: 1px solid var(--rs-line); background: var(--ion-item-background); }
    .list li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--rs-line); font-size: 15px; }
    .list li:last-child { border-bottom: 0; }
    .list .when { font-size: 13px; color: var(--ion-color-medium); }
    .delta { font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .delta.plus { color: var(--ion-color-success-shade, #1a7a3c); }
    .delta.minus { color: var(--ion-color-medium-shade); }
    .badge { font-size: 12.5px; font-weight: 700; padding: 2px 8px; border-radius: 20px; background: var(--rs-soft); color: var(--ion-color-medium-shade); margin-inline-start: 6px; }
    .empty { color: var(--ion-color-medium); padding: 14px 16px; }
    .err { color: var(--ion-color-danger); font-weight: 600; }
  `],
  template: `
    <ion-content>
      <app-desk-header></app-desk-header>
      <div class="page ion-padding">
        <h1>החשבון שלי</h1>
        @if (!auth.isSignedIn()) {
          <p class="hello">כדי לראות יתרה ורכישות צריך להתחבר.</p>
          <ion-button routerLink="/login">התחברות</ion-button>
        } @else {
          <p class="hello">{{ auth.displayName() }}</p>

          @if (info() && !info()!.enabled) {
            <p class="notice">בשלב ההרצה הבדיקה המלאה פתוחה בלי חיוב — מסמכים שנבדקים עכשיו לא יורדים מהיתרה.</p>
          }

          @if (billing.account(); as a) {
            <section class="hero" [class.low]="a.balance <= lowBalance" aria-label="יתרת מסמכים">
              <div>
                <span class="k">מסמכים שנשארו לבדיקה מלאה</span>
                <div class="v">{{ a.balance }}<small>מתוך {{ total() }}</small></div>
                <div class="bar" role="progressbar" [attr.aria-valuenow]="a.used" [attr.aria-valuemax]="total()">
                  <i [style.width.%]="usedPct()"></i>
                </div>
                <div class="bar-label">
                  נבדקו {{ a.used }} מסמכים
                  @if (a.balance <= lowBalance) { · <b>כמעט נגמרו המסמכים</b> }
                </div>
              </div>
              <div class="actions">
                <ion-button routerLink="/pricing">הוספת מסמכים</ion-button>
                <ion-button fill="outline" routerLink="/review/documents">להמשך הבדיקה</ion-button>
              </div>
            </section>

            <div class="tiles">
              <div class="tile"><span>נבדקו</span><b>{{ a.used }}</b></div>
              <div class="tile"><span>מתנת הצטרפות</span><b>{{ a.freeGranted }}</b></div>
              <div class="tile"><span>נרכשו</span><b>{{ a.purchased }}</b></div>
              <div class="tile"><span>הוחזרו (תקלה)</span><b>{{ a.refunded }}</b></div>
              <div class="tile"><span>שולם עד היום</span><b>₪{{ a.spentIls | number:'1.0-0' }}</b></div>
            </div>

            <h2 class="section">רכישות</h2>
            <ul class="list">
              @for (p of a.purchases; track p.id) {
                <li>
                  <span>
                    {{ p.planName }} · {{ p.documents }} מסמכים
                    @if (p.status === 'simulated') { <span class="badge">בדיקה, בלי חיוב</span> }
                    <div class="when">{{ p.createdAt | date:'d.M.yyyy HH:mm' }}</div>
                  </span>
                  <span class="delta">₪{{ p.amountIls | number:'1.0-0' }}</span>
                </li>
              } @empty {
                <li class="empty">עוד לא בוצעו רכישות.</li>
              }
            </ul>

            <h2 class="section">פעילות אחרונה</h2>
            <ul class="list">
              @for (e of a.recentActivity; track $index) {
                <li>
                  <span>{{ describe(e) }}<div class="when">{{ e.createdAt | date:'d.M.yyyy HH:mm' }}</div></span>
                  <span class="delta" [class.plus]="e.delta > 0" [class.minus]="e.delta < 0">{{ e.delta > 0 ? '+' : '−' }}{{ abs(e.delta) }}</span>
                </li>
              } @empty {
                <li class="empty">עוד אין פעילות.</li>
              }
            </ul>
          } @else if (error()) {
            <p class="err">{{ error() }}</p>
          } @else {
            <ion-spinner name="crescent"></ion-spinner>
          }
        }
      </div>
    </ion-content>
  `
})
export class AccountPage implements OnInit {
  readonly billing = inject(BillingService);
  readonly auth = inject(AuthService);
  readonly info = signal<PlansResponse | null>(null);
  readonly error = signal('');
  readonly lowBalance = LOW_BALANCE;

  readonly total = computed(() => {
    const a = this.billing.account();
    return a ? a.freeGranted + a.purchased + a.refunded : 0;
  });
  readonly usedPct = computed(() => {
    const a = this.billing.account();
    const t = this.total();
    return a && t ? Math.min(100, Math.round(a.used / t * 100)) : 0;
  });

  async ngOnInit(): Promise<void> {
    this.billing.plans().then(i => this.info.set(i)).catch(() => undefined);
    if (!this.auth.isSignedIn()) return;
    try {
      await this.billing.refresh();
    } catch (err) {
      this.error.set(describeError(err).message);
    }
  }

  describe(e: BillingLedgerEntry): string {
    switch (e.kind) {
      case 'welcome': return 'מתנת הצטרפות';
      case 'purchase': return 'רכישת מסמכים';
      case 'refund': return `החזר — הבדיקה נכשלה${this.docLabel(e)}`;
      default: return `בדיקת מסמך${this.docLabel(e)}`;
    }
  }

  abs(n: number): number {
    return Math.abs(n);
  }

  private docLabel(e: BillingLedgerEntry): string {
    if (!e.documentType) return '';
    const label = DOC_LABELS[e.documentType] ?? e.documentType;
    const when = e.month ? `${String(e.month).padStart(2, '0')}/${e.year}` : e.year ?? '';
    return ` · ${label} ${when}`.trimEnd();
  }
}
