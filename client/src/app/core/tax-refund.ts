/**
 * Is it worth asking the Tax Authority for an income-tax refund?
 * An indication only: it reads the employment data we already hold, adds what only the user knows,
 * and says how strong the case is. The amount itself comes from form 106 and the Tax Authority.
 */

export type RefundVerdict = 'likely' | 'worthChecking' | 'unlikely';
export type RefundStrength = 'strong' | 'medium';

export interface RefundSignal {
  key: string;
  title: string;
  why: string;
  strength: RefundStrength;
  /** true when it came from the employment data, false when the user ticked it. */
  fromData: boolean;
}

export interface RefundQuestion {
  key: RefundAnswerKey;
  text: string;
  /** Shown as the reason once the user ticks it. */
  why: string;
  strength: RefundStrength;
}

export type RefundAnswerKey = 'gap' | 'benefits' | 'twoJobs' | 'credits' | 'donations' | 'privateDeposits' | 'securities';
export type RefundAnswers = Partial<Record<RefundAnswerKey, boolean>>;

export interface RefundInput {
  /** yyyy-MM-dd, or empty when unknown. */
  startDate: string;
  endDate: string;
  monthlySalary: number;
  hourly: boolean;
  /** One-time amounts the employer pays at the end: severance top-up, vacation redemption, recuperation. */
  lumpSum: number;
  /** yyyy-MM-dd */
  today: string;
}

export interface RefundAssessment {
  verdict: RefundVerdict;
  headline: string;
  summary: string;
  signals: RefundSignal[];
  /** Past tax years of this employment that can still be claimed, newest first. */
  openYears: number[];
  /** A year that has not ended yet: it can be claimed only from January. */
  pendingYear: number | null;
  /** The oldest year still open, which closes at the end of this calendar year. */
  closingYear: number | null;
  lowIncome: boolean;
  cautions: string[];
}

/** A refund can be claimed for the six tax years before the current one. */
export const REFUND_YEARS_BACK = 6;

/**
 * Below roughly this monthly salary a resident's basic credit points cover the whole tax
 * (2.25 points × ₪242 a month against the 10% bracket), so there is little or nothing to refund.
 */
export const LOW_TAX_SALARY = 5400;

const MONTHS = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

export const REFUND_QUESTIONS: RefundQuestion[] = [
  {
    key: 'gap', strength: 'strong',
    text: 'הייתה לי תקופה בלי עבודה באחת השנים: בין עבודות, אבטלה או חל"ת',
    why: 'בחודשים בלי שכר לא ניצלתם את נקודות הזיכוי, והמס שנוכה בחודשי העבודה חושב כאילו עבדתם כל השנה.'
  },
  {
    key: 'credits', strength: 'strong',
    text: 'מגיעות לי נקודות זיכוי שלא עודכנו אצל המעסיק: ילד שנולד, סיום תואר או לימודי מקצוע, שחרור מצבא או שירות לאומי, עלייה, מגורים ביישוב מזכה',
    why: 'נקודות זיכוי שלא דווחו בטופס 101 לא הופחתו מהמס, ואפשר לקבל אותן בחזרה דרך בקשה להחזר.'
  },
  {
    key: 'benefits', strength: 'medium',
    text: 'קיבלתי דמי אבטלה, דמי לידה או תגמולי מילואים מביטוח לאומי',
    why: 'ביטוח לאומי מנכה מס בלי לדעת מה הרווחתם בשאר השנה, ולכן החשבון השנתי יוצא לעיתים קרובות שונה.'
  },
  {
    key: 'twoJobs', strength: 'medium',
    text: 'עבדתי אצל יותר ממעסיק אחד באותה שנה',
    why: 'כשמחליפים עבודה או עובדים בשתי עבודות, כל מעסיק מחשב מס בנפרד. החשבון השנתי יכול לצאת לטובתכם, אבל גם לחובתכם.'
  },
  {
    key: 'donations', strength: 'medium',
    text: 'תרמתי לעמותות מוכרות (סעיף 46) ויש לי קבלות',
    why: 'תרומה למוסד מוכר מזכה בהחזר של חלק מסכום התרומה, מעל סכום מינימלי בשנה.'
  },
  {
    key: 'privateDeposits', strength: 'medium',
    text: 'הפקדתי בעצמי לפנסיה, לביטוח חיים או לביטוח אובדן כושר עבודה, שלא דרך התלוש',
    why: 'הפקדות עצמאיות מזכות בהטבת מס שהמעסיק לא יודע עליה, ולכן היא לא ניתנה בתלוש.'
  },
  {
    key: 'securities', strength: 'medium',
    text: 'נוכה לי מס על רווחים בשוק ההון, והיו לי גם הפסדים',
    why: 'אפשר לקזז הפסדים מול רווחים ולקבל בחזרה מס שנוכה ביתר.'
  }
];

