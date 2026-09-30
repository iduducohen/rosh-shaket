import { Component, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, closeOutline, lockClosedOutline, logoApple, logoGoogle, logoMicrosoft, mailOutline, ribbonOutline, sparklesOutline } from 'ionicons/icons';
import { describeError } from '../core/api.service';
import { AuthService } from '../core/auth/auth.service';
import { ProviderInfo, SocialProviderId } from '../core/auth/auth.models';
import { SignInCancelled, SocialProviders } from '../core/auth/social/social-providers';
import { LogoComponent } from '../core/logo.component';
import { legalDoc } from './legal.page';

interface Sheet { label: string; x: number; y: number; r: number; tone: string; }

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, IonContent, IonIcon, IonSpinner, LogoComponent],
  styleUrl: './login.page.scss',
  templateUrl: './login.page.html'
})
export class LoginPage implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly social = inject(SocialProviders);
  private readonly router = inject(Router);

  /** Only providers that have a flow on this platform (web popup or native SDK). */
  readonly socialButtons = ([
    { id: 'Google', label: 'המשך עם Google', icon: 'logo-google' },
    { id: 'Apple', label: 'המשך עם Apple', icon: 'logo-apple' },
    { id: 'Microsoft', label: 'המשך עם Microsoft', icon: 'logo-microsoft' }
  ] as { id: SocialProviderId; label: string; icon: string }[]).filter(b => this.social.isSupported(b.id));

  /** The pile of paperwork the animation collapses into one answer. */
  readonly sheets: Sheet[] = [
    { label: 'תלוש שכר', x: -128, y: -46, r: -13, tone: '#0E7C6B' },
    { label: 'טופס 101', x: -44, y: -78, r: -4, tone: '#5B6CC2' },
    { label: 'דוח מסלקה', x: 50, y: -56, r: 7, tone: '#C2733B' },
    { label: 'חוזה עבודה', x: 128, y: 6, r: 14, tone: '#8A5A9E' },
    { label: 'טופס 161', x: -8, y: 38, r: -3, tone: '#3F7FA6' }
  ];

  readonly step = signal<'choose' | 'code'>('choose');
  private readonly legalKind = signal<'terms' | 'privacy' | null>(null);
  readonly legal = computed(() => {
    const kind = this.legalKind();
    return kind ? legalDoc(kind) : null;
  });
  readonly busy = signal<string | null>(null);
  readonly error = signal('');
  readonly resendIn = signal(0);
  email = '';
  code = '';

  private providers: ProviderInfo[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    addIcons({ logoGoogle, logoApple, logoMicrosoft, mailOutline, arrowBackOutline, closeOutline, lockClosedOutline, ribbonOutline, sparklesOutline });
  }

  async ngOnInit(): Promise<void> {
    try { this.providers = await this.auth.providers(); } catch { this.providers = []; }
  }

  ngOnDestroy(): void { clearInterval(this.timer); }

  async withProvider(id: SocialProviderId): Promise<void> {
    this.error.set('');
    const info = this.providers.find(p => p.provider === id);
    const flow = this.social.get(id);
    if (!flow || !info?.enabled || (flow.needsClientId && !info.clientId)) {
      this.error.set(`ההתחברות עם ${id} עוד לא הוגדרה בשרת. בינתיים אפשר להיכנס עם אימייל.`);
      return;
    }
    this.busy.set(id);
    try {
      const credential = await flow.getCredential(info);
      await this.auth.signInWithProvider(id, credential);
      await this.router.navigateByUrl('/details', { replaceUrl: true });
    } catch (err) {
      if (!(err instanceof SignInCancelled)) this.error.set(describeError(err).message);
    } finally {
      this.busy.set(null);
    }
  }

  async sendCode(): Promise<void> {
    this.error.set('');
    if (!/^\S+@\S+\.\S+$/.test(this.email.trim())) { this.error.set('הכניסו כתובת אימייל תקינה.'); return; }
    this.busy.set('email');
    try {
      await this.auth.startEmail(this.email.trim());
      this.code = '';
      this.step.set('code');
      this.startCooldown();
    } catch (err) {
      this.error.set(describeError(err).message);
    } finally {
      this.busy.set(null);
    }
  }

  async verify(): Promise<void> {
    this.error.set('');
    if (!/^\d{6}$/.test(this.code.trim())) { this.error.set('הקוד הוא 6 ספרות.'); return; }
    this.busy.set('verify');
    try {
      await this.auth.verifyEmail(this.email.trim(), this.code.trim());
      await this.router.navigateByUrl('/details', { replaceUrl: true });
    } catch (err) {
      this.error.set(describeError(err).message);
    } finally {
      this.busy.set(null);
    }
  }

  onCodeInput(): void {
    this.code = this.code.replace(/\D/g, '').slice(0, 6);
    if (this.code.length === 6 && !this.busy()) this.verify();
  }

  changeEmail(): void { this.step.set('choose'); this.error.set(''); }

  openLegal(kind: 'terms' | 'privacy' | null): void { this.legalKind.set(kind); }

  @HostListener('document:keydown.escape')
  closeLegal(): void { this.legalKind.set(null); }

  guest(): void {
    this.auth.continueAsGuest();
    this.router.navigateByUrl('/start', { replaceUrl: true });
  }

  private startCooldown(): void {
    clearInterval(this.timer);
    this.resendIn.set(30);
    this.timer = setInterval(() => {
      this.resendIn.update(s => Math.max(0, s - 1));
      if (this.resendIn() === 0) clearInterval(this.timer);
    }, 1000);
  }
}
