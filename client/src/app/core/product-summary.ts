import { fundKey, isStudyFund, unifyFunds } from './pension-deposits';
import { ReviewDocumentMeta } from './review.models';

/** The three kinds of savings product a payslip sets money aside for. */
export type ProductKey = 'pension' | 'managers' | 'study';

export interface Totals {
  employee: number;
  employer: number;
  severance: number;
}

export interface ProductSummary {
  product: ProductKey;
  /** Everything on the uploaded payslips for this product. */
  payslip: Totals;
  /** Everything in the uploaded fund reports for this product, or null when there is no report for it. */
  report: Totals | null;
  /**
   * The same funds and years on both sides, so the two can be compared: what the payslips say should have been
   * deposited, what the reports found, and the shortfall (never negative). null when there is nothing to compare.
   */
  compare: { should: Totals; found: Totals; missing: number } | null;
}

const emptyTotals = (): Totals => ({ employee: 0, employer: 0, severance: 0 });
const addTotals = (a: Totals, b: Totals): Totals => ({
  employee: a.employee + b.employee,
  employer: a.employer + b.employer,
  severance: a.severance + b.severance
});
const round = (v: number) => Math.round(v * 100) / 100;
const roundTotals = (t: Totals): Totals => ({ employee: round(t.employee), employer: round(t.employer), severance: round(t.severance) });

export const totalOf = (t: Totals): number => t.employee + t.employer + t.severance;

function productOf(c: { kind: string; provider: string | null | undefined }): ProductKey {
  if (isStudyFund(c)) return 'study';
  if (c.kind === 'managers') return 'managers';
  return 'pension';
}

function bucketOf(c: { kind: string; payer: string }): keyof Totals {
  if (c.kind === 'severance') return 'severance';
  return c.payer === 'employee' ? 'employee' : 'employer';
}

const PRODUCTS: ProductKey[] = ['pension', 'managers', 'study'];

interface Raw {
  year: number;
  month: number;
  product: ProductKey;
  bucket: keyof Totals;
  amount: number;
  provider: string | null;
}

interface Line extends Raw {
  company: string;
}

/**
 * Which products besides the pension fund the payslips of a year show: managers insurance and a study fund.
 * A report for each is expected for that year.
 */
export function productsInYear(docs: readonly ReviewDocumentMeta[], year: number): { managers: boolean; study: boolean } {
  const found = { managers: false, study: false };
  for (const d of docs) {
    if (d.documentType !== 'payslip' || !Array.isArray(d.extractedContributions)) continue;
    for (const c of d.extractedContributions) {
      if ((c.forYear ?? d.year) !== year || c.amount === 0) continue;
      if (isStudyFund(c)) found.study = true;
      else if (c.kind === 'managers') found.managers = true;
    }
  }
  return found;
}

/**
 * Sums the uploaded payslips and fund reports per product (pension fund, managers insurance, study fund) and compares
 * them where both exist. Disability premiums are left out: they buy insurance, they are not deposited into savings.
 * The last two months are not compared, because a deposit can take that long to arrive.
 */
