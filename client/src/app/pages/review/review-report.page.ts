import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton } from '@ionic/angular/standalone';
import { CalculationFacade } from '../../core/calculation.facade';
import { REASON_LABELS, type ExitReason } from '../../core/models';
import { healthLabel } from '../../core/review.models';
import { ReviewStore } from '../../core/review.store';
import { WizardStore } from '../../core/wizard.store';
import { ReviewStepNavComponent } from './review-step-nav.component';

const MONTH_LABELS = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

@Component({
  selector: 'app-review-report',
  standalone: true,
  imports: [IonButton, RouterLink, DecimalPipe, ReviewStepNavComponent],
  styles: [`
    .verdict {
      margin: 8px 0 18px; padding: 14px 16px;
      border-inline-start: 4px solid var(--ion-color-primary);
      background: var(--rs-soft, color-mix(in srgb, var(--ion-color-primary) 8%, transparent));
      border-radius: 0 12px 12px 0;
    }
    .verdict .status {
      margin: 0 0 6px; font-size: 22px; font-weight: 800; line-height: 1.25;
      color: var(--ion-color-primary);
    }
    .verdict p { margin: 0; font-size: 14.5px; line-height: 1.45; color: var(--ion-text-color); }
    .verdict .cover {
      display: block; margin-top: 8px; font-size: 13px; color: var(--ion-color-medium);
    }

    .sec { margin: 0 0 22px; }
    .sec h3 {
      margin: 0 0 4px; font-size: 15px; font-weight: 800;
      color: var(--ion-color-primary);
    }
    .sec .lead {
      margin: 0 0 12px; font-size: 13.5px; line-height: 1.4;
      color: var(--ion-color-medium);
    }

    .facts { margin: 0; padding: 0; list-style: none; }
    .facts li {
      display: flex; justify-content: space-between; gap: 12px; align-items: baseline;
      padding: 8px 0; border-bottom: 1px solid var(--rs-line, #e5e5e5);
      font-size: 14.5px;
    }
    .facts li:last-child { border-bottom: 0; }
    .facts .k { color: var(--ion-color-medium); }
    .facts .v { font-weight: 700; text-align: start; }

    .money { margin: 0; padding: 0; list-style: none; }
    .money li {
      display: grid; grid-template-columns: 1fr auto; gap: 4px 16px;
      padding: 10px 0; border-bottom: 1px solid var(--rs-line, #e5e5e5);
    }
    .money li:last-child { border-bottom: 0; }
    .money .k { font-size: 14.5px; font-weight: 700; }
    .money .hint { grid-column: 1 / -1; font-size: 12.5px; color: var(--ion-color-medium); line-height: 1.35; }
    .money .v { font-size: 16px; font-weight: 800; }
    .money .v.warn { color: var(--ion-color-danger); }
    .money .v.muted { color: var(--ion-color-medium); font-weight: 700; }

    .attention {
      margin: 0; padding: 0; list-style: none;
    }
    .attention li {
      position: relative; padding: 8px 0 8px 0; padding-inline-start: 14px;
      font-size: 14px; line-height: 1.45;
      border-bottom: 1px solid var(--rs-line, #e5e5e5);
    }
    .attention li:last-child { border-bottom: 0; }
    .attention li::before {
      content: ''; position: absolute; inset-inline-start: 0; top: 14px;
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--ion-color-warning, #c9a227);
    }
    .ok-note {
      margin: 0 0 6px; font-size: 14px; line-height: 1.45; color: var(--ion-color-medium);
    }
    .ok-note a, .attention a, .estimate a {
      color: var(--ion-color-primary); font-weight: 700; text-decoration: none;
    }
    .ok-note a:hover, .attention a:hover, .estimate a:hover { text-decoration: underline; }

    .estimate .big {
      margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.02em;
    }
    .estimate .sub {
      margin: 4px 0 0; font-size: 13px; color: var(--ion-color-medium); line-height: 1.4;
    }
    .estimate a { display: inline-block; margin-top: 8px; font-size: 13.5px; }

    .exports {
      display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
      margin-top: 8px;
    }
    .exports ion-button { margin: 0; }

    .legal {
      margin: 16px 0 0; font-size: 12.5px; line-height: 1.4;
      color: var(--ion-color-medium);
    }
  `],
  template: `
    <h2>הסיכום שלכם</h2>

    @if (a(); as analysis) {
      <section class="verdict" aria-label="מסקנה">
        <div class="status">{{ healthLabel(analysis.summary.health.status) }}</div>
        <p>{{ analysis.summary.health.messageHe }}</p>
        <span class="cover">
          כיסוי מידע: {{ (analysis.summary.health.coverageRatio * 100) | number:'1.0-0' }}%
          ({{ analysis.summary.monthsWithData }}/{{ analysis.summary.totalMonths }} חודשים)
        </span>
      </section>

      <section class="sec" aria-label="על התקופה">
        <h3>על התקופה</h3>
        <p class="lead">מי אתם בודקים — בלי מספרים.</p>
        <ul class="facts">
          <li>
            <span class="k">מעסיק</span>
            <span class="v">{{ employer() }}</span>
          </li>
          <li>
            <span class="k">תקופה</span>
            <span class="v">{{ periodLabel() }}</span>
          </li>
          <li>
            <span class="k">סיבת סיום</span>
            <span class="v">{{ reasonLabel() }}</span>
          </li>
        </ul>
      </section>

      <section class="sec" aria-label="הפקדות">
        <h3>ההפקדות במבט אחד</h3>
        <p class="lead">מה שהיה אמור להיכנס, מה שדווח, ומה שנכנס לקופה — אם ידוע.</p>
        <ul class="money">
          <li>
            <span class="k">אמור היה להיות מופקד</span>
            <span class="v" [class.muted]="analysis.summary.expectedTotal == null">{{ store.fmt(analysis.summary.expectedTotal) }}</span>
            <span class="hint">לפי השכר ושיעורי ההפרשות</span>
          </li>
          <li>
            <span class="k">דווח בתלושים / 106</span>
            <span class="v" [class.muted]="analysis.summary.reportedTotal == null">{{ store.fmt(analysis.summary.reportedTotal) }}</span>
            <span class="hint">מה שמופיע במסמכי השכר</span>
          </li>
          <li>
            <span class="k">נכנס בפועל לקופות</span>
            <span class="v" [class.muted]="analysis.summary.actualTotal == null">{{ store.fmt(analysis.summary.actualTotal) }}</span>
            <span class="hint">מדוחות הקופה — אם יש</span>
          </li>
          <li>
            <span class="k">פער משוער</span>
            <span class="v"
              [class.warn]="analysis.summary.gapTotal != null && analysis.summary.gapTotal < 0"
              [class.muted]="analysis.summary.gapTotal == null">
              {{ store.fmt(analysis.summary.gapTotal) }}
            </span>
            <span class="hint">הפרש בין מה שאמור לבין מה שנכנס (כשיש נתונים)</span>
          </li>
        </ul>
      </section>

      <section class="sec" aria-label="תשומת לב">
        <h3>מה דורש תשומת לב</h3>
        @if (attention().length) {
          <p class="lead">נקודות שכדאי לבדוק לפני שממשיכים הלאה.</p>
          <ul class="attention">
            @for (item of attention(); track item.text) {
              <li>
                {{ item.text }}
                @if (item.link) {
                  · <a [routerLink]="item.link">{{ item.linkLabel }}</a>
                }
              </li>
            }
          </ul>
        } @else {
          <p class="ok-note">לא סומנו פערים או חריגות משמעותיות בנתונים שיש. עדיין מומלץ לעבור על פירוט ההפקדות.</p>
          <p class="ok-note"><a routerLink="/review/check">לפירוט הפקדות</a></p>
        }
      </section>

      <section class="sec" aria-label="מסמכים חסרים">
        <h3>מה חסר</h3>
        @if (missingDocs().length) {
          <p class="lead">כדאי לבקש מהמעסיק או מהקופה — כל מסמך שמתווסף משפר את הבדיקה.</p>
          <ul class="attention">
            @for (d of missingDocs(); track d) { <li>{{ d }}</li> }
          </ul>
          <p class="ok-note"><a routerLink="/review/documents">להעלאת מסמכים</a></p>
        } @else {
          <p class="ok-note">כל המסמכים הבסיסיים הועלו או סומנו כלא זמינים.</p>
        }
      </section>

      <section class="sec estimate" aria-label="אומדן סיום">
        <h3>מה מגיע בסיום העבודה</h3>
        <p class="lead">מה שהופקד לקופה אינו בהכרח מה שמגיע כפיצויי פיטורים.</p>
        @if (exitTotal() != null) {
          <p class="big">{{ store.fmt(exitTotal()) }}</p>
          <p class="sub">הערכה לפי השכר האחרון וסיבת הסיום.</p>
          <a routerLink="/results/summary">לפירוט הזכויות</a>
        } @else {
          <p class="sub">אפשר לחשב הערכה לפי השכר האחרון שנקרא מהתלושים.</p>
          <ion-button size="small" (click)="runExitEstimate()" [disabled]="exitBusy() || !lastSalary()">חישוב אומדן סיום</ion-button>
        }
      </section>

      @if (sims().length) {
        <details class="sec">
          <summary><b>אומדן צבירה עתידית (רשות)</b></summary>
          <p class="lead">הערכה בלבד, לא תחזית השקעה. מבוסס על ההפקדות הידועות ועל הנחות תשואה ודמי ניהול.</p>
          <ul class="money">
            @for (s of sims(); track s.scenario) {
              <li>
                <span class="k">{{ simLabel(s.scenario) }} · תשואה {{ s.annualReturnPercent }}% · דמי ניהול {{ s.managementFeePercent }}%</span>
                <span class="v">{{ store.fmt(s.estimatedBalance) }}</span>
              </li>
            }
          </ul>
        </details>
      }

      <section class="sec" aria-label="שמירה">
        <h3>שמירה והדפסה</h3>
        <p class="lead">לשמירה אצלכם או לשיתוף עם יועץ — לא חובה להבין את הפורמט.</p>
        <div class="exports">
          <ion-button (click)="dl('html')">הורדת דוח</ion-button>
          <ion-button fill="outline" (click)="print()">הדפסה / PDF</ion-button>
          <ion-button fill="clear" size="small" (click)="dl('csv')">CSV</ion-button>
          <ion-button fill="clear" size="small" (click)="dl('json')">JSON</ion-button>
        </div>
      </section>

      <p class="legal">הערכה ואומדן בלבד — לא ייעוץ משפטי או פיננסי. חודש בלי מידע מוצג כ״לא ידוע״, לא כ־0.</p>
    } @else {
      <p class="ok-note">עדיין אין ניתוח. חזרו לשלבים הקודמים והריצו ניתוח.</p>
    }

    <app-review-step-nav [nextLabel]="null" />
  `
})
export class ReviewReportPage implements OnInit {
  readonly store = inject(ReviewStore);
  private readonly wizard = inject(WizardStore);
  private readonly calc = inject(CalculationFacade);
  readonly healthLabel = healthLabel;

