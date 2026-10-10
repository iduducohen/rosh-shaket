import { ExtractedContribution, ReviewDocumentMeta } from './review.models';

/** The three amounts a fund's deposit report can be compared with on a payslip. */
export type DepositLine = 'employeePension' | 'employerPension' | 'severance';

export const DEPOSIT_LINE_LABELS: Record<DepositLine, string> = {
  employeePension: 'ניכוי העובד לפנסיה',
  employerPension: 'הפרשת המעסיק לפנסיה',
  severance: 'הפרשה לפיצויים'
};

const GENERIC_WORDS = new Set(['קרן', 'קופת', 'קופה', 'חברת', 'החברה', 'פנסיה', 'ביטוח', 'גמל', 'בעמ']);

/** Words a payslip prints for the kind of line instead of (or next to) the company: "פיצ", "אוב", "קה"ש". */
export function isKindWord(word: string): boolean {
  return /^(פיצ|תגמ|אוב|השתל|קהש|עובד|מעסיק|ניכוי|הפרשה)/.test(word);
}

/**
 * The company a fund belongs to. Payslips print it cut short or garbled ("כלל פנס", "מגדל ביג", "פיצ מגד",
 * "פיצת כלז") and reports print it in full ("כלל פנסיה וגמל"), so a fund is matched by its first company word.
 * A line that names only its kind ("פיצ") has no company: the key is that kind word, and isKindWord() tells.
 */
export function fundKey(name: string | null | undefined): string {
  const words = (name ?? '').replace(/["'״׳”“]/g, '').trim().split(/\s+/).filter(Boolean);
  return words.find(w => !GENERIC_WORDS.has(w) && !isKindWord(w)) ?? words.find(w => !GENERIC_WORDS.has(w)) ?? words[0] ?? '';
}

/** "מגד" is "מגדל" cut short, and "כלז" is "כלל" misread: three letters and one slip are still the same company. */
function sameFund(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 3) return false;
  if (long.startsWith(short)) return true;
  if (a.length !== b.length) return false;
  let differences = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++differences > 1) return false;
  return true;
}

/**
 * One name per company over a set of spellings. A company named by a report wins, then the longest spelling seen.
 * The result maps any raw provider text to that name, or to '' when the text names no company at all.
 */
export function unifyFunds(names: ReadonlyArray<string | null | undefined>, preferred: readonly string[] = []): (name: string | null | undefined) => string {
  const keys = [...new Set(names.map(fundKey).filter(k => k && !isKindWord(k)))].sort((a, b) => b.length - a.length);
  const canonical = new Map<string, string>();
  const chosen: string[] = [];
  for (const key of keys) {
    const match = preferred.find(k => sameFund(k, key)) ?? chosen.find(k => sameFund(k, key));
    if (match) canonical.set(key, match);
    else {
      chosen.push(key);
      canonical.set(key, key);
    }
  }
  return name => {
    const key = fundKey(name);
    if (!key || isKindWord(key)) return '';
    return canonical.get(key) ?? preferred.find(k => sameFund(k, key)) ?? key;
  };
}

/**
 * A study fund is named by its abbreviation on the payslip ("מור קה"ג", "קה"ש"). The reading sometimes files such a
 * line under pension, disability or severance, so the name decides.
 */
