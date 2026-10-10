import { Component, HostListener, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkOutline, closeOutline, copyOutline, logoFacebook, logoInstagram, logoLinkedin, logoWhatsapp, logoX, mailOutline, paperPlaneOutline, shareSocialOutline } from 'ionicons/icons';
import { AuthService } from '../core/auth/auth.service';
import { LogoComponent } from '../core/logo.component';
import { FAQ, SHARE_TEXT, SITE_NAME } from '../core/seo';
import { SiteFooterComponent } from '../core/site-footer.component';

interface ShareTarget {
  id: string;
  label: string;
  icon: string;
  color: string;
  href: (url: string) => string;
}

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [SiteFooterComponent, IonContent, IonButton, IonIcon, RouterLink, LogoComponent],
  styles: [`
    .hero {
      position: relative; overflow: hidden; color: #F3F1EA;
      background:
        radial-gradient(110% 80% at 85% 0%, rgba(20, 150, 127, .35) 0%, transparent 60%),
        radial-gradient(90% 70% at 0% 100%, rgba(242, 169, 59, .12) 0%, transparent 55%),
        linear-gradient(160deg, var(--rs-ink-2) 0%, var(--rs-ink) 72%);
      padding: calc(28px + env(safe-area-inset-top, 0px)) 22px 36px;
    }
    .hero-inner, .band, .section { width: min(1120px, 100%); margin: 0 auto; }
    .hero h1 { color: #fff; font-size: 40px; margin: 18px 0 10px; }
    .hero .lead { margin: 0; max-width: 38ch; color: rgba(243, 241, 234, .78); font-size: 18px; }
    .actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-top: 22px; }
    .actions ion-button { margin: 0; }
    .ghost { color: #F3F1EA; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }
    .steps { display: flex; flex-direction: column; gap: 8px; list-style: none; padding: 0; margin: 26px 0 0; }
    .steps li { display: flex; gap: 10px; align-items: baseline; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.08); border-radius: 12px; padding: 12px 14px; font-size: 15px; }
    .steps span { color: var(--rs-accent); font-weight: 700; }
    .section { padding: 28px 22px 8px; }
    .section h2 { margin-bottom: 14px; }
    .cards { display: grid; gap: 12px; }
    .cards article, .faq details {
      background: var(--ion-item-background); border: 1px solid var(--rs-line); border-radius: 16px; padding: 16px 18px;
    }
    .cards h3 { margin: 0 0 6px; font-size: 18px; font-family: var(--rs-serif); }
    .cards p, .faq p, .share p { margin: 0; }
    .faq { display: grid; gap: 10px; }
    .faq summary { cursor: pointer; font-weight: 700; }
    .faq p { margin-top: 8px; }
    .share {
      margin: 8px 22px calc(28px + env(safe-area-inset-bottom, 0px));
      padding: 18px; border-radius: 16px; background: var(--rs-soft);
    }
    .share h2 { margin: 0 0 6px; font-size: 22px; }
    .share-cta { margin-top: 16px; width: 100%; font-weight: 700; --padding-top: 14px; --padding-bottom: 14px; font-size: 17px; }
    .share-backdrop {
      position: fixed; inset: 0; z-index: 20; background: rgba(11, 31, 38, .48);
      display: flex; align-items: flex-end; justify-content: center; padding: 12px;
    }
    /* The title and close button stay in view; only .share-body scrolls. */
    .share-sheet {
      width: min(440px, 100%); max-height: min(85vh, 720px);
      display: flex; flex-direction: column; overflow: hidden;
      background: var(--ion-background-color); color: var(--ion-text-color);
      border-radius: 18px; box-shadow: 0 18px 50px rgba(0, 0, 0, .28);
    }
    .share-head {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      flex: none; padding: 14px 16px 10px; border-bottom: 1px solid var(--rs-line);
    }
    .share-body {
      flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
      padding: 0 16px calc(16px + env(safe-area-inset-bottom, 0px));
    }
    .share-head h2 { margin: 0; font-size: 22px; }
    .share-close {
      background: none; border: 0; color: var(--ion-color-medium); cursor: pointer;
      width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center;
    }
    .share-list { display: grid; gap: 8px; margin-top: 14px; }
    .share-list a, .share-list button {
      display: flex; align-items: center; gap: 12px; width: 100%; text-align: start;
      font: inherit; font-weight: 700; font-size: 16px; text-decoration: none; cursor: pointer;
      color: var(--ion-text-color); background: var(--ion-item-background);
      border: 1px solid var(--rs-line); border-radius: 12px; padding: 12px 14px;
    }
    .share-list ion-icon { font-size: 22px; flex: none; }
    .share-note { margin: 12px 0 0; font-size: 14px; }
    .note { margin: 18px 22px 0; }
    .note a { font-weight: 700; margin-inline-start: 6px; }
    @media (min-width: 992px) {
      .hero { padding: 56px 32px 48px; }
      .hero-inner { display: grid; grid-template-columns: 1.2fr .8fr; gap: 40px; align-items: end; }
      .steps { flex-direction: row; }
      .hero h1 { font-size: 64px; }
      .section { padding: 48px 32px 8px; }
      .cards { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
      .share, .note { margin-left: 32px; margin-right: 32px; }
      .share { padding: 28px; }
      .share-cta { width: 240px; }
      .share-backdrop { align-items: center; }
    }
  `],
  template: `
    <ion-content>
      <header class="hero">
        <div class="hero-inner">
          <div>
            <app-logo tone="light" [size]="36" [wordmark]="false"></app-logo>
            <h1>יוצאים בראש שקט</h1>
            <p class="lead">זכויות בסיום עבודה, בלי ערימת ניירת. צלמו תלוש, ענו על שאלה אחת, ותדעו מה מגיע לכם ומה לעשות לפני היום האחרון.</p>
            <div class="actions">
              <ion-button (click)="start()">להתחיל בלי חשבון</ion-button>
              <a class="ghost" routerLink="/login">להתחבר ולשמור תוצאות</a>
            </div>
          </div>
          <ol class="steps">
            <li><span>1</span>מצלמים תלוש</li>
            <li><span>2</span>עונים על שאלה אחת</li>
            <li><span>3</span>מקבלים תשובה</li>
          </ol>
        </div>
      </header>

      <section class="section" aria-labelledby="get-heading">
        <h2 id="get-heading">מה מקבלים</h2>
        <div class="cards">
          <article>
            <h3>מה מגיע לי</h3>
            <p class="muted">הערכה של פיצויים, פדיון חופשה, דמי הבראה והודעה מוקדמת, עם הסבר לכל סכום.</p>
          </article>
          <article>
            <h3>מה לבקש לפני שעוזבים</h3>
            <p class="muted">צ'קליסט שמתאים לסיבת העזיבה: פיטורים, התפטרות, סיום חוזה או השוואה.</p>
          </article>
          <article>
            <h3>מה עושים אחרי</h3>
            <p class="muted">אבטלה, פנסיה וקרן השתלמות, עם קישור למקור הרשמי.</p>
          </article>
        </div>
      </section>

      <section class="section" aria-labelledby="faq-heading">
        <h2 id="faq-heading">שאלות נפוצות</h2>
        <div class="faq">
          @for (item of faq; track item.question) {
            <details>
              <summary>{{ item.question }}</summary>
              <p>{{ item.answer }}</p>
            </details>
          }
        </div>
      </section>

      <p class="note">הערכה בלבד, לא ייעוץ משפטי. מותאם לעובד בשכר חודשי. המסמכים לא נשמרים.
        <a routerLink="/terms">תנאי השימוש</a> · <a routerLink="/privacy">מדיניות הפרטיות</a>
      </p>

      <section class="share" aria-labelledby="share-heading">
        <h2 id="share-heading">מכירים מישהו שעוזב עבודה?</h2>
        <p class="muted">שלחו את הקישור למי שעוזב עבודה. זה לוקח כמה שניות.</p>
        <ion-button class="share-cta" (click)="openShare()" [attr.aria-expanded]="shareOpen()">
          <ion-icon slot="start" name="share-social-outline" aria-hidden="true"></ion-icon>
          שתף
        </ion-button>
      </section>
      <app-site-footer></app-site-footer>
    </ion-content>

    @if (shareOpen()) {
        <div class="share-backdrop" (click)="closeShare()">
          <div class="share-sheet" role="dialog" aria-modal="true" aria-labelledby="share-dialog-title" (click)="$event.stopPropagation()">
            <div class="share-head">
              <h2 id="share-dialog-title">שתפו את הקישור</h2>
              <button type="button" class="share-close" (click)="closeShare()" aria-label="סגירה">
                <ion-icon name="close-outline" aria-hidden="true"></ion-icon>
              </button>
            </div>
            <div class="share-body">
            <div class="share-list">
              @for (target of targets; track target.id) {
                <a [href]="target.href(pageUrl)" target="_blank" rel="noopener noreferrer" (click)="closeShare()">
                  <ion-icon [name]="target.icon" [style.color]="target.color" aria-hidden="true"></ion-icon>
                  {{ target.label }}
                </a>
              }
              <button type="button" (click)="shareInstagram()">
                <ion-icon name="logo-instagram" style="color:#E4405F" aria-hidden="true"></ion-icon>
                Instagram
              </button>
              <button type="button" (click)="copy()">
                <ion-icon [name]="copied() ? 'checkmark-outline' : 'copy-outline'" aria-hidden="true"></ion-icon>
                {{ copied() ? 'הקישור הועתק' : 'העתקת קישור' }}
              </button>
            </div>
            @if (instagramNote()) { <p class="share-note muted">{{ instagramNote() }}</p> }
            </div>
          </div>
        </div>
      }
  `
})
export class LandingPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  constructor() {
    addIcons({ logoWhatsapp, logoFacebook, logoInstagram, logoLinkedin, logoX, paperPlaneOutline, mailOutline, copyOutline, checkmarkOutline, shareSocialOutline, closeOutline });
  }

  readonly faq = FAQ;
  readonly copied = signal(false);
  readonly shareOpen = signal(false);
  readonly instagramNote = signal('');
  readonly pageUrl = `${location.origin}/`;

  readonly targets: readonly ShareTarget[] = [
    { id: 'whatsapp', label: 'WhatsApp', icon: 'logo-whatsapp', color: '#25D366', href: url => `https://wa.me/?text=${q(SHARE_TEXT + ' ' + url)}` },
    { id: 'facebook', label: 'Facebook', icon: 'logo-facebook', color: '#1877F2', href: url => `https://www.facebook.com/sharer/sharer.php?u=${q(url)}` },
    { id: 'linkedin', label: 'LinkedIn', icon: 'logo-linkedin', color: '#0A66C2', href: url => `https://www.linkedin.com/sharing/share-offsite/?url=${q(url)}` },
    { id: 'x', label: 'X', icon: 'logo-x', color: 'var(--ion-text-color)', href: url => `https://twitter.com/intent/tweet?text=${q(SHARE_TEXT)}&url=${q(url)}` },
    { id: 'telegram', label: 'Telegram', icon: 'paper-plane-outline', color: '#229ED9', href: url => `https://t.me/share/url?url=${q(url)}&text=${q(SHARE_TEXT)}` },
    { id: 'email', label: 'מייל', icon: 'mail-outline', color: 'var(--ion-color-primary)', href: url => `mailto:?subject=${q(SITE_NAME)}&body=${q(SHARE_TEXT + '\n' + url)}` }
  ];

  start(): void {
    this.auth.continueAsGuest();
    void this.router.navigateByUrl('/start');
  }

  openShare(): void {
    this.instagramNote.set('');
    this.copied.set(false);
    this.shareOpen.set(true);
  }

  closeShare(): void {
    this.shareOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.shareOpen()) this.closeShare();
  }

  async shareInstagram(): Promise<void> {
    window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
    await this.writeLink();
    this.instagramNote.set('הקישור הועתק. הדביקו אותו בסטורי, בפוסט או בהודעה.');
  }

  async copy(): Promise<void> {
    await this.writeLink();
    this.copied.set(true);
    this.instagramNote.set('');
  }

  private async writeLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.pageUrl);
    } catch {
      const input = document.createElement('input');
      input.value = this.pageUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
    }
  }
}

function q(value: string): string {
  return encodeURIComponent(value);
}
