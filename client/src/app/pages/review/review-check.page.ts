import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ContributionKind, EmploymentMonth, ExtractedContribution, FundKind } from '../../core/review.models';
import { ReviewStore } from '../../core/review.store';
import { ReviewStepNavComponent } from './review-step-nav.component';

/** Legal floor for severance; the rules' 8.33% is full severance coverage. */
const SEVERANCE_MIN_PERCENT = 6;
/** Mandatory pension may start only after a waiting period at a new job. */
const WAITING_MONTHS = 6;
const TOLERANCE = 0.97;

type Verdict = 'ok' | 'low' | 'none' | 'waiting' | 'unread' | 'missing' | 'waived';

interface Issue { text: string; bad: boolean; }

interface MonthLine extends ExtractedContribution { retro: boolean; }

interface CheckMonth {
  key: string;
  month: number;
  label: string;
  gross: number | null;
  base: number | null;
  employee: number | null;
  employer: number | null;
  severance: number | null;
  study: number | null;
  verdict: Verdict;
  issues: Issue[];
  lines: MonthLine[];
}

interface FundRow {
  key: string;
  provider: string;
  kind: string;
  employee: number;
  employer: number;
  severance: number;
}

interface CheckYear {
  year: number;
  months: CheckMonth[];
  funds: FundRow[];
  missing: number;
  problems: number;
  unread: number;
  employeeTotal: number;
  employerTotal: number;
  form106: number | null;
  grossSum: number | null;
}

const MONTH_NAMES = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const KIND_LABELS: Record<ContributionKind, string> = {
  pension: 'קרן פנסיה', managers: 'ביטוח מנהלים', severance: 'פיצויים', disability: 'אובדן כושר עבודה', study: 'קרן השתלמות'
};
const FUND_LABELS: Record<FundKind, string> = { Pension: 'פנסיה', Severance: 'פיצויים', Study: 'קרן השתלמות', Managers: 'ביטוח מנהלים' };

