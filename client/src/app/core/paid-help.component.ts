import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { logoWhatsapp, mailOutline, briefcaseOutline, scaleOutline } from 'ionicons/icons';
import { ApiService, describeError, PartnerOffer } from './api.service';
import { REASON_LABELS } from './models';
import { SITE_NAME } from './seo';
import { WizardStore } from './wizard.store';

type HelpKind = 'Professional' | 'Lawyer';

@Component({
  selector: 'app-paid-help',
  standalone: true,
  imports: [FormsModule, IonIcon, IonSpinner],
  styles: [`
    :host { display: block; margin-top: 22px; }
    .card {
      background: var(--ion-item-background); border: 1px solid var(--rs-line); border-radius: 16px; padding: 18px;
    }
    h3 { margin: 0 0 6px; font-family: var(--rs-serif); font-size: 22px; }
    .kinds { display: grid; gap: 8px; margin-top: 14px; }
    @media (min-width: 640px) { .kinds { grid-template-columns: 1fr 1fr; } }
    .kind {
      display: flex; align-items: flex-start; gap: 10px; text-align: start; font: inherit; cursor: pointer;
      background: var(--ion-background-color); color: var(--ion-text-color);
      border: 1.5px solid var(--rs-line); border-radius: 14px; padding: 12px 14px;
    }
    .kind ion-icon { font-size: 22px; color: var(--ion-color-primary); flex: none; margin-top: 2px; }
    .kind b { display: block; }
    .kind small { display: block; color: var(--ion-color-medium); font-size: 13.5px; margin-top: 2px; }
    .kind.on { border-color: var(--ion-color-primary); background: var(--rs-soft); }
    form { display: grid; gap: 10px; margin-top: 14px; }
    label { font-weight: 700; font-size: 14px; }
    input, textarea {
      width: 100%; font: inherit; color: var(--ion-text-color); background: var(--ion-background-color);
      border: 1px solid var(--rs-line); border-radius: 12px; padding: 10px 12px;
    }
    textarea { min-height: 72px; resize: vertical; }
    .field-error { color: var(--rs-warn); font-size: 13px; margin-top: -6px; }
    button.send {
      font: inherit; font-weight: 700; cursor: pointer; border: 0; border-radius: 12px; padding: 12px 16px;
      background: var(--ion-color-primary); color: var(--ion-color-primary-contrast);
    }
    button.send:disabled { opacity: .6; cursor: default; }
    .done b { display: block; margin-bottom: 4px; }
    .partners { display: grid; gap: 8px; margin-top: 12px; }
    .partner {
      display: grid; gap: 4px; text-align: start; font: inherit; cursor: pointer;
      background: var(--ion-background-color); color: var(--ion-text-color);
      border: 1.5px solid var(--rs-line); border-radius: 14px; padding: 12px 14px;
    }
    .partner.on { border-color: var(--ion-color-primary); background: var(--rs-soft); }
    .badges { display: flex; flex-wrap: wrap; gap: 6px; }
    .badge {
      font-size: 12px; font-weight: 700; color: var(--ion-color-primary); background: var(--rs-soft);
      border-radius: 999px; padding: 2px 8px;
    }
    .partner small { color: var(--ion-color-medium); }
    .preview {
      white-space: pre-wrap; font: inherit; font-size: 14px; margin: 0;
      background: var(--rs-soft); border-radius: 12px; padding: 12px 14px;
    }
    .channels { display: flex; flex-wrap: wrap; gap: 8px; }
    .channel {
      flex: 1; min-width: 140px; display: flex; align-items: center; justify-content: center; gap: 8px;
      text-decoration: none; font-weight: 700; border-radius: 12px; padding: 12px 16px;
    }
    .channel.mail { background: var(--ion-color-primary); color: var(--ion-color-primary-contrast); }
    .channel.wa { background: #25D366; color: #fff; }
    .channel ion-icon { font-size: 20px; }
  `],
  template: `
    <section class="card" aria-labelledby="paid-help-title">
      @if (sent()) {
        <div class="done">
          <b>קיבלנו את הבקשה.</b>
          <p class="muted">נחזור אליכם עם היקף העזרה והמחיר. אין תשלום עד שתאשרו.</p>
        </div>
      } @else {
        <h3 id="paid-help-title">רוצים שמישהו יבדוק את זה?</h3>
        <p class="muted">ההערכה כאן נשארת בלי עלות. אפשר לבקש בנפרד שאיש מקצוע או עורך דין לדיני עבודה יעבור על המקרה. התשלום על העזרה הזו נפרד, ומסכמים אותו לפני שמתחילים.</p>
        <div class="kinds">
          <button type="button" class="kind" [class.on]="kind() === 'Professional'" (click)="choose('Professional')">
            <ion-icon name="briefcase-outline" aria-hidden="true"></ion-icon>
            <span><b>איש מקצוע</b><small>בדיקת שכר, תלוש וזכויות בסיום העבודה</small></span>
          </button>
          <button type="button" class="kind" [class.on]="kind() === 'Lawyer'" (click)="choose('Lawyer')">
            <ion-icon name="scale-outline" aria-hidden="true"></ion-icon>
            <span><b>עורך דין לדיני עבודה</b><small>כשיש מחלוקת, סירוב לשלם, או צורך בייצוג</small></span>
          </button>
        </div>

        @if (kind(); as selected) {
          @if (partners().length) {
            <p class="muted small">שותפים, ומי שיש לו הנחה גדולה יותר, מופיעים ראשונים.</p>
            <div class="partners">
              @for (p of partners(); track p.id) {
                <button type="button" class="partner" [class.on]="partnerId() === p.id" (click)="partnerId.set(p.id)">
                  <b>{{ p.name }}</b>
                  <span class="badges">
                    @if (p.cooperation) { <span class="badge">שיתוף פעולה</span> }
                    @if (p.discountPercent > 0) { <span class="badge">הנחה {{ p.discountPercent }}%</span> }
                  </span>
                  @if (p.summary) { <small>{{ p.summary }}</small> }
                </button>
              }
            </div>
          } @else if (partnersNote()) {
            <p class="muted small">{{ partnersNote() }}</p>
          }
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

            <p class="muted small">נצרף לבקשה את סכום ההערכה ואת סיבת העזיבה, בלי תמונת התלוש.</p>
            @if (error()) { <div class="note">{{ error() }}</div> }
            @if (selectedPartner(); as partner) {
              @if (partner.email || partner.whatsapp) {
                <p class="muted small">כך תיראה ההודעה אל {{ partner.name }}</p>
                <pre class="preview">{{ message() }}</pre>
                <div class="channels">
                  @if (partner.email) {
                    <a class="channel mail" [href]="mailHref(partner)" (click)="contact('Email', $event)">
                      <ion-icon name="mail-outline" aria-hidden="true"></ion-icon> מייל
                    </a>
                  }
                  @if (partner.whatsapp) {
                    <a class="channel wa" [href]="whatsappHref(partner)" target="_blank" rel="noopener" (click)="contact('WhatsApp', $event)">
                      <ion-icon name="logo-whatsapp" aria-hidden="true"></ion-icon> וואטסאפ
                    </a>
                  }
                </div>
              } @else {
                <button type="submit" class="send" [disabled]="busy()">
                  @if (busy()) { <ion-spinner name="crescent"></ion-spinner> } @else { בקשו שיחזרו אליי }
                </button>
              }
            } @else {
              <button type="submit" class="send" [disabled]="busy()">
                @if (busy()) { <ion-spinner name="crescent"></ion-spinner> } @else { בקשו שיחזרו אליי }
              </button>
            }
            <p class="muted small">{{ selected === 'Lawyer' ? 'עורך דין' : 'איש מקצוע' }} יחזור עם הצעת מחיר. זו לא התחייבות ולא ייעוץ משפטי.</p>
          </form>
        }
      }
    </section>
  `
})
export class PaidHelpComponent {
  private readonly api = inject(ApiService);
  private readonly store = inject(WizardStore);

