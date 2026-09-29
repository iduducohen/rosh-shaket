/** A file the user picked is not a readable payslip. */
export class PayslipRejected extends Error {}

export type QualityProblem = 'small' | 'dark' | 'blank' | 'blurry';

const MIN_SHORT = 640;
const MIN_LONG = 900;
const MARKERS = ['תלוש', 'שכר', 'ברוטו', 'נטו', 'משכורת', 'ניכוי', 'מס הכנסה', 'ביטוח לאומי'];

/**
 * Text extracted from a PDF. A scan with no text layer stays unknown and is judged as an image.
 * A text document that never mentions payslip terms is rejected.
 */
export function classifyPayslipText(text: string): 'payslip' | 'other' | 'unknown' {
  const compact = text.replace(/\s+/g, '');
  if (compact.length < 40) return 'unknown';
  return MARKERS.some(marker => text.includes(marker)) ? 'payslip' : 'other';
}

export function qualityMessage(problem: QualityProblem): string {
  switch (problem) {
    case 'small': return 'התמונה קטנה מדי בשביל לקרוא תלוש. צלמו את כל הדף מקרוב, או העלו PDF של התלוש.';
    case 'dark': return 'התמונה כהה מדי. צלמו באור טוב, בלי צל על הדף.';
    case 'blank': return 'הקובץ חיוור או ריק. ודאו שהתלוש נראה במלואו ויש בו ניגוד.';
    case 'blurry': return 'התמונה מטושטשת. החזיקו את המכשיר יציב וצלמו שוב את כל התלוש.';
  }
}

/** Resolution, exposure, and sharpness of the image that would be sent. */
export function findQualityProblem(canvas: HTMLCanvasElement): QualityProblem | null {
  const short = Math.min(canvas.width, canvas.height);
  const long = Math.max(canvas.width, canvas.height);
  if (short < MIN_SHORT || long < MIN_LONG) return 'small';

  const { mean, std, lap } = metrics(sample(canvas, 480));
  if (mean < 35) return 'dark';
  if (std < 14) return 'blank';
  if (lap < 60) return 'blurry';
  return null;
}

export function assertPayslipImage(canvas: HTMLCanvasElement): void {
  const problem = findQualityProblem(canvas);
  if (problem) throw new PayslipRejected(qualityMessage(problem));
}

function sample(canvas: HTMLCanvasElement, maxSide: number): ImageData {
  const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  const w = Math.max(1, Math.round(canvas.width * scale));
  const h = Math.max(1, Math.round(canvas.height * scale));
  const copy = document.createElement('canvas');
  copy.width = w;
  copy.height = h;
  const ctx = copy.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(canvas, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

function metrics(image: ImageData): { mean: number; std: number; lap: number } {
  const w = image.width;
  const h = image.height;
  const px = image.data;
  const gray = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0; i < gray.length; i++) {
    const o = i * 4;
    const y = 0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2];
    gray[i] = y;
    sum += y;
  }
  const mean = sum / gray.length;
  let varSum = 0;
  for (const y of gray) {
    const d = y - mean;
    varSum += d * d;
  }
  const std = Math.sqrt(varSum / gray.length);

  let lapSum = 0;
  let lapSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const l = gray[i] * 4 - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      lapSum += l;
      lapSq += l * l;
      n++;
    }
  }
  const lapMean = n ? lapSum / n : 0;
  const lap = n ? lapSq / n - lapMean * lapMean : 0;
  return { mean, std, lap };
}
