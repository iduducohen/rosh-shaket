/** Public copy used by the landing page, the document head, and structured data. */
export const SITE_NAME = 'יוצאים בראש שקט';

export const HOME_TITLE = 'יוצאים בראש שקט | הערכת זכויות בסיום עבודה';

export const HOME_DESCRIPTION =
  'עוזבים עבודה? מצלמים תלוש ומקבלים הערכה של פיצויים, פדיון חופשה, דמי הבראה והודעה מוקדמת, עם צ\'קליסט ומקורות רשמיים. בלי עלות.';

export const SHARE_TEXT = 'יוצאים בראש שקט — הערכת זכויות בסיום עבודה, בלי עלות.';

export interface SeoConfig {
  title: string;
  description?: string;
  /** When false, search engines are asked not to list the screen. */
  index: boolean;
  /** Public path for the canonical URL. Defaults to the homepage. */
  path?: string;
}

export const SEO = {
  home: { title: HOME_TITLE, description: HOME_DESCRIPTION, index: true },
  login: { title: 'כניסה · יוצאים בראש שקט', index: false },
  start: { title: 'צילום תלוש · יוצאים בראש שקט', index: false },
  reason: { title: 'סיבת העזיבה · יוצאים בראש שקט', index: false },
  details: { title: 'פרטים · יוצאים בראש שקט', index: false },
  results: { title: 'התוצאה · יוצאים בראש שקט', index: false },
  reports: { title: 'דוחות · יוצאים בראש שקט', index: false },
  checklist: { title: 'צ\'קליסט · יוצאים בראש שקט', index: false },
  sources: { title: 'מקורות · יוצאים בראש שקט', index: false },
  terms: {
    title: 'תנאי השימוש · יוצאים בראש שקט',
    description: 'תנאי השימוש של יוצאים בראש שקט: הערכה של זכויות בסיום עבודה, לא ייעוץ משפטי.',
    index: true,
    path: '/terms'
  },
  privacy: {
    title: 'מדיניות הפרטיות · יוצאים בראש שקט',
    description: 'אילו פרטים נאספים ביוצאים בראש שקט, למה, ומה קורה לתמונת התלוש.',
    index: true,
    path: '/privacy'
  }
} as const satisfies Record<string, SeoConfig>;

export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQ: readonly FaqItem[] = [
  {
    question: 'מה אפשר לבדוק כאן?',
    answer: 'הערכה של פיצויים, פדיון חופשה, דמי הבראה והודעה מוקדמת, ואחר כך צ\'קליסט לפי סיבת העזיבה וקישורים למקורות רשמיים.'
  },
  {
    question: 'האם זו ייעוץ משפטי?',
    answer: 'לא. זו הערכה בלבד, לא ייעוץ משפטי. חוזה אישי או הסכם קיבוצי יכולים להיטיב מעבר להערכה.'
  },
  {
    question: 'האם חייבים להירשם?',
    answer: 'לא. אפשר להמשיך בלי חשבון ולחשב מיד. חשבון רק שומר את החישוב ואת הצ\'קליסט כדי לחזור אליהם אחר כך.'
  },
  {
    question: 'מה קורה לתמונת התלוש?',
    answer: 'התמונה משמשת לקריאת הנתונים ולא נשמרת באפליקציה. לפני השליחה היא מקודדת מחדש ל-JPEG, בלי נתוני מיקום.'
  },
  {
    question: 'כמה זה עולה?',
    answer: 'בלי עלות.'
  }
];
