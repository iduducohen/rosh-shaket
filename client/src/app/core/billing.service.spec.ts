import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BillingAccount, BillingService, PlansResponse, pricePerDocument } from './billing.service';

export const PLANS: PlansResponse = {
  plans: [
    { id: 'year', name: 'שנה אחת', tagline: 'עד 12 תלושים', documents: 15, priceIls: 29, recommended: false, topUp: false },
    { id: 'full', name: 'בדיקה מלאה', tagline: 'עד 3 שנים', documents: 45, priceIls: 59, recommended: true, topUp: false },
    { id: 'long', name: 'תקופה ארוכה', tagline: 'עד 8 שנים', documents: 120, priceIls: 99, recommended: false, topUp: false },
    { id: 'topup', name: 'תוספת מסמכים', tagline: 'להשלמה', documents: 10, priceIls: 19, recommended: false, topUp: true }
  ],
  freeDocuments: 3,
  enabled: true,
  checkoutAvailable: true,
  simulated: true
};

export const ACCOUNT: BillingAccount = {
  balance: 2, freeGranted: 3, purchased: 10, used: 12, refunded: 1, spentIls: 19,
  purchases: [{ id: 'p1', planId: 'topup', planName: 'תוספת מסמכים', documents: 10, amountIls: 19, status: 'simulated', provider: 'Simulated', createdAt: '2026-10-03T10:00:00Z' }],
  recentActivity: [
    { delta: -1, kind: 'document', documentType: 'payslip', year: 2024, month: 3, createdAt: '2026-10-03T11:00:00Z' },
    { delta: 1, kind: 'refund', documentType: 'form106', year: 2023, month: null, createdAt: '2026-10-03T10:30:00Z' },
    { delta: 3, kind: 'welcome', documentType: null, year: null, month: null, createdAt: '2026-10-01T09:00:00Z' }
  ]
};

describe('BillingService', () => {
  let service: BillingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(BillingService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('remembers whether the server counts documents', async () => {
    const p = service.plans();
    http.expectOne(r => r.url.endsWith('/api/billing/plans')).flush(PLANS);
    expect((await p).plans.length).toBe(4);
    expect(service.enabled()).toBeTrue();
  });

  it('keeps the latest account for the header, account page and paywall', async () => {
    const p = service.refresh();
    http.expectOne(r => r.url.endsWith('/api/billing/me')).flush(ACCOUNT);
    await p;
    expect(service.account()?.balance).toBe(2);
  });

  it('refreshes the account after a purchase', async () => {
    const p = service.checkout('topup');
    const req = http.expectOne(r => r.url.endsWith('/api/billing/checkout'));
    expect(req.request.body).toEqual({ planId: 'topup' });
    req.flush({ status: 'simulated', purchase: ACCOUNT.purchases[0], balance: 12 });
    await Promise.resolve();
    http.expectOne(r => r.url.endsWith('/api/billing/me')).flush({ ...ACCOUNT, balance: 12 });
    expect((await p).balance).toBe(12);
    expect(service.account()?.balance).toBe(12);
  });

  it('prices each document to the agora', () => {
    expect(pricePerDocument(PLANS.plans[1])).toBe(1.31);
    expect(pricePerDocument(PLANS.plans[2])).toBe(0.83);
  });
});
