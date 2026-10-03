import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { PLANS } from '../core/billing.service.spec';
import { PricingPage } from './pricing.page';

describe('PricingPage', () => {
  async function render() {
    TestBed.configureTestingModule({
      imports: [PricingPage],
      providers: [provideIonicAngular(), provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    });
    localStorage.clear();
    const f = TestBed.createComponent(PricingPage);
    f.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(r => r.url.endsWith('/api/billing/plans')).flush(PLANS);
    http.match(() => true);
    await f.whenStable();
    f.detectChanges();
    return { f, el: f.nativeElement as HTMLElement };
  }

  it('shows the free tier and the three packs, with the recommended one marked', async () => {
    const { el } = await render();
    expect(el.textContent).toContain('3 מסמכים ראשונים בבדיקה המלאה');
    const plans = el.querySelectorAll('.plans .plan');
    expect(plans.length).toBe(3);
    expect(el.querySelector('.plan.recommended h3')?.textContent).toContain('בדיקה מלאה');
    expect(el.textContent).toContain('₪1.31 למסמך');
  });

  it('suggests a pack from the years of employment', async () => {
    const { f } = await render();
    const page = f.componentInstance;
    page.years.set(3);
    expect(page.needed()).toBe(42);
    expect(page.suggested()?.id).toBe('full');
    page.years.set(8);
    expect(page.suggested()?.id).toBe('long');
    page.years.set(10);
    expect(page.suggested()).toBeNull();
  });

  it('asks a guest to sign in before buying', async () => {
    const { f, el } = await render();
    f.componentInstance.choose(PLANS.plans[1]);
    f.detectChanges();
    expect(el.querySelector('.sheet')?.textContent).toContain('כדי לרכוש צריך להתחבר');
  });
});
