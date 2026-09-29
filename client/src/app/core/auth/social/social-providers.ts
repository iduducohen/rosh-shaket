import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { environment } from '../../../../environments/environment';
import { ProviderInfo, SocialCredential, SocialProviderId } from '../auth.models';

// Browser SDK globals (loaded on demand, only when the user taps the button).
declare const google: any;
declare const AppleID: any;

/**
 * One sign-in flow per provider and platform (Strategy). The login page asks for a provider by id
 * and never knows whether a web popup or a native SDK runs behind it.
 */
export interface SocialProvider {
  readonly id: SocialProviderId;
  /** Web popups and most native flows need the public client id from the server. Apple on iOS does not. */
  readonly needsClientId: boolean;
  /** Whether this flow can run here (e.g. Apple has no native flow on Android). */
  isSupported(): boolean;
  getCredential(info: ProviderInfo): Promise<SocialCredential>;
}

export class SignInCancelled extends Error {}

const platform = Capacitor.getPlatform(); // 'web' | 'ios' | 'android'

// ---------------------------------------------------------------- web

const scripts = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  if (!scripts.has(src)) {
    scripts.set(src, new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { scripts.delete(src); reject(new Error(`failed to load ${src}`)); };
      document.head.appendChild(s);
    }));
  }
  return scripts.get(src)!;
}

/** Google web: popup authorization-code flow (custom button). The API exchanges the code. */
class WebGoogleProvider implements SocialProvider {
  readonly id = 'Google' as const;
  readonly needsClientId = true;
  isSupported() { return platform === 'web'; }
  async getCredential(info: ProviderInfo): Promise<SocialCredential> {
    await loadScript('https://accounts.google.com/gsi/client');
    return new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initCodeClient({
        client_id: info.clientId,
        scope: 'openid email profile',
        ux_mode: 'popup',
        callback: (r: { code?: string; error?: string }) => (r.code ? resolve({ code: r.code }) : reject(new Error(r.error))),
        error_callback: (e: { type?: string }) => reject(e?.type === 'popup_closed' ? new SignInCancelled() : new Error(e?.type))
      });
      client.requestCode();
    });
  }
}

/** Apple web: Sign in with Apple JS in popup mode. */
class WebAppleProvider implements SocialProvider {
  readonly id = 'Apple' as const;
  readonly needsClientId = true;
  isSupported() { return platform === 'web'; }
  async getCredential(info: ProviderInfo): Promise<SocialCredential> {
    await loadScript('https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js');
    AppleID.auth.init({ clientId: info.clientId, scope: 'name email', redirectURI: redirectUri(info), usePopup: true });
    try {
      const r = await AppleID.auth.signIn();
      return { idToken: r.authorization.id_token, name: fullName(r.user?.name?.firstName, r.user?.name?.lastName) };
    } catch (e: any) {
      throw e?.error === 'popup_closed_by_user' || e?.error === 'user_cancelled_authorize' ? new SignInCancelled() : e;
    }
  }
}

/** Microsoft web: MSAL popup, loaded lazily to keep the first page light. */
class WebMicrosoftProvider implements SocialProvider {
  readonly id = 'Microsoft' as const;
  readonly needsClientId = true;
  isSupported() { return platform === 'web'; }
  async getCredential(info: ProviderInfo): Promise<SocialCredential> {
    const { PublicClientApplication } = await import('@azure/msal-browser');
    const app = new PublicClientApplication({
      auth: { clientId: info.clientId!, authority: `https://login.microsoftonline.com/${info.tenantId || 'common'}`, redirectUri: redirectUri(info) },
      cache: { cacheLocation: 'sessionStorage' }
    });
    await app.initialize();
    try {
      const r = await app.loginPopup({ scopes: ['openid', 'profile', 'email'], prompt: 'select_account' });
      return { idToken: r.idToken };
    } catch (e: any) {
      throw e?.errorCode === 'user_cancelled' ? new SignInCancelled() : e;
    }
  }
}

// ---------------------------------------------------------------- native (iOS / Android)

