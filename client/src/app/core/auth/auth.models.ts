export type AuthProvider = 'Google' | 'Apple' | 'Microsoft' | 'Email';
export type SocialProviderId = Exclude<AuthProvider, 'Email'>;

export interface ProviderInfo {
  provider: AuthProvider;
  enabled: boolean;
  clientId: string | null;
  redirectUri?: string | null;
  tenantId?: string | null;
}

/** What a provider popup returns; sent to the API, which verifies it. */
export interface SocialCredential { idToken?: string; code?: string; name?: string; }

export interface TokenResponse { tokenType: string; accessToken: string; expiresIn: number; refreshToken: string; }

export interface Me { id: string; email: string | null; name: string | null; provider: AuthProvider | null; }
