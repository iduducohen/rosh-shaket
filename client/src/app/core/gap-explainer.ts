import { AnalyzeResponse, EmploymentMonth, EmploymentReviewCase, LineReconciliation } from './review.models';
import { buildDepositIndex, depositedTotals, isStudyFund } from './pension-deposits';

/**
 * Turns the reconciliation numbers into conclusions a person without payroll knowledge can act on:
 * what was found, how much, in which months, why it may happen, and what to do next.
 * Pure function — the results page renders it, the tests pin it.
 */

export type FindingSeverity = 'serious' | 'check' | 'info' | 'ok';

export interface FindingAction {
  text: string;
  link?: string;
  linkLabel?: string;
}

export interface GapFinding {
  id: string;
  severity: FindingSeverity;
  title: string;
  /** Shortfall in ₪ for this finding (positive = less than expected), or null when not a money gap. */
  amount: number | null;
  months: string[];
  /** What we saw, in plain words. */
  what: string;
  /** Likely reasons, most likely first. */
  why: string[];
  actions: FindingAction[];
}

export interface ReviewExplanation {
  headline: string;
  headlineSeverity: FindingSeverity;
  /** Two or three sentences that tell the whole story. */
  story: string[];
  /** Expected minus reported over the months that have a payslip (positive = shortfall). */
  payslipGap: number | null;
  monthsWithPayslip: number;
  monthsWithoutPayslip: number;
  /** Rough expected deposits for months without a payslip, from the average of known months. */
  estimatedForMissing: number | null;
  findings: GapFinding[];
}

const LINE_LABEL: Record<string, string> = {
  EmployeePension: 'הניכוי לפנסיה מהשכר (חלק העובד)',
  EmployerPension: 'הפקדת המעסיק לפנסיה (תגמולים)',
  EmployerCompensation: 'הפקדת המעסיק לפיצויים',
  EmployeeCompensation: 'פיצויים (חלק העובד)',
  TrainingFundEmployee: 'הניכוי לקרן ההשתלמות (חלק העובד)',
  TrainingFundEmployer: 'הפקדת המעסיק לקרן ההשתלמות'
};

/** Minimum rates under the mandatory pension order (percent of the pensionable salary). */
const LEGAL_MIN: Record<string, number> = {
  EmployeePension: 6,
  EmployerPension: 6.5,
  EmployerCompensation: 6
};

const MONTH_NAMES = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/** Differences under a shekel are rounding, not a gap. */
const TOLERANCE = 1;

const PENSION_LINES = new Set(['EmployeePension', 'EmployerPension', 'EmployerCompensation']);

/** The part of a fund report a payslip line is compared with. */
const REPORT_BUCKET: Record<string, 'employee' | 'employer' | 'severance'> = {
  EmployeePension: 'employee',
  EmployerPension: 'employer',
  EmployerCompensation: 'severance'
};

