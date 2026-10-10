import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiService, DocumentVerificationResult } from './api.service';
import { DocumentValidationService } from './document-validation.service';
import { EmploymentReviewCase } from './review.models';
import { ReviewStore } from './review.store';

describe('A pension report of another report year', () => {
  let validation: DocumentValidationService;
  let store: ReviewStore;
  let api: ApiService;

  async function sharpImage(): Promise<File> {
    const c = document.createElement('canvas');
    c.width = 1000;
    c.height = 1300;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 1000, 1300);
    g.fillStyle = '#222';
    for (let y = 0; y < 1300; y += 40) {
      for (let x = (y / 40) % 2 ? 0 : 40; x < 1000; x += 80) g.fillRect(x, y, 40, 40);
    }
    const blob = await new Promise<Blob>(r => c.toBlob(b => r(b!), 'image/png'));
    return new File([blob], 'annual-report.png', { type: 'image/png' });
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    validation = TestBed.inject(DocumentValidationService);
    store = TestBed.inject(ReviewStore);
    api = TestBed.inject(ApiService);
    store.review.set({
      workspaceId: 'ws', period: null, months: [], funds: [], updatedAt: new Date().toISOString(),
      documents: [{ id: 'r1', documentType: 'pension_report', pensionKind: 'annual', year: 2024, month: null, source: 'upload', parsedOk: false, extractedSummary: null, needsManualReview: true }]
    } as unknown as EmploymentReviewCase);
  });

  afterEach(() => TestBed.inject(HttpTestingController).match(() => true));

  it('is kept for the year it has deposit lines for, and keeps those lines with their salary month', async () => {
    spyOn(api, 'verifyDocument').and.resolveTo({
      readable: true, detectedType: 'pension_report', detectedYear: 2025, detectedMonth: null, periodLabel: null,
      typeMatches: true, yearMatches: true, monthMatches: true, overallOk: true, messageHe: 'דוח פנסיה מאומת.', summaryHe: null,
      contributions: [
        { kind: 'pension', payer: 'employee', provider: 'כלל פנסיה וגמל', ratePercent: null, amount: 1401.78, forYear: 2024, forMonth: 12 }
      ]
    } as DocumentVerificationResult);

    const kept = await validation.validateDocument('r1', await sharpImage());

    expect(kept).toBeTrue();
    const doc = store.review()!.documents[0];
    expect(doc.pensionKind).toBe('annual');
    expect(doc.extractedContributions?.length).toBe(1);
    expect(doc.extractedContributions![0].forMonth).toBe(12);
  });
});
