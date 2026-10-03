import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, CanActivateFn, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { AuthService } from './auth/auth.service';
import { DocumentValidationStatus, EmploymentReviewCase } from './review.models';
import { ReviewStore } from './review.store';
import { WizardStore } from './wizard.store';
import { detailsStepGuard, resultsStepGuard, reviewCheckGuard, reviewDocumentsGuard } from './wizard-guards';

describe('wizard step guards', () => {
  let review: ReviewStore;
  let wizard: WizardStore;

  async function run(guard: CanActivateFn): Promise<string> {
    const result = await runInInjectionContext(TestBed.inject(EnvironmentInjector),
      () => guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));
    return result instanceof UrlTree ? result.toString() : String(result);
  }

  function setReview(period: boolean, statuses: Array<DocumentValidationStatus | undefined>): void {
    const c: EmploymentReviewCase = {
      workspaceId: 'ws', months: [], funds: [], updatedAt: new Date().toISOString(),
      period: period ? { startDate: '2022-01-01', endDate: '2023-12-31' } as EmploymentReviewCase['period'] : null,
      documents: statuses.map((s, i) => ({ id: `d${i}`, documentType: 'payslip', year: 2023, month: i + 1, source: 'upload',
        parsedOk: s === 'ok', extractedSummary: null, needsManualReview: false, validationStatus: s }))
    };
    review.review.set(c);
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    review = TestBed.inject(ReviewStore);
    wizard = TestBed.inject(WizardStore);
    const auth = TestBed.inject(AuthService);
    spyOn(auth, 'init').and.resolveTo();
    spyOn(auth, 'isSignedIn').and.returnValue(false);
  });

  it('full review: documents need the period; check needs finished documents', async () => {
    setReview(false, []);
    expect(await run(reviewDocumentsGuard)).toBe('/review/employment');
    expect(await run(reviewCheckGuard)).toBe('/review/employment');

    setReview(true, []);
    expect(await run(reviewDocumentsGuard)).toBe('true');
    expect(await run(reviewCheckGuard)).toBe('/review/documents');

    setReview(true, ['ok', 'unavailable']);
    expect(await run(reviewCheckGuard)).toBe('/review/documents');
    expect(review.documentsBlocker()).toContain('לא נבדק');

    setReview(true, ['ok', 'manual']);
    expect(await run(reviewCheckGuard)).toBe('true');
    expect(review.documentsBlocker()).toBeNull();
  });

  it('quick check: details need a reason, results need a calculation', async () => {
    expect(await run(detailsStepGuard)).toBe('/reason');
    expect(await run(resultsStepGuard)).toBe('/reason');

    wizard.choice.set('Fired');
    expect(await run(detailsStepGuard)).toBe('true');
    expect(await run(resultsStepGuard)).toBe('/details');

    wizard.results.set([{} as never]);
    expect(await run(resultsStepGuard)).toBe('true');
  });
});
