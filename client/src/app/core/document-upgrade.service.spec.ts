import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ApiService } from './api.service';
import { DocumentUpgradeService } from './document-upgrade.service';
import { DocumentValidationService } from './document-validation.service';
import { EXTRACTION_VERSION, EmploymentReviewCase } from './review.models';
import { ReviewStore } from './review.store';

describe('Reading upgrade of saved documents', () => {
  let store: ReviewStore;
  let upgrade: DocumentUpgradeService;
  let validation: DocumentValidationService;

  const base = {
    documentType: 'payslip', year: 2024, month: 3, source: 'upload', parsedOk: true,
    extractedSummary: null, needsManualReview: false, validationStatus: 'ok'
  };

  function setDocs(...docs: object[]): void {
    store.review.set({
      workspaceId: 'ws', period: null, months: [], funds: [], updatedAt: new Date().toISOString(), documents: docs
    } as unknown as EmploymentReviewCase);
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    store = TestBed.inject(ReviewStore);
    upgrade = TestBed.inject(DocumentUpgradeService);
    validation = TestBed.inject(DocumentValidationService);
  });

  it('lists only accepted documents read by an older version', () => {
    setDocs(
      { ...base, id: 'old' },
      { ...base, id: 'older', extractionVersion: EXTRACTION_VERSION - 1 },
      { ...base, id: 'current', extractionVersion: EXTRACTION_VERSION },
      { ...base, id: 'broken', validationStatus: 'unreadable' }
    );

    expect(upgrade.pending()).toEqual(['old', 'older']);
  });

  it('keeps the document exactly as it was when the re-read does not match it', async () => {
    setDocs({ ...base, id: 'd1', extractedGrossSalary: 38250 });
    const api = TestBed.inject(ApiService);
    spyOn(api, 'verifyDocument').and.resolveTo({
      readable: true, typeMatches: false, yearMatches: true, detectedType: 'form106', detectedYear: 2024, detectedMonth: null
    } as never);
    const file = new File([new Uint8Array(2048)], 'x.png', { type: 'image/png' });

    const ok = await validation.upgradeDocument('d1', file);
    const doc = store.review()!.documents.find(d => d.id === 'd1')!;

    expect(ok).toBeFalse();
    expect(doc.extractedGrossSalary).toBe(38250);
    expect(doc.extractionVersion ?? 0).toBeLessThan(EXTRACTION_VERSION);
  });
});
