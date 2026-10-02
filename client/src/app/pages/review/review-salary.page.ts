import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonButton, IonIcon, IonInput } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { calculatorOutline } from 'ionicons/icons';
import { ReviewStore, MAX_MONTHLY_GROSS_SALARY, MIN_MONTHLY_GROSS_SALARY } from '../../core/review.store';
import { ReviewStepNavComponent } from './review-step-nav.component';

type MonthSource = 'payslip' | 'manual' | 'empty' | 'waived';

interface MonthRow {
  year: number;
  month: number;
  label: string;
  salary: number | null;
  source: MonthSource;
}

interface YearBlock {
  year: number;
  months: MonthRow[];
  filled: number;
  total: number;
  avg: number | null;
  sum: number | null;
  gaps: number;
  form106Annual: number | null;
  ok: boolean;
}

@Component({
  selector: 'app-review-salary',
  standalone: true,
  imports: [FormsModule, IonButton, IonIcon, IonInput, ReviewStepNavComponent],
  styles: [`
    .lead { color: var(--ion-color-primary); font-weight: 700; margin: 0 0 8px; }
    .hint { font-size: 13.5px; color: var(--ion-color-medium); margin: 0 0 14px; line-height: 1.45; }
    .year-list { display: flex; flex-direction: column; gap: 10px; margin: 0 0 16px; }
    .year-card {
      border: 1.5px solid var(--rs-line); border-radius: 14px; background: var(--ion-item-background);
      overflow: hidden;
    }
    .year-card.ok { border-color: color-mix(in srgb, var(--ion-color-success) 45%, var(--rs-line)); }
    .year-card.has-gap { border-color: color-mix(in srgb, var(--ion-color-danger) 35%, var(--rs-line)); }
    .year-head {
      width: 100%; border: 0; background: transparent; color: inherit; cursor: pointer;
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 14px 16px; font: inherit; text-align: start;
    }
    .year-head b { font-size: 16px; }
    .year-meta { font-size: 12.5px; color: var(--ion-color-medium); line-height: 1.35; }
    .year-meta .ok { color: var(--ion-color-success-shade, #1a7a3c); font-weight: 700; }
    .year-meta .miss { color: var(--ion-color-danger); font-weight: 700; }
    .chev { color: var(--ion-color-medium); font-size: 18px; flex: none; }
    .year-body { padding: 0 16px 14px; border-top: 1px solid var(--rs-line); }
    .summary {
      display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px;
      margin: 12px 0; font-size: 13px;
    }
    @media (min-width: 560px) {
      .summary { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    }
    .summary div {
      background: var(--rs-soft); border-radius: 10px; padding: 10px 12px;
    }
    .summary span { display: block; font-size: 11.5px; color: var(--ion-color-medium); margin-bottom: 2px; }
    .summary b { font-size: 14px; }
    .month-row {
      display: grid; grid-template-columns: 88px 1fr auto; gap: 10px; align-items: center;
      padding: 10px 0; border-bottom: 1px solid var(--rs-line); font-size: 14px;
    }
    .month-row:last-child { border-bottom: 0; }
    .tag {
      display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 8px;
      border-radius: 999px; background: var(--rs-soft); color: var(--ion-color-medium-shade, #5E6F73);
    }
    .tag.payslip { background: rgba(var(--ion-color-success-rgb, 45, 170, 90), .12); color: var(--ion-color-success-shade, #1a7a3c); }
    .tag.manual { background: rgba(var(--ion-color-primary-rgb, 14, 124, 107), .12); color: var(--ion-color-primary); }
    .tag.empty { background: rgba(var(--ion-color-danger-rgb, 235, 68, 90), .1); color: var(--ion-color-danger); }
    .tag.waived { color: var(--ion-color-medium); }
    .amt { font-weight: 700; white-space: nowrap; }
    .gap-edit { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 6px; }
    .gap-edit ion-input {
      --padding-start: 10px; --padding-end: 10px; max-width: 160px;
      border: 1px solid var(--rs-line); border-radius: 10px; min-height: 38px;
    }
    .gap-err { color: var(--ion-color-danger); font-size: 12.5px; margin: 4px 0 0; grid-column: 1 / -1; }
    .tools {
      display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: center;
      margin: 10px 0 0;
    }
    .tools button {
      background: none; border: 0; padding: 0; cursor: pointer; font: inherit;
      font-size: 13px; font-weight: 700; color: var(--ion-color-primary);
      display: inline-flex; align-items: center; gap: 5px;
    }
    .tools button:disabled { opacity: .45; cursor: default; }
    .tools button ion-icon { font-size: 16px; }
  `],
  template: `
    <h2>היסטוריית שכר</h2>
    <p class="lead">השכר מתמלא אוטומטית מהתלושים שכבר הועלו.</p>
    <p class="hint">
      רק בחודשים בלי תלוש אפשר להזין ידנית. חודשים שסומנו «לחץ אם אין» מוצגים כדולגים.
    </p>

    @if (!yearBlocks().length) {
      <p class="hint">מלאו תקופת העסקה והעלו תלושים בשלב המסמכים — ואז תופיע כאן ההיסטוריה.</p>
    } @else {
      <div class="year-list">
        @for (y of yearBlocks(); track y.year) {
          <div class="year-card" [class.ok]="y.ok" [class.has-gap]="!y.ok">
            <button type="button" class="year-head" (click)="toggleYear(y.year)" [attr.aria-expanded]="openYear() === y.year">
              <span>
                <b>{{ y.year }}</b>
                <div class="year-meta">
                  @if (y.ok) {
                    <span class="ok">{{ y.filled }}/{{ y.total }} חודשים עם שכר</span>
                  } @else {
                    <span class="miss">{{ y.gaps }} חסרים למילוי</span>
                    · {{ y.filled }}/{{ y.total }} מולאו
                  }
                </div>
              </span>
              <span class="chev" aria-hidden="true">{{ openYear() === y.year ? '▾' : '◂' }}</span>
            </button>

            @if (openYear() === y.year) {
              <div class="year-body">
                <div class="summary">
                  <div><span>ממוצע חודשי</span><b>{{ y.avg != null ? store.fmt(y.avg) : '—' }}</b></div>
                  <div><span>סה״כ ברוטו (מהחודשים)</span><b>{{ y.sum != null ? store.fmt(y.sum) : '—' }}</b></div>
                  <div><span>חודשים עם שכר</span><b>{{ y.filled }}/{{ y.total }}</b></div>
                  <div>
                    <span>סיכום מ־106</span>
                    <b>{{ y.form106Annual != null ? store.fmt(y.form106Annual) : '—' }}</b>
                  </div>
                </div>

                @for (m of y.months; track m.month) {
                  <div class="month-row">
                    <div>
                      <div>{{ m.label }}</div>
                      <span class="tag" [class]="m.source">{{ sourceLabel(m.source) }}</span>
                    </div>
                    <div>
                      @if (m.source === 'empty') {
                        <div class="gap-edit">
                          <ion-input
                            type="number"
                            inputmode="decimal"
                            placeholder="שכר ברוטו"
                            [min]="minSalary + 0.01"
                            [max]="maxSalary"
                            [value]="draftSalary[key(m.year, m.month)]"
                            (ionInput)="onDraft(m.year, m.month, $event)">
                          </ion-input>
                          <ion-button size="small" (click)="saveManual(m.year, m.month)">שמירה</ion-button>
                        </div>
                        @if (draftError[key(m.year, m.month)]) {
                          <p class="gap-err">{{ draftError[key(m.year, m.month)] }}</p>
                        }
                      } @else if (m.source === 'waived') {
                        <span class="hint" style="margin:0">דולג — לא ייכלל בחישוב החודשי</span>
                      }
                    </div>
                    <div class="amt">
                      @if (m.salary != null) { {{ store.fmt(m.salary) }} }
                      @else if (m.source === 'waived') { — }
                      @else { }
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        }
      </div>

      <div class="tools">
        <button type="button" (click)="fillExpected()" [disabled]="store.busy()">
          <ion-icon name="calculator-outline" aria-hidden="true"></ion-icon>
          חישוב הפקדות צפויות
        </button>
      </div>
    }

    <app-review-step-nav (next)="next()" />
  `
})
export class ReviewSalaryPage implements OnInit {
  readonly store = inject(ReviewStore);
  private readonly router = inject(Router);

