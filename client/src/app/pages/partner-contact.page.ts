import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonSpinner, ViewWillEnter } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, linkOutline, logoWhatsapp, mailOutline } from 'ionicons/icons';
import { ApiService, describeError, PartnerOffer, PartnerReview } from '../core/api.service';
import { AuthService } from '../core/auth/auth.service';
import { StarsComponent } from '../core/stars.component';
import { DeskHeaderComponent } from '../core/desk-header.component';
import { REASON_LABELS } from '../core/models';
import { SITE_NAME } from '../core/seo';
import { WizardStore } from '../core/wizard.store';

type HelpKind = 'Professional' | 'Lawyer';

@Component({
  selector: 'app-partner-contact',
  standalone: true,
  imports: [DeskHeaderComponent, FormsModule, RouterLink, IonContent, IonButton, IonIcon, IonSpinner, StarsComponent],
  styles: [`
    .reviews h3 { margin: 0 0 6px; }
    .review { padding: 10px 0; border-bottom: 1px solid var(--rs-line); }
    .review:last-child { border-bottom: 0; }
    .review .who { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 13.5px; color: var(--ion-color-medium); }
    .review .who b { color: var(--ion-text-color); }
    .review p { margin: 6px 0 0; font-size: 14.5px; line-height: 1.5; white-space: pre-line; }
    .mine-form { display: grid; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--rs-line); }
    .mine-form textarea { min-height: 80px; }
    .mine-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .mine-actions ion-button { margin: 0; }
    .card {
      background: var(--ion-item-background); border: 1px solid var(--rs-line);
      border-radius: 16px; padding: 18px; margin-bottom: 16px;
    }
    h3 { margin: 0 0 6px; font-family: var(--rs-serif); font-size: 22px; }
    .specialty { color: var(--ion-color-primary); font-weight: 700; margin: 0 0 8px; }
    .badges { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
    .badge {
      font-size: 12px; font-weight: 700; color: var(--ion-color-primary); background: var(--rs-soft);
      border-radius: 999px; padding: 2px 8px;
    }
    .recs { margin: 8px 0 0; padding: 0 18px; display: grid; gap: 4px; color: var(--ion-color-medium); font-size: 14px; }
    .site {
      display: inline-flex; align-items: center; gap: 6px; margin-top: 10px; font-weight: 700;
      color: var(--ion-color-primary); text-decoration: underline; text-underline-offset: 3px;
    }
    form { display: grid; gap: 10px; }
    label { font-weight: 700; font-size: 14px; }
    input, textarea {
      width: 100%; font: inherit; color: var(--ion-text-color); background: var(--ion-background-color);
      border: 1px solid var(--rs-line); border-radius: 12px; padding: 10px 12px;
    }
    textarea { min-height: 80px; resize: vertical; }
    .field-error { color: var(--rs-warn); font-size: 13px; margin-top: -6px; }
    button.send {
      font: inherit; font-weight: 700; cursor: pointer; border: 0; border-radius: 12px; padding: 12px 16px;
      background: var(--ion-color-primary); color: var(--ion-color-primary-contrast);
    }
    button.send:disabled { opacity: .6; cursor: default; }
    .channels { display: flex; flex-wrap: wrap; gap: 8px; }
    .channel {
      flex: 1; min-width: 140px; display: flex; align-items: center; justify-content: center; gap: 8px;
      text-decoration: none; font-weight: 700; border-radius: 12px; padding: 12px 16px;
    }
    .channel.mail { background: var(--ion-color-primary); color: var(--ion-color-primary-contrast); }
    .channel.wa { background: #25D366; color: #fff; }
    .preview {
      white-space: pre-wrap; font: inherit; font-size: 14px; margin: 0;
      background: var(--rs-soft); border-radius: 12px; padding: 12px 14px;
    }
    .done b { display: block; margin-bottom: 4px; }
  `],
  template: `
    <ion-content>
      <app-desk-header [step]="headerStep()" [tabs]="!!store.results().length"></app-desk-header>
      <div class="page narrow ion-padding">
        <ion-button fill="clear" [routerLink]="listLink()">
          <ion-icon slot="start" name="arrow-back-outline"></ion-icon>
          חזרה לרשימה
        </ion-button>

        @if (busyLoad()) {
          <p><ion-spinner name="crescent"></ion-spinner> טוענים…</p>
        } @else if (loadError()) {
          <div class="note">{{ loadError() }}</div>
        } @else if (sent()) {
          <div class="card done">
            <b>קיבלנו את הבקשה.</b>
            <p class="muted">נחזור אליכם עם היקף העזרה והמחיר. אין תשלום עד שתאשרו.</p>
            <ion-button routerLink="/results/summary">חזרה לתוצאה</ion-button>
          </div>
        } @else {
          @if (partner(); as p) {
            <div class="card">
              <h3>{{ p.name }}</h3>
              @if (p.specialty) { <p class="specialty">{{ p.specialty }}</p> }
              <div class="badges">
                @if (p.cooperation) { <span class="badge">שיתוף פעולה</span> }
                @if (p.discountPercent > 0) { <span class="badge">הנחה {{ p.discountPercent }}%</span> }
              </div>
              @if (p.summary) { <p class="muted" style="margin:0">{{ p.summary }}</p> }
              @if (p.recommendations?.length) {
                <ul class="recs">
                  @for (r of p.recommendations; track r) { <li>{{ r }}</li> }
                </ul>
              }
              @if (p.website) {
                <a class="site" [href]="p.website" target="_blank" rel="noopener noreferrer">
                  <ion-icon name="link-outline" aria-hidden="true"></ion-icon>
                  לאתר / מידע נוסף
                </a>
              }
            </div>

            <div class="card reviews">
              <h3>דירוגים ותגובות</h3>
              <app-stars [value]="p.ratingAverage ?? 0" [count]="p.ratingCount ?? 0" />
              @for (r of reviews(); track r.displayName + r.updatedAt) {
                <div class="review">
                  <div class="who">
                    <b>{{ r.mine ? 'התגובה שלכם' : r.displayName }}</b>
                    <app-stars [value]="r.rating" />
                    <span>{{ dateLabel(r.updatedAt) }}</span>
                  </div>
                  @if (r.text) { <p>{{ r.text }}</p> }
                </div>
              } @empty {
                <p class="muted small">עוד אין תגובות. אם פניתם אליהם — ספרו לאחרים איך היה.</p>
              }

              @if (signedIn()) {
                <form class="mine-form" (ngSubmit)="saveReview()">
                  <b>{{ myReview() ? 'עדכון הדירוג שלכם' : 'פניתם אליהם? דרגו' }}</b>
                  <app-stars [editable]="true" [(value)]="myRating" />
                  <textarea name="reviewText" [(ngModel)]="myText" maxlength="1000" placeholder="מה עבד, מה פחות, האם הייתם ממליצים (רשות)" [disabled]="reviewBusy()"></textarea>
                  @if (reviewError()) { <div class="note">{{ reviewError() }}</div> }
                  <div class="mine-actions">
                    <ion-button type="submit" [disabled]="reviewBusy() || myRating() < 1">{{ myReview() ? 'עדכון' : 'פרסום הדירוג' }}</ion-button>
                    @if (myReview()) { <ion-button fill="outline" color="danger" (click)="deleteReview()" [disabled]="reviewBusy()">מחיקת הדירוג</ion-button> }
                  </div>
                  <p class="muted small">התגובה מוצגת לכולם עם השם הפרטי והאות הראשונה של שם המשפחה בלבד.</p>
                </form>
              } @else {
                <p class="muted small"><a routerLink="/login">התחברו</a> כדי לדרג ולכתוב תגובה.</p>
              }
            </div>

            <div class="card">
              <h3>השאירו פרטים להמשך</h3>
              <p class="muted small">נצרף את סכום ההערכה ואת סיבת העזיבה, בלי תמונת התלוש.</p>
              <form (ngSubmit)="submit()">
                <label for="help-name">שם</label>
                <input id="help-name" name="name" autocomplete="name" [(ngModel)]="name" [disabled]="busy()">
                @if (fieldErrors()['name']) { <div class="field-error">{{ fieldErrors()['name'] }}</div> }

                <label for="help-phone">טלפון</label>
                <input id="help-phone" name="phone" type="tel" dir="ltr" autocomplete="tel" [(ngModel)]="phone" [disabled]="busy()">
                @if (fieldErrors()['phone']) { <div class="field-error">{{ fieldErrors()['phone'] }}</div> }

                <label for="help-email">אימייל</label>
                <input id="help-email" name="email" type="email" dir="ltr" autocomplete="email" [(ngModel)]="email" [disabled]="busy()">
                @if (fieldErrors()['email']) { <div class="field-error">{{ fieldErrors()['email'] }}</div> }

                <label for="help-note">מה חשוב שיבדקו</label>
                <textarea id="help-note" name="note" [(ngModel)]="note" [disabled]="busy()" placeholder="למשל פער בפיצויים, או סירוב של המעסיק"></textarea>

                @if (error()) { <div class="note">{{ error() }}</div> }

                <button type="submit" class="send" [disabled]="busy()">
                  @if (busy()) { <ion-spinner name="crescent"></ion-spinner> } @else { בקשו שיחזרו אליי }
                </button>

                @if (p.email || p.whatsapp) {
                  <p class="muted small">או לשלוח ישירות אל {{ p.name }}</p>
                  <pre class="preview">{{ message() }}</pre>
                  <div class="channels">
                    @if (p.email) {
                      <a class="channel mail" [href]="mailHref(p)" (click)="contact('Email', $event)">
                        <ion-icon name="mail-outline" aria-hidden="true"></ion-icon> מייל
                      </a>
                    }
                    @if (p.whatsapp) {
                      <a class="channel wa" [href]="whatsappHref(p)" target="_blank" rel="noopener" (click)="contact('WhatsApp', $event)">
                        <ion-icon name="logo-whatsapp" aria-hidden="true"></ion-icon> וואטסאפ
                      </a>
                    }
                  </div>
                }
                <p class="muted small">זו לא התחייבות ולא ייעוץ משפטי. התשלום על העזרה נפרד ומסכמים אותו לפני שמתחילים.</p>
              </form>
            </div>
          }
        }
      </div>
    </ion-content>
  `
})
export class PartnerContactPage implements ViewWillEnter {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly store = inject(WizardStore);
  private readonly auth = inject(AuthService);

