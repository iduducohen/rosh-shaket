/** Practical tips — prefer gov portals; company sites change often. */
export const PENSION_GUIDE = {
  intro:
    'דוח פנסיה / דוח הפקדות מגיע מהגוף שמנהל את הקופה. חלק מהנתונים מופיעים גם בתלוש. מומלץ להתחיל בשירות הממשלתי לאיתור חסכונות:',
  gov: [
    {
      name: 'איתור חסכונות פנסיוניים (הר הכסף)',
      tip: 'שירות משרד האוצר — איתור קרנות פנסיה / גמל / השתלמות על שמכם והורדת מידע, בחינם עם הזדהות.',
      url: 'https://itur.mof.gov.il/',
      urlLabel: 'itur.mof.gov.il'
    },
    {
      name: 'הר הביטוח',
      tip: 'ריכוז פוליסות ביטוח (כולל ביטוחי מנהלים) — שימושי אם יש חיסכון בחברת ביטוח.',
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
    'אם לא בטוחים באיזו חברה הקופה — התחילו באיתור החסכונות של משרד האוצר. התפריטים באפליקציות משתנים, אבל החיפוש הוא תמיד: אזור אישי → דוחות.'
} as const;