  readonly a = computed(() => this.store.analysis());

  readonly employer = computed(() => this.store.review()?.period?.employerName?.trim() || 'לא צוין');

  readonly periodLabel = computed(() => {
    const p = this.store.review()?.period;
    if (!p?.startDate || !p?.endDate) return '—';
    return `${this.fmtDate(p.startDate)} – ${this.fmtDate(p.endDate)}`;
  });

  readonly reasonLabel = computed(() => {
    const raw = this.store.review()?.period?.exitReason;
    if (!raw) return '—';
    return REASON_LABELS[raw as ExitReason] ?? raw;
  });

  readonly sims = computed(() => this.a()?.simulations ?? []);
  readonly exitTotal = computed(() => this.wizard.active()?.estimatedTotal ?? null);
  readonly exitBusy = signal(false);
  readonly lastSalary = computed(() =>
    [...(this.store.review()?.months ?? [])].reverse().find(m => m.grossSalary != null)?.grossSalary ?? null
  );

  readonly missingDocs = computed(() => {
    const r = this.store.review();
    if (!r?.period) return [] as string[];
    const has = (type: string, year: number, month?: number) =>
      r.documents.some(d => d.documentType === type && d.year === year && (month == null || d.month === month));
    const years = [...new Set(r.months.map(m => m.year))].sort((a, b) => a - b);
    const out: string[] = [];
    for (const y of years) {
      const months = r.months.filter(m => m.year === y && !has('payslip', y, m.month) && !this.store.isWaived('payslip', y, m.month));
      if (months.length) out.push(`תלושי שכר ${y}: ${months.map(m => MONTH_LABELS[m.month]).join(', ')}`);
      // Form 106 for year Y is issued by end of March Y+1.
      const form106Due = new Date() > new Date(y + 1, 2, 31);
      if (form106Due && !has('form106', y) && !this.store.isWaived('form106', y)) out.push(`טופס 106 לשנת ${y}`);
      if (!has('pension_report', y) && !this.store.isWaived('pension_report', y)) out.push(`דוח פנסיה / קופות לשנת ${y}`);
    }
    return out;
  });

