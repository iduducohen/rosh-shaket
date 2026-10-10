import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { IonButton, IonContent, IonSpinner, ViewWillEnter } from '@ionic/angular/standalone';
import { ApiService, describeError } from '../core/api.service';
import { DeskHeaderComponent } from '../core/desk-header.component';
import { ChartSlice, ExitReason, RightsReport } from '../core/models';
import { WizardStore } from '../core/wizard.store';
import { SiteFooterComponent } from '../core/site-footer.component';

const PALETTE = ['#0E7C6B', '#14967F', '#F2A93B', '#0B5F53', '#5B8A84', '#C47B3A'];

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [SiteFooterComponent, DeskHeaderComponent, DecimalPipe, RouterLink, IonContent, IonButton, IonSpinner],
  styles: [`
    .results-nav { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 16px; }
    .results-nav a {
      padding: 8px 14px; border-radius: 10px; border: 1px solid var(--rs-line);
      color: var(--ion-text-color); text-decoration: none; font-weight: 700; font-size: 14.5px;
      background: var(--ion-item-background);
    }
    .results-nav a.on { border-color: var(--ion-color-primary); background: var(--rs-soft); color: var(--ion-color-primary); }
    .toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 20px; }
    /* Equal choices: same size and style, none highlighted. */
    .toolbar ion-button { margin: 0; min-width: 120px; font-weight: 700; --box-shadow: none; }
    .grid { display: grid; gap: 18px; }
    .card {
      background: var(--ion-item-background); border: 1px solid var(--rs-line);
      border-radius: 16px; padding: 18px 18px 14px;
    }
    .card h3 { margin: 0 0 6px; font-size: 18px; font-family: var(--ion-font-family); }
    .card .hint { margin: 0 0 14px; color: var(--ion-color-medium); font-size: 13.5px; }
    .chart-row { display: grid; gap: 16px; align-items: center; }
    .donut-wrap { display: flex; justify-content: center; }
    .legend { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
    .legend li { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 14px; }
    .swatch { width: 10px; height: 10px; border-radius: 3px; flex: none; }
    .legend .left { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .bars { display: grid; gap: 12px; }
    .bar-row { display: grid; gap: 4px; }
    .bar-label { display: flex; justify-content: space-between; font-size: 13.5px; gap: 8px; }
    .track { height: 12px; border-radius: 999px; background: var(--rs-soft); overflow: hidden; }
    .fill { height: 100%; border-radius: 999px; background: var(--ion-color-primary); }
    .pair { display: grid; gap: 6px; }
    .pair .fill.employer { background: var(--ion-color-primary); }
    .pair .fill.employee { background: #F2A93B; }
    .pair-keys { display: flex; gap: 14px; font-size: 12.5px; color: var(--ion-color-medium); margin-top: 4px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-inline-end: 4px; }
    .dot.employer { background: var(--ion-color-primary); }
    .dot.employee { background: #F2A93B; }
    .total { font-family: var(--rs-serif); font-size: 36px; font-weight: 700; line-height: 1; margin: 4px 0; }
    .err { color: var(--ion-color-danger); }
    @media (min-width: 992px) {
      .results-nav { display: none; }
      .grid { grid-template-columns: 1fr 1fr; }
      .grid .wide { grid-column: 1 / -1; }
      .chart-row { grid-template-columns: 200px 1fr; }
    }
    @media print {
      .results-nav, .toolbar, app-desk-header { display: none !important; }
      .card { break-inside: avoid; }
    }
  `],
  template: `
    <ion-content>
      <app-desk-header [step]="4" [tabs]="true"></app-desk-header>
      <div class="page ion-padding">
        <nav class="results-nav" aria-label="תוצאות">
          <a routerLink="/results/summary">מה מגיע לי</a>
          <a routerLink="/results/reports" class="on">דוחות</a>
          <a routerLink="/checklist">צ'קליסט</a>
          <a routerLink="/sources">מקורות</a>
        </nav>

        <h2>דוחות ותרשימים</h2>
        <p class="muted small">פירוט ויזואלי של מה שחושב, ושיעורי ההפרשות מהתלוש (אם זוהו).</p>

        <div class="toolbar no-print">
          <ion-button size="small" fill="outline" [disabled]="busy() || !report()" (click)="print()">הדפסה / PDF</ion-button>
          <ion-button size="small" fill="outline" [disabled]="busy()" (click)="download('html')">HTML</ion-button>
          <ion-button size="small" fill="outline" [disabled]="busy()" (click)="download('csv')">CSV</ion-button>
          <ion-button size="small" fill="outline" [disabled]="busy()" (click)="download('json')">JSON</ion-button>
        </div>

        @if (report(); as r) {
          <div class="grid">
            @for (s of r.scenarios; track s.reason; let i = $index) {
              <section class="card" [class.wide]="r.scenarios.length === 1">
                <h3>{{ s.reasonLabel }}</h3>
                <p class="hint">ותק {{ s.seniorityYears | number:'1.1-1' }} שנים</p>
                <div class="total"><small>₪</small>{{ s.estimatedTotal | number:'1.0-0' }}</div>
                @if (s.entitlementSlices.length) {
                  <div class="chart-row" style="margin-top:16px">
                    <div class="donut-wrap" [innerHTML]="donutSvg(s.entitlementSlices)"></div>
                    <ul class="legend">
                      @for (slice of s.entitlementSlices; track slice.key; let j = $index) {
                        <li>
                          <span class="left"><span class="swatch" [style.background]="color(j)"></span>{{ slice.label }}</span>
                          <b>₪{{ slice.value | number:'1.0-0' }}</b>
                        </li>
                      }
                    </ul>
                  </div>
                } @else {
                  <p class="muted small">אין רכיבים מספריים בסה״כ לתרחיש זה.</p>
                }
              </section>
            }

            @if (r.scenarioTotalSlices.length > 1) {
              <section class="card wide">
                <h3>השוואת סה״כ בין תרחישים</h3>
                <p class="hint">אם תפוטרו מול אם תתפטרו</p>
                <div class="bars">
                  @for (slice of r.scenarioTotalSlices; track slice.key; let j = $index) {
                    <div class="bar-row">
                      <div class="bar-label"><span>{{ slice.label }}</span><b>₪{{ slice.value | number:'1.0-0' }}</b></div>
                      <div class="track"><div class="fill" [style.width.%]="barPct(slice.value, maxScenario())" [style.background]="color(j)"></div></div>
                    </div>
                  }
                </div>
              </section>
            }

            @if (r.employerFundSlices.length || r.employeeFundSlices.length) {
              <section class="card wide">
                <h3>הפרשות לקופות מהתלוש</h3>
                <p class="hint">שיעורים / סכומים שזוהו — לא יתרות צבורות בקופה</p>
                <div class="pair-keys"><span><i class="dot employer"></i>מעסיק</span><span><i class="dot employee"></i>עובד</span></div>
                <div class="bars" style="margin-top:12px">
                  @for (row of fundRows(); track row.key) {
                    <div class="bar-row pair">
                      <div class="bar-label"><span>{{ row.label }}</span><span class="muted small">{{ row.unitLabel }}</span></div>
                      <div class="track"><div class="fill employer" [style.width.%]="barPct(row.employer, fundMax())"></div></div>
                      <div class="bar-label small"><span></span><span>{{ formatFund(row.employer, row.unit) }}</span></div>
                      <div class="track"><div class="fill employee" [style.width.%]="barPct(row.employee, fundMax())"></div></div>
                      <div class="bar-label small"><span></span><span>{{ formatFund(row.employee, row.unit) }}</span></div>
                    </div>
                  }
                </div>
              </section>
            } @else if (store.fromPayslip()) {
              <section class="card wide">
                <h3>קופות</h3>
                <p class="hint">לא זוהו שורות קופות בתלוש. אפשר לחזור לפרטים ולבדוק ידנית.</p>
              </section>
            }

            <section class="card wide">
              <h3>בסיס הדוח</h3>
              <p class="small">
                @if (r.basis.employerName) { <b>{{ r.basis.employerName }}</b> · }
                שכר ₪{{ r.basis.monthlySalary | number:'1.0-0' }}, משרה {{ r.basis.jobPercent }}%,
                התחלה {{ r.basis.startDate }}, סיום {{ r.basis.endDate }},
                חופשה {{ r.basis.vacationBalanceDays }} ימים
                @if (r.basis.fromPayslip) {
                  · לפי תלוש{{ r.basis.payslipMonth ? ' (' + r.basis.payslipMonth + ')' : '' }}
                }
              </p>
              <p class="muted small">{{ r.disclaimer }}</p>
            </section>
          </div>
        } @else if (busy()) {
          <p><ion-spinner name="crescent"></ion-spinner> בונים דוח…</p>
        } @else if (error()) {
          <p class="err">{{ error() }}</p>
          <ion-button fill="outline" (click)="load()">נסו שוב</ion-button>
        } @else {
          <p>עוד אין חישוב. <ion-button fill="clear" routerLink="/start">להתחיל</ion-button></p>
        }
      </div>
      <app-site-footer></app-site-footer>
    </ion-content>
  `
})
export class ReportsPage implements ViewWillEnter {
  readonly store = inject(WizardStore);
  private readonly api = inject(ApiService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly report = signal<RightsReport | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly fundRows = computed(() => {
    const r = this.report();
    if (!r) return [];
    const keys = new Set([
      ...r.employerFundSlices.map(s => s.key),
      ...r.employeeFundSlices.map(s => s.key)
    ]);
    return [...keys].map(key => {
      const er = r.employerFundSlices.find(s => s.key === key);
      const ee = r.employeeFundSlices.find(s => s.key === key);
      const unit = er?.unit ?? ee?.unit ?? 'percent';
      return {
        key,
        label: er?.label ?? ee?.label ?? key,
        employer: er?.value ?? 0,
        employee: ee?.value ?? 0,
        unit,
        unitLabel: unit === 'ils' ? '₪' : '%'
      };
    });
  });

  ionViewWillEnter(): void {
    void this.load();
  }

  async load(): Promise<void> {
    if (!this.store.results().length) {
      this.report.set(null);
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const body = this.body();
      this.report.set(await this.api.buildReport(body));
    } catch (err) {
      this.error.set(describeError(err).message);
    } finally {
      this.busy.set(false);
    }
  }

  async download(format: 'html' | 'csv' | 'json'): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const blob = await this.api.exportReport(this.body(), format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rosh-shaket-report.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      this.error.set(describeError(err).message);
    } finally {
      this.busy.set(false);
    }
  }