  readonly kind = signal<HelpKind | null>(null);
  readonly partnerId = signal<string | null>(null);
  readonly partners = signal<PartnerOffer[]>([]);
  readonly partnersNote = signal('');
  readonly busy = signal(false);
  readonly sent = signal(false);
  readonly error = signal('');
  readonly fieldErrors = signal<Record<string, string>>({});

  name = '';
  phone = '';
  email = '';
  note = '';

  constructor() {
    addIcons({ briefcaseOutline, scaleOutline, mailOutline, logoWhatsapp });
  }

  choose(next: HelpKind): void {
    this.kind.set(next);
    this.partnerId.set(null);
    void this.loadPartners(next);
  }

  private loadToken = 0;

  private async loadPartners(next: HelpKind): Promise<void> {
    const token = ++this.loadToken;
    this.partners.set([]);
    this.partnersNote.set('');
    try {
      const list = await this.api.partners(next);
      if (token !== this.loadToken) return;
      this.partners.set(list);
    } catch {
      if (token !== this.loadToken) return;
      this.partnersNote.set('רשימת השותפים לא נטענה. אפשר עדיין לבקש שיחזרו אליכם.');
    }
  }

  async submit(): Promise<void> {
    const errors = this.validate();
    this.fieldErrors.set(errors);
    const partner = this.selectedPartner();
    if (partner?.email || partner?.whatsapp) {
      this.error.set(Object.keys(errors).length ? '' : 'בחרו מייל או וואטסאפ כדי לשלוח את ההודעה.');
      return;
    }
    if (Object.keys(errors).length || !this.kind()) return;
    await this.send(null);
  }

  contact(channel: 'Email' | 'WhatsApp', event: Event): void {
    const errors = this.validate();
    this.fieldErrors.set(errors);
    this.error.set('');
    if (Object.keys(errors).length || !this.kind()) {
      event.preventDefault();
      return;
    }
    void this.send(channel);
  }

  selectedPartner(): PartnerOffer | null {
    return this.partners().find(p => p.id === this.partnerId()) ?? null;
  }

  message(): string {
    const active = this.store.active();
    const reason = active?.reason ? REASON_LABELS[active.reason] : null;
    const lines = [
      'שלום,',
      `פונים אליכם מ${SITE_NAME}.`,
      '',
      `שם: ${this.name.trim()}`,
      `טלפון: ${this.phone.trim()}`,
      `אימייל: ${this.email.trim()}`
    ];
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

  private async send(channel: 'Email' | 'WhatsApp' | null): Promise<void> {
    const active = this.store.active();
    this.busy.set(true);
    try {
      await this.api.requestPaidHelp({
        kind: this.kind()!,
        name: this.name.trim(),
        phone: this.phone.trim(),
        email: this.email.trim(),
        note: this.note.trim() || null,
        reason: active?.reason ?? null,
        estimatedTotal: active?.estimatedTotal ?? null,
        partnerId: this.partnerId(),
        channel
      });
      if (!channel) this.sent.set(true);
    } catch (err) {
      if (channel) return;
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
