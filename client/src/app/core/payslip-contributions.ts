import { FundLine } from './models';

export type RateStatus = 'ok' | 'partial' | 'low' | 'missing' | 'info';

export interface RateCheck {
  key: 'employee' | 'employer' | 'severance' | 'study';
  title: string;
  /** Effective percent of salary; null when the payslip line could not be turned into a rate. */
  rate: number | null;
  status: RateStatus;
  note: string;
}

/** Legal minimums for a salaried employee (mandatory pension order). */
const MIN_EMPLOYEE = 6;
const MIN_EMPLOYER = 6.5;
const MIN_SEVERANCE = 6;
const FULL_SEVERANCE = 8.33;
const TOLERANCE = 0.05;

/**
 * Turn the contribution table of one payslip into a rate per component and compare it with the law.
 * With several funds, each fund applies the rate to its own share of the salary, so percent lines are
 * checked per fund (the weakest one counts); amount lines are summed and divided by the salary.
 */
export function assessContributions(funds: FundLine[], monthlySalary: number): RateCheck[] {
  const pension = funds.filter(f => f.kind === 'pension');
  const disability = funds.filter(f => f.kind === 'disability');
  const severance = funds.filter(f => f.kind === 'severance');
  const study = funds.filter(f => f.kind === 'study');

  const employeeRate = rate(pension, 'employee', monthlySalary);
  const employerRate = rate(pension, 'employer', monthlySalary, disability);
  const severanceRate = rate(severance, 'employer', monthlySalary);
  const studyEmployee = rate(study, 'employee', monthlySalary);
  const studyEmployer = rate(study, 'employer', monthlySalary);

  const checks: RateCheck[] = [];
  if (!pension.length) {
    checks.push({
      key: 'employer', title: 'פנסיה', rate: null, status: 'missing',
      note: 'לא מופיעה בתלוש הפרשה לפנסיה. בתחילת עבודה מותרת תקופת המתנה (עד 6 חודשים) — אחריה המעסיק חייב להפריש, ובדרך כלל גם רטרואקטיבית.'
    });
  } else {
    checks.push(minCheck('employee', 'ניכוי שלכם לפנסיה', employeeRate, MIN_EMPLOYEE));
    checks.push(minCheck('employer', 'הפרשת המעסיק לפנסיה', employerRate, MIN_EMPLOYER,
      disability.length ? 'כולל ביטוח אובדן כושר עבודה.' : ''));
  }

  if (!severance.length) {
    checks.push({
      key: 'severance', title: 'הפרשת המעסיק לפיצויים', rate: null, status: pension.length ? 'low' : 'missing',
      note: 'לא מופיעה בתלוש הפרשה לפיצויים — המעסיק חייב להפריש לפחות 6% כשיש הפרשה לפנסיה.'
    });
  } else if (severanceRate == null) {
    checks.push({ key: 'severance', title: 'הפרשת המעסיק לפיצויים', rate: null, status: 'info', note: 'מופיעה הפרשה, אבל לא הצלחנו לחשב את השיעור.' });
  } else if (severanceRate >= FULL_SEVERANCE - TOLERANCE) {
    checks.push({
      key: 'severance', title: 'הפרשת המעסיק לפיצויים', rate: severanceRate, status: 'ok',
      note: '8.33% — פיצויים מלאים. אם יש סעיף 14 בחוזה, הכסף בקופה מחליף את פיצויי הפיטורים.'
    });
  } else if (severanceRate >= MIN_SEVERANCE - TOLERANCE) {
    checks.push({
      key: 'severance', title: 'הפרשת המעסיק לפיצויים', rate: severanceRate, status: 'partial',
      note: '6% — המינימום בחוק. אם תפוטרו, המעסיק צריך להשלים את ההפרש עד פיצויים מלאים.'
    });
  } else {
    checks.push({
      key: 'severance', title: 'הפרשת המעסיק לפיצויים', rate: severanceRate, status: 'low',
      note: `נמוך מהמינימום בחוק (${MIN_SEVERANCE}%).`
    });
  }

  if (study.length) {
    checks.push({
      key: 'study', title: 'קרן השתלמות', rate: studyEmployer, status: 'info',
      note: `עובד ${pct(studyEmployee)} · מעסיק ${pct(studyEmployer)}. לא חובה לפי חוק — לפי חוזה או הסכם קיבוצי.`
    });
  }
  return checks;
}

function minCheck(key: RateCheck['key'], title: string, value: number | null, min: number, extra = ''): RateCheck {
  if (value == null) return { key, title, rate: null, status: 'info', note: `לא הצלחנו לחשב את השיעור. המינימום בחוק: ${min}%.` };
  const ok = value >= min - TOLERANCE;
  const note = ok ? `לפחות ${min}% כנדרש.` : `נמוך מהמינימום בחוק (${min}%).`;
  return { key, title, rate: value, status: ok ? 'ok' : 'low', note: extra ? `${note} ${extra}` : note };
}

function rate(lines: FundLine[], side: 'employee' | 'employer', salary: number, addOn: FundLine[] = []): number | null {
  const valued = lines.filter(l => l[side] != null);
  if (!valued.length) return null;

  if (valued.every(l => l.unit === 'percent')) {
    // Same fund's add-on (e.g. disability with managers insurance) counts toward that fund's rate.
    const perFund = valued.map(l => {
      const extra = addOn
        .filter(a => a.unit === 'percent' && a[side] != null && sameFund(a.name, l.name))
        .reduce((s, a) => s + Number(a[side]), 0);
      return Number(l[side]) + extra;
    });
    return round(Math.min(...perFund));
  }

  if (salary > 0 && valued.every(l => l.unit === 'amount')) {
    const extra = addOn.filter(a => a.unit === 'amount' && a[side] != null).reduce((s, a) => s + Number(a[side]), 0);
    const total = valued.reduce((s, l) => s + Number(l[side]), 0) + extra;
    return round(total / salary * 100);
  }
  return null;
}

function sameFund(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const norm = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 4);
  return norm(a) === norm(b);
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

function pct(v: number | null): string {
  return v == null ? 'לא ידוע' : `${v}%`;
}
