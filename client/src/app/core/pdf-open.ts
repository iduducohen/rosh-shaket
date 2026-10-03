/**
 * One way to open a PDF everywhere in the app (quick check, document check, text hints), so a
 * protected file is unlocked the same way: saved passwords first, then — only if none fits — the user.
 */
export type PdfJs = typeof import('pdfjs-dist');
export type PdfDoc = Awaited<ReturnType<PdfJs['getDocument']>['promise']>;

/** Supplies and keeps the passwords that open the user's PDFs. */
export interface PdfUnlocker {
  /** Passwords already known for this user, tried in order before asking. */
  known(): readonly string[];
  /**
   * Ask the user. `wrong` = their last entry did not open the file; `triedSaved` = saved passwords exist
   * but none fits this file (it has a different password). null = they cancelled.
   */
  ask(fileName: string, wrong: boolean, triedSaved: boolean): Promise<string | null>;
  /** A password the user typed that opened a file — keep it for the next files and devices. */
  remember(password: string): void;
}

/** The file is protected and no password was given (no unlocker, or the user cancelled). */
export class PdfLockedError extends Error {
  constructor() { super('הקובץ מוגן בסיסמה.'); }
}

let pdfjsReady: Promise<PdfJs> | null = null;

export function loadPdfjs(): Promise<PdfJs> {
  pdfjsReady ??= import('pdfjs-dist').then(pdfjs => {
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
    return pdfjs;
  });
  return pdfjsReady;
}

export async function openPdf(file: Blob & { name?: string }, unlock?: PdfUnlocker | null): Promise<PdfDoc> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const saved = [...(unlock?.known() ?? [])];
  let next = 0;
  let typed: string | null = null;
  let locked = false;

  task.onPassword = (update: (password: string) => void) => {
    void (async () => {
      if (next < saved.length) {
        update(saved[next++]);
        return;
      }
      const password = unlock ? await unlock.ask(file.name ?? 'PDF', typed !== null, saved.length > 0).catch(() => null) : null;
      if (password === null) {
        locked = true;
        await task.destroy().catch(() => undefined);
        return;
      }
      typed = password;
      update(password);
    })();
  };

  try {
    const pdf = await task.promise;
    if (typed !== null) unlock?.remember(typed);
    return pdf;
  } catch (err) {
    if (locked || (err as { name?: string })?.name === 'PasswordException') throw new PdfLockedError();
    throw err;
  }
}
