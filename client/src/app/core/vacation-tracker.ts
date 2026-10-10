/**
 * Follows the vacation-days balance from payslip to payslip and says where it does not add up.
 * Works only on what the payslips print (balance, use, accrual, previous balance) — nothing is guessed.
 */

export interface VacationFigures {
  /** Balance at the end of the month, in days. Can be negative. */
  balance: number | null;
  used: number | null;
  accrued: number | null;
  previousBalance: number | null;
}

export interface VacationPayslip {
  year: number;
  month: number;
  /** undefined = the payslip was checked before vacation days were read; null = read, nothing printed. */
  vacation: VacationFigures | null | undefined;
}

export type VacationMonthStatus = 'ok' | 'mismatch' | 'note' | 'noData';

export interface VacationMonth {
  year: number;
  month: number;
  label: string;
  opening: number | null;
  accrued: number | null;
  used: number | null;
  balance: number | null;
  /** opening + accrued − used, when all three are known. */
  expected: number | null;
  status: VacationMonthStatus;
  note: string | null;
}

export type VacationSeverity = 'warn' | 'info' | 'ok';

export interface VacationFinding {
  severity: VacationSeverity;
  title: string;
  text: string;
  months: string[];
}

export interface VacationTracking {
  /** At least one payslip printed vacation figures. */
  hasData: boolean;
  months: VacationMonth[];
  findings: VacationFinding[];
  mismatchCount: number;
  lastBalance: number | null;
  lastBalanceLabel: string | null;
  /** The last known balance in shekels, by the salary of that month. Null when there is nothing to redeem. */
  redemptionEstimate: number | null;
  /** Payslips checked before vacation days were read — a re-check adds them. */
  notReadCount: number;
}

export interface VacationInput {
  payslips: VacationPayslip[];
  /** yyyy-MM-dd */
  startDate: string;
  endDate: string;
  /** Gross salary of the month holding the last balance, for the redemption estimate. */
  salaryFor?: (year: number, month: number) => number | null;
  workDaysPerWeek?: 5 | 6;
}

/** Balances are printed with two decimals; anything below this is rounding. */
const TOLERANCE = 0.06;

/** Annual vacation by year of work, in work days (Annual Leave Law): index 0 = first year. */
const LEGAL_DAYS: Record<5 | 6, number[]> = {
  5: [12, 12, 12, 12, 12, 14, 15, 16, 17, 18, 19, 20],
  6: [14, 14, 14, 14, 14, 16, 18, 19, 20, 21, 22, 23, 24]
};
/** Work days in a month, for the value of one vacation day. */
const MONTH_WORK_DAYS: Record<5 | 6, number> = { 5: 22, 6: 25 };

export function legalAnnualVacationDays(yearOfWork: number, workDaysPerWeek: 5 | 6 = 5): number {
  const table = LEGAL_DAYS[workDaysPerWeek];
  return table[Math.min(Math.max(yearOfWork, 1), table.length) - 1];
}

