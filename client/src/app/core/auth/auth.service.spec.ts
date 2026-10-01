import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
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
    const req = http.expectOne('http://localhost:5080/api/auth/me');
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
    http.expectOne('http://localhost:5080/api/auth/me').flush({ id: '1', email: 'a@b.co', name: null, provider: 'Email' });
    await pending;
    await Promise.resolve();

    const done = auth.signOut();
    const logout = http.expectOne('http://localhost:5080/api/auth/logout');
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

    http.expectOne('http://localhost:5080/api/auth/me').flush({ id: '1', email: null, name: null, provider: 'Email' });
    await pending;
    expect(auth.isSignedIn()).toBeTrue();
  });
});
