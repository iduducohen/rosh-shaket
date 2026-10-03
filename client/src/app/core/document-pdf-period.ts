/**
 * Best-effort read from PDF text (no OCR). Used before / alongside server verify.
 */
export type PdfDocHint = {
  year: number | null;
  month: number | null;
  /** null = no text / inconclusive; other = text present but not a known employment doc. */
  detectedType: 'payslip' | 'form106' | 'pension_report' | 'other' | null;
  /** Every employment-doc type whose markers appear in the text (a payslip also mentions pension funds). */
  matchedTypes?: Array<'payslip' | 'form106' | 'pension_report'>;
};

const YEAR_RE = /\b(20[0-3]\d)\b/g;
const MONTH_YEAR_RE = /\b(0?[1-9]|1[0-2])[/.-](20[0-3]\d)\b/g;
const TAX_YEAR_RE = /לשנת\s+המס\D{0,12}(20[0-3]\d)/;

const PAYSLIP_RE = /תלוש(?:י)?\s*שכר|תלוש\s+משכורת|שכר\s+נטו|ברוטו\s+לחודש|תקופת\s+שכר|ימי\s+עבודה/i;
const FORM106_RE = /טופס\s*106|אישור\s+שנתי\s+למס|סיכום\s+שנתי\s+של\s+שכר/i;
const PENSION_RE = /דוח\s+פנסיה|קרן\s+פנסיה|קופת\s+גמל|קרן\s+השתלמות|ביטוח\s+מנהלים|יתרה\s+צבורה|הר\s+הכסף|דוח\s+הפקדות/i;

export async function readPdfDocHint(file: File): Promise<PdfDocHint | null> {
  if (!isPdf(file)) return null;
  const text = await extractPdfText(file);
  if (!text.trim()) return { year: null, month: null, detectedType: null };
  return parseDocFromText(text);
}

/** @deprecated use readPdfDocHint */
export async function readPdfPeriodHint(file: File): Promise<PdfDocHint | null> {
  return readPdfDocHint(file);
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

let pdfjsReady: Promise<typeof import('pdfjs-dist')> | null = null;

function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  pdfjsReady ??= import('pdfjs-dist').then(pdfjs => {
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
    return pdfjs;
  });
  return pdfjsReady;
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  try {
    const pages = Math.min(pdf.numPages, 2);
    const chunks: string[] = [];
    for (let i = 1; i <= pages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const line = content.items
        .map(item => ('str' in item ? item.str : ''))
        .join(' ');
      chunks.push(line);
    }
    return chunks.join('\n');
  } finally {
    await pdf.destroy().catch(() => undefined);
  }
}

export function parseDocFromText(text: string): PdfDocHint {
  const normalized = text.replace(/\s+/g, ' ');
  const detectedType = detectTypeFromText(normalized);
  const matchedTypes = matchedTypesIn(normalized);
  // Form 106 carries an issue date from the following year ("תאריך הפקה: 02/04/2024") — use the tax year.
  const taxYear = detectedType === 'form106' ? normalized.match(TAX_YEAR_RE) : null;
  if (taxYear) {
    return { year: Number(taxYear[1]), month: null, detectedType, matchedTypes };
  }
  const period = parsePeriodFromText(normalized);
  return { year: period.year, month: period.month, detectedType, matchedTypes };
}

function matchedTypesIn(text: string): Array<'payslip' | 'form106' | 'pension_report'> {
  const types: Array<'payslip' | 'form106' | 'pension_report'> = [];
  if (PAYSLIP_RE.test(text)) types.push('payslip');
  if (FORM106_RE.test(text)) types.push('form106');
  if (PENSION_RE.test(text)) types.push('pension_report');
  return types;
}

function detectTypeFromText(text: string): PdfDocHint['detectedType'] {
  const scores = {
    payslip: PAYSLIP_RE.test(text) ? 1 : 0,
    form106: FORM106_RE.test(text) ? 1 : 0,
    pension_report: PENSION_RE.test(text) ? 1 : 0
  };
  const hits = (Object.entries(scores) as [keyof typeof scores, number][])
    .filter(([, n]) => n > 0)
    .map(([k]) => k);
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) {
    // Prefer the most specific employment-doc signal.
    if (scores.form106) return 'form106';
    if (scores.payslip) return 'payslip';
    return 'pension_report';
  }
  // Has text but none of the known markers → not a matching employment document.
  return 'other';
}

/** Exported for unit-style checks in dev tools if needed. */
export function parsePeriodFromText(text: string): { year: number | null; month: number | null } {
  const normalized = text.replace(/\s+/g, ' ');

  const monthYearHits: { month: number; year: number }[] = [];
  for (const m of normalized.matchAll(MONTH_YEAR_RE)) {
    const month = Number(m[1]);
    const year = Number(m[2]);
    if (month >= 1 && month <= 12) monthYearHits.push({ month, year });
  }
  if (monthYearHits.length) {
    const best = monthYearHits[0];
    return { year: best.year, month: best.month };
  }

  const years = [...normalized.matchAll(YEAR_RE)].map(m => Number(m[1]));
  const unique = [...new Set(years)];
  if (unique.length === 1) return { year: unique[0], month: null };
  if (unique.length > 1) {
    return { year: Math.max(...unique), month: null };
  }
  return { year: null, month: null };
}