  readonly reviews = signal<PartnerReview[]>([]);
  readonly myReview = computed(() => this.reviews().find(r => r.mine) ?? null);
  readonly myRating = signal(0);
  myText = '';
  readonly reviewBusy = signal(false);
  readonly reviewError = signal('');
  readonly signedIn = () => this.auth.isSignedIn() || this.auth.hasSession();

  readonly kind = signal<HelpKind>('Professional');
  readonly partner = signal<PartnerOffer | null>(null);
  readonly busyLoad = signal(false);
  readonly busy = signal(false);
  readonly sent = signal(false);
  readonly loadError = signal('');
  readonly error = signal('');
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly headerStep = computed(() => this.store.results().length ? 4 : 3);

  name = '';
  phone = '';
  email = '';
  note = '';

  constructor() {
    addIcons({ arrowBackOutline, linkOutline, mailOutline, logoWhatsapp });
  }

  ionViewWillEnter(): void {
    const segment = this.route.snapshot.paramMap.get('kind');
    const id = this.route.snapshot.paramMap.get('id');
    if (segment !== 'professionals' && segment !== 'lawyers') {
      this.loadError.set('עמוד לא נמצא.');
      return;
    }
    this.kind.set(segment === 'lawyers' ? 'Lawyer' : 'Professional');
    void this.load(id);
  }