@Component({
  selector: 'app-review-check',
  standalone: true,
  imports: [RouterLink, ReviewStepNavComponent],
  styles: [`
    .lead { color: var(--ion-color-primary); font-weight: 700; margin: 0 0 6px; }
    .hint { font-size: 13.5px; color: var(--ion-color-medium); margin: 0 0 14px; line-height: 1.5; }
    .notice {
      border: 1px solid var(--rs-line); border-radius: 12px; background: var(--rs-soft);
      padding: 10px 14px; font-size: 13.5px; line-height: 1.5; margin: 0 0 16px;
    }
    .notice a { color: var(--ion-color-primary); font-weight: 700; }
    h3.section { margin: 24px 0 10px; font-size: 18px; }
    h4 { margin: 16px 0 6px; font-size: 14.5px; }

    .year-list { display: flex; flex-direction: column; gap: 10px; }
    .year-card { box-shadow: var(--rs-card-shadow); border: 1.5px solid var(--rs-line); border-radius: 14px; background: var(--ion-item-background); overflow: hidden; }
    .year-card.ok { border-color: color-mix(in srgb, var(--ion-color-success) 45%, var(--rs-line)); }
    .year-card.bad { border-color: color-mix(in srgb, var(--ion-color-danger) 35%, var(--rs-line)); }
    .year-head {
      width: 100%; border: 0; background: transparent; color: inherit; cursor: pointer; font: inherit;
      display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; text-align: start;
    }
    .year-head b { font-size: 16px; }
    .meta { font-size: 12.5px; color: var(--ion-color-medium); }
    .good { color: var(--ion-color-success-shade, #1a7a3c); font-weight: 700; }
    .bad-t { color: var(--ion-color-danger); font-weight: 700; }
    .year-body { padding: 4px 16px 16px; border-top: 1px solid var(--rs-line); }

    .totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin: 12px 0 4px; }
    .totals div { background: var(--rs-soft); border-radius: 10px; padding: 10px 12px; }
    .totals span { display: block; font-size: 12.5px; color: var(--ion-color-medium); margin-bottom: 2px; }
    .totals b { font-size: 15px; }

    .tbl-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
    th { font-size: 12.5px; font-weight: 600; color: var(--ion-color-medium); text-align: start; padding: 6px; white-space: nowrap; }
    td { padding: 8px 6px; border-top: 1px solid var(--rs-line); white-space: nowrap; }
    td.n { font-weight: 700; font-variant-numeric: tabular-nums; }
    td.unk { color: var(--ion-color-medium); }
    tr.month { cursor: pointer; }
    tr.month:hover td { background: var(--rs-soft); }
    tr.detail td { background: var(--rs-soft); white-space: normal; padding: 10px 12px; }
    .issues { margin: 0; padding: 0; list-style: none; font-size: 12.5px; line-height: 1.45; }
    .issues li.bad { color: var(--ion-color-danger); }
    .issues li.warn { color: var(--ion-color-warning-shade, #8a6d00); }
    .lines { margin-top: 8px; }
    .lines td { border-top-color: color-mix(in srgb, var(--rs-line) 60%, transparent); background: transparent; padding: 5px 6px; }
    .retro { font-size: 12.5px; color: var(--ion-color-medium); }

    .tag { display: inline-block; font-size: 12.5px; font-weight: 700; padding: 2px 8px; border-radius: 999px; }
    .tag.ok { background: rgba(var(--ion-color-success-rgb, 45, 170, 90), .12); color: var(--ion-color-success-shade, #1a7a3c); }
    .tag.low, .tag.none, .tag.missing { background: rgba(var(--ion-color-danger-rgb, 235, 68, 90), .1); color: var(--ion-color-danger); }
    .tag.waiting { background: rgba(var(--ion-color-warning-rgb, 255, 196, 9), .16); color: var(--ion-color-warning-shade, #8a6d00); }
    .tag.unread, .tag.waived { background: var(--rs-soft); color: var(--ion-color-medium); }
    .tag a { color: inherit; }

    .compare { margin: 12px 0 0; font-size: 13px; line-height: 1.5; }

    .funds { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
    .fund { box-shadow: var(--rs-card-shadow); border: 1px solid var(--rs-line); border-radius: 12px; padding: 12px 14px; background: var(--ion-item-background); }
    .fund b { display: block; font-size: 14px; }
    .fund .amt { font-size: 18px; font-weight: 800; margin: 4px 0; }
    .fund .small { font-size: 12px; color: var(--ion-color-medium); line-height: 1.4; }
  `],
  template: `
    <h2>מה הופרש לכם</h2>
    <p class="lead">כמה אתם והמעסיק הפרשתם, לאיזו קופה, והאם זה לפי החוק.</p>
    <p class="hint">
      הכול נקרא מהתלושים. <b>עובד</b> = מה שנוכה מהשכר שלכם. <b>מעסיק</b> = מה שהמעסיק הפריש לתגמולים (כולל אובדן כושר עבודה).
      <b>פיצויים</b> = הפרשת המעסיק לפיצויים. לחצו על חודש לפירוט לפי קופה.
    </p>

    @if (needsReread()) {
      <p class="notice">
        חלק מהתלושים נבדקו לפני שהמערכת קראה את שורות ההפרשה. כדי לראות אותן —
        <a routerLink="/review/documents">בשלב המסמכים</a> לחצו «בדיקה מחדש» על התלושים.
      </p>
    }

    @if (!years().length) {
      <p class="notice">עדיין אין נתונים. <a routerLink="/review/documents">להעלאת מסמכים</a></p>
    } @else {
      <div class="year-list">
        @for (y of years(); track y.year) {
          <div class="year-card" [class.ok]="!y.missing && !y.problems && !y.unread" [class.bad]="y.missing || y.problems">
            <button type="button" class="year-head" (click)="toggleYear(y.year)" [attr.aria-expanded]="openYear() === y.year">
              <span>
                <b>{{ y.year }}</b>
                <div class="meta">
                  @if (y.unread && !y.missing && !y.problems) {
                    <span>{{ y.unread }} חודשים עוד לא נקראו מהתלושים</span>
                  } @else if (!y.missing && !y.problems) {
                    <span class="good">ההפרשות תקינות בכל החודשים</span>
                  } @else {
                    @if (y.problems) { <span class="bad-t">{{ y.problems }} חודשים עם הפרשה חסרה או נמוכה</span> }
                    @if (y.problems && y.missing) { · }
                    @if (y.missing) { <span class="bad-t">{{ y.missing }} תלושים חסרים</span> }
                  }
                </div>
              </span>
              <span class="meta" aria-hidden="true">{{ openYear() === y.year ? '▾' : '◂' }}</span>
            </button>

            @if (openYear() === y.year) {
              <div class="year-body">
                <div class="totals">
                  <div><span>אתם הפרשתם</span><b>{{ store.fmt(y.employeeTotal) }}</b></div>
                  <div><span>המעסיק הפריש (כולל פיצויים)</span><b>{{ store.fmt(y.employerTotal) }}</b></div>
                </div>

                @if (y.funds.length) {
                  <h4>לאן הלך הכסף</h4>
                  <div class="tbl-wrap">
                    <table>
                      <thead><tr><th>קופה</th><th>סוג</th><th>עובד</th><th>מעסיק</th><th>פיצויים</th></tr></thead>
                      <tbody>
                        @for (f of y.funds; track f.key) {
                          <tr>
                            <td>{{ f.provider }}</td>
                            <td>{{ f.kind }}</td>
                            <td class="n">{{ amount(f.employee) }}</td>
                            <td class="n">{{ amount(f.employer) }}</td>
                            <td class="n">{{ amount(f.severance) }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                }

                <h4>חודש אחרי חודש</h4>
                <div class="tbl-wrap">
                  <table>
                    <thead>
                      <tr><th>חודש</th><th>ברוטו</th><th>בסיס לפנסיה</th><th>עובד</th><th>מעסיק</th><th>פיצויים</th><th>השתלמות</th><th>בדיקה</th></tr>
                    </thead>
                    <tbody>
                      @for (m of y.months; track m.key) {
                        <tr class="month" (click)="toggleMonth(m.key)" [attr.aria-expanded]="openMonth() === m.key">
                          <td>{{ m.label }}</td>
                          <td class="n" [class.unk]="m.gross == null">{{ cell(m.gross) }}</td>
                          <td class="n" [class.unk]="m.base == null">{{ cell(m.base) }}</td>
                          <td class="n" [class.unk]="m.employee == null">{{ withRate(m.employee, m.base) }}</td>
                          <td class="n" [class.unk]="m.employer == null">{{ withRate(m.employer, m.base) }}</td>
                          <td class="n" [class.unk]="m.severance == null">{{ withRate(m.severance, m.base) }}</td>
                          <td class="n" [class.unk]="m.study == null">{{ cell(m.study) }}</td>
                          <td>
                            <span class="tag" [class]="m.verdict">
                              @if (m.verdict === 'missing') { <a routerLink="/review/documents" (click)="$event.stopPropagation()">חסר תלוש</a> }
                              @else { {{ verdictLabel(m.verdict) }} }
                            </span>
                          </td>
                        </tr>
                        @if (openMonth() === m.key) {
                          <tr class="detail">
                            <td colspan="8">
                              @if (m.issues.length) {
                                <ul class="issues">
                                  @for (i of m.issues; track i.text) { <li [class.bad]="i.bad" [class.warn]="!i.bad">{{ i.text }}</li> }
                                </ul>
                              }
                              @if (m.lines.length) {
                                <table class="lines">
                                  <thead><tr><th>קופה</th><th>רכיב</th><th>מי</th><th>אחוז</th><th>סכום</th></tr></thead>
                                  <tbody>
                                    @for (l of m.lines; track $index) {
                                      <tr>
                                        <td>{{ l.provider || '—' }}</td>
                                        <td>{{ kindLabel(l.kind) }}</td>
                                        <td>{{ l.payer === 'employee' ? 'עובד' : 'מעסיק' }}</td>
                                        <td>{{ l.ratePercent != null ? l.ratePercent + '%' : '—' }}</td>
                                        <td class="n">
                                          {{ store.fmt(l.amount) }}
                                          @if (l.retro) { <span class="retro">· הפרש מתלוש מאוחר יותר</span> }
                                        </td>
                                      </tr>
                                    }
                                  </tbody>
                                </table>
                              } @else if (!m.issues.length) {
                                <span class="meta">אין שורות הפרשה לחודש הזה.</span>
                              }
                            </td>
                          </tr>
                        }
                      }
                    </tbody>
                  </table>
                </div>

                @if (y.form106 != null && y.grossSum != null) {
                  <p class="compare">
                    ברוטו לפי טופס 106: <b>{{ store.fmt(y.form106) }}</b> · ברוטו לפי התלושים: <b>{{ store.fmt(y.grossSum) }}</b>
                    @if (y.missing) {
                      <br><span class="meta">חסרים תלושים לשנה הזו, לכן הסכומים לא אמורים להתאים עדיין.</span>
                    } @else if (form106Diff(y) > 0.03) {
                      <br><span class="bad-t">הפרש של {{ store.fmt(y.form106 - y.grossSum) }}. ייתכן שתלוש נקרא לא נכון או שיש תשלום שאינו בתלושים שהועלו.</span>
                    } @else {
                      <br><span class="good">תואם לטופס 106.</span>
                    }
                  </p>
                }
              </div>
            }
          </div>
        }
      </div>

      <h3 class="section">האם הכסף הגיע לקופות</h3>
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
        <p class="notice">
          התלושים מראים מה המעסיק <b>דיווח</b> שהפריש. כדי לוודא שהכסף באמת הגיע לקופה —
          <a routerLink="/review/documents">העלו דוח שנתי מהקופה</a> (פנסיה / ביטוח מנהלים / קרן השתלמות).
        </p>
      }
    }

    <app-review-step-nav nextLabel="לתוצאות" (next)="next()" />
  `
})
export class ReviewCheckPage implements OnInit {
  readonly store = inject(ReviewStore);
  private readonly router = inject(Router);
  readonly openYear = signal<number | null>(null);
  readonly openMonth = signal<string | null>(null);