export function explainReview(review: EmploymentReviewCase, analysis: AnalyzeResponse): ReviewExplanation {
  const months = analysis.summary.months;
  const byKey = new Map(review.months.map(m => [`${m.year}-${m.month}`, m]));
  const order = [...months].sort((a, b) => a.year - b.year || a.month - b.month);
  const first = order[0];
  const withData = order.filter(m => m.hasAnyData);
  const withoutData = order.filter(m => !m.hasAnyData);

  const findings: GapFinding[] = [];
  const depositIndex = buildDepositIndex(review.documents);

  // 1. Per contribution line: months where the payslip shows less than expected.
  const codes = [...new Set(order.flatMap(m => m.lines.map(l => l.code)))];
  for (const code of codes) {
    const rows = withData
      .map(m => ({ m, line: m.lines.find(l => l.code === code), month: byKey.get(`${m.year}-${m.month}`) }))
      .filter((r): r is { m: typeof r.m; line: LineReconciliation; month: EmploymentMonth | undefined } => !!r.line && r.line.expected != null);

    const absent = rows.filter(r => (r.line.expected ?? 0) > TOLERANCE && (r.line.reported ?? 0) <= TOLERANCE);
    // The payslip does not show the line, but a later payslip or the fund's own report does: nothing is missing, so nothing is shown.
    const bucket = REPORT_BUCKET[code];
    const inReport = absent
      .map(r => {
        const expected = r.line.expected ?? 0;
        const fromReport = bucket ? depositedTotals(depositIndex, r.m.year, r.m.month)?.[bucket] : null;
        if (fromReport != null && fromReport >= expected * 0.95) return { r, got: fromReport };
        const retro = retroAmount(review, code, r.m.year, r.m.month);
        return retro >= expected * 0.9 ? { r, got: retro } : { r, got: null };
      })
      .filter((x): x is { r: typeof absent[number]; got: number } => x.got != null);
    const missing = absent.filter(r => !inReport.some(x => x.r === r));
    const lower = rows.filter(r => (r.line.reported ?? 0) > TOLERANCE && (r.line.expected ?? 0) - (r.line.reported ?? 0) > TOLERANCE);
    const label = LINE_LABEL[code] ?? code;

    if (missing.length) {
      const onlyFirstMonth = missing.length === 1 && first && missing[0].m.year === first.year && missing[0].m.month === first.month;
      const amount = sum(missing.map(r => r.line.expected ?? 0));
      findings.push(onlyFirstMonth
        ? firstMonthFinding(code, label, amount, monthLabel(missing[0].m), partialStart(review, first))
        : missingFinding(code, label, amount, missing.map(r => monthLabel(r.m))));
    }

    if (lower.length) {
      const amount = sum(lower.map(r => (r.line.expected ?? 0) - (r.line.reported ?? 0)));
      const rates = lower
        .map(r => rateOf(r.line.reported, r.month))
        .filter((v): v is number => v != null);
      const rate = rates.length ? Math.round(median(rates) * 100) / 100 : null;
      findings.push(lowerFinding(code, label, amount, lower.map(r => monthLabel(r.m)), rate));
    }
  }

  // 2. Months without a payslip: not checked — say so, and give a rough estimate.
  const avgExpected = withData.length
    ? sum(withData.map(m => sum(m.lines.map(l => l.expected ?? 0)))) / withData.length
    : null;
  const estimatedForMissing = withoutData.length && avgExpected != null ? Math.round(avgExpected * withoutData.length) : null;
  if (withoutData.length) {
    findings.push({
      id: 'no-payslip',
      severity: 'check',
      title: withoutData.length === 1 ? 'חודש אחד בלי תלוש — לא נבדק' : `${withoutData.length} חודשים בלי תלוש — לא נבדקו`,
      amount: null,
      months: withoutData.map(monthLabel),
      what: estimatedForMissing != null
        ? `לחודשים האלה אין תלוש, ולכן אין לנו מה שדווח בהם. לפי השכר בשאר החודשים, היה אמור להיות מופקד בהם בערך ${shekel(estimatedForMissing)} — זה אומדן בלבד, הוא לא נכלל בפער.`
        : 'לחודשים האלה אין תלוש, ולכן אין לנו מה שדווח בהם.',
      why: [
        'התלוש לא הועלה, או שסומן שאין.',
        'בלי התלוש אי אפשר לדעת אם ההפקדה בחודש הזה הייתה תקינה — חודש כזה מוצג כ"לא ידוע", לא כ־0.'
      ],
      actions: [
        { text: 'העלו את התלושים החסרים — כל תלוש שמתווסף נבדק מיד.', link: '/review/documents', linkLabel: 'להעלאת תלושים' },
        { text: 'אין תלוש? דוח שנתי מהקופה מראה מה הופקד בכל חודש, וטופס 106 מראה את השכר השנתי.' }
      ]
    });
  }

  // 3. What the payslip says is not proof the money reached the fund.
  if (analysis.summary.actualTotal == null && withData.length) {
    findings.push({
      id: 'no-fund-report',
      severity: 'info',
      title: 'עוד לא בדקנו שהכסף הגיע לקופה',
      amount: null,
      months: [],
      what: 'התלוש מראה מה המעסיק דיווח שהפקיד. רק דוח מהקופה (פנסיה / השתלמות) מראה שהכסף באמת נכנס, ובאיזה תאריך.',
      why: [
        'לא הועלה דוח שנתי או דוח הפקדות מהקופה.',
        'קורה שמעסיק מנכה מהשכר אבל מעביר לקופה באיחור או לא מעביר — רק הדוח מהקופה יראה את זה.'
      ],
      actions: [
        { text: 'הורידו דוח הפקדות מהאזור האישי בקופה, או בקשו אותו מהקופה או מחברת הביטוח, והעלו אותו לבדיקה. הר הכסף והר הביטוח מראים רק מי הגוף.', link: '/review/documents', linkLabel: 'איך משיגים דוח פנסיה' }
      ]
    });
  }

  // 4. Salary jumps the analysis flagged — explain instead of alarming.
  const partial = partialMonths(review, order);
  const nextOf = (y: number, m: number) => (m === 12 ? `${y + 1}-1` : `${y}-${m + 1}`);
  for (const anomaly of analysis.anomalies.filter(a => a.kind === 'UnusualChange')) {
    // A jump to or from a part-month (started on the 22nd, left on the 10th) is the month length, not a pay change.
    const prev = anomaly.month === 1 ? `${anomaly.year - 1}-12` : `${anomaly.year}-${anomaly.month - 1}`;
    if (partial.has(`${anomaly.year}-${anomaly.month}`) || partial.has(prev) || partial.has(nextOf(anomaly.year, anomaly.month))) continue;
    if (isOneOffPayment(review, anomaly.year, anomaly.month)) continue;
    findings.push({
      id: `salary-${anomaly.year}-${anomaly.month}`,
      severity: 'info',
      title: `שינוי גדול בשכר ב${MONTH_NAMES[anomaly.month]} ${anomaly.year}`,
      amount: null,
      months: [`${MONTH_NAMES[anomaly.month]} ${anomaly.year}`],
      what: anomaly.explanation,
      why: [
        'חודש עבודה חלקי — למשל חודש ראשון או אחרון, או חופשה ללא תשלום.',
        'העלאת שכר, בונוס או תשלום חד־פעמי.',
        'טעות בקריאת התלוש — כדאי להציץ בתלוש של אותו חודש.'
      ],
      actions: [{ text: 'אם השכר בתלוש שונה ממה שמופיע כאן, אפשר לתקן אותו בשלב הבדיקה.', link: '/review/check', linkLabel: 'לפירוט החודשים' }]
    });
  }

  findings.sort((a, b) => rank(a.severity) - rank(b.severity) || (b.amount ?? 0) - (a.amount ?? 0));

  const payslipGap = withData.length
    ? round(sum(withData.flatMap(m => m.lines.map(l => (l.expected ?? 0) - (l.reported ?? 0)))))
    : null;
  const moneyFindings = findings.filter(f => f.amount != null && f.amount > TOLERANCE);
  const worst = findings[0]?.severity ?? 'ok';

  let headline: string;
  let headlineSeverity: FindingSeverity;
  if (!withData.length) {
    headline = 'עוד אין מספיק מידע כדי לבדוק את ההפקדות';
    headlineSeverity = 'check';
  } else if (!moneyFindings.length) {
    headline = 'לפי התלושים, ההפקדות תואמות למה שנדרש';
    headlineSeverity = worst === 'serious' ? 'serious' : 'ok';
  } else {
    const total = sum(moneyFindings.map(f => f.amount ?? 0));
    headline = `נמצא פער של ${shekel(total)} בין מה שהיה צריך להיות מופקד לבין מה שמופיע בתלושים`;
    headlineSeverity = moneyFindings.some(f => f.severity === 'serious') ? 'serious' : 'check';
  }

  const story: string[] = [];
  story.push(`בדקנו ${withData.length} מתוך ${order.length} חודשי עבודה שיש להם תלוש: לכל חודש חישבנו כמה היה אמור להיות מופקד לפנסיה, לפיצויים ולקרן ההשתלמות לפי השכר, והשווינו למה שמופיע בתלוש.`);
  if (moneyFindings.length) {
    const top = moneyFindings[0];
    story.push(`הפער העיקרי: ${top.title} (${shekel(top.amount ?? 0)}). למטה מפורט כל פער — מה ראינו, למה זה יכול לקרות, ומה כדאי לעשות.`);
  }
  if (withoutData.length) story.push(`${withoutData.length} חודשים בלי תלוש לא נבדקו, ולכן התמונה עדיין חלקית.`);
  if (analysis.summary.actualTotal == null && withData.length) story.push('בלי דוח מהקופה אי אפשר לדעת אם הכסף שדווח בתלוש אכן הגיע לקופה.');

  return {
    headline,
    headlineSeverity,
    story,
    payslipGap,
    monthsWithPayslip: withData.length,
    monthsWithoutPayslip: withoutData.length,
    estimatedForMissing,
    findings
  };
}