export function isStudyFund(c: { kind: string; provider: string | null | undefined }): boolean {
  if (c.kind === 'study') return true;
  const name = (c.provider ?? '').replace(/["'״׳”“]/g, '');
  return /(^|\s)קה(ג|ש)?(\s|$)/.test(name) || name.includes('השתל');
}

/** Study funds and disability premiums are not deposited into the pension fund account, so they are left out. */
function lineOf(c: ExtractedContribution): DepositLine | null {
  if (isStudyFund(c) || c.kind === 'disability') return null;
  if (c.kind === 'severance') return 'severance';
  return c.payer === 'employee' ? 'employeePension' : 'employerPension';
}

export interface DepositIndex {
  /** What each payslip set aside, per salary month, line and named fund. */
  payslip: Map<string, number>;
  /** The same for lines with no company on them ("פיצ"), per salary month and line. */
  unnamed: Map<string, number>;
  /** What the funds' reports say reached them, per salary month, line and fund. */
  deposited: Map<string, number>;
  /** Per year: the funds that have a deposit report, by key, with the name printed in the report. */
  coveredFunds: Map<number, Map<string, string>>;
  /** Per year: the named funds that appear on a payslip. */
  payslipFunds: Map<number, Set<string>>;
}

const slot = (year: number, month: number, line: DepositLine, fund = '') => `${year}-${month}|${line}|${fund}`;

export function buildDepositIndex(docs: readonly ReviewDocumentMeta[]): DepositIndex {
  const payslip = new Map<string, number>();
  const unnamed = new Map<string, number>();
  const deposited = new Map<string, number>();
  const coveredFunds = new Map<number, Map<string, string>>();
  const payslipFunds = new Map<number, Set<string>>();

  // Funds with a report first, so a payslip's cut-short name can be matched to them.
  const reportKeys: string[] = [];
  for (const d of docs) {
    if (d.documentType !== 'pension_report' || !Array.isArray(d.extractedContributions)) continue;
    const own = new Map<string, number>();
    for (const c of d.extractedContributions) {
      const line = lineOf(c);
      const fund = fundKey(c.provider);
      if (!line || !fund || c.forYear == null || c.forMonth == null) continue;
      if (!reportKeys.includes(fund)) reportKeys.push(fund);
      const key = slot(c.forYear, c.forMonth, line, fund);
      own.set(key, (own.get(key) ?? 0) + c.amount);
      const funds = coveredFunds.get(c.forYear) ?? new Map<string, string>();
      const name = c.provider ?? fund;
      if (!funds.has(fund) || (funds.get(fund)?.length ?? 0) < name.length) funds.set(fund, name);
      coveredFunds.set(c.forYear, funds);
    }
    // Two reports of the same fund and year (a yearly report and a deposit report) are not added up: the larger wins.
    for (const [key, value] of own) deposited.set(key, Math.max(deposited.get(key) ?? 0, value));
  }

  // One key per company: a report's key wins, then the longest spelling seen on the payslips ("מגד" joins "מגדל").
  const resolve = unifyFunds(
    docs.filter(d => d.documentType === 'payslip').flatMap(d => (d.extractedContributions ?? []).map(c => c.provider)),
    reportKeys
  );

  for (const d of docs) {
    if (d.documentType !== 'payslip' || d.year == null || d.month == null || !Array.isArray(d.extractedContributions)) continue;
    for (const c of d.extractedContributions) {
      const line = lineOf(c);
      if (!line) continue;
      const year = c.forYear ?? d.year;
      const month = c.forMonth ?? d.month;
      const fund = resolve(c.provider);
      if (!fund) {
        const key = slot(year, month, line);
        unnamed.set(key, (unnamed.get(key) ?? 0) + c.amount);
        continue;
      }
      const key = slot(year, month, line, fund);
      payslip.set(key, (payslip.get(key) ?? 0) + c.amount);
      const set = payslipFunds.get(year) ?? new Set<string>();
      set.add(fund);
      payslipFunds.set(year, set);
    }
  }
  return { payslip, unnamed, deposited, coveredFunds, payslipFunds };
}

export interface DepositGap {
  fund: string;
  line: DepositLine;
  reported: number;
  deposited: number;
}

const LINES: DepositLine[] = ['employeePension', 'employerPension', 'severance'];

/**
 * Where a fund's own report shows less than that same fund's payslip line. Only funds that have a report are judged.
 * A line with no company on it is used for the one fund the month names no line for.
 */
export function depositGaps(index: DepositIndex, year: number, month: number): DepositGap[] {
  const gaps: DepositGap[] = [];
  const covered = index.coveredFunds.get(year);
  if (!covered) return gaps;

  const same = (a: number, b: number) => Math.abs(a - b) <= Math.max(5, Math.max(a, b) * 0.03);

  for (const [fund, name] of covered) {
    const reportedOf = (line: DepositLine): number => {
      let reported = index.payslip.get(slot(year, month, line, fund)) ?? 0;
      if (reported === 0) {
        const withoutNamedLine = [...covered.keys()].filter(f => !index.payslip.has(slot(year, month, line, f)));
        if (withoutNamedLine.length === 1) reported = index.unnamed.get(slot(year, month, line)) ?? 0;
      }
      return reported;
    };
    const gotOf = (line: DepositLine) => index.deposited.get(slot(year, month, line, fund)) ?? 0;

    // A report's two employer columns (contributions and severance) are easy to read the wrong way round.
    // When each payslip amount matches the other column, the money is all there, and nothing is flagged for the pair.
    const swapped =
      reportedOf('employerPension') > 0 && reportedOf('severance') > 0
      && same(reportedOf('employerPension'), gotOf('severance'))
      && same(reportedOf('severance'), gotOf('employerPension'))
      && !(same(reportedOf('employerPension'), gotOf('employerPension')) && same(reportedOf('severance'), gotOf('severance')));

    for (const line of LINES) {
      if (swapped && (line === 'employerPension' || line === 'severance')) continue;
      const reported = reportedOf(line);
      if (reported <= 0) continue;
      const got = gotOf(line);
      if (reported - got > Math.max(5, reported * 0.03)) gaps.push({ fund: name, line, reported, deposited: got });
    }
  }
  return gaps;
}

/**
 * What the fund reports say reached the funds in a salary month, all reporting funds together.
 * null when no fund has a report for that year, so nothing is known.
 */
export function depositedTotals(index: DepositIndex, year: number, month: number): { employee: number; employer: number; severance: number } | null {
  const covered = index.coveredFunds.get(year);
  if (!covered?.size) return null;
  const total = { employee: 0, employer: 0, severance: 0 };
  for (const fund of covered.keys()) {
    total.employee += index.deposited.get(slot(year, month, 'employeePension', fund)) ?? 0;
    total.employer += index.deposited.get(slot(year, month, 'employerPension', fund)) ?? 0;
    total.severance += index.deposited.get(slot(year, month, 'severance', fund)) ?? 0;
  }
  return total;
}

export interface UnreadCandidate {
  provider: string | null;
  kind: string;
  payer: string;
  amount: number;
  retro?: boolean;
}

/**
 * Lines that sat on both of the two payslips before this month (and on the one after it, when there is one), with the
 * same amount, and are not found on this one. Either the reading missed them or they were really not on the payslip:
 * both are worth a look at the file. Only named funds count, and retroactive lines never do.
 */
export function suspectedUnread(
  current: readonly UnreadCandidate[],
  previous: readonly UnreadCandidate[],
  beforePrevious: readonly UnreadCandidate[],
  resolve: (name: string | null | undefined) => string,
  /** The month after, when it exists and was read: the line must be there too, so a step change (a raise) is not a loss. */
  next?: readonly UnreadCandidate[] | null
): Array<UnreadCandidate & { company: string }> {
  // The same amount repeats every month. The company name and the exact kind are not part of the identity: a payslip prints
  // a fund's name cut short or not at all, and the reading files pension and managers insurance interchangeably.
  const bucket = (l: UnreadCandidate) =>
    isStudyFund(l) ? 'study' : l.kind === 'severance' ? 'severance' : l.kind === 'disability' ? 'disability' : 'savings';
  const sig = (l: UnreadCandidate) => `${bucket(l)}|${l.payer}|${Math.round(l.amount)}`;
  const regular = (list: readonly UnreadCandidate[]) => list.filter(l => !l.retro && l.amount > 0);
  const now = new Set(regular(current).map(sig));
  const before = new Set(regular(beforePrevious).map(sig));
  const after = next ? new Set(regular(next).map(sig)) : null;
  const seen = new Set<string>();
  const found: Array<UnreadCandidate & { company: string }> = [];
  for (const l of regular(previous)) {
    const company = resolve(l.provider);
    const key = sig(l);
    if (!company || now.has(key) || !before.has(key) || seen.has(key)) continue;
    if (after && !after.has(key)) continue;
    seen.add(key);
    found.push({ ...l, company });
  }
  return found;
}

/** Which funds of a year were compared with a report, and which named funds have no report to compare with. */
export function depositCoverage(index: DepositIndex, year: number): { checked: string[]; unchecked: string[] } {
  const covered = index.coveredFunds.get(year);
  if (!covered?.size) return { checked: [], unchecked: [] };
  const unchecked = [...(index.payslipFunds.get(year) ?? [])].filter(key => !covered.has(key));
  return { checked: [...covered.values()], unchecked };
}
