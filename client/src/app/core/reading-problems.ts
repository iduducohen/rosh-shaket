import { suspectedUnread, unifyFunds, fundKey } from './pension-deposits';
import { finalMonthPensionBase } from './pay-components';
import { ExtractedContribution, ReviewDocumentMeta } from './review.models';

const MONTHS = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/** A file that was checked but whose lines were read only in part, so what the app concludes from it cannot be trusted yet. */
export interface ReadingProblem {
  docId: string;
  year: number;
  month: number | null;
  kind: 'payslip' | 'pension_report';
  /** "תלוש מרץ 2025", "דוח שנתי 2024". */
  where: string;
  fileName: string | null;
  /** What was not read, in a sentence. */
  text: string;
}

const checked = (d: ReviewDocumentMeta) => d.validationStatus === 'ok' || d.validationStatus === 'manual';

function label(list: Array<{ company: string; kind: string; payer: string; amount: number }>): string {
  const kindText = (l: { kind: string; payer: string }) => {
    switch (l.kind) {
      case 'severance': return 'פיצויים';
      case 'study': return l.payer === 'employee' ? 'קרן השתלמות, עובד' : 'קרן השתלמות, מעסיק';
      case 'managers': return l.payer === 'employee' ? 'ביטוח מנהלים, עובד' : 'ביטוח מנהלים, מעסיק';
      case 'disability': return 'אובדן כושר עבודה';
      default: return l.payer === 'employee' ? 'ניכוי עובד לפנסיה' : 'הפרשת מעסיק לפנסיה';
    }
  };
  return list.map(l => `${l.company}, ${kindText(l)} (${Math.round(l.amount).toLocaleString('he-IL')} ₪)`).join(' · ');
}

/**
 * Finds files whose reading looks incomplete, from what repeats: a fund line that sat on the two payslips before and is
 * gone from this one, an empty contribution table among months that have one, a report with no deposit table, or a report
 * that shows fewer months than the payslips do. Each one is a reason to check the file again, not a verdict on the employer.
 */
