import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiService } from './api.service';
import { DocumentValidationService } from './document-validation.service';
import { EmploymentReviewCase } from './review.models';
import { ReviewStore } from './review.store';

describe('DocumentValidationService: photo quality', () => {
  let validation: DocumentValidationService;
  let store: ReviewStore;
  let api: ApiService;

  async function flat(width: number, height: number, fill: string): Promise<File> {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const g = c.getContext('2d')!;
    g.fillStyle = fill;
    g.fillRect(0, 0, width, height);
    const blob = await new Promise<Blob>(r => c.toBlob(b => r(b!), 'image/png'));
    return new File([blob], 'photo.png', { type: 'image/png' });
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

  it('stops a tiny photo before the paid check and opens the photo tips', async () => {
    const verify = spyOn(api, 'verifyDocument');

    const kept = await validation.validateDocument('d1', await flat(300, 400, '#888'));

    expect(kept).toBeFalse();
    expect(verify).not.toHaveBeenCalled();
    expect(validation.blockMessage()).toContain('קטנה מדי');
    expect(validation.photoTips()).toBeTrue();
  });

  it('stops a dark photo and says so', async () => {
    const verify = spyOn(api, 'verifyDocument');

    await validation.validateDocument('d1', await flat(1000, 1300, '#050505'));

    expect(verify).not.toHaveBeenCalled();
    expect(validation.blockMessage()).toContain('כהה');
  });

  it('clears the tips and the message when the next file starts', async () => {
    spyOn(api, 'verifyDocument');
    await validation.validateDocument('d1', await flat(300, 400, '#888'));
    expect(validation.photoTips()).toBeTrue();

    validation.clearBlockMessage();

    expect(validation.blockMessage()).toBe('');
    expect(validation.photoTips()).toBeFalse();
  });
});

describe('DocumentValidationService: a server that does not answer', () => {
  it('treats a timeout like an unreachable server, so the document waits for a re-check', async () => {
    const { isTransientVerifyError } = await import('./document-validation.service');
    const { TimeoutError } = await import('rxjs');

    expect(isTransientVerifyError(new TimeoutError())).toBeTrue();
  });
});
