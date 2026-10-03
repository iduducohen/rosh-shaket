import { AnalyzeResponse, EmploymentMonth, EmploymentReviewCase, LineReconciliation } from './review.models';

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

export function explainReview(review: EmploymentReviewCase, analysis: AnalyzeResponse): ReviewExplanation {
  const months = analysis.summary.months;
  const byKey = new Map(review.months.map(m => [`${m.year}-${m.month}`, m]));
  const order = [...months].sort((a, b) => a.year - b.year || a.month - b.month);
  const first = order[0];
  const withData = order.filter(m => m.hasAnyData);
  const withoutData = order.filter(m => !m.hasAnyData);

  const findings: GapFinding[] = [];

  // 1. Per contribution line: months where the payslip shows less than expected.
  const codes = [...new Set(order.flatMap(m => m.lines.map(l => l.code)))];
  for (const code of codes) {
    const rows = withData
      .map(m => ({ m, line: m.lines.find(l => l.code === code), month: byKey.get(`${m.year}-${m.month}`) }))
      .filter((r): r is { m: typeof r.m; line: LineReconciliation; month: EmploymentMonth | undefined } => !!r.line && r.line.expected != null);

    const missing = rows.filter(r => (r.line.expected ?? 0) > TOLERANCE && (r.line.reported ?? 0) <= TOLERANCE);
    const lower = rows.filter(r => (r.line.reported ?? 0) > TOLERANCE && (r.line.expected ?? 0) - (r.line.reported ?? 0) > TOLERANCE);
    const label = LINE_LABEL[code] ?? code;

    if (missing.length) {
      const onlyFirstMonth = missing.length === 1 && first && missing[0].m.year === first.year && missing[0].m.month === first.month;
      const amount = sum(missing.map(r => r.line.expected ?? 0));
      findings.push(onlyFirstMonth
        ? firstMonthFinding(code, label, amount, monthLabel(missing[0].m))
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
        { text: 'הורידו דוח הפקדות מהאזור האישי בקופה או מהר הכסף, והעלו אותו לבדיקה.', link: '/review/documents', linkLabel: 'איך משיגים דוח פנסיה' }
      ]
    });
  }

  // 4. Salary jumps the analysis flagged — explain instead of alarming.
  for (const anomaly of analysis.anomalies.filter(a => a.kind === 'UnusualChange')) {
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

function firstMonthFinding(code: string, label: string, amount: number, month: string): GapFinding {
  return {
    id: `${code}-first-month`,
    severity: 'check',
    title: `בחודש הראשון (${month}) לא מופיע ${label}`,
    amount: round(amount),
    months: [month],
    what: `לפי השכר, היה אמור להופיע ${shekel(amount)}, אבל בתלוש של החודש הראשון אין שורה כזו. בשאר החודשים היא כן מופיעה.`,
    why: [
      'בחודש הראשון ההפקדות מתחילות לפעמים מאוחר יותר: מי שלא הייתה לו קרן פנסיה פעילה יכול להצטרף לפנסיה אחרי תקופת המתנה, ולפעמים ההפקדה משולמת אחר כך רטרואקטיבית.',
      'ייתכן שההפקדה מופיעה בתלוש של החודש הבא כשורת "הפרשים" — אם כן, היא תיספר לחודש הנכון.',
      'ייתכן שהשורה לא נקראה מהתלוש — כדאי להציץ בתלוש של אותו חודש.'
    ],
    actions: [
      { text: 'בדקו בתלוש של החודש הראשון אם יש שורה של ניכוי או הפרשה לקופה.', link: '/review/check', linkLabel: 'לתלושים לפי חודש' },
      { text: 'דוח הפקדות מהקופה יראה אם הסכום הופקד בכל זאת.', link: '/review/documents', linkLabel: 'להעלאת דוח פנסיה' }
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
