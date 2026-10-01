import { Injectable, inject } from '@angular/core';
import { ApiService, DocumentVerificationResult, describeError } from './api.service';
import { prepareDocumentImages } from './document-images';
import { DocumentValidationStatus, ExtractedFundSnapshot, ReviewDocumentMeta } from './review.models';
import { ReviewStore } from './review.store';

@Injectable({ providedIn: 'root' })
export class DocumentValidationService {
  private readonly api = inject(ApiService);
  private readonly store = inject(ReviewStore);

  /** Run OCR/AI verify and persist status on the document row. */
  async validateDocument(docId: string, file: File): Promise<void> {
    const doc = this.find(docId);
    if (!doc || doc.year == null) return;

    this.store.updateDocument(docId, {
      validationStatus: 'checking',
      validationMessage: 'בודקים שהמסמך תואם לשנה ולסוג שנבחרו…',
      parsedOk: false,
      needsManualReview: true
    });

    try {
      const images = await prepareDocumentImages(file);
      const result = await this.api.verifyDocument({
        images,
        expectedType: doc.documentType,
        expectedYear: doc.year,
        expectedMonth: doc.documentType === 'payslip' ? doc.month : null
      });
      this.applyResult(docId, result);
    } catch (err) {
      const message = describeError(err).message;
      this.store.updateDocument(docId, {
        validationStatus: 'unavailable',
        validationMessage: message.includes('מפתח') || message.includes('מוגדר')
          ? 'אימות אוטומטי אינו זמין כרגע. אפשר להמשיך אחרי בדיקה ידנית.'
          : `${message} אפשר לאשר ידנית אחרי בדיקה.`,
        parsedOk: false,
        needsManualReview: true
      });
    }
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
    if (doc.detectedType && ['payslip', 'form106', 'pension_report'].includes(doc.detectedType)) {
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
      || !['payslip', 'form106', 'pension_report'].includes(updated.detectedType);

    if (yearOk && monthOk && typeOk && updated.detectedType && updated.detectedType !== 'other') {
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

  private applyResult(docId: string, result: DocumentVerificationResult): void {
    let status: DocumentValidationStatus;
    if (!result.readable) status = 'unreadable';
    else if (result.overallOk) status = 'ok';
    else status = 'mismatch';

    const funds: ExtractedFundSnapshot[] = (result.funds ?? []).map(f => ({
      kind: f.kind,
      provider: f.provider,
      balance: f.balance,
      asOf: f.asOf,
      feeAnnualPercent: f.feeAnnualPercent,
      returnAnnualPercent: f.returnAnnualPercent,
      track: f.track
    }));

    this.store.updateDocument(docId, {
      validationStatus: status,
      validationMessage: result.messageHe,
      detectedType: result.detectedType,
      detectedYear: result.detectedYear,
      detectedMonth: result.detectedMonth,
      detectedPeriodLabel: result.periodLabel,
      extractedSummary: result.summaryHe || this.find(docId)?.extractedSummary || null,
      extractedGrossSalary: result.grossSalary ?? null,
      extractedAnnualGross: result.annualGross ?? null,
      extractedFunds: funds.length ? funds : null,
      extractedContributionKinds: (result.contributionKinds ?? []).length
        ? [...new Set(result.contributionKinds!.map(k => k.toLowerCase()))]
        : null,
      parsedOk: status === 'ok',
      needsManualReview: status !== 'ok'
    });

    if (status === 'ok' || funds.length || (result.grossSalary != null && result.grossSalary > 0)
      || (result.contributionKinds?.length ?? 0) > 0) {
      this.syncFromDoc(docId);
    }
  }

  private syncFromDoc(docId: string): void {
    const doc = this.find(docId);
    if (!doc || doc.year == null) return;

    if (doc.documentType === 'payslip' && doc.month != null && doc.extractedGrossSalary != null && doc.extractedGrossSalary > 0) {
      this.store.applyPayslipSalary(doc.year, doc.month, doc.extractedGrossSalary, doc.id);
    }

    if (doc.documentType === 'pension_report' && doc.extractedFunds?.length) {
      this.store.applyFundsFromDocument(doc.id, doc.extractedFunds);
    }
  }

  private find(id: string): ReviewDocumentMeta | undefined {
    return this.store.review()?.documents.find(d => d.id === id);
  }
}
