import { DecimalPipe } from '@angular/common';
import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkOutline, closeOutline, sparklesOutline } from 'ionicons/icons';
import { describeError } from '../core/api.service';
import { AuthService } from '../core/auth/auth.service';
import { BillingPlan, BillingService, PlansResponse, pricePerDocument } from '../core/billing.service';
import { DeskHeaderComponent } from '../core/desk-header.component';

/** Typical documents per year of employment: 12 payslips + form 106 + one fund report. */
const DOCS_PER_YEAR = 14;

@Component({
  selector: 'app-pricing',
  standalone: true,
  imports: [IonContent, IonButton, IonIcon, IonSpinner, RouterLink, DeskHeaderComponent, DecimalPipe],
  styles: [`
    .lead { font-size: 17px; color: var(--ion-color-medium); max-width: 62ch; margin: 0 0 22px; line-height: 1.5; }
    .free {
      display: grid; gap: 6px; padding: 18px 20px; border-radius: 16px; margin: 0 0 22px;
      background: var(--rs-soft); border: 1px solid color-mix(in srgb, var(--ion-color-primary) 25%, transparent);
    }
    .free b { font-size: 17px; }
    .free ul { margin: 4px 0 0; padding-inline-start: 20px; line-height: 1.6; }

    .plans { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin: 0 0 28px; }
    .plan {
      position: relative; display: flex; flex-direction: column; gap: 8px; padding: 20px; border-radius: 16px;
      background: var(--ion-item-background); border: 1.5px solid var(--rs-line); box-shadow: var(--rs-card-shadow);
    }
    .plan.recommended { border-color: var(--ion-color-primary); box-shadow: 0 8px 28px rgba(14, 124, 107, .16); }
    .plan.suggested { outline: 3px solid var(--rs-accent); outline-offset: 2px; }
    .ribbon {
      position: absolute; top: -12px; inset-inline-start: 16px; font-size: 12.5px; font-weight: 800;
      padding: 3px 10px; border-radius: 20px; background: var(--ion-color-primary); color: var(--ion-color-primary-contrast);
    }
    .plan h3 { margin: 4px 0 0; font-size: 19px; }
    .plan .tag { font-size: 14px; color: var(--ion-color-medium); min-height: 2.6em; line-height: 1.35; }
    .price { font-family: var(--rs-serif); font-size: 40px; font-weight: 700; line-height: 1; }
    .price small { font-size: 20px; margin-inline-end: 2px; }
    .meta { font-size: 14px; color: var(--ion-color-medium); }
    .meta b { color: var(--ion-text-color); }
    .plan ion-button { margin: 8px 0 0; }

    h2.section { font-size: 24px; margin: 28px 0 12px; }
    .estimator { padding: 18px 20px; border-radius: 16px; background: var(--ion-item-background); border: 1px solid var(--rs-line); box-shadow: var(--rs-card-shadow); }
    .estimator label { display: block; font-weight: 700; margin-bottom: 8px; }
    .estimator input[type=range] { width: 100%; accent-color: var(--ion-color-primary); }
    .estimate { margin: 10px 0 0; font-size: 15.5px; line-height: 1.5; }
    .estimate b { color: var(--ion-color-primary); }

    .faq { display: grid; gap: 10px; }
    .faq details { padding: 12px 16px; border-radius: 12px; background: var(--ion-item-background); border: 1px solid var(--rs-line); }
    .faq summary { cursor: pointer; font-weight: 700; }
    .faq p { margin: 8px 0 0; line-height: 1.55; color: var(--ion-color-medium); }

    .notice { padding: 12px 14px; border-radius: 12px; background: var(--rs-warn-bg); color: var(--rs-warn); font-size: 14.5px; margin: 0 0 18px; }

    .sheet-backdrop {
      position: fixed; inset: 0; z-index: 40; background: rgba(11, 31, 38, .48);
      display: flex; align-items: flex-end; justify-content: center; padding: 12px;
    }
    /* The title and close button stay in view; only .sheet-body scrolls. */
    .sheet {
      width: min(480px, 100%); max-height: min(85vh, 720px);
      display: flex; flex-direction: column; overflow: hidden;
      background: var(--ion-background-color); color: var(--ion-text-color);
      border-radius: 18px; box-shadow: 0 18px 50px rgba(0, 0, 0, .28);
    }
    .sheet-head {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      flex: none; padding: 14px 20px 10px; border-bottom: 1px solid var(--rs-line);
    }
    .sheet-body {
      flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
      padding: 0 20px calc(20px + env(safe-area-inset-bottom, 0px));
    }
    .sheet-head h2 { margin: 0; font-size: 22px; }
    .sheet-close { background: none; border: 0; color: var(--ion-color-medium); cursor: pointer; width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; }
    .sheet-close ion-icon { font-size: 24px; }
    .summary { margin: 14px 0; padding: 14px 16px; border-radius: 12px; background: var(--rs-soft); display: grid; gap: 6px; font-size: 15px; }
    .summary div { display: flex; justify-content: space-between; }
    .summary .total { font-weight: 800; font-size: 17px; border-top: 1px solid var(--rs-line); padding-top: 8px; margin-top: 2px; }
    .err { color: var(--ion-color-danger); font-weight: 600; margin: 8px 0 0; }
    .ok { color: var(--ion-color-success-shade, #1a7a3c); font-weight: 700; }
    @media (min-width: 992px) { .sheet-backdrop { align-items: center; } }
  `],
  template: `
    <ion-content>
      <app-desk-header></app-desk-header>
      <div class="page ion-padding">
        <h1>מחירים</h1>
        <p class="lead">הבדיקה המהירה חינמית. בבדיקה המלאה משלמים לפי מספר המסמכים שנבדקים — ומסמך שהבדיקה שלו נכשלה בצד שלנו לא נספר.</p>

        @if (info(); as i) {
          @if (!i.enabled) {
            <p class="notice">בשלב ההרצה הבדיקה המלאה פתוחה בלי חיוב — המסמכים עדיין לא נספרים.</p>
          }

          <div class="free">
            <b>חינם</b>
            <ul>
              <li>בדיקה מהירה לפי התלוש האחרון — מה מגיע לכם והאם ההפרשות תקינות.</li>
              @if (i.freeDocuments > 0) {
                <li>{{ i.freeDocuments }} מסמכים ראשונים בבדיקה המלאה, לכל משתמש מחובר.</li>
              }
            </ul>
          </div>

          <div class="plans">
            @for (p of mainPlans(); track p.id) {
              <article class="plan" [class.recommended]="p.recommended" [class.suggested]="suggested()?.id === p.id">
                @if (p.recommended) { <span class="ribbon">הכי משתלם לרוב המשתמשים</span> }
                <h3>{{ p.name }}</h3>
                <span class="tag">{{ p.tagline }}</span>
                <div class="price"><small>₪</small>{{ p.priceIls | number:'1.0-0' }}</div>
                <span class="meta"><b>{{ p.documents }}</b> מסמכים · ₪{{ perDoc(p) | number:'1.2-2' }} למסמך</span>
                <ion-button [fill]="p.recommended ? 'solid' : 'outline'" (click)="choose(p)">בחירה</ion-button>
              </article>
            }
          </div>

          <h2 class="section">כמה מסמכים אני צריך?</h2>
          <div class="estimator">
            <label for="years">שנות עבודה שרוצים לבדוק: {{ years() }}</label>
            <input id="years" type="range" min="1" max="10" [value]="years()" (input)="years.set(+$any($event.target).value)">
            <p class="estimate">
              בערך <b>{{ needed() }} מסמכים</b> (12 תלושים, טופס 106 ודוח קופה לכל שנה).
              @if (suggested(); as s) { מתאים: <b>{{ s.name }}</b> — ₪{{ s.priceIls }}. }
              @else { אפשר לשלב חבילה ותוספות. }
            </p>
          </div>

          @if (topUp(); as t) {
            <h2 class="section">צריכים עוד קצת?</h2>
            <article class="plan" style="max-width: 360px">
              <h3>{{ t.name }}</h3>
              <span class="tag">{{ t.tagline }}</span>
              <div class="price"><small>₪</small>{{ t.priceIls | number:'1.0-0' }}</div>
              <span class="meta"><b>{{ t.documents }}</b> מסמכים</span>
              <ion-button fill="outline" (click)="choose(t)">הוספה</ion-button>
            </article>
          }

          <h2 class="section">שאלות נפוצות</h2>
          <div class="faq">
            <details><summary>מה נחשב מסמך?</summary><p>כל קובץ שנבדק ב־AI: תלוש של חודש, טופס 106 של שנה או דוח קופה. קובץ עם כמה עמודים של אותו מסמך נחשב מסמך אחד.</p></details>
            <details><summary>מה אם הבדיקה נכשלה?</summary><p>אם שירות הקריאה לא הצליח לקרוא את הקובץ בגלל תקלה אצלנו — המסמך חוזר ליתרה אוטומטית.</p></details>
            <details><summary>בדיקה מחדש של אותו מסמך נספרת?</summary><p>כן, כל קריאה של AI נספרת. לכן קודם בודקים במכשיר שהשנה והחודש בקובץ מתאימים — קובץ לא מתאים נדחה לפני שנספר.</p></details>
            <details><summary>יש תוקף למסמכים שנרכשו?</summary><p>לא. היתרה נשמרת בחשבון עד שמשתמשים בה.</p></details>
            <details><summary>למה לא חינם?</summary><p>כל מסמך נקרא במודל AI שעולה לנו כסף בכל קריאה. המחיר נועד לכסות את זה — בלי מנויים ובלי חיוב חוזר.</p></details>
          </div>
        } @else if (loadError()) {
          <p class="err">{{ loadError() }}</p>
        } @else {
          <ion-spinner name="crescent"></ion-spinner>
        }
      </div>
    </ion-content>

    @if (selected(); as p) {
      <div class="sheet-backdrop" (click)="close()">
        <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="checkout-title" (click)="$event.stopPropagation()">
          <div class="sheet-head">
            <h2 id="checkout-title">{{ done() ? 'נוסף לחשבון' : 'רכישת ' + p.name }}</h2>
            <button type="button" class="sheet-close" (click)="close()" aria-label="סגירה"><ion-icon name="close-outline" aria-hidden="true"></ion-icon></button>
          </div>

          <div class="sheet-body">
          @if (done(); as balance) {
            <p class="ok"><ion-icon name="checkmark-outline" aria-hidden="true"></ion-icon> {{ p.documents }} מסמכים נוספו. היתרה שלכם: {{ balance }} מסמכים.</p>
            <ion-button expand="block" (click)="goAccount()">לחשבון שלי</ion-button>
          } @else if (!auth.isSignedIn()) {
            <p>כדי לרכוש צריך להתחבר — כך היתרה נשמרת בחשבון ואפשר להמשיך מכל מכשיר.</p>
            <ion-button expand="block" routerLink="/login" (click)="close()">התחברות</ion-button>
          } @else {
            <div class="summary">
              <div><span>{{ p.documents }} מסמכים</span><span>₪{{ perDoc(p) | number:'1.2-2' }} למסמך</span></div>
              <div class="total"><span>לתשלום (כולל מע״מ)</span><span>₪{{ p.priceIls | number:'1.0-0' }}</span></div>
            </div>
            @if (info()?.simulated) {
              <p class="notice">מצב בדיקה: הרכישה מוסיפה מסמכים בלי חיוב אמיתי.</p>
            } @else if (!info()?.checkoutAvailable) {
              <p class="notice">התשלום באתר עוד לא מחובר. נעדכן כשאפשר יהיה לרכוש.</p>
            }
            @if (error()) { <p class="err">{{ error() }}</p> }
            <ion-button expand="block" [disabled]="busy() || !info()?.checkoutAvailable" (click)="pay(p)">
              @if (busy()) { <ion-spinner name="crescent"></ion-spinner> } @else { לתשלום ₪{{ p.priceIls | number:'1.0-0' }} }
            </ion-button>
          }
          </div>
        </div>
      </div>
    }
  `
})
export class PricingPage implements OnInit {
  private readonly billing = inject(BillingService);
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);

  readonly info = signal<PlansResponse | null>(null);
  readonly loadError = signal('');
  readonly years = signal(3);
  readonly selected = signal<BillingPlan | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly done = signal<number | null>(null);

  readonly mainPlans = computed(() => (this.info()?.plans ?? []).filter(p => !p.topUp));
  readonly topUp = computed(() => (this.info()?.plans ?? []).find(p => p.topUp) ?? null);
  readonly needed = computed(() => this.years() * DOCS_PER_YEAR);
  readonly suggested = computed(() => this.mainPlans().find(p => p.documents >= this.needed()) ?? null);

  constructor() {
    addIcons({ checkmarkOutline, closeOutline, sparklesOutline });
  }

  async ngOnInit(): Promise<void> {
    // Pricing is public (no route guard), so load the session here to know who is buying.
    this.auth.init().catch(() => undefined);
    try {
      this.info.set(await this.billing.plans());
    } catch (err) {
      this.loadError.set(describeError(err).message);
    }
  }

  perDoc(p: BillingPlan): number {
    return pricePerDocument(p);
  }

  choose(p: BillingPlan): void {
    this.error.set('');
    this.done.set(null);
    this.selected.set(p);
  }

  @HostListener('document:keydown.escape')
  close(): void {
    if (!this.busy()) this.selected.set(null);
  }

  async pay(p: BillingPlan): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const result = await this.billing.checkout(p.id);
      this.done.set(result.balance);
    } catch (err) {
      this.error.set(describeError(err).message);
    } finally {
      this.busy.set(false);
    }
  }

  goAccount(): void {
    this.selected.set(null);
    void this.router.navigateByUrl('/account');
  }
}
