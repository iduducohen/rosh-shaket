import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DocumentValidationService } from './document-validation.service';
import { EmploymentReviewCase } from './review.models';
import { ReviewStore } from './review.store';

describe('Duplicate detection and unfinished checks', () => {
  let validation: DocumentValidationService;
  let store: ReviewStore;

  const file = new File([new Uint8Array(2048)], 'pdf_13880318.pdf', { type: 'application/pdf' });

  function doc(status: string, id = 'd1') {
    return {
      id, documentType: 'payslip', year: 2026, month: null, source: 'upload', parsedOk: false,
      extractedSummary: null, needsManualReview: true, fileName: 'pdf_13880318.pdf', fileSize: 2048,
      validationStatus: status
    };
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    validation = TestBed.inject(DocumentValidationService);
    store = TestBed.inject(ReviewStore);
  });

  afterEach(() => TestBed.inject(HttpTestingController).match(() => true));

  function setDocs(...docs: ReturnType<typeof doc>[]): void {
    store.review.set({
      workspaceId: 'ws', period: null, months: [], funds: [], updatedAt: new Date().toISOString(), documents: docs
    } as unknown as EmploymentReviewCase);
  }

  it('does not count a check that never finished as an upload of the same file', () => {
    setDocs(doc('checking'));

    expect(validation.isDuplicateFile(2026, file)).toBeFalse();
    expect(validation.staleDuplicates(2026, file).map(d => d.id)).toEqual(['d1']);
  });

  it('still blocks the same file once it was checked', () => {
    setDocs(doc('ok'));

    expect(validation.isDuplicateFile(2026, file)).toBeTrue();
    expect(validation.staleDuplicates(2026, file)).toEqual([]);
  });
});
