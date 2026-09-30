import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { AlertController, IonButton, IonContent, IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { cameraOutline, checkmarkOutline, closeOutline, documentTextOutline } from 'ionicons/icons';
import { DeskHeaderComponent } from '../core/desk-header.component';
import { ApiService, describeError } from '../core/api.service';
import { PhotoService, isUserCancel } from '../core/photo.service';
import { WizardStore } from '../core/wizard.store';
import { AuthService } from '../core/auth/auth.service';
import { LogoComponent } from '../core/logo.component';

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [IonContent, IonButton, IonIcon, IonSpinner, DeskHeaderComponent, LogoComponent],
  styles: [`
    .promise { list-style: none; padding: 0; margin: 18px 0 22px; }
    .promise li { padding: 12px 0; border-bottom: 1px solid var(--rs-line); }
    .promise b { display: block; font-size: 17px; }
    .upload { border: 1.5px dashed var(--ion-color-primary); border-radius: 14px; padding: 14px 16px; margin-bottom: 14px;
              background: var(--ion-item-background); }
    .upload b { display: block; font-size: 17px; }
    .row { display: flex; gap: 8px; margin-top: 10px; }
    .row ion-button { flex: 1; margin: 0; }
    .status { display: flex; gap: 10px; align-items: center; font-size: 15px; font-weight: 700; margin-top: 10px; }
    .status ion-icon { font-size: 28px; flex: none; }
    .status.ok { color: var(--ion-color-primary); }
    .status.bad { color: var(--ion-color-danger); }
    .foot { font-size: 12.5px; margin-top: 22px; }
    .hello { margin: 10px 0 0; color: var(--ion-color-primary); font-weight: 700; }
    @media (min-width: 992px) {
      .welcome { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); grid-template-areas: "intro upload" "promises upload"; gap: 8px 64px; align-items: start; }
      .intro { grid-area: intro; } .up { grid-area: upload; position: sticky; top: 24px; } .promises { grid-area: promises; }
      .upload { padding: 28px; border-radius: 18px; margin-bottom: 8px; }
      .upload b { font-size: 22px; font-family: var(--rs-serif); margin-bottom: 6px; }
      .row { flex-direction: column; gap: 10px; margin-top: 18px; }
      .row ion-button { --padding-top: 14px; --padding-bottom: 14px; font-size: 16px; }
      .promise { margin-top: 28px; } .promise li { padding: 16px 0; } .promise b { font-size: 19px; }
    }
  `],
  template: `
    <ion-content>
      <app-desk-header [step]="1"></app-desk-header>
      <div class="page welcome ion-padding">
        <div class="intro">
          <app-logo class="mobile-only" [size]="30" [wordmark]="false"></app-logo>
          @if (auth.displayName(); as name) { <p class="hello">שלום {{ name }},</p> }
          <h1>יוצאים בראש שקט</h1>
          <p class="muted lead">עוזבים עבודה? העלו תלוש, ענו על שאלה אחת, ותדעו מה מגיע לכם ומה לעשות לפני היום האחרון.</p>
        </div>

        <div class="up">
        <div class="upload">
          <b>הדרך המהירה: העלו את התלוש האחרון</b>
          <span class="muted small">תלוש אחרון אחד מספיק: השכר והיתרות כבר מסוכמים בו. נבדוק שהוא תקין, ואז נחשב הערכה. עד 5 תלושים, תמונה או PDF. הקבצים לא נשמרים.</span>
          <div class="row">
            @if (native) {
              <ion-button (click)="pickCamera()" [disabled]="busy()">
                <ion-icon slot="start" name="camera-outline"></ion-icon>צילום במצלמה
              </ion-button>
            }
            <ion-button [fill]="native ? 'outline' : 'solid'" (click)="fileInput.click()" [disabled]="busy()">
              <ion-icon slot="start" name="document-text-outline"></ion-icon>העלאת תמונה או PDF
            </ion-button>
          </div>
          <input #fileInput hidden type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" multiple (change)="onFiles($event)">
          @if (busy()) {
            <div class="status" aria-live="polite"><ion-spinner name="crescent"></ion-spinner>בודק שהקובץ תלוש שכר תקין…</div>
          } @else if (status()) {
            <div class="status" [class.ok]="verdict() === 'ok'" [class.bad]="verdict() === 'bad'" aria-live="polite">
              @if (verdict() === 'ok') { <ion-icon name="checkmark-outline" aria-hidden="true"></ion-icon> }
              @if (verdict() === 'bad') { <ion-icon name="close-outline" aria-hidden="true"></ion-icon> }
              <span>{{ status() }}</span>
            </div>
          }
        </div>

        <ion-button expand="block" fill="clear" (click)="manual()">בלי תלוש, למלא ידנית</ion-button>
        </div>

        <div class="promises">
        <ul class="promise">
          <li><b>מה מגיע לי</b><span class="muted">פיצויים, חופשה, הבראה והודעה מוקדמת, עם הסבר לכל סכום</span></li>
          <li><b>מה לבקש לפני שעוזבים</b><span class="muted">צ'קליסט שמתאים לסיבת העזיבה</span></li>
          <li><b>מה עושים אחרי</b><span class="muted">אבטלה, פנסיה, קרן השתלמות, עם קישור למקור הרשמי</span></li>
        </ul>
        <p class="foot muted">הערכה בלבד, לא ייעוץ משפטי. מותאם לעובד בשכר חודשי. חוזה אישי או הסכם קיבוצי יכולים להיטיב.</p>
        </div>
      </div>
    </ion-content>
  `
})
export class WelcomePage {
  private readonly photos = inject(PhotoService);
  private readonly api = inject(ApiService);
  private readonly store = inject(WizardStore);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly busy = signal(false);
  readonly status = signal('');
  readonly verdict = signal<'ok' | 'bad' | ''>('');
  readonly native = Capacitor.isNativePlatform();
  private readonly alerts = inject(AlertController);
  private continueTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    addIcons({ cameraOutline, documentTextOutline, checkmarkOutline, closeOutline });
  }

  pickCamera(): Promise<void> {
    return this.read(() => this.photos.fromCamera(), 'לא הצלחנו לפתוח את המצלמה. בדקו הרשאות בהגדרות הטלפון.');
  }

  onFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return Promise.resolve();
    return this.read(
      () => this.photos.fromFiles(files, (name, wrong) => this.askPassword(name, wrong)),
      'לא הצלחנו לקרוא את הקובץ.');
  }

  private async askPassword(name: string, wrong: boolean): Promise<string | null> {
    const alert = await this.alerts.create({
      header: 'הקובץ נעול',
      message: wrong
        ? `הסיסמה של ${name} לא נכונה. נסו שוב.`
        : `הקובץ ${name} מוגן בסיסמה. הזינו אותה כדי לקרוא את התלוש. הסיסמה לא נשלחת לשרת.`,
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

  private async read(load: () => Promise<Blob[]>, fallback: string): Promise<void> {
    clearTimeout(this.continueTimer);
    this.verdict.set('');
    this.status.set('בודק את איכות הקובץ…');
    let images: Blob[];
    try {
      images = await load();
    } catch (err) {
      if (isUserCancel(err)) {
        this.status.set('');
        this.verdict.set('');
      } else {
        this.fail(err instanceof Error && err.message ? err.message : fallback);
      }
      return;
    }
    if (images.length === 0) {
      this.status.set('');
      this.verdict.set('');
      return;
    }

    this.busy.set(true);
    let accepted = false;
    try {
      const draft = await this.api.extractPayslips(images);
      if (!draft.isPayslip) {
        this.fail('זה לא נראה כמו תלוש שכר. העלו את התלוש עצמו, תמונה של כל הדף או PDF.');
        return;
      }
      if (draft.readable === false) {
        this.fail('התלוש לא מספיק חד לקריאה. צלמו את כל הדף באור טוב, בלי טשטוש ובלי צל.');
        return;
      }
      this.store.reset();
      this.store.applyDraft(draft);
      this.verdict.set('ok');
      this.status.set('התלוש תקין');
      accepted = true;
    } catch (err) {
      this.fail(describeError(err).message + ' אפשר גם למלא ידנית.');
    } finally {
      this.busy.set(false);
    }
    if (accepted) this.continueToReason();
  }

  private fail(message: string): void {
    this.verdict.set('bad');
    this.status.set(message);
  }

  private continueToReason(): void {
    clearTimeout(this.continueTimer);
    this.continueTimer = setTimeout(() => void this.router.navigateByUrl('/reason'), 900);
  }

  manual(): void {
    clearTimeout(this.continueTimer);
    this.store.reset();
    this.router.navigateByUrl('/reason');
  }
}
