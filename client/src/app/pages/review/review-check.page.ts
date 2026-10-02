import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ContributionTriplet, EmploymentMonth, FundKind } from '../../core/review.models';
import { ReviewStore } from '../../core/review.store';
import { ReviewStepNavComponent } from './review-step-nav.component';

type MonthState = 'ok' | 'salaryOnly' | 'gap' | 'missing' | 'waived';

interface CheckMonth {
  month: number;
  label: string;
  salary: number | null;
  expected: number | null;
  reported: number | null;
  actual: number | null;
  state: MonthState;
}

interface CheckYear {
  year: number;
  months: CheckMonth[];
  missing: number;
  gaps: number;
  payslipSum: number | null;
  form106: number | null;
  form106Note: string | null;
}

const MONTH_NAMES = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const FUND_LABELS: Record<FundKind, string> = { Pension: 'פנסיה', Severance: 'פיצויים', Study: 'קרן השתלמות', Managers: 'ביטוח מנהלים' };

@Component({
  selector: 'app-review-check',
  standalone: true,
  imports: [RouterLink, ReviewStepNavComponent],
  styles: [`
    .lead { color: var(--ion-color-primary); font-weight: 700; margin: 0 0 6px; }
    .hint { font-size: 13.5px; color: var(--ion-color-medium); margin: 0 0 14px; line-height: 1.45; }
    .notice {
      border: 1px solid var(--rs-line); border-radius: 12px; background: var(--rs-soft);
      padding: 10px 14px; font-size: 13.5px; line-height: 1.45; margin: 0 0 16px;
    }
    .notice a { color: var(--ion-color-primary); font-weight: 700; }
    h3.section { margin: 22px 0 10px; font-size: 18px; }

    .year-list { display: flex; flex-direction: column; gap: 10px; }
    .year-card { border: 1.5px solid var(--rs-line); border-radius: 14px; background: var(--ion-item-background); overflow: hidden; }
    .year-card.ok { border-color: color-mix(in srgb, var(--ion-color-success) 45%, var(--rs-line)); }
    .year-card.bad { border-color: color-mix(in srgb, var(--ion-color-danger) 35%, var(--rs-line)); }
    .year-head {
      width: 100%; border: 0; background: transparent; color: inherit; cursor: pointer; font: inherit;
      display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; text-align: start;
    }
    .year-head b { font-size: 16px; }
    .meta { font-size: 12.5px; color: var(--ion-color-medium); }
    .meta .ok { color: var(--ion-color-success-shade, #1a7a3c); font-weight: 700; }
    .meta .bad { color: var(--ion-color-danger); font-weight: 700; }
    .year-body { padding: 0 16px 14px; border-top: 1px solid var(--rs-line); }

    .grid { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13.5px; }
    .grid th { font-size: 11.5px; font-weight: 600; color: var(--ion-color-medium); text-align: start; padding: 6px 4px; }
    .grid td { padding: 9px 4px; border-top: 1px solid var(--rs-line); white-space: nowrap; }
    .grid td.num { font-weight: 700; }
    .grid .unk { color: var(--ion-color-medium); font-weight: 400; }
    .tag { display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; }
    .tag.ok { background: rgba(var(--ion-color-success-rgb, 45, 170, 90), .12); color: var(--ion-color-success-shade, #1a7a3c); }
    .tag.gap, .tag.missing { background: rgba(var(--ion-color-danger-rgb, 235, 68, 90), .1); color: var(--ion-color-danger); }
    .tag.waived { background: var(--rs-soft); color: var(--ion-color-medium); }
    .tag a { color: inherit; }
    @media (max-width: 560px) {
      .grid .wide { display: none; }
    }

    .compare { margin: 12px 0 0; font-size: 13px; line-height: 1.45; }
    .compare b { font-weight: 700; }
    .compare .warn { color: var(--ion-color-danger); }

    .funds { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
    .fund { border: 1px solid var(--rs-line); border-radius: 12px; padding: 12px 14px; background: var(--ion-item-background); }
    .fund b { display: block; font-size: 14px; }
    .fund .amt { font-size: 18px; font-weight: 800; margin: 4px 0; }
    .fund .small { font-size: 12px; color: var(--ion-color-medium); line-height: 1.4; }
  `],
  template: `
    <h2>בדיקת הנתונים</h2>
    <p class="lead">כל מה שנקרא מהמסמכים שהעליתם, חודש אחרי חודש.</p>
    <p class="hint">אין כאן מה למלא. חסר משהו? מעלים את המסמך בשלב «מסמכים» והנתונים מתעדכנים לבד.</p>

    @if (!depositsFromDocs()) {
      <p class="notice">
        כרגע נקראים מהמסמכים השכר ויתרות הקופות. סכומי ההפקדה מהתלוש ומהקופה עדיין לא נקראים —
        לכן העמודות «בתלוש» ו«בקופה» מוצגות כ״לא ידוע״. «צפוי» מחושב לפי השכר ושיעורי ההפרשה בחוק.
      </p>
    }

    @if (!years().length) {
      <p class="notice">עדיין אין נתונים. <a routerLink="/review/documents">להעלאת מסמכים</a></p>
    } @else {
      <h3 class="section">שכר והפקדות</h3>
      <div class="year-list">
        @for (y of years(); track y.year) {
          <div class="year-card" [class.ok]="!y.missing && !y.gaps" [class.bad]="y.missing || y.gaps">
            <button type="button" class="year-head" (click)="toggle(y.year)" [attr.aria-expanded]="open() === y.year">
              <span>
                <b>{{ y.year }}</b>
                <div class="meta">
                  @if (!y.missing && !y.gaps) {
                    <span class="ok">כל החודשים מכוסים</span>
                  } @else {
                    @if (y.missing) { <span class="bad">{{ y.missing }} תלושים חסרים</span> }
                    @if (y.missing && y.gaps) { · }
                    @if (y.gaps) { <span class="bad">{{ y.gaps }} חודשים עם פער</span> }
                  }
                </div>
              </span>
              <span class="meta" aria-hidden="true">{{ open() === y.year ? '▾' : '◂' }}</span>
            </button>

            @if (open() === y.year) {
              <div class="year-body">
                <table class="grid">
                  <thead>
                    <tr>
                      <th>חודש</th>
                      <th>שכר ברוטו</th>
                      <th class="wide">צפוי להפקדה</th>
                      <th class="wide">בתלוש</th>
                      <th class="wide">בקופה</th>
                      <th>מצב</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (m of y.months; track m.month) {
                      <tr>
                        <td>{{ m.label }}</td>
                        <td class="num" [class.unk]="m.salary == null">{{ cell(m.salary) }}</td>
                        <td class="num wide" [class.unk]="m.expected == null">{{ cell(m.expected) }}</td>
                        <td class="num wide" [class.unk]="m.reported == null">{{ cell(m.reported) }}</td>
                        <td class="num wide" [class.unk]="m.actual == null">{{ cell(m.actual) }}</td>
                        <td>
                          @switch (m.state) {
                            @case ('ok') { <span class="tag ok">תקין</span> }
                            @case ('salaryOnly') { <span class="unk">—</span> }
                            @case ('gap') { <span class="tag gap">פער</span> }
                            @case ('waived') { <span class="tag waived">דולג</span> }
                            @default { <span class="tag missing"><a routerLink="/review/documents">חסר תלוש</a></span> }
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>

                @if (y.form106 != null) {
                  <p class="compare">
                    לפי טופס 106: <b>{{ store.fmt(y.form106) }}</b> · סכום התלושים: <b>{{ store.fmt(y.payslipSum) }}</b>
                    @if (y.form106Note) { <br><span class="warn">{{ y.form106Note }}</span> }
                  </p>
                }
              </div>
            }
          </div>
        }
      </div>

      <h3 class="section">קופות</h3>
      @if (funds().length) {
        <div class="funds">
          @for (f of funds(); track f.id) {
            <div class="fund">
              <b>{{ fundLabel(f.kind) }}</b>
              <div class="amt">{{ store.fmt(f.balance) }}</div>
              <div class="small">
                {{ f.provider || 'גוף מנהל לא זוהה' }}
                @if (f.asOf) { · נכון ל־{{ f.asOf }} }
                @if (f.feeAnnualPercent != null) { <br>דמי ניהול {{ f.feeAnnualPercent }}% }
              </div>
            </div>
          }
        </div>
      } @else {
        <p class="notice">לא נקראו יתרות קופות. <a routerLink="/review/documents">העלו דוח פנסיה / קרן השתלמות</a> והיתרות יופיעו כאן.</p>
      }
    }

    <app-review-step-nav nextLabel="לתוצאות" (next)="next()" />
  `
})
export class ReviewCheckPage implements OnInit {
  readonly store = inject(ReviewStore);
  private readonly router = inject(Router);
  readonly open = signal<number | null>(null);

