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
    // Large and sharp enough to pass the on-device photo-quality gate: bold blocks survive the downscale.
    c.width = 1000; c.height = 1300;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 1000, 1300);
    g.fillStyle = '#222';
    for (let y = 0; y < 1300; y += 40) {
      for (let x = (y / 40) % 2 ? 0 : 40; x < 1000; x += 80) g.fillRect(x, y, 40, 40);
    }
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

  it('retries once when the server is unreachable, then keeps the document for a re-check', async () => {
    const verify = spyOn(api, 'verifyDocument').and.rejectWith(new HttpErrorResponse({ status: 0 }));
    spyOn(console, 'error');

    const kept = await validation.validateDocument('d1', await pngFile());

    expect(verify).toHaveBeenCalledTimes(2);
    expect(kept).toBeTrue();
    const doc = store.review()!.documents[0];
    expect(doc.validationStatus).toBe('unavailable');
    expect(doc.validationMessage).toContain('לבדוק עכשיו');
    expect(console.error).toHaveBeenCalled();
  });

  it('still rejects an image the server could not accept for a non-transient reason', async () => {
    const verify = spyOn(api, 'verifyDocument').and.rejectWith(new HttpErrorResponse({ status: 400 }));
    spyOn(console, 'error');

    const kept = await validation.validateDocument('d1', await pngFile());

    expect(verify).toHaveBeenCalledTimes(1);
    expect(kept).toBeFalse();
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