/** "22/10/2023" when the job started inside the first month, so that only part of it was worked. */
/**
 * A jump in the gross that is a bonus (or the month after a bonus, when the pay goes back): the payslip's own payment lines
 * say so, and without them a one-month spike that returns to the earlier level is the same thing. It is not a pay change.
 */
function isOneOffPayment(review: EmploymentReviewCase, year: number, month: number): boolean {
  const grossOf = (y: number, m: number) => review.months.find(x => x.year === y && x.month === m)?.grossSalary ?? null;
  const bonusOf = (y: number, m: number) => {
    const doc = review.documents.find(d => d.documentType === 'payslip' && d.year === y && d.month === m && Array.isArray(d.extractedComponents));
    return (doc?.extractedComponents ?? []).filter(c => c.kind === 'bonus').reduce((a, c) => a + c.amount, 0);
  };
  const near = (a: number, b: number) => b > 0 && Math.abs(a - b) / b < 0.25;
  const prevY = month === 1 ? year - 1 : year;
  const prevM = month === 1 ? 12 : month - 1;
  const nextY = month === 12 ? year + 1 : year;
  const nextM = month === 12 ? 1 : month + 1;
  const gross = grossOf(year, month);
  const prev = grossOf(prevY, prevM);
  if (gross == null || prev == null) return false;

  // This month holds a bonus, and without it the pay is where it was.
  const bonus = bonusOf(year, month);
  if (bonus > 0 && near(gross - bonus, prev)) return true;
  // The month before held a bonus, and without it the pay is where it is now.
  const prevBonus = bonusOf(prevY, prevM);
  if (prevBonus > 0 && near(prev - prevBonus, gross)) return true;

  // No payment lines read: up for a single month and back to the level before it, or the month right after such a spike.
  const next = grossOf(nextY, nextM);
  const beforePrev = grossOf(prevM === 1 ? prevY - 1 : prevY, prevM === 1 ? 12 : prevM - 1);
  if (next != null && gross > prev * 1.25 && near(next, prev)) return true;
  if (beforePrev != null && prev > beforePrev * 1.25 && near(gross, beforePrev)) return true;
  return false;
}

