import { fundKey, isStudyFund, unifyFunds } from './pension-deposits';
import { ExtractedFundTotal, ReviewDocumentMeta } from './review.models';

/** What a fund holds, grouped so that the reading's habit of filing pension and managers insurance either way does not matter. */
type Group = 'savings' | 'severance' | 'disability' | 'study';

const GROUP_LABELS: Record<Group, string> = {
  savings: 'פנסיה / ביטוח מנהלים',
  severance: 'פיצויים',
  disability: 'אובדן כושר עבודה',
  study: 'קרן השתלמות'
};

export interface ReconcileRow {
  company: string;
  label: string;
  /** What the year's payslips add up to. */
  payslipEmployee: number;
  payslipEmployer: number;
  /** What Form 106 prints for the fund; null for a fund that the payslips show and the form does not. */
  formEmployee: number | null;
  formEmployer: number | null;
  match: boolean;
}

export type AnnualReconcile =
  | { state: 'unread' | 'noTable'; text: string }
  | { state: 'ready'; rows: ReconcileRow[]; complete: boolean; mismatches: number };

const groupOf = (kind: string, provider: string | null | undefined): Group => {
  if (isStudyFund({ kind, provider })) return 'study';
  if (kind === 'severance') return 'severance';
  if (kind === 'disability') return 'disability';
  return 'savings';
};

const round = (v: number) => Math.round(v * 100) / 100;
const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(10, Math.max(a, b) * 0.015);

/**
 * Years whose payslips add up to Form 106 fund by fund, with every payslip of the year present. For such a year the
 * reading is confirmed from two sources, so a line that looks absent from one month is not a problem.
 * The months of the year come from the period: a year is complete when each of its months has a payslip.
 */
export function verifiedYears(
  docs: readonly ReviewDocumentMeta[],
  period: { startDate: string; endDate: string } | null | undefined
): Set<number> {
  const verified = new Set<number>();
  if (!period) return verified;
  const start = new Date(period.startDate + 'T00:00:00');
  const end = new Date(period.endDate + 'T00:00:00');
  const years = [...new Set(docs.filter(d => d.documentType === 'form106' && d.year != null).map(d => d.year!))];
  for (const year of years) {
    let complete = true;
    for (let month = 1; month <= 12; month++) {
      const first = new Date(year, month - 1, 1);
      const last = new Date(year, month, 0);
      if (last < start || first > end) continue;
      if (!docs.some(d => d.documentType === 'payslip' && d.year === year && d.month === month)) {
        complete = false;
        break;
      }
    }
    const result = reconcileWithForm106(docs, year, { allPayslipsPresent: complete });
    if (complete && result?.state === 'ready' && result.mismatches === 0) verified.add(year);
  }
  return verified;
}

/**
 * Form 106 prints, for every fund, what went into it over the whole year, from the employer's own books.
 * The year's payslips must add up to the same, fund by fund: a payslip line that was misread or never read shows up
 * here as a gap, whatever the month. This does not depend on the lines repeating from month to month.
 *
 * Only a year with every payslip is compared in full: with a month missing, the payslips are expected to fall short.
 */