  readonly funds = computed(() => (this.store.review()?.funds ?? []).filter(f => f.source === 'document' || f.balance != null));

  readonly depositsFromDocs = computed(() =>
    (this.store.review()?.months ?? []).some(m => this.total(m, 'reported') != null || this.total(m, 'actual') != null)
  );

  readonly years = computed((): CheckYear[] => {
    const r = this.store.review();
    if (!r?.period) return [];
    const gapMonths = new Set(
      (this.store.analysis()?.summary.months ?? []).filter(m => m.hasGap).map(m => `${m.year}-${m.month}`)
    );
    const byYear = new Map<number, EmploymentMonth[]>();
    for (const m of r.months) byYear.set(m.year, [...(byYear.get(m.year) ?? []), m]);

    return [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, rows]) => {
      const months = rows.sort((a, b) => a.month - b.month).map((m): CheckMonth => {
        const hasPayslip = r.documents.some(d => d.documentType === 'payslip' && d.year === year && d.month === m.month);
        let state: MonthState = 'ok';
        if (m.grossSalary == null) state = this.store.isWaived('payslip', year, m.month) ? 'waived' : 'missing';
        else if (gapMonths.has(`${year}-${m.month}`)) state = 'gap';
        else if (!hasPayslip && m.flags !== 'manual') state = 'missing';
        const reported = this.total(m, 'reported');
        const actual = this.total(m, 'actual');
        if (state === 'ok' && reported == null && actual == null) state = 'salaryOnly';
        return {
          month: m.month,
          label: MONTH_NAMES[m.month] ?? String(m.month),
          salary: m.grossSalary,
          expected: this.total(m, 'expected'),
          reported,
          actual,
          state
        };
      });
      const salaries = months.map(m => m.salary).filter((v): v is number => v != null);
      const payslipSum = salaries.length ? salaries.reduce((s, v) => s + v, 0) : null;
      const form106 = r.documents.find(d => d.documentType === 'form106' && d.year === year)?.extractedAnnualGross ?? null;
      const missing = months.filter(m => m.state === 'missing').length;
      return {
        year,
        months,
        missing,
        gaps: months.filter(m => m.state === 'gap').length,
        payslipSum,
        form106,
        form106Note: this.form106Note(form106, payslipSum, missing)
      };
    });
  });

  async ngOnInit(): Promise<void> {
    this.store.scrubOrphanSalaries();
    this.store.syncSalariesFromDocuments();
    this.store.syncFundsFromDocuments();
    try {
      await this.store.fillExpectedFromServer();
    } catch {
      // Rules endpoint down — show salaries without expected amounts.
    }
    await this.store.analyze();
    const ys = this.years();
    this.open.set(ys.find(y => y.missing || y.gaps)?.year ?? ys[0]?.year ?? null);
  }

  toggle(year: number): void {
    this.open.set(this.open() === year ? null : year);
  }

  cell(v: number | null): string {
    return v == null ? 'לא ידוע' : this.store.fmt(v);
  }

  fundLabel(kind: FundKind): string {
    return FUND_LABELS[kind] ?? kind;
  }

  next(): void {
    void this.router.navigateByUrl('/review/report');
  }

  private total(m: EmploymentMonth, key: keyof ContributionTriplet): number | null {
    const lines = [m.employeePension, m.employerPension, m.employeeCompensation, m.employerCompensation, m.trainingFundEmployee, m.trainingFundEmployer];
    const vals = lines.map(t => t?.[key]).filter((v): v is number => v != null);
    return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0)) : null;
  }

  private form106Note(form106: number | null, payslipSum: number | null, missing: number): string | null {
    if (form106 == null || payslipSum == null) return null;
    if (missing > 0) return 'חסרים תלושים לשנה הזו — לכן הסכומים לא אמורים להתאים עדיין.';
    const diff = Math.abs(form106 - payslipSum) / Math.max(1, form106);
    if (diff <= 0.03) return null;
    return 'סכום התלושים שונה מטופס 106. ייתכן שיש תשלומים שלא מופיעים בתלושים שהועלו (בונוס, פדיון חופשה) או שתלוש נקרא לא נכון.';
  }
}
