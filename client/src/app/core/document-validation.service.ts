import { HttpErrorResponse } from '@angular/common/http';
import { TimeoutError } from 'rxjs';
import { Injectable, inject, signal } from '@angular/core';
import { ApiService, DocumentVerificationResult } from './api.service';
import { imageQualityProblem, prepareDocumentImages } from './document-images';
import { qualityMessage } from './payslip-quality';
import { finalMonthPensionBase } from './pay-components';
import { readPdfDocHint, type PdfDocHint } from './document-pdf-period';
import { PdfLockedError } from './pdf-open';
import { PdfPasswordService } from './pdf-passwords.service';
import { DocumentValidationStatus, ExtractedFundSnapshot, ReviewDocumentMeta } from './review.models';
import { ReviewStore } from './review.store';

const ALLOWED_TYPES = new Set(['payslip', 'form106', 'pension_report']);

const UNSUITABLE_FILE_MSG =
  'הקובץ שהועלה לא מתאים למסמכים החסרים — נא לבדוק את הקובץ.';

const SERVER_UNAVAILABLE_MSG =
  'הבדיקה האוטומטית לא הצליחה כרגע — אין חיבור לשרת או שהוא עמוס. המסמך נשמר; לחצו «לבדוק עכשיו» בעוד רגע.';

/** Status codes worth one automatic retry: no connection, restart, overload, gateway timeouts. */
const TRANSIENT_STATUSES = new Set([0, 429, 502, 503, 504]);

/** Network failures and 5xx: the server could not check, which says nothing about the document. */
export function isTransientVerifyError(err: unknown): boolean {
  if (err instanceof TimeoutError) return true;
  return err instanceof HttpErrorResponse && (TRANSIENT_STATUSES.has(err.status) || err.status >= 500);
}

const RETRY_DELAY_MS = 2500;

const LOCKED_PDF_MSG = 'הקובץ מוגן בסיסמה ולא הוזנה סיסמה. העלו אותו שוב והזינו את הסיסמה שלו.';

const TYPE_LABELS: Record<string, string> = {
  payslip: 'תלוש שכר',
  form106: 'טופס 106',
  pension_report: 'דוח פנסיה / קופות'
};

/**
 * The PDF text names another employment document and none of the chosen type's markers.
 * Only a clear case: a payslip that also lists pension funds still counts as a payslip.
 */
export function typeMismatchMessage(expected: string, local: PdfDocHint | null): string | null {
  const detected = local?.detectedType;
  if (!detected || !ALLOWED_TYPES.has(detected) || detected === expected || !ALLOWED_TYPES.has(expected)) return null;
  if (local?.matchedTypes?.includes(expected as 'payslip' | 'form106' | 'pension_report')) return null;
  return `העלית ${TYPE_LABELS[detected]}, אבל נבחר ${TYPE_LABELS[expected]}. בחרו למעלה «${TYPE_LABELS[detected]}» והעלו שוב.`;
}

/** Form 106 is a single yearly summary, so a year has at most one. */
export const SECOND_FORM106_MSG =
  'לשנה הזו כבר יש טופס 106 — יש רק אחד בשנה. כדי להחליף אותו, מחקו את הקיים או השתמשו ב«החלפת קובץ».';

const MONTH_LABELS = [
  '', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
];

@Injectable({ providedIn: 'root' })
export class DocumentValidationService {
  private readonly api = inject(ApiService);
  private readonly store = inject(ReviewStore);
  private readonly passwords = inject(PdfPasswordService);

  /** Shown when an upload is rejected and removed (wrong type / year / month). */
  readonly blockMessage = signal('');

  /** Set when the server refused a paid check — the documents page shows how to continue. */
  readonly paywall = signal<'payment' | 'signin' | null>(null);

  /** Docs with a check running in this tab — a persisted 'checking' without one is stale (page reloaded). */
  private readonly running = signal<ReadonlySet<string>>(new Set());

  isRunning(docId: string): boolean {
    return this.running().has(docId);
  }

  /** True when the last problem was the quality of a photo: the page then opens its photo tips. */
  readonly photoTips = signal(false);

  clearBlockMessage(): void {
    this.blockMessage.set('');
    this.photoTips.set(false);
  }