  readonly openYear = signal<number | null>(null);
  readonly minSalary = MIN_MONTHLY_GROSS_SALARY;
  readonly maxSalary = MAX_MONTHLY_GROSS_SALARY;
  draftSalary: Record<string, string> = {};
  draftError: Record<string, string> = {};

  constructor() {
    addIcons({ calculatorOutline });
  }

  readonly monthNames = [
    '', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
    'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
  ];

  readonly yearBlocks = computed((): YearBlock[] => {
    const r = this.store.review();
    if (!r?.period) return [];
    const byYear = new Map<number, MonthRow[]>();
    for (const m of r.months) {
      const payslip = r.documents.find(
        d => d.documentType === 'payslip' && d.year === m.year && d.month === m.month
      );
      const waived = this.store.isWaived('payslip', m.year, m.month);
      let source: MonthSource = 'empty';
      if (m.grossSalary != null && (m.flags === 'from_payslip' || payslip?.extractedGrossSalary != null)) {
        source = 'payslip';
      } else if (m.grossSalary != null && m.flags === 'manual') {
        source = 'manual';
      } else if (waived) {
        source = 'waived';
      }
      // Orphan gross (no flag / no payslip) is treated as empty — see scrubOrphanSalaries.

      const row: MonthRow = {
        year: m.year,
        month: m.month,
        label: this.monthNames[m.month] ?? String(m.month),
        salary: m.grossSalary,
        source
      };
      const list = byYear.get(m.year) ?? [];
      list.push(row);
      byYear.set(m.year, list);
    }

    return [...byYear.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([year, months]) => {
        months.sort((a, b) => a.month - b.month);
        const withPay = months.filter(m => m.source === 'payslip' || m.source === 'manual');
        const gaps = months.filter(m => m.source === 'empty').length;
        const sum = withPay.length ? withPay.reduce((s, m) => s + (m.salary ?? 0), 0) : null;
        const avg = withPay.length && sum != null ? sum / withPay.length : null;
        const form106 = r.documents.find(d => d.documentType === 'form106' && d.year === year);
        return {
          year,
          months,
          filled: withPay.length,
          total: months.length,
          avg,
          sum,
          gaps,
          form106Annual: form106?.extractedAnnualGross ?? null,
          ok: gaps === 0
        };
      });
  });