/** Months the person worked only part of: the start month when it began after the 1st, the end month when it ended before its last day. */
function partialMonths(review: EmploymentReviewCase, order: Array<{ year: number; month: number }>): Set<string> {
  const set = new Set<string>();
  const start = review.period?.startDate?.split('-').map(Number);
  if (start && start.length === 3 && start[2] > 1) set.add(`${start[0]}-${start[1]}`);
  const end = review.period?.endDate?.split('-').map(Number);
  const last = order[order.length - 1];
  if (end && end.length === 3 && end[0] === last?.year && end[1] === last?.month) {
    const days = new Date(end[0], end[1], 0).getDate();
    if (end[2] < days) set.add(`${end[0]}-${end[1]}`);
  }
  return set;
}

/** What other payslips carry for this salary month and line (the "differences" rows), added up. */
function retroAmount(review: EmploymentReviewCase, code: string, year: number, month: number): number {
  let total = 0;
  for (const d of review.documents) {
    if (d.documentType !== 'payslip' || !Array.isArray(d.extractedContributions)) continue;
    if (d.year === year && d.month === month) continue;
    for (const c of d.extractedContributions) {
      if (c.forYear !== year || c.forMonth !== month) continue;
      const study = isStudyFund(c);
      const ok = code === 'TrainingFundEmployee' ? study && c.payer === 'employee'
        : code === 'TrainingFundEmployer' ? study && c.payer === 'employer'
        : study || c.kind === 'disability' ? false
        : code === 'EmployerCompensation' ? c.kind === 'severance'
        : code === 'EmployeePension' ? c.kind !== 'severance' && c.payer === 'employee'
        : code === 'EmployerPension' ? c.kind !== 'severance' && c.payer === 'employer'
        : false;
      if (ok) total += c.amount;
    }
  }
  return total;
}