export function assessTaxRefund(input: RefundInput, answers: RefundAnswers = {}): RefundAssessment {
  const signals: RefundSignal[] = [];
  const cautions: string[] = [];
  const thisYear = Number(input.today.slice(0, 4));
  const start = parse(input.startDate);
  const end = parse(input.endDate);
  const firstOpenYear = thisYear - REFUND_YEARS_BACK;

  if (end && end.month < 12) {
    const past = end.year < thisYear;
    signals.push({
      key: 'partialLastYear', strength: 'strong', fromData: true,
      title: `העבודה ${past ? 'הסתיימה' : 'מסתיימת'} ב${MONTHS[end.month]} ${end.year}, באמצע שנת המס`,
      why: 'המעסיק ניכה מס כל חודש כאילו תעבדו שנה שלמה באותו שכר. אם בשאר השנה לא עבדתם, או הרווחתם פחות, שילמתם יותר מס ממה שמגיע.'
    });
  }
  if (start && start.month > 1 && start.year >= firstOpenYear && (!end || start.year < end.year)) {
    signals.push({
      key: 'partialFirstYear', strength: 'medium', fromData: true,
      title: `התחלתם לעבוד ב${MONTHS[start.month]} ${start.year}, באמצע שנת המס`,
      why: 'אם בחודשים שלפני כן לא עבדתם, או עבדתם בשכר נמוך יותר, ייתכן שנוכה מס ביתר גם באותה שנה.'
    });
  }
  if (input.lumpSum > 0) {
    signals.push({
      key: 'lumpSum', strength: 'medium', fromData: true,
      title: `בגמר החשבון משולמים בבת אחת כ-₪${Math.round(input.lumpSum).toLocaleString('en-US')}`,
      why: 'פדיון חופשה, דמי הבראה ומענקים שמשולמים בתלוש האחרון ממוסים במדרגת מס גבוהה מהרגיל. לפיצויי פיטורים יש פטור ממס ואפשרות לפריסת המס על כמה שנים.'
    });
  }
  if (input.hourly) {
    signals.push({
      key: 'hourly', strength: 'medium', fromData: true,
      title: 'השכר שלכם משתנה מחודש לחודש',
      why: 'אצל עובד שעתי המס מחושב כל חודש לפי השכר של אותו חודש. בחודשים חזקים נוכה מס גבוה, והחשבון השנתי יכול לצאת נמוך יותר.'
    });
  }

  for (const q of REFUND_QUESTIONS) {
    if (answers[q.key]) signals.push({ key: q.key, title: q.text, why: q.why, strength: q.strength, fromData: false });
  }
  if (answers.twoJobs) {
    cautions.push('עבדתם אצל יותר ממעסיק אחד: אם לא נעשה תיאום מס, החשבון השנתי יכול להראות גם חוב. בדקו במחשבון של רשות המסים לפני שמגישים.');
  }

  const lowIncome = input.monthlySalary > 0 && input.monthlySalary < LOW_TAX_SALARY;
  const strong = signals.some(s => s.strength === 'strong');
  const verdict: RefundVerdict = signals.length === 0 ? 'unlikely' : strong && !lowIncome ? 'likely' : 'worthChecking';

  const openYears: number[] = [];
  const from = Math.max(firstOpenYear, start?.year ?? firstOpenYear);
  const to = Math.min(thisYear - 1, end?.year ?? thisYear - 1);
  for (let y = to; y >= from; y--) openYears.push(y);

  return {
    verdict,
    headline: HEADLINES[verdict],
    summary: summaryFor(verdict, lowIncome),
    signals,
    openYears,
    pendingYear: end && end.year >= thisYear ? end.year : null,
    closingYear: openYears.includes(firstOpenYear) ? firstOpenYear : null,
    lowIncome,
    cautions
  };
}

const HEADLINES: Record<RefundVerdict, string> = {
  likely: 'כדאי לבדוק: יש סיכוי טוב שמגיע לכם החזר מס',
  worthChecking: 'שווה בדיקה: ייתכן שמגיע לכם החזר מס',
  unlikely: 'לפי הנתונים שיש לנו, לא מצאנו סיבה מיוחדת להחזר מס'
};

function summaryFor(verdict: RefundVerdict, lowIncome: boolean): string {
  if (lowIncome && verdict !== 'unlikely') {
    return 'מצאנו סיבות אפשריות להחזר, אבל בשכר כזה כנראה נוכה מעט מס הכנסה או בכלל לא, ואי אפשר לקבל בחזרה יותר ממה ששולם. בדקו בטופס 106 כמה מס נוכה לפני שמשקיעים בזה זמן.';
  }
  if (verdict === 'likely') return 'מצאנו לפחות סיבה אחת חזקה. הסכום עצמו תלוי במס שנוכה בפועל, והוא מופיע בטופס 106. הבדיקה וההגשה בלי עלות.';
  if (verdict === 'worthChecking') return 'מצאנו סיבות שלפעמים מובילות להחזר. הבדיקה במחשבון של רשות המסים לוקחת כמה דקות ולא מחייבת להגיש.';
  return 'זה לא אומר שלא מגיע החזר. סמנו למטה מה נכון לגביכם: יש סיבות שרק אתם יודעים עליהן.';
}

function parse(date: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})/.exec(date ?? '');
  return m ? { year: Number(m[1]), month: Number(m[2]) } : null;
}
