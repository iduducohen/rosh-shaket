import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthProvider, Me, ProviderInfo, SocialCredential, TokenResponse } from './auth.models';

const TOKENS_KEY = 'rs-auth';
const GUEST_KEY = 'rs-guest';

interface StoredTokens { accessToken: string; refreshToken: string; expiresAt: number; }

/** Session state and the API calls behind it. Pages never touch tokens directly. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly base = `${environment.apiBaseUrl}/api/auth`;
  private tokens: StoredTokens | null = read<StoredTokens>(TOKENS_KEY);
  private initPromise: Promise<void> | null = null;
  private refreshPromise: Promise<boolean> | null = null;

  readonly user = signal<Me | null>(null);
  readonly guest = signal(localStorage.getItem(GUEST_KEY) === '1');
  /** A still-valid access token, so a refresh can open the app before /me returns. */
  readonly hasSession = signal(this.tokens !== null && this.tokens.expiresAt > Date.now());
  readonly isSignedIn = computed(() => this.user() !== null);
  readonly displayName = computed(() => {
    const u = this.user();
    return u?.name?.split(' ')[0] ?? u?.email?.split('@')[0] ?? null;
  });

  /** Restores the session once per app start (guards await this). */
  init(): Promise<void> {
    this.initPromise ??= this.restore();
    return this.initPromise;
  }

  get accessToken(): string | null { return this.tokens?.accessToken ?? null; }

  providers(): Promise<ProviderInfo[]> {
    return firstValueFrom(this.http.get<ProviderInfo[]>(`${this.base}/providers`));
  }

  async signInWithProvider(provider: AuthProvider, credential: SocialCredential): Promise<void> {
    const res = await firstValueFrom(this.http.post<TokenResponse>(`${this.base}/external`, { provider, ...credential }));
    await this.acceptTokens(res);
  }

  startEmail(email: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.base}/email/start`, { email }));
  }

  async verifyEmail(email: string, code: string): Promise<void> {
    const res = await firstValueFrom(this.http.post<TokenResponse>(`${this.base}/email/verify`, { email, code }));
    await this.acceptTokens(res);
  }

  continueAsGuest(): void {
    this.guest.set(true);
    try { localStorage.setItem(GUEST_KEY, '1'); } catch { /* ignore */ }
  }

  async signOut(): Promise<void> {
    const refreshToken = this.tokens?.refreshToken ?? null;
    try {
      if (refreshToken || this.tokens?.accessToken) {
        await firstValueFrom(this.http.post<void>(`${this.base}/logout`, { refreshToken }));
      }
    } catch { /* always clear local session */ }
    this.clearLocalSession();
  }

  private clearLocalSession(): void {
    this.tokens = null;
    this.hasSession.set(false);
    this.user.set(null);
    this.guest.set(false);
    try { localStorage.removeItem(TOKENS_KEY); localStorage.removeItem(GUEST_KEY); } catch { /* ignore */ }
  }

  /** Single-flight refresh, used by the interceptor on 401. */
  refresh(): Promise<boolean> {
    this.refreshPromise ??= this.doRefresh().finally(() => (this.refreshPromise = null));
    return this.refreshPromise;
  }

  private async doRefresh(): Promise<boolean> {
    if (!this.tokens?.refreshToken) return false;
    try {
      const res = await firstValueFrom(this.http.post<TokenResponse>(`${this.base}/refresh`, { refreshToken: this.tokens.refreshToken }));
      this.store(res);
      return true;
    } catch {
      this.clearLocalSession();
      return false;
    }
  }

  private async acceptTokens(res: TokenResponse): Promise<void> {
    this.store(res);
    this.guest.set(false);
    try { localStorage.removeItem(GUEST_KEY); } catch { /* ignore */ }
    await this.loadMe();
  }

  private store(res: TokenResponse): void {
    this.tokens = { accessToken: res.accessToken, refreshToken: res.refreshToken, expiresAt: Date.now() + res.expiresIn * 1000 };
    this.hasSession.set(true);
    try { localStorage.setItem(TOKENS_KEY, JSON.stringify(this.tokens)); } catch { /* ignore */ }
  }

  private async loadMe(): Promise<void> {
    this.user.set(await firstValueFrom(this.http.get<Me>(`${this.base}/me`)));
  }

  private async restore(): Promise<void> {
    if (!this.tokens) return;
    if (this.hasSession()) {
      void this.revalidate();
      return;
    }
    try {
      await this.loadMe(); // the interceptor refreshes an expired access token
    } catch (err) {
      if (!(err instanceof HttpErrorResponse) || err.status === 401) this.clearLocalSession();
    }
  }

  /** Confirms a still-valid token without blocking the first screen. */
  private async revalidate(): Promise<void> {
    try {
      await this.loadMe();
    } catch (err) {
      if (!(err instanceof HttpErrorResponse) || err.status === 401) {
        this.clearLocalSession();
        void this.router.navigateByUrl('/login');
      }
    }
  }
}

function read<T>(key: string): T | null {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
}