  setBlockMessage(message: string): void {
    this.blockMessage.set(message);
  }

  /**
   * A document whose check never finished (the tab was closed or the check was cut short). Nothing is running for it,
   * so it can only be re-checked or replaced; it must not block uploading the same file again.
   */
  isStale(d: ReviewDocumentMeta): boolean {
    return (d.validationStatus === 'checking' || d.validationStatus === 'pending') && !this.running().has(d.id);
  }

  /** Stale copies of this file for the year, to be replaced by a fresh upload. */
  staleDuplicates(year: number, file: File): ReviewDocumentMeta[] {
    const name = file.name.trim().toLowerCase();
    return (this.store.review()?.documents ?? []).filter(d =>
      d.year === year
      && this.isStale(d)
      && (d.fileName ?? '').trim().toLowerCase() === name
      && (d.fileSize == null || d.fileSize === file.size)
    );
  }

  /** True when the same file (name + size) is already registered for this year. */
  isDuplicateFile(year: number, file: File, excludeDocId?: string): boolean {
    const name = file.name.trim().toLowerCase();
    const size = file.size;
    return (this.store.review()?.documents ?? []).some(d =>
      d.year === year
      && d.id !== excludeDocId
      && !this.isStale(d)
      && (d.fileName ?? '').trim().toLowerCase() === name
      && (d.fileSize == null || d.fileSize === size)
    );
  }

  duplicateFileMessage(fileName: string): string {
    return `הקובץ "${fileName}" כבר הועלה לשנה זו — לא ניתן להעלות אותו שוב.`;
  }

  /**
   * Run OCR/AI verify. Returns false when the file was rejected and removed.
   */
  async validateDocument(docId: string, file: File): Promise<boolean> {
    this.running.update(s => new Set(s).add(docId));
    try {
      return await this.runValidation(docId, file);
    } finally {
      this.running.update(s => {
        const next = new Set(s);
        next.delete(docId);
        return next;
      });
    }
  }