  print(): void {
    window.print();
  }

  color(i: number): string {
    return PALETTE[i % PALETTE.length];
  }

  barPct(value: number, max: number): number {
    if (!(max > 0) || !(value > 0)) return 0;
    return Math.max(4, Math.round((value / max) * 100));
  }

  maxScenario(): number {
    return Math.max(0, ...((this.report()?.scenarioTotalSlices ?? []).map(s => s.value)));
  }

  fundMax(): number {
    return Math.max(0, ...this.fundRows().flatMap(r => [r.employer, r.employee]));
  }

  formatFund(value: number, unit: string): string {
    if (!(value > 0)) return '—';
    return unit === 'ils' ? `₪${value}` : `${value}%`;
  }

  donutSvg(slices: ChartSlice[]): SafeHtml {
    const total = slices.reduce((s, x) => s + x.value, 0);
    if (!(total > 0)) return '';
    const cx = 90, cy = 90, r = 68, stroke = 22;
    const arcs: string[] = [];
    if (slices.length === 1) {
      arcs.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${this.color(0)}" stroke-width="${stroke}"/>`);
    } else {
      let angle = -Math.PI / 2;
      slices.forEach((slice, i) => {
        const sweep = (slice.value / total) * Math.PI * 2;
        const x1 = cx + r * Math.cos(angle);
        const y1 = cy + r * Math.sin(angle);
        angle += sweep;
        const x2 = cx + r * Math.cos(angle);
        const y2 = cy + r * Math.sin(angle);
        const large = sweep > Math.PI ? 1 : 0;
        arcs.push(
          `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}" fill="none" stroke="${this.color(i)}" stroke-width="${stroke}" stroke-linecap="butt"/>`
        );
      });
    }
    const svg = `<svg width="180" height="180" viewBox="0 0 180 180" aria-hidden="true">${arcs.join('')}<circle cx="${cx}" cy="${cy}" r="${r - stroke / 2 - 4}" fill="var(--ion-item-background, #fff)"/><text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="15" font-weight="700" fill="currentColor">₪${Math.round(total).toLocaleString('he-IL')}</text></svg>`;
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }

  private body() {
    const compare = this.store.results().length > 1;
    const reason: ExitReason | null = compare ? null : (this.store.activeReason() ?? null);
    return {
      profile: this.store.profile(),
      reason,
      compare,
      fromPayslip: this.store.fromPayslip(),
      payslipMonth: this.store.payslipMonth(),
      funds: this.store.funds() ?? [],
      employerName: this.store.profile().employerName ?? null
    };
  }
}