export function trackVacation(input: VacationInput): VacationTracking {
  const week = input.workDaysPerWeek ?? 5;
  const slips = [...input.payslips].sort((a, b) => a.year - b.year || a.month - b.month);
  const notReadCount = slips.filter(s => s.vacation === undefined).length;
  const months: VacationMonth[] = [];
  const lowAccrual: string[] = [];
  const negative: string[] = [];
  const unexplainedDrop: string[] = [];
  let lowAccrualMinimum = 0;
  let prev: { index: number; balance: number | null } | null = null;

  for (const slip of slips) {
    const label = `${String(slip.month).padStart(2, '0')}/${slip.year}`;
    const index = slip.year * 12 + slip.month;
    const v = slip.vacation;
    if (!v || !hasAny(v)) {
      months.push({ year: slip.year, month: slip.month, label, opening: null, accrued: null, used: null, balance: null, expected: null, status: 'noData', note: null });
      prev = null;
      continue;
    }

    const carried = prev && prev.index === index - 1 ? prev.balance : null;
    const opening = v.previousBalance ?? carried;
    let status: VacationMonthStatus = 'ok';
    let note: string | null = null;
    let expected: number | null = null;

    if (v.previousBalance != null && carried != null && differs(v.previousBalance, carried)) {
      status = 'mismatch';
      note = `היתרה הקודמת שמודפסת בתלוש (${days(v.previousBalance)}) שונה מהיתרה בתלוש של החודש הקודם (${days(carried)}).`;
    } else if (opening != null && v.accrued != null && v.used != null && v.balance != null) {
      expected = round(opening + v.accrued - v.used);
      if (differs(v.balance, expected)) {
        status = 'mismatch';
        note = `${days(opening)} + ${days(v.accrued)} שנצברו − ${days(v.used)} שנוצלו = ${days(expected)}, אבל בתלוש מודפסת יתרה של ${days(v.balance)} (הפרש של ${days(Math.abs(v.balance - expected))} ימים).`;
      }
    } else if (opening != null && v.balance != null && v.balance < opening - TOLERANCE) {
      const drop = round(opening - v.balance);
      if (v.used != null && drop > v.used + TOLERANCE) {
        status = 'mismatch';
        note = `היתרה ירדה ב-${days(drop)} ימים, אבל בתלוש רשום ניצול של ${days(v.used)} ימים בלבד.`;
      } else if (v.used == null) {
        status = 'note';
        note = `היתרה ירדה ב-${days(drop)} ימים, ובתלוש לא מודפס ניצול. ודאו שאלה ימי חופשה שלקחתם בפועל.`;
        unexplainedDrop.push(label);
      }
    }

    if (v.accrued != null) {
      const minimum = legalAnnualVacationDays(yearOfWork(input.startDate, slip.year, slip.month), week) / 12;
      if (v.accrued < minimum - TOLERANCE) {
        lowAccrual.push(label);
        lowAccrualMinimum = Math.max(lowAccrualMinimum, minimum);
        if (status === 'ok') status = 'note';
      }
    }
    if (v.balance != null && v.balance < -TOLERANCE) {
      negative.push(label);
      if (status === 'ok') status = 'note';
    }

    months.push({ year: slip.year, month: slip.month, label, opening, accrued: v.accrued, used: v.used, balance: v.balance, expected, status, note });
    prev = { index, balance: v.balance };
  }

  const withData = months.filter(m => m.status !== 'noData');
  const mismatches = months.filter(m => m.status === 'mismatch');
  const findings: VacationFinding[] = [];

  if (mismatches.length) {
    findings.push({
      severity: 'warn',
      title: mismatches.length === 1 ? 'בחודש אחד היתרה לא מסתדרת' : `ב-${mismatches.length} חודשים היתרה לא מסתדרת`,
      text: 'היתרה שמודפסת בתלוש שונה ממה שיוצא מהחשבון: היתרה הקודמת, ועוד הימים שנצברו, פחות הימים שנוצלו. בקשו מהמעסיק או ממחלקת השכר פירוט של ימי החופשה לפי חודשים, ותקנו את היתרה לפני גמר החשבון.',
      months: mismatches.map(m => m.label)
    });
  }
  if (unexplainedDrop.length) {
    findings.push({
      severity: 'info',
      title: 'ירידה ביתרה בלי ניצול מודפס',
      text: 'בחודשים האלה היתרה ירדה, אבל התלוש לא מציג כמה ימים נוצלו. השוו לימי החופשה שלקחתם בפועל.',
      months: unexplainedDrop
    });
  }
  if (lowAccrual.length) {
    findings.push({
      severity: 'info',
      title: 'צבירה חודשית נמוכה מהמינימום למשרה מלאה',
      text: `לפי חוק חופשה שנתית, במשרה מלאה של ${week} ימים בשבוע נצברים לפחות ${days(lowAccrualMinimum)} ימים בחודש בוותק שלכם. במשרה חלקית, או בחודש שלא עבדתם בו במלואו, הצבירה קטנה בהתאם. אם עבדתם במשרה מלאה, שווה לברר.`,
      months: lowAccrual
    });
  }
  if (negative.length) {
    findings.push({
      severity: 'info',
      title: 'יתרת חופשה שלילית',
      text: 'לקחתם יותר ימים ממה שנצבר. בסיום העבודה המעסיק עשוי לבקש לקזז את הימים האלה מגמר החשבון. בדקו מה סוכם איתכם כשיצאתם לחופשה, ואם הקיזוז נראה לא מוצדק, התייעצו עם איש מקצוע.',
      months: negative
    });
  }

  const last = [...withData].reverse().find(m => m.balance != null) ?? null;
  let redemptionEstimate: number | null = null;
  if (last && last.balance != null) {
    const isFinalMonth = `${last.year}-${String(last.month).padStart(2, '0')}` === input.endDate.slice(0, 7);
    if (last.balance > TOLERANCE) {
      const salary = input.salaryFor?.(last.year, last.month) ?? null;
      redemptionEstimate = salary && salary > 0 ? Math.round(last.balance * salary / MONTH_WORK_DAYS[week]) : null;
      findings.push({
        severity: 'info',
        title: `נשארו ${days(last.balance)} ימי חופשה לפי התלוש של ${last.label}`,
        text: (isFinalMonth
          ? 'זה התלוש של החודש האחרון. '
          : 'זה התלוש האחרון שבו מודפסת יתרה, ולא החודש האחרון של העבודה. העלו את התלוש האחרון כדי לראות את היתרה הסופית. ')
          + 'בסיום העבודה המעסיק חייב לשלם על היתרה פדיון חופשה'
          + (redemptionEstimate != null ? `, בערך ₪${redemptionEstimate.toLocaleString('en-US')} לפי השכר באותו חודש` : '')
          + '. ודאו שהסכום מופיע בתלוש גמר החשבון.',
        months: []
      });
    }
  }

  if (withData.length >= 2 && !mismatches.length) {
    findings.unshift({
      severity: 'ok',
      title: 'היתרות עקביות מחודש לחודש',
      text: `עברנו על ${withData.length} תלושים שבהם מודפסים ימי חופשה, ולא מצאנו אי-התאמה בין היתרה, הצבירה והניצול.`,
      months: []
    });
  }

  return {
    hasData: withData.length > 0,
    months,
    findings,
    mismatchCount: mismatches.length,
    lastBalance: last?.balance ?? null,
    lastBalanceLabel: last?.label ?? null,
    redemptionEstimate,
    notReadCount
  };
}

function hasAny(v: VacationFigures): boolean {
  return v.balance != null || v.used != null || v.accrued != null || v.previousBalance != null;
}

function differs(a: number, b: number): boolean {
  return Math.abs(a - b) > TOLERANCE;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function days(n: number): string {
  return String(round(n));
}

/** 1 during the first twelve months of work, 2 during the next twelve, and so on. */
function yearOfWork(startDate: string, year: number, month: number): number {
  const m = /^(\d{4})-(\d{2})/.exec(startDate ?? '');
  if (!m) return 1;
  const worked = (year - Number(m[1])) * 12 + (month - Number(m[2]));
  return Math.max(1, Math.floor(worked / 12) + 1);
}
