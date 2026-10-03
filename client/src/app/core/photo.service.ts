import { Injectable, inject } from '@angular/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { PdfLockedError, PdfUnlocker, openPdf } from './pdf-open';
import { PdfPasswordService } from './pdf-passwords.service';
import { assertPayslipImage, classifyPayslipText, findQualityProblem, PayslipRejected } from './payslip-quality';

const MAX_SIDE = 2000;
const MAX_IMAGES = 5;
const MAX_BYTES = 10 * 1024 * 1024;

/** The picker or the password window was dismissed. Not an error to show. */
export class UserCancel extends Error {
  constructor() { super('cancel'); }
}

/**
 * Camera on a phone, or files in the browser. Images are re-encoded as JPEG (max 2000px),
 * which also strips EXIF metadata such as location. A PDF is opened on the device and each
 * page is sent as a JPEG. A password opens the file on the device; the PDF itself is never sent to read it.
 */
@Injectable({ providedIn: 'root' })
export class PhotoService {
  private readonly passwords = inject(PdfPasswordService);

  async fromCamera(): Promise<Blob[]> {
    const photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.Uri,
      quality: 85,
      correctOrientation: true,
      saveToGallery: false
    });
    return photo.webPath ? [await toJpeg(await (await fetch(photo.webPath)).blob())] : [];
  }

  async fromFiles(files: File[]): Promise<Blob[]> {
    const out: Blob[] = [];
    await this.passwords.load();
    for (const file of files) {
      if (out.length >= MAX_IMAGES) break;
      if (file.size > MAX_BYTES) throw new Error('כל קובץ עד 10MB');
      if (isPdf(file)) out.push(...await pdfToJpegs(file, this.passwords, MAX_IMAGES - out.length));
      else if (isImage(file)) out.push(await toJpeg(file));
      else throw new Error('אפשר להעלות תמונה (JPG, PNG או WEBP) או קובץ PDF.');
    }
    return out;
  }
}

export function isUserCancel(err: unknown): boolean {
  if (err instanceof UserCancel) return true;
  const msg = String((err as { message?: string })?.message ?? err).toLowerCase();
  return msg.includes('cancel') || msg.includes('no image picked') || msg.includes('user denied');
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function isImage(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/webp'
    || /\.(jpe?g|png|webp)$/.test(name);
}

async function toJpeg(blob: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    throw new Error('לא הצלחנו לקרוא את התמונה. נסו JPG, PNG או WEBP.');
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  assertPayslipImage(canvas);
  return canvasToJpeg(canvas);
}

async function pdfToJpegs(file: File, unlock: PdfUnlocker, limit: number): Promise<Blob[]> {
  let pdf: Awaited<ReturnType<typeof openPdf>>;
  try {
    pdf = await openPdf(file, unlock);
  } catch (err) {
    // No password given: the user closed the window — not an error to show.
    if (err instanceof PdfLockedError) throw new UserCancel();
    throw new Error('לא הצלחנו לפתוח את קובץ ה-PDF.');
  }

  try {
    const pages = Math.min(pdf.numPages, limit);
    const canvases: HTMLCanvasElement[] = [];
    let text = '';
    for (let i = 1; i <= pages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => 'str' in item ? item.str : '').join(' ') + '\n';
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2.5, MAX_SIDE / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      canvases.push(canvas);
    }
    const kind = classifyPayslipText(text);
    if (kind === 'other') {
      throw new PayslipRejected(`הקובץ ${file.name} לא נראה כמו תלוש שכר. העלו את התלוש עצמו.`);
    }
    const blobs: Blob[] = [];
    for (const canvas of canvases) {
      const problem = findQualityProblem(canvas);
      if (problem === 'blank') continue;
      if (kind !== 'payslip') assertPayslipImage(canvas);
      blobs.push(await canvasToJpeg(canvas));
    }
    if (blobs.length === 0) throw new PayslipRejected('הקובץ חיוור או ריק. ודאו שהתלוש נראה במלואו ויש בו ניגוד.');
    return blobs;
  } catch (err) {
    if (err instanceof PayslipRejected) throw err;
    throw new Error('לא הצלחנו לקרוא את עמודי ה-PDF.');
  } finally {
    await pdf.destroy().catch(() => undefined);
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('לא הצלחנו להכין את התמונה.'))), 'image/jpeg', 0.85));
}