  ngOnInit(): void {
    this.store.scrubOrphanSalaries();
    this.store.syncSalariesFromDocuments();
    const blocks = this.yearBlocks();
    const firstGap = blocks.find(b => !b.ok)?.year ?? blocks[0]?.year ?? null;
    this.openYear.set(firstGap);
  }

  toggleYear(year: number): void {
    this.openYear.set(this.openYear() === year ? null : year);
  }

  sourceLabel(source: MonthSource): string {
    switch (source) {
      case 'payslip': return 'מתלוש';
      case 'manual': return 'ידני';
      case 'waived': return 'דולג';
      default: return 'חסר';
    }
  }

  key(year: number, month: number): string {
    return `${year}-${month}`;
  }

  onDraft(year: number, month: number, ev: CustomEvent): void {
    const k = this.key(year, month);
    const v = (ev.detail as { value?: string | number | null })?.value;
    this.draftSalary[k] = v == null ? '' : String(v);
    delete this.draftError[k];
  }

  saveManual(year: number, month: number): void {
    const k = this.key(year, month);
    const raw = this.draftSalary[k];
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= MIN_MONTHLY_GROSS_SALARY) {
      this.draftError[k] = `שכר חודשי חייב להיות גדול מ־${MIN_MONTHLY_GROSS_SALARY.toLocaleString('he-IL')} ₪.`;
      return;
    }
    if (n > MAX_MONTHLY_GROSS_SALARY) {
      this.draftError[k] = `שכר חודשי עד ${MAX_MONTHLY_GROSS_SALARY.toLocaleString('he-IL')} ₪.`;
      return;
    }
    if (!this.store.setManualMonthSalary(year, month, n, true)) {
      this.draftError[k] = 'לא ניתן לשמור את הסכום.';
      return;
    }
    delete this.draftSalary[k];
    delete this.draftError[k];
  }

  async fillExpected(): Promise<void> {
    await this.store.fillExpectedFromServer();
  }

  async next(): Promise<void> {
    await this.store.fillExpectedFromServer();
    await this.router.navigateByUrl('/review/funds');
  }
}
