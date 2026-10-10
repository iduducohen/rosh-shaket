import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ContributionKind, EmploymentMonth, ExtractedContribution, FundKind } from '../../core/review.models';
import { ReviewStore } from '../../core/review.store';
import { finalMonthParts } from '../../core/pay-components';
import { ReadingProblemsComponent } from '../../core/reading-problems.component';
import { findReadingProblems } from '../../core/reading-problems';
import { summarizeProducts, totalOf } from '../../core/product-summary';
import { DEPOSIT_LINE_LABELS, DepositIndex, buildDepositIndex, depositCoverage, depositGaps, depositedTotals, isStudyFund, suspectedUnread, unifyFunds } from '../../core/pension-deposits';
import { ReviewStepNavComponent } from './review-step-nav.component';

/** Legal floor for severance; the rules' 8.33% is full severance coverage. */
const SEVERANCE_MIN_PERCENT = 6;
/** Mandatory pension may start only after a waiting period at a new job. */
const WAITING_MONTHS = 6;
const TOLERANCE = 0.97;

type Verdict = 'ok' | 'low' | 'none' | 'waiting' | 'unread' | 'missing' | 'waived' | 'deposit' | 'final' | 'partial';

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
  /** Which funds were compared with a fund report this year, and which have none. */
  depositNote: string;
  /** The pension base is lower than the gross in some month: overtime, bonuses or expenses are not part of it. */
  basisBelowGross: boolean;
  /** Every payslip is there, but the year's gross does not match Form 106. Separate from the monthly deposit check. */
  form106Gap: boolean;
  /** The last month of work has no contribution on its payslip and is waiting for a closer look. */
  finalMonthOpen: boolean;
  /** Months whose payslip is there but a line that every month has was not read from it. */
  partial: number;
}

const MONTH_NAMES = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const KIND_LABELS: Record<ContributionKind, string> = {
  pension: 'קרן פנסיה', managers: 'ביטוח מנהלים', severance: 'פיצויים', disability: 'אובדן כושר עבודה', study: 'קרן השתלמות'
};
const FUND_LABELS: Record<FundKind, string> = { Pension: 'פנסיה', Severance: 'פיצויים', Study: 'קרן השתלמות', Managers: 'ביטוח מנהלים' };