let socialLoginReady: Promise<void> | null = null;
async function socialLogin(info: ProviderInfo) {
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  socialLoginReady ??= SocialLogin.initialize({
    google: {
      webClientId: info.provider === 'Google' ? info.clientId ?? undefined : undefined, // Android: token audience = web client id
      iOSClientId: environment.nativeAuth.googleIosClientId || undefined               // iOS: token audience = iOS client id
    },
    apple: { clientId: 'il.roshshaket.app' }
  }).catch((e: unknown) => { socialLoginReady = null; throw e; });
  await socialLoginReady;
  return SocialLogin;
}

const isNativeCancel = (e: any) => /cancel|canceled|cancelled|12501|16:|user denied/i.test(String(e?.message ?? e?.code ?? e));

/** Google native: the OS account picker (Credential Manager on Android, GoogleSignIn on iOS). */
class NativeGoogleProvider implements SocialProvider {
  readonly id = 'Google' as const;
  readonly needsClientId = true;
  isSupported() {
    return platform === 'android' || (platform === 'ios' && !!environment.nativeAuth.googleIosClientId);
  }
  async getCredential(info: ProviderInfo): Promise<SocialCredential> {
    const plugin = await socialLogin(info);
    try {
      const { result } = await plugin.login({ provider: 'google', options: { scopes: ['email', 'profile'] } });
      if (result.responseType !== 'online' || !result.idToken) throw new Error('Google did not return an ID token');
      return { idToken: result.idToken };
    } catch (e) {
      throw isNativeCancel(e) ? new SignInCancelled() : e;
    }
  }
}

/** Apple native: AuthenticationServices on iOS. (Android would need a redirect backend, so it is not offered there.) */
class NativeAppleProvider implements SocialProvider {
  readonly id = 'Apple' as const;
  readonly needsClientId = false;
  isSupported() { return platform === 'ios'; }
  async getCredential(info: ProviderInfo): Promise<SocialCredential> {
    const plugin = await socialLogin(info);
    try {
      const { result } = await plugin.login({ provider: 'apple', options: { scopes: ['email', 'name'] } });
      if (!result.idToken) throw new Error('Apple did not return an ID token');
      return { idToken: result.idToken, name: fullName(result.profile.givenName, result.profile.familyName) };
    } catch (e) {
      throw isNativeCancel(e) ? new SignInCancelled() : e;
    }
  }
}

/** Microsoft native: MSAL for iOS/Android (uses the Authenticator/Company Portal broker when installed). */
class NativeMicrosoftProvider implements SocialProvider {
  readonly id = 'Microsoft' as const;
  readonly needsClientId = true;
  isSupported() {
    return platform === 'ios' || (platform === 'android' && !!environment.nativeAuth.microsoftAndroidKeyHash);
  }
  async getCredential(info: ProviderInfo): Promise<SocialCredential> {
    const { MsAuthPlugin } = await import('@recognizebv/capacitor-plugin-msauth');
    try {
      const r = await MsAuthPlugin.login({
        clientId: info.clientId!,
        tenant: info.tenantId || 'common',
        keyHash: environment.nativeAuth.microsoftAndroidKeyHash || undefined,
        scopes: [],
        prompt: 'select_account'
      });
      return { idToken: r.idToken };
    } catch (e) {
      throw isNativeCancel(e) ? new SignInCancelled() : e;
    }
  }
}

// ---------------------------------------------------------------- registry

@Injectable({ providedIn: 'root' })
export class SocialProviders {
  private readonly all: SocialProvider[] = [
    new NativeGoogleProvider(), new NativeAppleProvider(), new NativeMicrosoftProvider(),
    new WebGoogleProvider(), new WebAppleProvider(), new WebMicrosoftProvider()
  ];

  /** The flow for this provider on the current platform, or null when there is none. */
  get(id: SocialProviderId): SocialProvider | null {
    return this.all.find(p => p.id === id && p.isSupported()) ?? null;
  }

  isSupported(id: SocialProviderId): boolean {
    return this.get(id) !== null;
  }
}

function fullName(first?: string | null, last?: string | null): string | undefined {
  const n = `${first ?? ''} ${last ?? ''}`.trim();
  return n || undefined;
}

function redirectUri(info: ProviderInfo): string {
  return info.redirectUri || `${location.origin}/login`;
}
