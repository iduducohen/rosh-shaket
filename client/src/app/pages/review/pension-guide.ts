/** The company site of a fund, by the name a payslip prints it with (first word). Sites change: this is a starting point. */
export interface FundSite {
  /** The company word as a payslip and a report print it. */
  key: string;
  name: string;
  url: string;
}

export const FUND_SITES: readonly FundSite[] = [
  { key: 'כלל', name: 'כלל', url: 'https://www.clalbit.co.il/' },
  { key: 'מגדל', name: 'מגדל', url: 'https://www.migdal.co.il/' },
  { key: 'הראל', name: 'הראל', url: 'https://www.harel-group.co.il/' },
  { key: 'מנורה', name: 'מנורה מבטחים', url: 'https://www.menoramivt.co.il/' },
  { key: 'הפניקס', name: 'הפניקס', url: 'https://www.fnx.co.il/' },
  { key: 'מיטב', name: 'מיטב', url: 'https://www.meitav.co.il/' },
  { key: 'אלטשולר', name: 'אלטשולר שחם', url: 'https://www.as-invest.co.il/' },
  { key: 'מור', name: 'מור', url: 'https://www.mor.co.il/' }
];

/** The title of the help for each report a year can ask for. */
export const GUIDE_TITLES: Record<string, string> = {
  pension_deposits: 'איך להשיג דוח הפקדות',
  pension_annual: 'איך להשיג דוח שנתי מפורט',
  pension_managers: 'איך להשיג דוח ביטוח מנהלים',
  pension_study: 'איך להשיג דוח קרן השתלמות'
};

/** Practical tips — prefer gov portals; company sites change often. */
export const PENSION_GUIDE = {
  intro:
    'דוח הפקדות מגיע רק מהגוף שמנהל את הקופה או מחברת הביטוח. הר הכסף והר הביטוח הם שירותי איתור: הם מראים מי הגופים ואיך לפנות אליהם, בלי הפקדות ובלי יתרות. משתמשים בהם כדי לגלות את הגוף, ואז פונים אליו:',
  gov: [
    {
      name: 'איתור חסכונות פנסיוניים (הר הכסף)',
      tip: 'שירות משרד האוצר. מציג רשימת גופים שבהם יש לכם פנסיה, גמל או השתלמות, בחינם עם הזדהות. אצל הגופים בסוג מוצר «פעילה» מזמינים דוח הפקדות. את מסך התוצאות עצמו לא מעלים.',
      url: 'https://itur.mof.gov.il/',
      urlLabel: 'itur.mof.gov.il'
    },
    {
      name: 'הר הביטוח',
      tip: 'מציג פוליסות ביטוח עם תקופת ביטוח ופרמיה, בלי הפקדות. אין בו דוח הפקדות. שימושי רק כדי לגלות באיזו חברת ביטוח יש לכם ביטוח מנהלים, ואז פונים לחברה ומבקשים ממנה דוח הפקדות. את מסך הפוליסות לא מעלים.',
      url: 'https://harb.cma.gov.il/Home',
      urlLabel: 'harb.cma.gov.il'
    }
  ],
  companies: [
    {
      name: 'מנורה מבטחים',
      tip: 'אזור אישי → דוחות / פנסיה → הורדת דוח שנתי או דוח הפקדות.',
      url: 'https://www.menoramivt.co.il/',
      urlLabel: 'menoramivt.co.il'
    },
    {
      name: 'מגדל',
      tip: 'אזור אישי → חיסכון פנסיוני → דוחות להורדה.',
      url: 'https://www.migdal.co.il/',
      urlLabel: 'migdal.co.il'
    },
    {
      name: 'הראל',
      tip: 'אזור אישי → פנסיה וגמל → דוחות ומסמכים.',
      url: 'https://www.harel-group.co.il/',
      urlLabel: 'harel-group.co.il'
    },
    {
      name: 'כלל',
      tip: 'אזור אישי → חיסכון ארוך טווח → דוחות.',
      url: 'https://www.clalbit.co.il/',
      urlLabel: 'clalbit.co.il'
    },
    {
      name: 'הפניקס',
      tip: 'אזור אישי → פנסיה → דוחות להורדה.',
      url: 'https://www.fnx.co.il/',
      urlLabel: 'fnx.co.il'
    },
    {
      name: 'מיטב',
      tip: 'אזור אישי → קופות ופנסיה → דוחות.',
      url: 'https://www.meitav.co.il/',
      urlLabel: 'meitav.co.il'
    },
    {
      name: 'אלטשולר שחם',
      tip: 'אזור אישי → דוחות שנתיים / תנועות.',
      url: 'https://www.as-invest.co.il/',
      urlLabel: 'as-invest.co.il'
    }
  ],
  note:
    'אם לא בטוחים באיזו חברה הקופה — התחילו באיתור החסכונות של משרד האוצר. התפריטים באפליקציות משתנים, אבל החיפוש הוא תמיד: אזור אישי → דוחות. דוח הפקדות אפשר להזמין בכל עת במהלך השנה. הדוח השנתי המפורט מופק רק אחרי שהשנה מסתיימת.'
} as const;