function partialStart(review: EmploymentReviewCase, first: { year: number; month: number } | undefined): string | null {
  const start = review.period?.startDate;
  if (!start || !first) return null;
  const [y, m, d] = start.split('-').map(Number);
  if (!y || !m || !d || d <= 1 || y !== first.year || m !== first.month) return null;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

function firstMonthFinding(code: string, label: string, amount: number, month: string, startedOn: string | null): GapFinding {
  const part = startedOn
    ? ` (הסכום מחושב על השכר החלקי של החודש הזה, כי העבודה התחילה ב־${startedOn})`
    : '';
  return {
    id: `${code}-first-month`,
    severity: 'check',
    title: `בחודש הראשון (${month}) לא מופיע ${label}`,
    amount: round(amount),
    months: [month],
    what: `לפי השכר, היה אמור להופיע ${shekel(amount)}${part}. בדקנו את התלוש של החודש הראשון ואת התלושים שאחריו, גם כשורת "הפרשים", ולא נמצאה שורה כזו. בשאר החודשים היא כן מופיעה.`,
    why: [
      'בחודש הראשון ההפקדות מתחילות לפעמים מאוחר יותר: מי שלא הייתה לו קרן פנסיה פעילה יכול להצטרף לפנסיה אחרי תקופת המתנה, ולפעמים ההפקדה משולמת אחר כך רטרואקטיבית.',
      'ייתכן שהשורה לא נקראה מהקובץ. אם יש אותה בקובץ, בדיקה מחדש של התלוש בשלב המסמכים תקרא אותה והממצא יתעדכן לבד.'
    ],
    actions: [
      { text: 'אם השורה קיימת בקובץ של התלוש, בצעו בדיקה מחדש לתלוש, והממצא יוסר.', link: '/review/documents', linkLabel: 'לשלב המסמכים' },
      { text: 'דוח הפקדות מהקופה יראה אם הסכום הופקד בכל זאת, והממצא יוסר לבד כשהדוח נקרא.', link: '/review/documents', linkLabel: 'להעלאת דוח פנסיה' }
    ]
  };
}

function missingFinding(code: string, label: string, amount: number, months: string[]): GapFinding {
  const pension = PENSION_LINES.has(code);
  return {
    id: `${code}-missing`,
    severity: pension ? 'serious' : 'check',
    title: `${months.length === 1 ? 'בחודש אחד' : `ב־${months.length} חודשים`} לא מופיע ${label}`,
    amount: round(amount),
    months,
    what: `בחודשים האלה יש תלוש, אבל אין בו ${label}. לפי השכר היה אמור להופיע בהם יחד ${shekel(amount)}.`,
    why: pension
      ? [
          'המעסיק לא הפריש לפנסיה באותם חודשים — הפקדה לפנסיה היא חובה לפי החוק.',
          'ההפקדה עברה לחודש אחר (שורת "הפרשים") או רוכזה בתלוש מאוחר יותר.',
          'השורה לא נקראה מהתלוש — כדאי לבדוק בתלוש עצמו.'
        ]
      : [
          'קרן השתלמות אינה חובה לפי החוק — היא תלויה בחוזה או בהסכם הקיבוצי.',
          'ההפקדה הופסקה או עברה לחודש אחר.',
          'השורה לא נקראה מהתלוש.'
        ],
    actions: [
      { text: 'בדקו את התלושים של החודשים האלה.', link: '/review/check', linkLabel: 'לתלושים לפי חודש' },
      { text: 'דוח הפקדות מהקופה יראה אם הכסף הופקד בפועל.', link: '/review/documents', linkLabel: 'להעלאת דוח פנסיה' },
      ...(pension ? [{ text: 'אם ההפקדה באמת חסרה — זה בדיוק המקרה שבו כדאי להתייעץ עם איש מקצוע או עורך דין לדיני עבודה.', link: '/help/lawyers', linkLabel: 'לעורכי דין לדיני עבודה' }] : [])
    ]
  };
}

function lowerFinding(code: string, label: string, amount: number, months: string[], rate: number | null): GapFinding {
  const min = LEGAL_MIN[code];
  const belowLaw = min != null && rate != null && rate + 0.05 < min;
  const training = code.startsWith('TrainingFund');
  const severity: FindingSeverity = belowLaw ? 'serious' : training || (min != null && rate != null) ? 'info' : 'check';
  const rateText = rate != null ? `${formatRate(rate)}% מהשכר` : 'פחות ממה שחישבנו';

  const why: string[] = [];
  if (training) {
    why.push('הכי נפוץ: המעסיק מפקיד לקרן השתלמות רק עד תקרת השכר שמוכרת לפטור ממס (כ־15,712 ₪ בחודש), ולא על כל השכר. זה חוקי ומקובל, ואם זה המצב — אין כאן חוסר.');
    why.push('קרן השתלמות אינה חובה לפי החוק; השיעור נקבע בחוזה או בהסכם הקיבוצי.');
  } else if (belowLaw) {
    why.push(`זה פחות מהמינימום שקבוע בצו פנסיה חובה (${min}%).`);
    why.push('ייתכן שההפקדה מחושבת על שכר נמוך מהשכר המבוטח — למשל רק על שכר היסוד.');
  } else if (code === 'EmployerCompensation' && rate != null && rate < 8.33) {
    why.push(`${formatRate(rate)}% לפיצויים זה מעל המינימום בחוק (6%), אבל מכסה רק חלק מפיצויי הפיטורים. 8.33% מכסים את הפיצויים במלואם.`);
    why.push('בפיטורים, המעסיק צריך להשלים את ההפרש עד פיצויים מלאים — אלא אם יש בחוזה סעיף 14 על 8.33%.');
  } else {
    why.push('ההפקדה מחושבת על בסיס שכר אחר — למשל בלי רכיבים שאינם פנסיוניים.');
    why.push('חודש עבודה חלקי.');
  }
  why.push('ייתכן שהסכום לא נקרא נכון מהתלוש.');

  return {
    id: `${code}-lower`,
    severity,
    title: `${label} נמוך ממה שחישבנו`,
    amount: round(amount),
    months,
    what: `בתלוש מופיע ${rateText}. לפי מה שחישבנו היה אמור להופיע יותר — בסך הכול ${shekel(amount)} פחות${months.length > 1 ? ` ב־${months.length} חודשים` : ''}.`,
    why,
    actions: [
      { text: training ? 'בדקו בחוזה מה השיעור והתקרה לקרן השתלמות.' : 'בדקו בתלוש על איזה שכר מחושבת ההפקדה ובאיזה שיעור.' },
      ...(belowLaw ? [{ text: 'הפקדה מתחת למינימום היא סיבה טובה לבדיקה עם איש מקצוע.', link: '/help/professionals', linkLabel: 'לאנשי מקצוע' }] : [])
    ]
  };
}

function rateOf(amount: number | null | undefined, month: EmploymentMonth | undefined): number | null {
  const base = month?.pensionableSalary ?? month?.grossSalary;
  if (amount == null || !base) return null;
  return (amount / base) * 100;
}

function monthLabel(m: { year: number; month: number }): string {
  return `${MONTH_NAMES[m.month]} ${m.year}`;
}

function rank(s: FindingSeverity): number {
  return s === 'serious' ? 0 : s === 'check' ? 1 : s === 'info' ? 2 : 3;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

function formatRate(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, '');
}

export function shekel(v: number): string {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(v);
}