  private async runValidation(docId: string, file: File): Promise<boolean> {
    const doc = this.find(docId);
    if (!doc || doc.year == null) return false;

    if (this.isDuplicateFile(doc.year, file, docId)) {
      return this.rejectUpload(docId, this.duplicateFileMessage(file.name));
    }

    this.blockMessage.set('');
    this.photoTips.set(false);
    this.store.updateDocument(docId, {
      validationStatus: 'checking',
      validationMessage: 'בודקים שהמסמך תואם לשנה ולסוג שנבחרו…',
      parsedOk: false,
      needsManualReview: true,
      fileSize: file.size
    });

    let local: PdfDocHint | null = null;
    try {
      // Saved passwords first, so a protected payslip opens without asking (on any device, when signed in).
      await this.passwords.load();
      local = await readPdfDocHint(file, this.passwords);

      // PDF text clearly isn't payslip / 106 / pension.
      if (local?.detectedType === 'other') {
        return this.rejectUpload(docId, UNSUITABLE_FILE_MSG);
      }

      // A pension report can cover several years, so the PDF text year says little; the server checks its deposit lines.
      if (local?.year != null && local.year !== doc.year && doc.documentType !== 'pension_report') {
        const msg = doc.documentType === 'payslip' || local.detectedType === 'payslip'
          ? `העלית תלוש של שנה ${local.year} אבל צריך להעלות עבור שנה ${doc.year}.`
          : doc.documentType === 'form106'
          ? `העלית טופס 106 של שנה ${local.year} אבל צריך להעלות עבור שנה ${doc.year}.`
          : `במסמך מופיעה שנת ${local.year}, אבל המסך פתוח לשנת ${doc.year}.`;
        return this.rejectUpload(docId, msg);
      }
      // Caught from the PDF text, before the paid AI check: e.g. a payslip uploaded under "Form 106".
      const typeIssue = typeMismatchMessage(doc.documentType, local);
      if (typeIssue) return this.rejectUpload(docId, typeIssue);
      if (local?.year === doc.year && doc.documentType === 'payslip' && doc.month == null && local.month != null) {
        const monthIssue = this.payslipMonthIssue(doc.year, local.month, docId);
        if (monthIssue) return this.rejectUpload(docId, monthIssue);
      }

      // A dark, blurry or tiny photo is stopped here, before it costs a paid check.
      const problem = await imageQualityProblem(file);
      if (problem) {
        this.photoTips.set(true);
        const text = qualityMessage(problem);
        return this.rejectUpload(docId, doc.documentType === 'payslip' ? text : text.replace(/התלוש/g, 'המסמך').replace(/תלוש/g, 'מסמך'));
      }

      const images = await prepareDocumentImages(file, this.passwords);
      const result = await this.verifyWithRetry({
        images,
        expectedType: doc.documentType,
        expectedYear: doc.year,
        expectedMonth: doc.documentType === 'payslip' ? doc.month : null
      });
      return this.applyResult(docId, result, local);
    } catch (err) {
      if (err instanceof PdfLockedError) return this.rejectUpload(docId, LOCKED_PDF_MSG);
      // Keep the real cause visible in DevTools — the UI message is deliberately general.
      console.error('Document check failed', docId, err);
      // Paid check refused (guest / no credits): keep the file and wait — it is not a broken document.
      if (err instanceof HttpErrorResponse && (err.status === 401 || err.status === 402)) {
        const reason = err.status === 402 ? 'payment' : 'signin';
        this.paywall.set(reason);
        // The PDF text already gave the payslip month — fill it so the user isn't asked to pick it by hand.
        if (doc.documentType === 'payslip' && doc.month == null && local?.year === doc.year && local.month != null
          && !this.payslipMonthIssue(doc.year, local.month, docId)) {
          this.store.updateDocument(docId, { month: local.month, detectedYear: local.year, detectedMonth: local.month });
        }
        this.store.updateDocument(docId, {
          validationStatus: 'unavailable',
          validationMessage: reason === 'payment'
            ? 'המסמך נשמר אבל עוד לא נבדק — נגמרו המסמכים בחבילה. אחרי הוספת מסמכים לחצו «לבדוק עכשיו».'
            : 'המסמך נשמר אבל עוד לא נבדק — הבדיקה זמינה למשתמשים מחוברים. אחרי ההתחברות לחצו «לבדוק עכשיו».',
          parsedOk: false,
          needsManualReview: true
        });
        return true;
      }
      const localMatch = !!local
        && local.year === doc.year
        && local.detectedType != null
        && ALLOWED_TYPES.has(local.detectedType);
      // Server unreachable / failing: the document was never judged, so keep it and offer a re-check.
      if (isTransientVerifyError(err)) {
        if (localMatch) this.acceptWithLocalHint(docId, local!, local!.detectedType!);
        else this.store.updateDocument(docId, { validationStatus: 'unavailable', parsedOk: false, needsManualReview: true });
        this.store.updateDocument(docId, { validationMessage: SERVER_UNAVAILABLE_MSG });
        return true;
      }
      // Any other failure: only keep when PDF text already looks like a matching employment doc for this year.
      if (localMatch) return this.acceptWithLocalHint(docId, local!, local!.detectedType!);
      return this.rejectUpload(docId, UNSUITABLE_FILE_MSG);
    }
  }

  /** One automatic retry on a transient failure (e.g. the API restarting), then give up. */
  private async verifyWithRetry(body: Parameters<ApiService['verifyDocument']>[0]): Promise<DocumentVerificationResult> {
    try {
      return await this.api.verifyDocument(body);
    } catch (err) {
      // A server that did not answer in time is not retried at once: that would be another long wait.
      if (!isTransientVerifyError(err) || err instanceof TimeoutError) throw err;
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      return this.api.verifyDocument(body);
    }
  }