export function reconcileWithForm106(
  docs: readonly ReviewDocumentMeta[],
  year: number,
  opts: { allPayslipsPresent: boolean }
): AnnualReconcile | null {
  const form = docs.find(d => d.documentType === 'form106' && d.year === year);
  if (!form) return null;
  const totals = form.extractedFundTotals;
  if (!Array.isArray(totals)) {
    return { state: 'unread', text: 'טופס 106 נבדק לפני שקריאת טבלת הקופות נוספה. בדיקה מחדש של הטופס תקרא אותה, ואז אפשר להשוות לכל קופה.' };
  }
  if (!totals.length) {
    return { state: 'noTable', text: 'בטופס 106 לא נקראה טבלת הפרשות לקופות. אם יש בטופס טבלה כזו, בדיקה מחדש תקרא אותה.' };
  }

  // The payslip side: every contribution line that belongs to this year, by the month it is for.
  type Line = { company: string; group: Group; payer: 'employee' | 'employer'; amount: number; kind: string };
  const raw: Array<{ provider: string | null; kind: string; payer: string; amount: number }> = [];
  for (const d of docs) {
    if (d.documentType !== 'payslip' || d.year == null || !Array.isArray(d.extractedContributions)) continue;
    for (const c of d.extractedContributions) {
      if ((c.forYear ?? d.year) !== year || c.amount === 0) continue;
      raw.push({ provider: c.provider, kind: c.kind, payer: c.payer, amount: c.amount });
    }
  }

  const formKeys = [...new Set(totals.map(t => fundKey(t.provider)).filter(Boolean))];
  const resolve = unifyFunds([...raw.map(r => r.provider), ...totals.map(t => t.provider)], formKeys);

  // A line with no company ("פיצ") belongs to the company that has the same amount named elsewhere in the year.
  const ownerKey = (r: { kind: string; payer: string; amount: number; provider: string | null }) =>
    `${groupOf(r.kind, r.provider)}|${r.payer}|${r.amount.toFixed(2)}`;
  const owners = new Map<string, Set<string>>();
  for (const r of raw) {
    const company = resolve(r.provider);
    if (!company) continue;
    const set = owners.get(ownerKey(r)) ?? new Set<string>();
    set.add(company);
    owners.set(ownerKey(r), set);
  }
  const lines: Line[] = raw.map(r => {
    let company = resolve(r.provider);
    if (!company) {
      const same = owners.get(ownerKey(r));
      if (same?.size === 1) company = [...same][0];
    }
    return { company, group: groupOf(r.kind, r.provider), payer: r.payer === 'employee' ? 'employee' : 'employer', amount: r.amount, kind: r.kind };
  });

  // The form side, one row per company and group.
  const rows = new Map<string, ReconcileRow>();
  const keyOf = (company: string, group: Group) => `${company}|${group}`;
  for (const t of totals as ExtractedFundTotal[]) {
    const company = resolve(t.provider) || fundKey(t.provider) || '?';
    const group = groupOf(t.kind, t.provider);
    const key = keyOf(company, group);
    const row = rows.get(key) ?? {
      company, label: GROUP_LABELS[group], payslipEmployee: 0, payslipEmployer: 0, formEmployee: 0, formEmployer: 0, match: true
    };
    row.formEmployee = (row.formEmployee ?? 0) + t.employee;
    row.formEmployer = (row.formEmployer ?? 0) + t.employer;
    rows.set(key, row);
  }

  // A fund that the payslips show and the form does not: shown on its own, so it is not lost.
  const unmatched = new Map<string, ReconcileRow>();
  for (const l of lines) {
    if (!l.company) continue;
    const key = keyOf(l.company, l.group);
    let row = rows.get(key) ?? unmatched.get(key);
    if (!row) {
      row = { company: l.company, label: GROUP_LABELS[l.group], payslipEmployee: 0, payslipEmployer: 0, formEmployee: null, formEmployer: null, match: false };
      unmatched.set(key, row);
    }
    if (l.payer === 'employee') row.payslipEmployee += l.amount;
    else row.payslipEmployer += l.amount;
  }

  const all = [...rows.values(), ...unmatched.values()].map(r => {
    const payslipEmployee = round(r.payslipEmployee);
    const payslipEmployer = round(r.payslipEmployer);
    const match = r.formEmployee == null
      ? false
      : close(payslipEmployee, r.formEmployee) && close(payslipEmployer, r.formEmployer ?? 0);
    return { ...r, payslipEmployee, payslipEmployer, formEmployee: r.formEmployee == null ? null : round(r.formEmployee),
      formEmployer: r.formEmployer == null ? null : round(r.formEmployer), match };
  });
  return { state: 'ready', rows: all, complete: opts.allPayslipsPresent, mismatches: all.filter(r => !r.match).length };
}