  readonly attention = computed(() => {
    const analysis = this.a();
    if (!analysis) return [] as { text: string; link?: string; linkLabel?: string }[];
    const s = analysis.summary;
    const items: { text: string; link?: string; linkLabel?: string }[] = [];

    if (s.monthsNoInfo > 0) {
      items.push({
        text: `${s.monthsNoInfo} חודשים בלי מידע על שכר או הפקדות`,
        link: '/review/documents',
        linkLabel: 'להעלאת תלושים'
      });
    }
    if (s.monthsWithGap > 0) {
      items.push({
        text: `${s.monthsWithGap} חודשים עם פער בהפקדות`,
        link: '/review/check',
        linkLabel: 'לפירוט'
      });
    }
    if (analysis.anomalies.length > 0) {
      items.push({
        text: `${analysis.anomalies.length} חריגות שזוהו בניתוח`,
        link: '/review/check',
        linkLabel: 'לפירוט'
      });
    }
    if (s.actualTotal == null) {
      items.push({
        text: 'אין עדיין אישור מהקופות על מה שנכנס בפועל',
        link: '/review/documents',
        linkLabel: 'להעלאת דוח'
      });
    }
    if (this.store.hasAnyWaiver()) {
      items.push({
        text: 'חלק מהמסמכים סומנו כלא זמינים — החישוב מתבסס על מה שיש'
      });
    }
    if (s.gapTotal != null && s.gapTotal < 0) {
      items.push({ text: `פער שלילי משוער: ${this.store.fmt(s.gapTotal)}` });
    }
    return items.slice(0, 5);
  });

  async ngOnInit(): Promise<void> {
    if (!this.store.analysis()) await this.store.analyze();
  }

  async dl(format: 'html' | 'csv' | 'json'): Promise<void> {
    await this.store.downloadReport(format);
  }

  print(): void {
    window.print();
  }

  simLabel(s: string): string {
    return s === 'Conservative' ? 'שמרני' : s === 'Optimistic' ? 'אופטימי' : 'בסיס';
  }

  async runExitEstimate(): Promise<void> {
    const p = this.store.review()?.period;
    const salary = this.lastSalary();
    if (!p || !salary) return;
    this.exitBusy.set(true);
    try {
      const reason = (['Fired', 'Resigned', 'ResignedJustified', 'ContractEnded'] as const)
        .find(x => x === p.exitReason) ?? 'Fired';
      this.wizard.choice.set(reason);
      this.wizard.profile.set({ ...this.wizard.profile(), startDate: p.startDate, endDate: p.endDate, monthlySalary: salary });
      await this.calc.calculate();
    } finally {
      this.exitBusy.set(false);
    }
  }

  private fmtDate(iso: string): string {
    const [y, m, d] = iso.split('-');
    if (!y || !m || !d) return iso;
    return `${d}/${m}/${y}`;
  }
}
