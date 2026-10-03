import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal } from '@angular/core';
import { AlertController } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth/auth.service';
import { PdfUnlocker } from './pdf-open';

/**
 * Passwords for the user's protected PDFs. Signed in: saved (encrypted) in the account, so no device asks
 * twice. Guest: kept in memory until the tab closes.
 */
@Injectable({ providedIn: 'root' })
export class PdfPasswordService implements PdfUnlocker {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly alerts = inject(AlertController);
  private readonly base = `${environment.apiBaseUrl}/api/pdf-passwords`;

  private readonly list = signal<string[]>([]);
  private loading: Promise<void> | null = null;

  /** How many passwords are kept — the account page shows it. */
  readonly count = () => this.list().length;

  constructor() {
    // Signing out (or in as someone else) must not leave the previous user's passwords behind.
    effect(() => {
      this.auth.user();
      if (!this.signedIn()) this.list.set([]);
      this.loading = null;
    }, { allowSignalWrites: true });
  }

  known(): readonly string[] {
    return this.list();
  }

  /** Fetch the account's saved passwords once per session. Soft-fails: the user can still type one. */
  load(): Promise<void> {
    if (!this.signedIn()) return Promise.resolve();
    this.loading ??= firstValueFrom(this.http.get<{ passwords: string[] }>(this.base))
      .then(r => this.list.set(merge(r.passwords, this.list())))
      .catch(() => undefined);
    return this.loading;
  }

  remember(password: string): void {
    if (!password || this.list().includes(password)) return;
    this.list.update(l => [password, ...l]);
    if (this.signedIn()) {
      void firstValueFrom(this.http.post<void>(this.base, { password })).catch(() => undefined);
    }
  }

  async clearAll(): Promise<void> {
    if (this.signedIn()) await firstValueFrom(this.http.delete<void>(this.base));
    this.list.set([]);
  }

  async ask(fileName: string, wrong: boolean, triedSaved: boolean): Promise<string | null> {
    const keep = this.signedIn()
      ? 'נשמור אותה בחשבון, מוצפנת, כדי שלא תצטרכו להזין אותה שוב — גם במכשיר אחר.'
      : 'נזכור אותה עד שתסגרו את הדף.';
    const message = wrong
      ? `הסיסמה של ${fileName} לא נכונה. נסו שוב.`
      : triedSaved
      ? `הסיסמה השמורה לא פותחת את ${fileName} — כנראה יש לו סיסמה אחרת. הזינו את הסיסמה של הקובץ הזה. ${keep}`
      : `הקובץ ${fileName} מוגן בסיסמה. הזינו אותה כדי לקרוא את המסמך. ${keep}`;
    const alert = await this.alerts.create({
      header: triedSaved && !wrong ? 'סיסמה אחרת לקובץ' : 'הקובץ נעול',
      message,
      inputs: [{ name: 'password', type: 'password', placeholder: 'סיסמה', attributes: { autocomplete: 'off' } }],
      buttons: [
        { text: 'ביטול', role: 'cancel' },
        { text: 'פתיחה', role: 'confirm' }
      ],
      backdropDismiss: false
    });
    await alert.present();
    const result = await alert.onDidDismiss();
    if (result.role !== 'confirm') return null;
    return String(result.data?.values?.password ?? '');
  }

  private signedIn(): boolean {
    return this.auth.isSignedIn() || this.auth.hasSession();
  }
}

function merge(fromServer: string[], local: string[]): string[] {
  return [...new Set([...local, ...fromServer])];
}