export function findReadingProblems(
  docs: readonly ReviewDocumentMeta[],
  today = new Date(),
  /** Years confirmed against Form 106: a payslip line that looks missing in one of them is not reported. */
  verified: ReadonlySet<number> = new Set()
): ReadingProblem[] {
  const problems: ReadingProblem[] = [];
  const payslips = docs.filter(d => d.documentType === 'payslip' && d.year != null && d.month != null);
  const resolve = unifyFunds(payslips.flatMap(d => (d.extractedContributions ?? []).map(c => c.provider)));

  const byMonth = new Map<number, ReviewDocumentMeta>();
  for (const d of payslips) byMonth.set(d.year! * 12 + (d.month! - 1), d);
  const linesOf = (d: ReviewDocumentMeta | undefined): ExtractedContribution[] | null =>
    d && Array.isArray(d.extractedContributions) ? d.extractedContributions : null;
  const regular = (d: ReviewDocumentMeta, list: ExtractedContribution[]) =>
    list.filter(c => (c.forMonth == null || c.forMonth === d.month) && (c.forYear == null || c.forYear === d.year));

  for (const d of payslips) {
    // A final settlement has no regular contribution table: it is not compared with the months around it.
    if (!checked(d) || verified.has(d.year!) || d.isSettlement) continue;
    const where = `תלוש ${MONTHS[d.month!]} ${d.year}`;
    const lines = linesOf(d);
    if (lines == null) {
      problems.push({
        docId: d.id, year: d.year!, month: d.month, kind: 'payslip', where, fileName: d.fileName ?? null,
        text: 'שורות ההפרשה עוד לא נקראו מהתלוש הזה.'
      });
      continue;
    }
    const index = d.year! * 12 + (d.month! - 1);
    const previous = byMonth.get(index - 1);
    const beforePrevious = byMonth.get(index - 2);
    const prevLines = linesOf(previous);
    const beforeLines = linesOf(beforePrevious);

    if (lines.length === 0 && ((prevLines?.length ?? 0) > 0 || (beforeLines?.length ?? 0) > 0)) {
      // The last payslip, with notice pay or a vacation redemption, normally has no contribution table: not a reading problem.
      if (!byMonth.has(index + 1) && finalMonthPensionBase(d.extractedComponents) != null) continue;
      problems.push({
        docId: d.id, year: d.year!, month: d.month, kind: 'payslip', where, fileName: d.fileName ?? null,
        text: 'לא נקראו שורות הפרשה בתלוש הזה, אף שבחודשים הקודמים יש בו. אם גם בקובץ אין כאלה, ההפרשה לא הופיעה החודש (או שולמה בנפרד, למשל בחודש סיום).'
      });
      continue;
    }
    if (prevLines && beforeLines) {
      const nextDoc = byMonth.get(index + 1);
      const nextLines = linesOf(nextDoc);
      const missing = suspectedUnread(
        regular(d, lines), regular(previous!, prevLines), regular(beforePrevious!, beforeLines), resolve,
        nextDoc && nextLines ? regular(nextDoc, nextLines) : null
      );
      if (missing.length) {
        problems.push({
          docId: d.id, year: d.year!, month: d.month, kind: 'payslip', where, fileName: d.fileName ?? null,
          text: `שורות שהופיעו בחודשים שלפניו ולא נמצאו בקריאה של התלוש הזה: ${label(missing)}. ייתכן שהקריאה פספסה אותן, וייתכן שהן באמת לא מופיעות בתלוש, וגם זה שווה בירור.`
        });
      }
    }
  }

  // Reports
  const nowIndex = today.getFullYear() * 12 + today.getMonth();
  for (const d of docs) {
    if (d.documentType !== 'pension_report' || d.year == null || !checked(d)) continue;
    const where = `${d.pensionKind === 'deposits' ? 'דוח הפקדות' : 'דוח שנתי'} ${d.year}`;
    const base = { docId: d.id, year: d.year, month: null as number | null, kind: 'pension_report' as const, where, fileName: d.fileName ?? null };
    const lines = linesOf(d);
    if (lines == null) {
      problems.push({ ...base, text: 'הדוח נבדק לפני שקריאת ההפקדות נוספה, ולכן ההפקדות שבו לא נקראו.' });
      continue;
    }
    if (lines.length === 0) {
      problems.push({ ...base, text: 'לא נקראה בדוח טבלת הפקדות לפי חודש. דוח שמציג יתרות בלבד באמת לא מכיל אותה.' });
      continue;
    }

    // Fewer months in the report than on the payslips of the same fund: part of the table may not have been read.
    const reportMonths = new Map<string, Set<number>>();
    for (const c of lines) {
      if (c.forYear !== d.year || c.forMonth == null) continue;
      const company = fundKey(c.provider);
      if (!company) continue;
      const set = reportMonths.get(company) ?? new Set<number>();
      set.add(c.forMonth);
      reportMonths.set(company, set);
    }
    const missingMonths = new Set<number>();
    for (const p of payslips) {
      if (p.year !== d.year || nowIndex - (p.year * 12 + (p.month! - 1)) <= 2) continue;
      for (const c of regular(p, linesOf(p) ?? [])) {
        if (c.kind === 'disability' || c.kind === 'study') continue;
        const company = resolve(c.provider);
        const key = [...reportMonths.keys()].find(k => resolve(k) === company);
        if (company && key && !reportMonths.get(key)!.has(p.month!)) missingMonths.add(p.month!);
      }
    }
    if (missingMonths.size) {
      const list = [...missingMonths].sort((a, b) => a - b).map(m => MONTHS[m]).join(', ');
      problems.push({
        ...base,
        text: `בדוח נקראו הפקדות לחלק מהחודשים בלבד. אין שורות עבור: ${list}. אם הן מופיעות בדוח עצמו, בדיקה מחדש תקרא אותן. אם אינן שם, כדאי לפנות לקופה.`
      });
    }
  }
  return problems;
}