  /** Keep upload when year was confirmed from PDF text but server OCR failed. */
  private acceptWithLocalHint(
    docId: string,
    local: { year: number | null; month: number | null },
    documentType: string
  ): boolean {
    const before = this.find(docId);
    if (!before || before.year == null) return false;

    const patch: Partial<Omit<ReviewDocumentMeta, 'id'>> = {
      detectedYear: local.year,
      detectedMonth: local.month,
      validationStatus: 'unavailable',
      validationMessage: 'השנה תואמת לפי הטקסט בקובץ. אימות OCR לא זמין כרגע — בדקו את הפרטים ידנית.',
      parsedOk: false,
      needsManualReview: true
    };

    if (documentType === 'payslip' && before.month == null && local.month != null) {
      patch.month = local.month;
      patch.validationMessage =
        `תלוש זוהה ל־${local.month}/${before.year} לפי הטקסט בקובץ. אימות OCR לא זמין — בדקו ידנית.`;
    } else if (documentType === 'payslip' && before.month == null && local.month == null) {
      patch.validationStatus = 'mismatch';
      patch.validationMessage = 'השנה תואמת, אבל לא זוהה חודש — בחרו חודש ידנית. אימות OCR לא זמין.';
    }

    this.store.updateDocument(docId, patch);
    return true;
  }

  /** User confirms after reading a mismatch / unavailable warning. */
  confirmManual(docId: string): void {
    const doc = this.find(docId);
    if (!doc) return;
    this.store.updateDocument(docId, {
      validationStatus: 'manual',
      validationMessage: 'אושר ידנית — ודאו שהשנה/החודש/הסוג נכונים לפני החישוב.',
      parsedOk: false,
      needsManualReview: true
    });
  }

  /** Align stored year/month to what OCR detected (when available). */
  applyDetected(docId: string): void {
    const doc = this.find(docId);
    if (!doc) return;
    const patch: Partial<Omit<ReviewDocumentMeta, 'id'>> = {
      needsManualReview: false
    };
    if (doc.detectedYear != null) patch.year = doc.detectedYear;
    if (doc.documentType === 'payslip' && doc.detectedMonth != null) patch.month = doc.detectedMonth;
    if (doc.detectedType && ALLOWED_TYPES.has(doc.detectedType)) {
      patch.documentType = doc.detectedType;
    }

    this.store.updateDocument(docId, patch);

    const updated = this.find(docId);
    if (!updated) return;

    const yearOk = updated.detectedYear == null || updated.detectedYear === updated.year;
    const monthOk = updated.documentType !== 'payslip'
      || updated.detectedMonth == null
      || updated.detectedMonth === updated.month;
    const typeOk = !updated.detectedType
      || updated.detectedType === updated.documentType
      || !ALLOWED_TYPES.has(updated.detectedType);

    if (yearOk && monthOk && typeOk && updated.detectedType && ALLOWED_TYPES.has(updated.detectedType)) {
      this.store.updateDocument(docId, {
        validationStatus: 'ok',
        validationMessage: 'עודכן לפי מה שזוהה במסמך.',
        parsedOk: true,
        needsManualReview: false
      });
      this.syncFromDoc(docId);
    } else {
      this.store.updateDocument(docId, {
        validationStatus: 'mismatch',
        validationMessage: 'עדיין אין התאמה מלאה — בדקו שוב או אשרו ידנית.',
        parsedOk: false,
        needsManualReview: true
      });
    }
  }

