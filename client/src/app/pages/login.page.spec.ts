import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [provideIonicAngular(), provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    });
    localStorage.clear();
  });

  it('shows the three providers and the email form, without demo credentials', () => {
    const f = TestBed.createComponent(LoginPage);
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    const buttons = Array.from(el.querySelectorAll('button.social')).map(b => b.textContent!.trim());
    expect(buttons).toEqual(['המשך עם Google', 'המשך עם Apple', 'המשך עם Microsoft']);
    expect(el.querySelector('#email')).not.toBeNull();
    expect(el.textContent).not.toContain('demo');
    TestBed.inject(HttpTestingController).match(() => true);
  });

  it('explains when a provider is not configured on the server', async () => {
    const f = TestBed.createComponent(LoginPage);
    f.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(r => r.url.endsWith('/api/auth/providers'))
      .flush([{ provider: 'Google', enabled: false, clientId: null }]);
    await f.whenStable();
    await f.componentInstance.withProvider('Google');
    expect(f.componentInstance.error()).toContain('עוד לא הוגדרה');
  });

  it('continue as guest goes to the payslip screen', () => {
    const f = TestBed.createComponent(LoginPage);
    const nav = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    f.componentInstance.guest();
    expect(nav).toHaveBeenCalledWith('/start', { replaceUrl: true });
    expect(localStorage.getItem('rs-guest')).toBe('1');
  });
});
