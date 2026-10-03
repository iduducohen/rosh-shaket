import { Component, HostListener, NgZone, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
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

/** Must match $T in login.page.scss — the act switches exactly when its loop ends. */
const ACT_MS = 10_000;

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
  private readonly zone = inject(NgZone);

  /** Only providers that have a flow on this platform (web popup or native SDK). */
  readonly socialButtons = ([
    { id: 'Google', label: 'המשך עם Google', icon: 'logo-google' },
    { id: 'Apple', label: 'המשך עם Apple', icon: 'logo-apple' },
    { id: 'Microsoft', label: 'המשך עם Microsoft', icon: 'logo-microsoft' }
  ] as { id: SocialProviderId; label: string; icon: string }[]).filter(b => this.social.isSupported(b.id));

  /** Act 1 — one payslip and its surroundings collapse into one answer. */
  readonly quickSheets: Sheet[] = [
    { label: 'תלוש שכר', x: -128, y: -46, r: -13, tone: '#0E7C6B' },
    { label: 'טופס 101', x: -44, y: -78, r: -4, tone: '#5B6CC2' },
    { label: 'דוח מסלקה', x: 50, y: -56, r: 7, tone: '#C2733B' },
    { label: 'חוזה עבודה', x: 128, y: 6, r: 14, tone: '#8A5A9E' },
    { label: 'טופס 161', x: -8, y: 38, r: -3, tone: '#3F7FA6' }
  ];

  /** Act 2 — the full review: many months of documents become a month-by-month timeline. */
  readonly fullSheets: Sheet[] = [
    { label: 'תלוש 10/23', x: -132, y: -40, r: -12, tone: '#0E7C6B' },
    { label: 'תלוש 03/24', x: -52, y: -80, r: -5, tone: '#0E7C6B' },
    { label: 'טופס 106', x: 46, y: -60, r: 6, tone: '#5B6CC2' },
    { label: 'דוח פנסיה', x: 130, y: 2, r: 13, tone: '#C2733B' },
    { label: 'תלוש 12/25', x: -6, y: 40, r: -3, tone: '#0E7C6B' }
  ];

  /** 36 months; one month without a pension deposit (March 2024) is the finding. */
  readonly timeline = [2023, 2024, 2025].map((year, y) => ({
    year,
    dots: Array.from({ length: 12 }, (_, m) => ({ i: y * 12 + m, bad: year === 2024 && m === 2 }))
  }));

  /** Each act plays one 10s loop, then hands over to the other. */
  readonly act = signal<'quick' | 'full'>('quick');
  private readonly reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private actTimer: ReturnType<typeof setTimeout> | undefined;

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
    this.scheduleNextAct();
    try { this.providers = await this.auth.providers(); } catch { this.providers = []; }
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
    clearTimeout(this.actTimer);
  }

  showAct(act: 'quick' | 'full'): void {
    this.act.set(act);
    this.scheduleNextAct();
  }

  private scheduleNextAct(): void {
    clearTimeout(this.actTimer);
    if (this.reducedMotion) return;
    // A recurring timer inside the zone would keep the app from ever becoming stable.
    this.zone.runOutsideAngular(() => {
      this.actTimer = setTimeout(() => this.zone.run(() => this.showAct(this.act() === 'quick' ? 'full' : 'quick')), ACT_MS);
    });
  }

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
      await this.router.navigateByUrl('/start', { replaceUrl: true });
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
      await this.router.navigateByUrl('/start', { replaceUrl: true });
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
    this.resendIn.set(60);
    this.timer = setInterval(() => {
      this.resendIn.update(s => Math.max(0, s - 1));
      if (this.resendIn() === 0) clearInterval(this.timer);
    }, 1000);
  }
}
