import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

describe('AuthService session restore', () => {
  let http: HttpTestingController;

  afterEach(() => {
    localStorage.removeItem('rs-auth');
    localStorage.removeItem('rs-guest');
    http.verify();
  });

  function setup(expiresAt: number): AuthService {
    localStorage.setItem('rs-auth', JSON.stringify({ accessToken: 'a', refreshToken: 'r', expiresAt }));
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [provideRouter([]), AuthService]
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(AuthService);
  }

  it('opens a fresh session without waiting for the profile', async () => {
    const auth = setup(Date.now() + 60_000);
    const pending = auth.init();
    const req = http.expectOne(`${environment.apiBaseUrl}/api/auth/me`);
    await pending;
    expect(auth.hasSession()).toBeTrue();
    expect(auth.isSignedIn()).toBeFalse();

    req.flush({ id: '1', email: 'dana@example.com', name: 'Dana Cohen', provider: 'Email' });
    await Promise.resolve();
    expect(auth.displayName()).toBe('Dana');
    expect(auth.isSignedIn()).toBeTrue();
  });

  it('calls logout then clears local session', async () => {
    const auth = setup(Date.now() + 60_000);
    const pending = auth.init();
    http.expectOne(`${environment.apiBaseUrl}/api/auth/me`).flush({ id: '1', email: 'a@b.co', name: null, provider: 'Email' });
    await pending;
    await Promise.resolve();

    const done = auth.signOut();
    const logout = http.expectOne(`${environment.apiBaseUrl}/api/auth/logout`);
    expect(logout.request.body).toEqual({ refreshToken: 'r' });
    logout.flush(null);
    await done;
    expect(auth.hasSession()).toBeFalse();
    expect(localStorage.getItem('rs-auth')).toBeNull();
  });

  it('waits for the profile when the access token is expired', async () => {
    const auth = setup(Date.now() - 1000);
    let settled = false;
    const pending = auth.init().then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBeFalse();
    expect(auth.hasSession()).toBeFalse();

    http.expectOne(`${environment.apiBaseUrl}/api/auth/me`).flush({ id: '1', email: null, name: null, provider: 'Email' });
    await pending;
    expect(auth.isSignedIn()).toBeTrue();
  });

  it('keeps the sign-in when the server cannot be reached while refreshing', async () => {
    const auth = setup(Date.now() - 1000);

    const refreshed = auth.refresh();
    http.expectOne(environment.apiBaseUrl + '/api/auth/refresh').error(new ProgressEvent('error'), { status: 0 });

    expect(await refreshed).toBeFalse();
    expect(localStorage.getItem('rs-auth')).not.toBeNull();
  });

  it('keeps the sign-in when the server answers with an error of its own', async () => {
    const auth = setup(Date.now() - 1000);

    const refreshed = auth.refresh();
    http.expectOne(environment.apiBaseUrl + '/api/auth/refresh').flush(null, { status: 503, statusText: 'Unavailable' });

    expect(await refreshed).toBeFalse();
    expect(localStorage.getItem('rs-auth')).not.toBeNull();
  });

  it('ends the sign-in only when the server refuses the refresh token', async () => {
    const auth = setup(Date.now() - 1000);

    const refreshed = auth.refresh();
    http.expectOne(environment.apiBaseUrl + '/api/auth/refresh').flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(await refreshed).toBeFalse();
    expect(localStorage.getItem('rs-auth')).toBeNull();
  });
});