  listLink(): string {
    return this.kind() === 'Lawyer' ? '/help/lawyers' : '/help/professionals';
  }

  private async load(id: string | null): Promise<void> {
    if (!id) {
      this.loadError.set('לא נבחר בעל מקצוע.');
      return;
    }
    this.busyLoad.set(true);
    this.loadError.set('');
    try {
      const list = await this.api.partners(this.kind());
      const found = list.find(p => p.id === id) ?? null;
      this.partner.set(found);
      if (!found) this.loadError.set('בעל המקצוע לא נמצא ברשימה.');
      else await this.loadReviews(found.id);
    } catch (err) {
      this.loadError.set(describeError(err).message);
    } finally {
      this.busyLoad.set(false);
    }
  }

  private async loadReviews(partnerId: string): Promise<void> {
    try {
      this.reviews.set(await this.api.partnerReviews(partnerId));
    } catch {
      this.reviews.set([]);
    }
    const mine = this.myReview();
    this.myRating.set(mine?.rating ?? 0);
    this.myText = mine?.text ?? '';
  }

  /** Re-read the partner too, so the average and count update with the new review. */
  private async refreshPartner(id: string): Promise<void> {
    const list = await this.api.partners(this.kind()).catch(() => null);
    const found = list?.find(p => p.id === id);
    if (found) this.partner.set(found);
    await this.loadReviews(id);
  }

