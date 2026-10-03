import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiService } from './api.service';
import { DocumentValidationService } from './document-validation.service';
import { EmploymentReviewCase } from './review.models';
import { ReviewStore } from './review.store';

describe('DocumentValidationService — paid checks', () => {
  let validation: DocumentValidationService;
  let store: ReviewStore;
  let api: ApiService;

  async function pngFile(): Promise<File> {
    const c = document.createElement('canvas');
    c.width = 40; c.height = 40;
    c.getContext('2d')!.fillRect(0, 0, 40, 40);
    const blob = await new Promise<Blob>(r => c.toBlob(b => r(b!), 'image/png'));
    return new File([blob], 'payslip.png', { type: 'image/png' });
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    validation = TestBed.inject(DocumentValidationService);
    store = TestBed.inject(ReviewStore);
    api = TestBed.inject(ApiService);
    const review: EmploymentReviewCase = {
      workspaceId: 'ws', period: null, months: [], funds: [], updatedAt: new Date().toISOString(),
      documents: [{ id: 'd1', documentType: 'payslip', year: 2024, month: null, source: 'upload', parsedOk: false, extractedSummary: null, needsManualReview: true }]
    };
    store.review.set(review);
  });

  afterEach(() => TestBed.inject(HttpTestingController).match(() => true));

  it('keeps the document and shows how to continue when documents ran out (402)', async () => {
    spyOn(api, 'verifyDocument').and.rejectWith(new HttpErrorResponse({ status: 402, error: { title: 'נגמרו המסמכים בחבילה.' } }));

    const kept = await validation.validateDocument('d1', await pngFile());

    expect(kept).toBeTrue();
    expect(validation.paywall()).toBe('payment');
    const doc = store.review()!.documents[0];
    expect(doc.validationStatus).toBe('unavailable');
    expect(doc.validationMessage).toContain('נגמרו המסמכים בחבילה');
  });

  it('asks a guest to sign in instead of reading the PDF text alone (401)', async () => {
    spyOn(api, 'verifyDocument').and.rejectWith(new HttpErrorResponse({ status: 401 }));

    await validation.validateDocument('d1', await pngFile());

    expect(validation.paywall()).toBe('signin');
    expect(store.review()!.documents[0].validationMessage).toContain('למשתמשים מחוברים');
  });

  it('reports a running check while it is in flight and clears it afterwards', async () => {
    let release!: () => void;
    spyOn(api, 'verifyDocument').and.returnValue(new Promise((_, reject) => {
      release = () => reject(new HttpErrorResponse({ status: 402 }));
    }));

    const run = validation.validateDocument('d1', await pngFile());
    await new Promise(r => setTimeout(r, 50));
    expect(validation.isRunning('d1')).toBeTrue();
    release();
    await run;
    expect(validation.isRunning('d1')).toBeFalse();
  });
});
