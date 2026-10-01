/**
 * Turn review uploads (PDF / image) into JPEGs for OCR/AI verify.
 * Unlike PhotoService, this does not reject non-payslip documents.
 */
const MAX_SIDE = 2000;
const MAX_PAGES = 3;
const MAX_BYTES = 10 * 1024 * 1024;

export async function prepareDocumentImages(file: File): Promise<Blob[]> {
  if (file.size > MAX_BYTES) throw new Error('כל קובץ עד 10MB');
  if (isPdf(file)) return pdfToJpegs(file);
  if (isImage(file)) return [await toJpeg(file)];
  throw new Error('אפשר להעלות תמונה (JPG, PNG או WEBP) או קובץ PDF.');
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function isImage(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/webp'
    || /\.(jpe?g|png|webp|heic)$/.test(name);
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
  return canvasToJpeg(canvas);
}

let pdfjsReady: Promise<typeof import('pdfjs-dist')> | null = null;

function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  pdfjsReady ??= import('pdfjs-dist').then(pdfjs => {
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
    return pdfjs;
  });
  return pdfjsReady;
}

async function pdfToJpegs(file: File): Promise<Blob[]> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  let pdf: Awaited<typeof task.promise>;
  try {
    pdf = await task.promise;
  } catch {
    throw new Error('לא הצלחנו לפתוח את קובץ ה-PDF.');
  }

  try {
    const pages = Math.min(pdf.numPages, MAX_PAGES);
    const blobs: Blob[] = [];
    for (let i = 1; i <= pages; i++) {
      const page = await pdf.getPage(i);
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
      blobs.push(await canvasToJpeg(canvas));
    }
    if (!blobs.length) throw new Error('הקובץ ריק או לא קריא.');
    return blobs;
  } catch (err) {
    if (err instanceof Error && err.message) throw err;
    throw new Error('לא הצלחנו לקרוא את עמודי ה-PDF.');
  } finally {
    await pdf.destroy().catch(() => undefined);
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('לא הצלחנו להכין את התמונה.'))), 'image/jpeg', 0.85));
}