  async saveReview(): Promise<void> {
    const p = this.partner();
    if (!p || this.myRating() < 1) return;
    this.reviewBusy.set(true);
    this.reviewError.set('');
    try {
      await this.api.saveReview(p.id, this.myRating(), this.myText.trim());
      await this.refreshPartner(p.id);
    } catch (err) {
      this.reviewError.set(describeError(err).message);
    } finally {
      this.reviewBusy.set(false);
    }
  }

  async deleteReview(): Promise<void> {
    const p = this.partner();
    if (!p) return;
    this.reviewBusy.set(true);
    try {
      await this.api.deleteReview(p.id);
      await this.refreshPartner(p.id);
    } catch (err) {
      this.reviewError.set(describeError(err).message);
    } finally {
      this.reviewBusy.set(false);
    }
  }

  dateLabel(iso: string): string {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
  }

  async submit(): Promise<void> {
    const errors = this.validate();
    this.fieldErrors.set(errors);
    this.error.set('');
    if (Object.keys(errors).length) return;
    await this.send(null);
  }

  contact(channel: 'Email' | 'WhatsApp', event: Event): void {
    const errors = this.validate();
    this.fieldErrors.set(errors);
    this.error.set('');
    if (Object.keys(errors).length) {
      event.preventDefault();
      return;
    }
    // Record the lead, then let the browser open mail/WhatsApp.
    void this.send(channel, { keepChannelOpen: true });
  }

  message(): string {
    const active = this.store.active();
    const reason = active?.reason ? REASON_LABELS[active.reason] : null;
    const p = this.partner();
    const lines = [
      'שלום,',
      `פונים אליכם מ${SITE_NAME}.`,
      '',
      `שם: ${this.name.trim()}`,
      `טלפון: ${this.phone.trim()}`,
      `אימייל: ${this.email.trim()}`
    ];
    if (p) lines.push(`פנייה אל: ${p.name}`);
    if (reason) lines.push(`סיבת העזיבה: ${reason}`);
    if (active) {
      lines.push(`סכום ההערכה: ₪${new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(active.estimatedTotal)}`);
      lines.push(`ותק: ${new Intl.NumberFormat('he-IL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(active.seniorityYears)} שנים`);
    }
    if (this.note.trim()) lines.push(`מה חשוב שיבדקו: ${this.note.trim()}`);
    lines.push('', `ההודעה יצאה מ${SITE_NAME}.`);
    return lines.join('\n');
  }

  mailHref(partner: PartnerOffer): string {
    return `mailto:${partner.email}?subject=${encodeURIComponent('פנייה מ' + SITE_NAME)}&body=${encodeURIComponent(this.message())}`;
  }

  whatsappHref(partner: PartnerOffer): string {
    return `https://wa.me/${partner.whatsapp}?text=${encodeURIComponent(this.message())}`;
  }

  private async send(channel: 'Email' | 'WhatsApp' | null, opts?: { keepChannelOpen?: boolean }): Promise<void> {
    const active = this.store.active();
    const p = this.partner();
    if (!p) return;
    this.busy.set(true);
    try {
      await this.api.requestPaidHelp({
        kind: this.kind(),
        name: this.name.trim(),
        phone: this.phone.trim(),
        email: this.email.trim(),
        note: this.note.trim() || null,
        reason: active?.reason ?? null,
        estimatedTotal: active?.estimatedTotal ?? null,
        partnerId: p.id,
        channel
      });
      if (!opts?.keepChannelOpen) this.sent.set(true);
    } catch (err) {
      const described = describeError(err);
      this.error.set(described.message);
      this.fieldErrors.set(described.fields);
    } finally {
      this.busy.set(false);
    }
  }

  private validate(): Record<string, string> {
    const errors: Record<string, string> = {};
    if (this.name.trim().length < 2) errors['name'] = 'הכניסו שם.';
    const digits = this.phone.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 15) errors['phone'] = 'הכניסו מספר טלפון.';
    if (!/^\S+@\S+\.\S+$/.test(this.email.trim())) errors['email'] = 'הכניסו כתובת אימייל תקינה.';
    return errors;
  }
}