  readonly funds = computed(() => (this.store.review()?.funds ?? []).filter(f => f.source === 'document' || f.balance != null));

  readonly needsReread = computed(() =>
    (this.store.review()?.documents ?? []).some(d =>
      d.documentType === 'payslip' && !Array.isArray(d.extractedContributions))
  );

  readonly years = computed((): CheckYear[] => {
    const r = this.store.review();
    if (!r?.period) return [];
    const start = new Date(r.period.startDate + 'T00:00:00');

    const linesByMonth = new Map<string, MonthLine[]>();
    for (const d of r.documents) {
      if (d.documentType !== 'payslip' || d.year == null || d.month == null) continue;
      for (const c of d.extractedContributions ?? []) {
        const key = `${c.forYear ?? d.year}-${c.forMonth ?? d.month}`;
        const retro = c.forMonth != null && (c.forMonth !== d.month || (c.forYear ?? d.year) !== d.year);
        linesByMonth.set(key, [...(linesByMonth.get(key) ?? []), { ...c, retro }]);
      }
    }

    const byYear = new Map<number, EmploymentMonth[]>();
    for (const m of r.months) byYear.set(m.year, [...(byYear.get(m.year) ?? []), m]);

    return [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, rows]) => {
      const months = [...rows].sort((a, b) => a.month - b.month).map(m => {
        const key = `${year}-${m.month}`;
        const hasPayslip = r.documents.some(d => d.documentType === 'payslip' && d.year === year && d.month === m.month);
        const monthIndex = (year - start.getFullYear()) * 12 + (m.month - 1 - start.getMonth());
        return this.checkMonth(m, key, hasPayslip, monthIndex, linesByMonth.get(key) ?? []);
      });
      const yearLines = months.flatMap(m => m.lines);
      const grosses = months.map(m => m.gross).filter((v): v is number => v != null);
      return {
        year,
        months,
        funds: this.fundRows(yearLines),
        missing: months.filter(m => m.verdict === 'missing').length,
        problems: months.filter(m => m.verdict === 'low' || m.verdict === 'none').length,
        unread: months.filter(m => m.verdict === 'unread').length,
        employeeTotal: sum(yearLines.filter(l => l.payer === 'employee').map(l => l.amount)),
        employerTotal: sum(yearLines.filter(l => l.payer === 'employer').map(l => l.amount)),
        form106: r.documents.find(d => d.documentType === 'form106' && d.year === year)?.extractedAnnualGross ?? null,
        grossSum: grosses.length ? sum(grosses) : null
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
      // Rules endpoint down — rates still show; legal comparison is skipped.
    }
    void this.store.analyze();
    const ys = this.years();
    this.openYear.set(ys.find(y => y.problems || y.missing)?.year ?? ys[0]?.year ?? null);
  }

  toggleYear(year: number): void {
    this.openYear.set(this.openYear() === year ? null : year);
    this.openMonth.set(null);
  }

  toggleMonth(key: string): void {
    this.openMonth.set(this.openMonth() === key ? null : key);
  }

  cell(v: number | null): string {
    return v == null ? '—' : this.store.fmt(v);
  }

  amount(v: number): string {
    return v ? this.store.fmt(v) : '—';
  }

  withRate(v: number | null, base: number | null): string {
    if (v == null) return '—';
    if (!base || !v) return this.store.fmt(v);
    return `${this.store.fmt(v)} (${(v / base * 100).toFixed(2).replace(/\.?0+$/, '')}%)`;
  }

  form106Diff(y: CheckYear): number {
    return y.form106 && y.grossSum != null ? Math.abs(y.form106 - y.grossSum) / y.form106 : 0;
  }

  verdictLabel(v: Verdict): string {
    switch (v) {
      case 'ok': return 'תקין';
      case 'low': return 'נמוך מהחוק';
      case 'none': return 'אין הפרשה';
      case 'waiting': return 'תקופת המתנה?';
      case 'unread': return 'לא נקרא';
      case 'waived': return 'דולג';
      default: return 'חסר תלוש';
    }
  }

  kindLabel(k: ContributionKind): string {
    return KIND_LABELS[k] ?? k;
  }

  fundLabel(kind: FundKind): string {
    return FUND_LABELS[kind] ?? kind;
  }

  next(): void {
    void this.router.navigateByUrl('/review/report');
  }

  private checkMonth(m: EmploymentMonth, key: string, hasPayslip: boolean, monthIndex: number, lines: MonthLine[]): CheckMonth {
    const base = m.pensionableSalary ?? m.grossSalary;
    const employee = m.employeePension.reported;
    const employer = m.employerPension.reported;
    const severance = m.employerCompensation.reported;
    const studyEmp = m.trainingFundEmployee.reported;
    const studyEr = m.trainingFundEmployer.reported;
    const study = studyEmp == null && studyEr == null ? null : (studyEmp ?? 0) + (studyEr ?? 0);
    const row = { key, month: m.month, label: MONTH_NAMES[m.month] ?? String(m.month), gross: m.grossSalary, base, employee, employer, severance, study, lines };

    if (!hasPayslip && m.grossSalary == null) {
      const waived = this.store.isWaived('payslip', m.year, m.month);
      return { ...row, verdict: waived ? 'waived' : 'missing', issues: [] };
    }
    if (employee == null && employer == null && severance == null) {
      return { ...row, verdict: 'unread', issues: [{ text: 'שורות ההפרשה בתלוש עדיין לא נקראו — לחצו «בדיקה מחדש» על התלוש בשלב המסמכים.', bad: false }] };
    }

    if (!employee && !employer && !severance) {
      if (monthIndex < WAITING_MONTHS) {
        return {
          ...row,
          verdict: 'waiting',
          issues: [{
            text: 'אין הפרשה לפנסיה בחודש הזה. בתחילת עבודה מותרת תקופת המתנה (עד 6 חודשים, או 3 אם הייתה לכם קופה). ' +
              'אם בסוף התקופה לא הופרש רטרואקטיבית לחודשים האלה — זה חוב של המעסיק.',
            bad: false
          }]
        };
      }
      return { ...row, verdict: 'none', issues: [{ text: 'לא הופרש כלום לפנסיה ולפיצויים בחודש הזה.', bad: true }] };
    }

    const issues: Issue[] = [];
    const short = (reported: number | null, expected: number | null) =>
      expected != null && expected > 0 && (reported ?? 0) < expected * TOLERANCE;
    if (short(employee, m.employeePension.expected)) {
      issues.push({ text: `ניכוי העובד לפנסיה נמוך מהחובה: ${this.store.fmt(employee ?? 0)} במקום ${this.store.fmt(m.employeePension.expected)}.`, bad: true });
    }
    if (short(employer, m.employerPension.expected)) {
      issues.push({ text: `הפרשת המעסיק לתגמולים נמוכה מהחובה: ${this.store.fmt(employer ?? 0)} במקום ${this.store.fmt(m.employerPension.expected)}.`, bad: true });
    }
    if (base) {
      const sevPct = (severance ?? 0) / base * 100;
      if (sevPct < SEVERANCE_MIN_PERCENT * TOLERANCE) {
        issues.push({ text: `הפרשה לפיצויים ${sevPct.toFixed(2)}% — נמוך מהמינימום (${SEVERANCE_MIN_PERCENT}%).`, bad: true });
      } else if (sevPct < 8.33 * TOLERANCE) {
        issues.push({ text: `פיצויים ${sevPct.toFixed(2)}% (לא 8.33%). אם פוטרתם — המעסיק צריך להשלים את ההפרש בסיום.`, bad: false });
      }
    }
    return { ...row, verdict: issues.some(i => i.bad) ? 'low' : 'ok', issues };
  }

  private fundRows(lines: MonthLine[]): FundRow[] {
    const rows = new Map<string, FundRow & { kinds: Set<string> }>();
    for (const l of lines) {
      const provider = l.provider?.trim() || 'קופה לא מזוהה';
      const row = rows.get(provider) ?? { key: provider, provider, kind: '', employee: 0, employer: 0, severance: 0, kinds: new Set<string>() };
      if (l.kind !== 'severance' && l.kind !== 'disability') row.kinds.add(KIND_LABELS[l.kind]);
      if (l.payer === 'employee') row.employee += l.amount;
      else if (l.kind === 'severance') row.severance += l.amount;
      else row.employer += l.amount;
      rows.set(provider, row);
    }
    return [...rows.values()].map(({ kinds, ...r }) => ({ ...r, kind: [...kinds].join(' · ') || KIND_LABELS.pension }));
  }
}

function sum(values: number[]): number {
  return Math.round(values.reduce((s, v) => s + v, 0) * 100) / 100;
}