  /** @returns false if the document was rejected and removed. */
  private applyResult(
    docId: string,
    result: DocumentVerificationResult,
    localHint?: PdfDocHint | null
  ): boolean {
    const before = this.find(docId);
    if (!before || before.year == null) return false;

    // The employment form no longer asks for the employer: take it from a matching payslip / Form 106.
    if (result.employerName && result.typeMatches && result.yearMatches
      && (result.detectedType === 'payslip' || result.detectedType === 'form106')) {
      this.store.adoptEmployerName(result.employerName);
    }

    if (!result.readable) {
      this.photoTips.set(true);
      this.store.updateDocument(docId, {
        validationStatus: 'unreadable',
        validationMessage: result.messageHe,
        detectedType: result.detectedType,
        detectedYear: result.detectedYear,
        detectedMonth: result.detectedMonth,
        detectedPeriodLabel: result.periodLabel,
        extractedSummary: result.summaryHe || before.extractedSummary || null,
        parsedOk: false,
        needsManualReview: true
      });
      return true;
    }

    const detectedType = (result.detectedType || '').toLowerCase();
    let detectedYear = result.detectedYear ?? null;
    let detectedMonth = result.detectedMonth ?? null;

    // Prefer explicit OCR; fall back to PDF text hint when server returned no year.
    if (detectedYear == null && localHint?.year != null) {
      detectedYear = localHint.year;
      if (detectedMonth == null && localHint.month != null) detectedMonth = localHint.month;
    }

    // A multi-year pension report belongs to this year when it has deposit lines for it.
    if (detectedType === 'pension_report' && result.yearMatches && before.year != null) detectedYear = before.year;

    if (!result.yearMatches && detectedYear != null && before.year != null && detectedYear !== before.year) {
      return this.rejectUpload(
        docId,
        detectedType === 'payslip'
          ? `העלית תלוש של שנה ${detectedYear} אבל צריך להעלות עבור שנה ${before.year}.`
          : result.messageHe || `שנת המסמך ${detectedYear} אינה תואמת לשנת ${before.year}.`
      );
    }

    // 1) Not payslip / 106 / pension → reject and remove.
    if (!ALLOWED_TYPES.has(detectedType)) {
      return this.rejectUpload(docId, UNSUITABLE_FILE_MSG);
    }

    // 2) Year must be read from the document and must match the year cube.
    if (detectedYear == null) {
      return this.rejectUpload(
        docId,
        detectedType === 'payslip'
          ? 'לא הצלחנו לזהות את שנת התלוש במסמך — העלו קובץ ברור יותר.'
          : 'לא הצלחנו לזהות את השנה במסמך — העלו קובץ ברור יותר.'
      );
    }
    if (detectedYear !== before.year) {
      if (detectedType === 'payslip') {
        return this.rejectUpload(
          docId,
          `העלית תלוש של שנה ${detectedYear} אבל צריך להעלות עבור שנה ${before.year}.`
        );
      }
      if (detectedType === 'form106') {
        return this.rejectUpload(
          docId,
          `העלית טופס 106 של שנה ${detectedYear} אבל צריך להעלות עבור שנה ${before.year}.`
        );
      }
      return this.rejectUpload(
        docId,
        `העלית דוח פנסיה של שנה ${detectedYear} אבל צריך להעלות עבור שנה ${before.year}.`
      );
    }

    // 3) Payslip month not among missing months for this year → reject.
    if (detectedType === 'payslip' && detectedMonth != null) {
      const monthIssue = this.payslipMonthIssue(before.year, detectedMonth, docId);
      if (monthIssue) return this.rejectUpload(docId, monthIssue);
    }

    const funds: ExtractedFundSnapshot[] = (result.funds ?? []).map(f => ({
      kind: f.kind,
      provider: f.provider,
      balance: f.balance,
      asOf: f.asOf,
      feeAnnualPercent: f.feeAnnualPercent,
      returnAnnualPercent: f.returnAnnualPercent,
      track: f.track
    }));

    let status: DocumentValidationStatus = 'ok';
    const patch: Partial<Omit<ReviewDocumentMeta, 'id'>> = {
      documentType: detectedType,
      validationStatus: status,
      validationMessage: result.messageHe,
      detectedType,
      detectedYear,
      detectedMonth,
      detectedPeriodLabel: result.periodLabel,
      extractedSummary: result.summaryHe || before.extractedSummary || null,
      extractedGrossSalary: result.grossSalary ?? null,
      extractedPensionBase: result.pensionBase ?? null,
      // null = read and nothing printed; a payslip checked before this was read has no such field at all.
      extractedVacation: detectedType === 'payslip' ? (result.vacation ?? null) : null,
      // [] = read, none found; null = not read (older OCR / unavailable).
      extractedComponents: detectedType === 'payslip' ? (result.payComponents ?? []) : null,
      // Known from the file's own text, or from what the payslip pays: notice pay, vacation redemption, severance.
      isSettlement: detectedType === 'payslip'
        && (!!localHint?.settlement
          || (result.payComponents ?? []).some(c => ['notice', 'vacation_redemption', 'severance_pay'].includes(c.kind))),
      // Form 106: [] = no table of funds found; null = not read.
      extractedFundTotals: detectedType === 'form106' ? (result.fundTotals ?? []) : null,
      // [] = read, none found; null = not read (older OCR / unavailable).
      // Payslip: the contribution table. Pension report: the deposits the fund received, by salary month.
      extractedContributions: detectedType === 'payslip' || detectedType === 'pension_report' ? (result.contributions ?? []) : null,
      extractedAnnualGross: result.annualGross ?? null,
      extractedFunds: funds.length ? funds : null,
      extractedContributionKinds: (result.contributionKinds ?? []).length
        ? [...new Set(result.contributionKinds!.map(k => k.toLowerCase()))]
        : null,
      parsedOk: true,
      needsManualReview: false
    };

    // Auto-fill payslip month from OCR / PDF hint.
    if (
      detectedType === 'payslip'
      && before.month == null
      && detectedMonth != null
      && detectedMonth >= 1
      && detectedMonth <= 12
    ) {
      patch.month = detectedMonth;
      patch.validationMessage = `תלוש זוהה ל־${detectedMonth}/${before.year}.`;
    }

    // Payslip without a month: keep and ask for manual pick.
    if (
      detectedType === 'payslip'
      && (patch.month == null && before.month == null)
      && detectedMonth == null
    ) {
      patch.validationStatus = 'mismatch';
      patch.validationMessage = 'התלוש תואם לשנה, אבל לא זוהה חודש — בחרו חודש ידנית.';
      patch.parsedOk = false;
      patch.needsManualReview = true;
      status = 'mismatch';
    }

    this.store.updateDocument(docId, patch);

    if (status === 'ok' || funds.length || (result.grossSalary != null && result.grossSalary > 0)
      || (result.contributionKinds?.length ?? 0) > 0) {
      this.syncFromDoc(docId);
    }
    return true;
  }

