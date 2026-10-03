import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { AuthService } from '../core/auth/auth.service';
import { ACCOUNT, PLANS } from '../core/billing.service.spec';
import { AccountPage } from './account.page';

describe('AccountPage', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AccountPage],
      providers: [provideIonicAngular(), provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    });
    localStorage.clear();
  });

  it('asks guests to sign in', () => {
    const f = TestBed.createComponent(AccountPage);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('כדי לראות יתרה ורכישות צריך להתחבר');
    TestBed.inject(HttpTestingController).match(() => true);
  });

  it('shows balance, usage, purchases and a readable activity log', async () => {
    TestBed.inject(AuthService).user.set({ id: 'u1', email: 'dudu@example.com', name: 'דודו', provider: 'Email' });
    const f = TestBed.createComponent(AccountPage);
    f.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(r => r.url.endsWith('/api/billing/plans')).flush(PLANS);
    http.expectOne(r => r.url.endsWith('/api/billing/me')).flush(ACCOUNT);
    http.match(() => true);
    await f.whenStable();
    f.detectChanges();

    const el: HTMLElement = f.nativeElement;
    expect(el.querySelector('.hero .v')?.textContent).toContain('2');
    expect(el.querySelector('.hero')?.classList).toContain('low');
    expect(el.textContent).toContain('כמעט נגמרו המסמכים');
    expect(el.textContent).toContain('בדיקה, בלי חיוב');
    expect(el.textContent).toContain('בדיקת מסמך · תלוש 03/2024');
    expect(el.textContent).toContain('החזר — הבדיקה נכשלה · טופס 106 2023');
    expect(el.textContent).toContain('מתנת הצטרפות');
  });
});