export function summarizeProducts(
  docs: readonly ReviewDocumentMeta[],
  today = new Date()
): { products: ProductSummary[]; total: ProductSummary } {
  const payslipRaw: Raw[] = [];
  for (const d of docs) {
    if (d.documentType !== 'payslip' || d.year == null || d.month == null || !Array.isArray(d.extractedContributions)) continue;
    for (const c of d.extractedContributions) {
      if (c.kind === 'disability' || c.amount === 0) continue;
      payslipRaw.push({
        year: c.forYear ?? d.year,
        month: c.forMonth ?? d.month,
        product: productOf(c),
        bucket: bucketOf(c),
        amount: c.amount,
        provider: c.provider
      });
    }
  }

  // Reports: the lines of one document add up; two documents of the same fund and month are not added, the larger wins.
  const reportBest = new Map<string, Raw>();
  for (const d of docs) {
    if (d.documentType !== 'pension_report' || !Array.isArray(d.extractedContributions)) continue;
    const own = new Map<string, Raw>();
    for (const c of d.extractedContributions) {
      if (c.kind === 'disability' || c.amount === 0 || c.forYear == null || c.forMonth == null) continue;
      const product = productOf(c);
      const bucket = bucketOf(c);
      const key = `${c.forYear}-${c.forMonth}|${product}|${bucket}|${fundKey(c.provider)}`;
      const row = own.get(key) ?? { year: c.forYear, month: c.forMonth, product, bucket, amount: 0, provider: c.provider };
      row.amount += c.amount;
      own.set(key, row);
    }
    for (const [key, row] of own) {
      const best = reportBest.get(key);
      if (!best || row.amount > best.amount) reportBest.set(key, row);
    }
  }
  const reportRaw = [...reportBest.values()];

  // One name per company across payslips and reports.
  const resolve = unifyFunds(
    [...payslipRaw, ...reportRaw].map(r => r.provider),
    [...new Set(reportRaw.map(r => fundKey(r.provider)).filter(Boolean))]
  );

  // A payslip line with no company ("פיצ") belongs to the company that has the same amount named elsewhere.
  const owners = new Map<string, Set<string>>();
  const ownerKey = (r: Raw) => `${r.product}|${r.bucket}|${r.amount.toFixed(2)}`;
  for (const r of [...payslipRaw, ...reportRaw]) {
    const company = resolve(r.provider);
    if (!company) continue;
    const set = owners.get(ownerKey(r)) ?? new Set<string>();
    set.add(company);
    owners.set(ownerKey(r), set);
  }
  const payslipLines: Line[] = payslipRaw.map(r => {
    let company = resolve(r.provider);
    if (!company) {
      const same = owners.get(ownerKey(r));
      if (same?.size === 1) company = [...same][0];
    }
    return { ...r, company };
  });
  const reportLines: Line[] = reportRaw.map(r => ({ ...r, company: resolve(r.provider) }));

  // What can be compared: a company and year that has a report for that product.
  const covered = new Set(reportLines.map(r => `${r.company}|${r.year}|${r.product}`));
  const nowIndex = today.getFullYear() * 12 + today.getMonth();
  const settled = (l: Line) => nowIndex - (l.year * 12 + (l.month - 1)) > 2;

  const products: ProductSummary[] = [];
  for (const product of PRODUCTS) {
    const mine = payslipLines.filter(l => l.product === product);
    const theirs = reportLines.filter(l => l.product === product);
    if (!mine.length && !theirs.length) continue;

    const payslip = emptyTotals();
    for (const l of mine) payslip[l.bucket] += l.amount;
    const report = theirs.length ? emptyTotals() : null;
    for (const l of theirs) report![l.bucket] += l.amount;

    let compare: ProductSummary['compare'] = null;
    if (theirs.length) {
      const should = emptyTotals();
      const found = emptyTotals();
      for (const l of mine) {
        if (l.company && covered.has(`${l.company}|${l.year}|${product}`) && settled(l)) should[l.bucket] += l.amount;
      }
      for (const l of theirs) if (settled(l)) found[l.bucket] += l.amount;
      if (totalOf(should) > 0) {
        // The two employer columns of a report are easy to read the wrong way round, so the shortfall is on the sum.
        compare = { should: roundTotals(should), found: roundTotals(found), missing: Math.max(0, round(totalOf(should) - totalOf(found))) };
      }
    }
    products.push({ product, payslip: roundTotals(payslip), report: report ? roundTotals(report) : null, compare });
  }

  const total: ProductSummary = {
    product: 'pension',
    payslip: roundTotals(products.reduce((s, p) => addTotals(s, p.payslip), emptyTotals())),
    report: products.some(p => p.report)
      ? roundTotals(products.reduce((s, p) => addTotals(s, p.report ?? emptyTotals()), emptyTotals()))
      : null,
    compare: null
  };
  const withCompare = products.filter(p => p.compare);
  if (withCompare.length) {
    total.compare = {
      should: roundTotals(withCompare.reduce((s, p) => addTotals(s, p.compare!.should), emptyTotals())),
      found: roundTotals(withCompare.reduce((s, p) => addTotals(s, p.compare!.found), emptyTotals())),
      missing: round(withCompare.reduce((s, p) => s + p.compare!.missing, 0))
    };
  }
  return { products, total };
}
