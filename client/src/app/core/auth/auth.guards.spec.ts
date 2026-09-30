import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { loginGuard, sessionGuard } from './auth.guards';

describe('auth guards', () => {
  const auth = {
    init: () => Promise.resolve(),
    isSignedIn: jasmine.createSpy('isSignedIn'),
    hasSession: jasmine.createSpy('hasSession').and.returnValue(false),
    guest: jasmine.createSpy('guest')
  };
  const run = (guard: typeof sessionGuard) =>
    TestBed.runInInjectionContext(() => guard({} as any, {} as any)) as Promise<boolean | UrlTree>;

  beforeEach(() => {
    auth.hasSession.and.returnValue(false);
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthService, useValue: auth }] });
  });

  it('sends a visitor with no session to /login', async () => {
    auth.isSignedIn.and.returnValue(false); auth.guest.and.returnValue(false);
    const result = await run(sessionGuard);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/login');
  });

  it('lets a guest in', async () => {
    auth.isSignedIn.and.returnValue(false); auth.guest.and.returnValue(true);
    expect(await run(sessionGuard)).toBeTrue();
  });

  it('lets a returning session in before the profile loads', async () => {
    auth.isSignedIn.and.returnValue(false); auth.hasSession.and.returnValue(true); auth.guest.and.returnValue(false);
    expect(await run(sessionGuard)).toBeTrue();
  });

  it('skips the login screen when signed in', async () => {
    auth.isSignedIn.and.returnValue(true);
    const result = await run(loginGuard);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/details');
  });
});