@Component({
  selector: 'app-review-check',
  standalone: true,
  imports: [RouterLink, ReviewStepNavComponent, ReadingProblemsComponent],
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
    h4.funds-title { margin: 22px 0 6px; font-size: 20px; font-weight: 800; color: var(--ion-color-primary); }
    table.funds-table th { font-size: 13.5px; font-weight: 800; color: var(--ion-text-color); border-bottom: 2px solid var(--rs-line); padding-bottom: 8px; }

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
    .warn-t { color: var(--ion-color-warning-shade, #8a6d00); font-weight: 700; }
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
    .tag.low, .tag.none, .tag.missing, .tag.deposit { background: rgba(var(--ion-color-danger-rgb, 235, 68, 90), .1); color: var(--ion-color-danger); }
    .tag.waiting, .tag.final, .tag.partial { background: rgba(var(--ion-color-warning-rgb, 255, 196, 9), .16); color: var(--ion-color-warning-shade, #8a6d00); }
    .tag.unread, .tag.waived { background: var(--rs-soft); color: var(--ion-color-medium); }
    .tag a { color: inherit; }

    .compare { margin: 12px 0 0; font-size: 13px; line-height: 1.5; }

    .funds { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
    .fund { box-shadow: var(--rs-card-shadow); border: 1px solid var(--rs-line); border-radius: 12px; padding: 12px 14px; background: var(--ion-item-background); }
    .fund b { display: block; font-size: 14px; }
    .fund .amt { font-size: 18px; font-weight: 800; margin: 4px 0; }
    .fund .small { font-size: 12px; color: var(--ion-color-medium); line-height: 1.4; }
    .funds.sums { grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); }
    .fund.sum.fine { border-color: color-mix(in srgb, var(--ion-color-success) 45%, var(--rs-line)); }
    .fund.sum.alert { border-color: color-mix(in srgb, var(--ion-color-danger) 45%, var(--rs-line)); }
    .fund table.mini { width: 100%; margin: 8px 0 6px; font-size: 12.5px; }
    .fund table.mini th { font-size: 11.5px; padding: 2px 4px; }
    .fund table.mini td { padding: 3px 4px; white-space: nowrap; border-top: 1px solid var(--rs-line); }
    .fund table.mini td:not(:first-child) { font-weight: 700; font-variant-numeric: tabular-nums; }
    .fund .verdict { margin: 4px 0 0; font-size: 12.5px; line-height: 1.45; }
    .fund .verdict.good { color: var(--ion-color-success-shade, #1a7a3c); font-weight: 700; }
    .fund .verdict.small { color: var(--ion-color-medium); }
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
      <app-reading-problems [problems]="readingProblems()" />
      <div class="year-list">
        @for (y of years(); track y.year) {
          <div class="year-card" [class.ok]="!y.missing && !y.problems && !y.unread && !y.partial" [class.bad]="y.missing || y.problems">
            <button type="button" class="year-head" (click)="toggleYear(y.year)" [attr.aria-expanded]="openYear() === y.year">
              <span>
                <b>{{ y.year }}</b>
                <div class="meta">
                  @if (y.unread && !y.missing && !y.problems) {
                    <span>{{ monthsText(y.unread) }} עוד לא נקראו מהתלושים</span>
                  } @else if (y.partial && !y.missing && !y.problems) {
                    <span class="warn-t">{{ monthsText(y.partial) }} עם שורה שלא נקראה מהתלוש. בדיקה מחדש של התלוש תבהיר</span>
                  } @else if (!y.missing && !y.problems) {
                    <span class="good">ההפרשות תקינות בכל החודשים</span>
                    @if (y.form106Gap) { <span class="warn-t"> · אבל יש פער בין התלושים לטופס 106</span> }
                    @if (y.finalMonthOpen) { <span class="warn-t"> · חודש הסיום דורש בירור הפרשה</span> }
                  } @else {
                    @if (y.problems) { <span class="bad-t">{{ monthsText(y.problems) }} עם הפרשה חסרה או נמוכה</span> }
                    @if (y.problems && y.missing) { · }
                    @if (y.missing) { <span class="bad-t">{{ y.missing === 1 ? 'תלוש אחד חסר' : y.missing + ' תלושים חסרים' }}</span> }
                  }
                </div>
              </span>
              <span class="meta" aria-hidden="true">{{ openYear() === y.year ? '▾' : '◂' }}</span>
            </button>

            @if (openYear() === y.year) {
              <div class="year-body">
                @if (y.depositNote) { <p class="hint">{{ y.depositNote }}</p> }
                <div class="totals">
                  <div><span>אתם הפרשתם</span><b>{{ store.fmt(y.employeeTotal) }}</b></div>
                  <div><span>המעסיק הפריש (כולל פיצויים)</span><b>{{ store.fmt(y.employerTotal) }}</b></div>
                </div>

                @if (y.funds.length) {
                  <h4 class="funds-title">לאן הלך הכסף</h4>
                  <p class="hint">סיכום ההפרשות של השנה לפי קופה, מתוך שורות ההפרשה בתלושים. התלוש מדפיס שמות קופה חתוכים, ולכן אוחדו לפי החברה.</p>
                  <div class="tbl-wrap">
                    <table class="funds-table">
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

                @if (y.basisBelowGross) {
                  <p class="hint basis">
                    <b>למה הברוטו גבוה מהבסיס לפנסיה?</b>
                    ההפרשות מחושבות על המשכורת בלבד («בסיס לפנסיה»), ולא על שעות נוספות, בונוסים או החזרי הוצאות, גם כשהם קבועים כל חודש.
                    ככלל זה תקין כשכך נקבע בחוזה ההעסקה או בהסכם. כדאי לוודא מול החוזה, ואם כתוב בו אחרת, ההפרשות צריכות לחול גם על התוספות.
                  </p>
                }

                @if (y.form106 != null && y.grossSum != null) {
                  <p class="compare">
                    ברוטו לפי טופס 106: <b>{{ store.fmt(y.form106) }}</b> · ברוטו לפי התלושים: <b>{{ store.fmt(y.grossSum) }}</b>
                    @if (y.missing) {
                      <br><span class="meta">חסרים תלושים לשנה הזו, לכן הסכומים לא אמורים להתאים עדיין.</span>
                    } @else if (form106Diff(y) > 0.03) {
                      <br><span class="warn-t">הפרש של {{ store.fmt(y.form106 - y.grossSum) }}. זו בדיקה נפרדת מההפרשות: ייתכן שתלוש נקרא לא נכון או שיש תשלום שאינו בתלושים שהועלו.</span>
                      <br><span class="meta">בטופס 106 מופיעים כמה סכומים (הכנסה חייבת רגילה, שעות נוספות, החזר הוצאות). ההשוואה היא ל«משכורת חייבת במס», הסך של כולם.</span>
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

      <h3 class="section">סיכום ההפקדות לפי תלושים ודוחות</h3>
      @if (summaryCards().length) {
        <p class="hint">
          סכום ההפרשות בכל התלושים והדוחות שהעליתם, לפי סוג קופה. ההשוואה היא רק לקופות ולשנים שיש להן דוח,
          ובלי החודשיים האחרונים, כי הפקדה מגיעה באיחור.
        </p>
        <div class="funds sums">
          @for (c of summaryCards(); track c.title) {
            <div class="fund sum" [class.alert]="c.s.compare && c.s.compare.missing > 5" [class.fine]="c.s.compare && c.s.compare.missing <= 5">
              <b>{{ c.title }}</b>
              <div class="amt">{{ store.fmt(totalOf(c.s.payslip)) }}</div>
              <div class="small">הופרש לפי התלושים</div>
              <table class="mini">
                <thead><tr><th></th><th title="כל מה שנקרא מהתלושים שהעליתם">תלושים</th><th title="מה שנקרא מדוחות הקופות שהעליתם. מקף אומר שאין דוח לסוג הזה">דוחות</th></tr></thead>
                <tbody>
                  <tr><td>עובד</td><td>{{ amount(c.s.payslip.employee) }}</td><td [attr.title]="c.s.report ? null : 'אין דוח לסוג הזה'">{{ c.s.report ? amount(c.s.report.employee) : '—' }}</td></tr>
                  <tr><td>מעסיק</td><td>{{ amount(c.s.payslip.employer) }}</td><td [attr.title]="c.s.report ? null : 'אין דוח לסוג הזה'">{{ c.s.report ? amount(c.s.report.employer) : '—' }}</td></tr>
                  <tr><td>פיצויים</td><td>{{ amount(c.s.payslip.severance) }}</td><td [attr.title]="c.s.report ? null : 'אין דוח לסוג הזה'">{{ c.s.report ? amount(c.s.report.severance) : '—' }}</td></tr>
                </tbody>
              </table>
              @if (c.s.compare; as cmp) {
                @if (cmp.missing > 5) {
                  <p class="verdict bad-t">
                    מול הדוחות: צריך להיות {{ store.fmt(totalOf(cmp.should)) }}, נמצא {{ store.fmt(totalOf(cmp.found)) }}.
                    חסרים {{ store.fmt(cmp.missing) }}.
                  </p>
                } @else {
                  <p class="verdict good">
                    בקופות ובשנים שיש להן דוח: צריך להיות {{ store.fmt(totalOf(cmp.should)) }}, נמצא {{ store.fmt(totalOf(cmp.found)) }}. תואם.
                  </p>
                }
              } @else if (c.s.report) {
                <p class="verdict small">יש דוח, אבל אין חודשים להשוואה מול התלושים.</p>
              } @else {
                <p class="verdict small">
                  אין דוח של הקופה הזו, ולכן אי אפשר לדעת אם הכסף הגיע. זה לא אומר שחסר כסף.
                  <a routerLink="/review/documents">להעלאת דוח</a>
                </p>
              }
            </div>
          }
        </div>
        <p class="hint legend">
          <b>תלושים:</b> כל מה שנקרא מהתלושים שהעליתם. <b>דוחות:</b> מה שנקרא מדוחות הקופות שהעליתם, ולכן הוא יכול להיות קטן יותר
          כשלא העליתם דוח לכל קופה או לכל שנה. מקף אומר שאין דוח לסוג הזה, ולא שחסר כסף.
          ההשוואה (בירוק או באדום) נעשית רק בקופות ובשנים שיש להן דוח.
        </p>
      } @else {
        <p class="notice">
          התלושים מראים מה המעסיק <b>דיווח</b> שהפריש. כדי לוודא שהכסף באמת הגיע לקופה —
          <a routerLink="/review/documents">העלו דוח שנתי או דוח הפקדות מהקופה</a> (פנסיה / ביטוח מנהלים / קרן השתלמות).
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

  readonly totalOf = totalOf;

  /** Files whose lines were read only in part, so the verdicts below may be wrong for them. */
  readonly readingProblems = computed(() => findReadingProblems(this.store.review()?.documents ?? []));

  /** A total card, then one card per product that appears in the payslips or the reports. */
  readonly summaryCards = computed(() => {
    const { products, total } = summarizeProducts(this.store.review()?.documents ?? []);
    if (!products.length) return [];
    const titles: Record<string, string> = { pension: 'קרן פנסיה', managers: 'ביטוח מנהלים', study: 'קרן השתלמות' };
    return [
      { title: 'סה״כ', s: total },
      ...products.map(p => ({ title: titles[p.product], s: p }))
    ];
  });

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

    const depositIndex = buildDepositIndex(r.documents);
    const resolveFund = unifyFunds([...linesByMonth.values()].flat().map(l => l.provider));
    const monthBefore = (y: number, m: number, back: number) => {
      const index = y * 12 + (m - 1) - back;
      return `${Math.floor(index / 12)}-${(index % 12) + 1}`;
    };
    const endYear = Number(r.period.endDate.slice(0, 4));
    const endMonth = Number(r.period.endDate.slice(5, 7));
    // Someone still working has no "final month": the period only ends at the latest payslip.
    const ongoing = r.period.exitReason === 'Ongoing';

    const byYear = new Map<number, EmploymentMonth[]>();
    for (const m of r.months) byYear.set(m.year, [...(byYear.get(m.year) ?? []), m]);

    return [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, rows]) => {
      const months = [...rows].sort((a, b) => a.month - b.month).map(m => {
        const key = `${year}-${m.month}`;
        const hasPayslip = r.documents.some(d => d.documentType === 'payslip' && d.year === year && d.month === m.month);
        const monthIndex = (year - start.getFullYear()) * 12 + (m.month - 1 - start.getMonth());
        return this.checkMonth(m, key, hasPayslip, monthIndex, linesByMonth.get(key) ?? [], this.depositIssues(depositIndex, year, m.month), depositedTotals(depositIndex, year, m.month),
          suspectedUnread(
            linesByMonth.get(key) ?? [],
            linesByMonth.get(monthBefore(year, m.month, 1)) ?? [],
            linesByMonth.get(monthBefore(year, m.month, 2)) ?? [],
            resolveFund,
            linesByMonth.get(monthBefore(year, m.month, -1))
          ).map(l => `${l.company}: ${this.unreadLabel(l)} ${this.store.fmt(l.amount)}`),
          !ongoing && year === endYear && m.month === endMonth
            ? finalMonthParts(r.documents.find(d => d.documentType === 'payslip' && d.year === year && d.month === m.month)?.extractedComponents)
            : null);
      });
      const yearLines = months.flatMap(m => m.lines);
      const grosses = months.map(m => m.gross).filter((v): v is number => v != null);
      const form106 = r.documents.find(d => d.documentType === 'form106' && d.year === year)?.extractedAnnualGross ?? null;
      const grossSum = grosses.length ? sum(grosses) : null;
      const missingMonths = months.filter(m => m.verdict === 'missing').length;
      return {
        year,
        months,
        funds: this.fundRows(months.map(m => m.lines)),
        missing: months.filter(m => m.verdict === 'missing').length,
        problems: months.filter(m => m.verdict === 'low' || m.verdict === 'none' || m.verdict === 'deposit').length,
        unread: months.filter(m => m.verdict === 'unread').length,
        employeeTotal: sum(yearLines.filter(l => l.payer === 'employee').map(l => l.amount)),
        employerTotal: sum(yearLines.filter(l => l.payer === 'employer').map(l => l.amount)),
        form106,
        grossSum,
        finalMonthOpen: months.some(m => m.verdict === 'final'),
        partial: months.filter(m => m.verdict === 'partial').length,
        form106Gap: missingMonths === 0 && form106 != null && grossSum != null && Math.abs(form106 - grossSum) / form106 > 0.03,
        depositNote: this.depositNote(depositIndex, year),
        basisBelowGross: months.some(m => m.gross != null && m.base != null && m.gross - m.base > 1)
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

  /** "חודש אחד" or "3 חודשים". */
  monthsText(n: number): string {
    return n === 1 ? 'חודש אחד' : `${n} חודשים`;
  }

  verdictLabel(v: Verdict): string {
    switch (v) {
      case 'ok': return 'תקין';
      case 'low': return 'נמוך מהחוק';
      case 'deposit': return 'לא הופקד';
      case 'final': return 'חודש סיום';
      case 'partial': return 'שורה לא נקראה';
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

  private checkMonth(m: EmploymentMonth, key: string, hasPayslip: boolean, monthIndex: number, lines: MonthLine[], deposits: Issue[], received: { employee: number; employer: number; severance: number } | null,
    suspected: string[],
    finalMonth: { notice: number; vacation: number; base: number | null } | null): CheckMonth {
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
      // The last month: notice pay, vacation redemption and recuperation are paid, and the contributions on them
      // often come separately or later. It is a question to ask, not a verdict.
      if (finalMonth) {
        const arrived = received ? received.employee + received.employer + received.severance : 0;
        if (arrived > 0) {
          return { ...row, verdict: 'ok', issues: [{
            text: `בחודש הסיום לא נקראה הפרשה בתלוש, אבל בדוח הקופה הופקדו ${this.store.fmt(arrived)}.`, bad: false }] };
        }
        const parts: string[] = [];
        if (finalMonth.notice > 0) parts.push(`חלף הודעה מוקדמת ${this.store.fmt(finalMonth.notice)}`);
        if (finalMonth.vacation > 0) parts.push(`פדיון חופשה ${this.store.fmt(finalMonth.vacation)}`);
        const text = parts.length
          ? `חודש הסיום: התשלום כולל ${parts.join(' ו')}. על רכיבים אלה בדרך כלל חלה חובת הפרשה לפנסיה (בבסיס של ${this.store.fmt(finalMonth.base ?? 0)}), ובתלוש לא נקראה הפרשה. ` +
            'הפקדה על חודש אחרון מגיעה לפעמים באיחור, ולכן כדאי לבדוק בדוח הקופה. אם אין שם הפקדה, כדאי לפנות למעסיק.'
          : 'חודש הסיום: לא נקראה הפרשה בתלוש. הפקדה על חודש אחרון מגיעה לפעמים באיחור, ולכן כדאי לבדוק בדוח הקופה. אם אין שם הפקדה, כדאי לפנות למעסיק.';
        return { ...row, verdict: 'final', issues: [{ text, bad: false }] };
      }
      return { ...row, verdict: 'none', issues: [{ text: 'לא הופרש כלום לפנסיה ולפיצויים בחודש הזה.', bad: true }] };
    }

    const issues: Issue[] = [];
    const short = (reported: number | null, expected: number | null) =>
      expected != null && expected > 0 && (reported ?? 0) < expected * TOLERANCE;
    // The fund's own report is the proof: money that reached the fund meets the minimum even when the payslip
    // of that month does not show it (a deduction can come as a retroactive line on the next month's payslip).
    const arrived = (got: number | undefined, expected: number | null) =>
      received != null && got != null && expected != null && expected > 0 && got >= expected * TOLERANCE;
    const notRead = (what: string, got: number) =>
      `${what}: לא נקרא בתלוש של החודש הזה, אבל בדוח הקופה הופקדו ${this.store.fmt(got)}. כנראה הוא מופיע בתלוש אחר כהפרשים.`;
    if (short(employee, m.employeePension.expected)) {
      if (arrived(received?.employee, m.employeePension.expected)) {
        issues.push({ text: notRead('ניכוי העובד לפנסיה', received!.employee), bad: false });
      } else {
        issues.push({ text: `ניכוי העובד לפנסיה נמוך מהחובה: ${this.store.fmt(employee ?? 0)} במקום ${this.store.fmt(m.employeePension.expected)}.`, bad: true });
      }
    }
    if (short(employer, m.employerPension.expected)) {
      if (arrived(received?.employer, m.employerPension.expected)) {
        issues.push({ text: notRead('הפרשת המעסיק לתגמולים', received!.employer), bad: false });
      } else {
        issues.push({ text: `הפרשת המעסיק לתגמולים נמוכה מהחובה: ${this.store.fmt(employer ?? 0)} במקום ${this.store.fmt(m.employerPension.expected)}.`, bad: true });
      }
    }
    if (base) {
      const sevPct = (severance ?? 0) / base * 100;
      if (sevPct < SEVERANCE_MIN_PERCENT * TOLERANCE) {
        if (arrived(received?.severance, base * SEVERANCE_MIN_PERCENT / 100)) {
          issues.push({ text: notRead('הפרשה לפיצויים', received!.severance), bad: false });
        } else {
          issues.push({ text: `הפרשה לפיצויים ${sevPct.toFixed(2)}% — נמוך מהמינימום (${SEVERANCE_MIN_PERCENT}%).`, bad: true });
        }
      } else if (sevPct < 8.33 * TOLERANCE) {
        issues.push({ text: `פיצויים ${sevPct.toFixed(2)}% (לא 8.33%). אם פוטרתם — המעסיק צריך להשלים את ההפרש בסיום.`, bad: false });
      }
    }
    const lawBad = issues.some(i => i.bad);
    // A line the months before always had, and this month lacks: first suspect the reading, not the employer.
    if (lawBad && suspected.length) {
      return {
        ...row,
        verdict: 'partial',
        issues: [
          {
            text: `בחודשים הקודמים הופיעו שורות שלא נקראו בחודש הזה: ${suspected.join(' · ')}. כנראה הן בתלוש ולא נקראו, ולכן המסקנה לא סופית. ` +
              'לחצו «בדיקה מחדש» על התלוש בשלב המסמכים, ובדקו מול הקובץ.',
            bad: false
          },
          ...issues.map(i => ({ ...i, bad: false }))
        ]
      };
    }
    issues.push(...deposits);
    const verdict: Verdict = lawBad ? 'low' : deposits.some(i => i.bad) ? 'deposit' : 'ok';
    return { ...row, verdict, issues };
  }

  /**
   * Each fund's payslip line against that same fund's own report, so a second fund with no report is not
   * mistaken for a missing deposit. The latest months are only a note: a deposit can take two months to arrive.
   */
  private unreadLabel(l: { kind: string; payer: string; provider?: string | null }): string {
    if (isStudyFund({ kind: l.kind, provider: l.provider ?? null })) return l.payer === 'employee' ? 'קרן השתלמות, עובד' : 'קרן השתלמות, מעסיק';
    switch (l.kind) {
      case 'severance': return 'פיצויים';
      case 'disability': return 'אובדן כושר עבודה';
      case 'managers': return l.payer === 'employee' ? 'ביטוח מנהלים, עובד' : 'ביטוח מנהלים, מעסיק';
      default: return l.payer === 'employee' ? 'ניכוי עובד לפנסיה' : 'הפרשת מעסיק לפנסיה';
    }
  }

  private depositIssues(index: DepositIndex, year: number, month: number): Issue[] {
    const now = new Date();
    const monthsAgo = now.getFullYear() * 12 + now.getMonth() + 1 - (year * 12 + month);
    return depositGaps(index, year, month).map(g => {
      const label = `${DEPOSIT_LINE_LABELS[g.line]} ל${g.fund}`;
      const text = g.deposited === 0
        ? `${label}: בתלוש ${this.store.fmt(g.reported)}, ובדוח הקופה לא נמצאה הפקדה לחודש הזה.`
        : `${label}: בתלוש ${this.store.fmt(g.reported)}, ובדוח הקופה הופקדו ${this.store.fmt(g.deposited)}. חסרים ${this.store.fmt(g.reported - g.deposited)}.`;
      return monthsAgo <= 2
        ? { text: text + ' החודש עדיין קרוב, וההפקדה יכולה להיקלט עד חודשיים אחרי.', bad: false }
        : { text, bad: true };
    });
  }

  private depositNote(index: DepositIndex, year: number): string {
    const { checked, unchecked } = depositCoverage(index, year);
    if (!checked.length) return '';
    const head = `ההפקדות הושוו לדוחות של: ${checked.join(', ')}.`;
    return unchecked.length
      ? `${head} אין דוח עבור: ${unchecked.join(', ')}, ולכן ההפקדות שלה לא נבדקו. אפשר להעלות דוח הפקדות שלה בשלב המסמכים.`
      : head;
  }

  /**
   * One row per company and product. Payslips print fund names cut short ("מגד", "כלל פנס", "פיצ מגד"), so the
   * spellings are merged into the company, and a severance line with no company goes to the only company of
   * that month that has none.
   */
  private fundRows(perMonth: MonthLine[][]): FundRow[] {
    const resolve = unifyFunds(perMonth.flat().map(l => l.provider));
    const rows = new Map<string, FundRow>();
    // The same amount recurs every month, so a line with no company is the company that has it named elsewhere.
    const amountKey = (l: MonthLine) => `${isStudyFund(l) ? 'study' : l.kind}|${l.payer}|${l.amount.toFixed(2)}`;
    const owners = new Map<string, Set<string>>();
    for (const l of perMonth.flat()) {
      const company = resolve(l.provider);
      if (!company) continue;
      const set = owners.get(amountKey(l)) ?? new Set<string>();
      set.add(company);
      owners.set(amountKey(l), set);
    }
    const add = (company: string, l: MonthLine) => {
      const kind = isStudyFund(l) ? KIND_LABELS.study : l.kind === 'managers' ? KIND_LABELS.managers : KIND_LABELS.pension;
      const key = `${company}|${kind}`;
      const row = rows.get(key) ?? { key, provider: company, kind, employee: 0, employer: 0, severance: 0 };
      if (l.payer === 'employee') row.employee += l.amount;
      else if (l.kind === 'severance' && !isStudyFund(l)) row.severance += l.amount;
      else row.employer += l.amount;
      rows.set(key, row);
    };
    for (const lines of perMonth) {
      const named = lines.map(l => ({ l, company: resolve(l.provider) }));
      const companies = [...new Set(named.filter(x => x.company && !isStudyFund(x.l)).map(x => x.company))];
      for (const x of named) {
        let company = x.company;
        if (!company) {
          const same = owners.get(amountKey(x.l));
          if (same?.size === 1) company = [...same][0];
        }
        if (!company && x.l.kind === 'severance') {
          const free = companies.filter(c => !named.some(y => y.company === c && y.l.kind === 'severance'));
          if (free.length === 1) company = free[0];
        }
        add(company || 'ללא שם קופה בתלוש', x.l);
      }
    }
    return [...rows.values()].sort((p, q) => p.provider.localeCompare(q.provider, 'he') || p.kind.localeCompare(q.kind, 'he'));
  }
}

function sum(values: number[]): number {
  return Math.round(values.reduce((s, v) => s + v, 0) * 100) / 100;
}