  private rejectUpload(docId: string, message: string): false {
    this.store.removeDocument(docId);
    this.blockMessage.set(message);
    return false;
  }

  /**
   * Returns an error message if the month is not a missing payslip month for the year.
   */
  private payslipMonthIssue(year: number, month: number, excludeDocId: string): string | null {
    const label = MONTH_LABELS[month] ?? String(month);
    const employmentMonths = this.monthsInEmploymentYear(year);

    if (!employmentMonths.includes(month)) {
      return `העלית תלוש ל־${label}, אבל החודש הזה לא בתקופת העסקה לשנת ${year}.`;
    }

    const alreadyHave = (this.store.review()?.documents ?? []).some(
      d => d.id !== excludeDocId
        && d.documentType === 'payslip'
        && d.year === year
        && d.month === month
    );
    if (alreadyHave) {
      return `העלית תלוש ל־${label}, אבל החודש הזה כבר קיים ברשימה.`;
    }

    if (this.store.isWaived('payslip', year, month) || this.store.isWaived('payslip', year, null)) {
      return `העלית תלוש ל־${label}, אבל החודש הזה מסומן כדולג — בטלו את הדילוג אם רוצים להעלות.`;
    }

    return null;
  }

  private monthsInEmploymentYear(year: number): number[] {
    const p = this.store.review()?.period;
    if (!p?.startDate || !p?.endDate) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const start = new Date(p.startDate + 'T00:00:00');
    const end = new Date(p.endDate + 'T00:00:00');
    const months: number[] = [];
    for (let m = 1; m <= 12; m++) {
      const first = new Date(year, m - 1, 1);
      const last = new Date(year, m, 0);
      if (last >= start && first <= end) months.push(m);
    }
    return months;
  }

  private syncFromDoc(docId: string): void {
    const doc = this.find(docId);
    if (!doc || doc.year == null) return;

    if (doc.documentType === 'payslip' && doc.month != null && doc.extractedGrossSalary != null && doc.extractedGrossSalary > 0) {
      this.store.applyPayslipSalary(doc.year, doc.month, doc.extractedGrossSalary, doc.extractedPensionBase ?? finalMonthPensionBase(doc.extractedComponents), doc.id);
      this.store.syncContributionsFromDocuments();
    }

    if (doc.documentType === 'pension_report' && doc.extractedFunds?.length) {
      this.store.applyFundsFromDocument(doc.id, doc.extractedFunds);
    }
  }

  private find(id: string): ReviewDocumentMeta | undefined {
    return this.store.review()?.documents.find(d => d.id === id);
  }
}
