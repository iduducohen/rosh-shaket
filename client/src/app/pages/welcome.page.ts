import { Component, OnDestroy, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { AlertController, IonButton, IonContent, IonIcon, IonSpinner, ViewWillEnter } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { cameraOutline, checkmarkOutline, closeOutline, documentTextOutline } from 'ionicons/icons';
import { DeskHeaderComponent } from '../core/desk-header.component';
import { ApiService, describeError } from '../core/api.service';
import { PhotoService, isUserCancel } from '../core/photo.service';
import { WizardStore } from '../core/wizard.store';
import { AuthService } from '../core/auth/auth.service';
import { LogoComponent } from '../core/logo.component';
import { ReadingPhase, ReadingProgressComponent } from '../core/reading-progress.component';
import { WorkspaceService } from '../core/workspace.service';

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [IonContent, IonButton, IonIcon, RouterLink, DeskHeaderComponent, LogoComponent, ReadingProgressComponent],
  styles: [`
    .promise { list-style: none; padding: 0; margin: 18px 0 22px; }
    .promise li { padding: 12px 0; border-bottom: 1px solid var(--rs-line); }
    .promise b { display: block; font-size: 17px; }
    .upload { box-shadow: var(--rs-card-shadow); border: 1px solid var(--rs-line); border-radius: 14px; padding: 16px; margin-bottom: 12px;
              background: var(--ion-item-background); }
    .upload > b { display: block; font-size: 17px; }
    .upload .sub { display: block; margin: 4px 0 12px; }
    .drop {
      border: 1.5px dashed var(--ion-color-primary); border-radius: 12px; padding: 22px 14px;
      background: rgba(var(--ion-color-primary-rgb), .04); text-align: center; cursor: pointer;
      display: grid; gap: 6px; justify-items: center; transition: background .12s ease;
    }
    .drop:hover, .drop:focus-visible { background: rgba(var(--ion-color-primary-rgb), .08); outline: none; }
    .drop.over { background: rgba(var(--ion-color-primary-rgb), .14); border-style: solid; }
    .drop.busy { cursor: wait; pointer-events: none; border-style: solid; }
    .drop ion-icon { font-size: 30px; color: var(--ion-color-primary); }
    .drop .t { font-weight: 700; font-size: 15.5px; }
    .full .row { margin-top: 12px; }
    .manual { display: block; margin: 10px auto 0; background: none; border: 0; padding: 4px; cursor: pointer;
              font: inherit; font-size: 14px; color: var(--ion-color-medium); text-decoration: underline; text-underline-offset: 3px; }
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
      .upload { padding: 26px 28px; border-radius: 18px; margin-bottom: 12px; }
      .upload > b { font-size: 22px; font-family: var(--rs-serif); }
      .drop { padding: 34px 18px; }
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
          <p class="muted lead">עוזבים עבודה? העלו את התלוש האחרון ותוך דקה תדעו מה מגיע לכם — והאם ההפרשות לפנסיה תקינות.</p>
        </div>

        <div class="up">
        <div class="upload">
          <b>העלו את התלוש האחרון</b>
          <span class="muted small sub">
            תלוש אחד מספיק — השכר, הוותק והיתרות כבר מופיעים בו.
            {{ auth.isSignedIn() ? 'כשאתם מחוברים התלוש נשמר בחשבון שלכם.' : 'כאורחים הקובץ לא נשמר אחרי הקריאה.' }}
          </span>
          <div class="drop" role="button" tabindex="0"
               [class.over]="dragOver() && !busy()" [class.busy]="busy()"
               [attr.aria-label]="'בחירת תלוש שכר להעלאה'"
               (click)="!busy() && fileInput.click()" (keydown.enter)="!busy() && fileInput.click()"
               (dragover)="onDragOver($event)" (dragleave)="dragOver.set(false)" (drop)="onDrop($event)">
            @if (busy()) {
              <app-reading-progress [phase]="phase()"></app-reading-progress>
            } @else {
              <ion-icon name="document-text-outline" aria-hidden="true"></ion-icon>
              <span class="t">גררו לכאן את התלוש או לחצו לבחירה</span>
              <span class="muted small">PDF או תמונה · אפשר כמה עמודים של אותו תלוש</span>
            }
          </div>
          @if (native) {
            <div class="row">
              <ion-button fill="outline" (click)="pickCamera()" [disabled]="busy()">
                <ion-icon slot="start" name="camera-outline"></ion-icon>צילום במצלמה
              </ion-button>
            </div>
          }
          <input #fileInput hidden type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" multiple (change)="onFiles($event)">
          @if (!busy() && status()) {
            <div class="status" [class.ok]="verdict() === 'ok'" [class.bad]="verdict() === 'bad'" aria-live="polite">
              @if (verdict() === 'ok') { <ion-icon name="checkmark-outline" aria-hidden="true"></ion-icon> }
              @if (verdict() === 'bad') { <ion-icon name="close-outline" aria-hidden="true"></ion-icon> }
              <span>{{ status() }}</span>
            </div>
          }
          <button type="button" class="manual" (click)="manual()">אין תלוש בהישג יד? למלא ידנית</button>
        </div>

        <div class="upload full">
          <b>רוצים לוודא שהכול הופקד לאורך השנים?</b>
          <span class="muted small sub">בבדיקה המלאה מעלים את כל התלושים, טפסי 106 ודוחות הקופות — ובודקים חודש אחרי חודש מה הופרש, לאיזו קופה, והאם זה לפי החוק.</span>
          <span class="muted small sub">3 מסמכים ראשונים בחינם · חבילות מ־₪29 · <a routerLink="/pricing">מחירים</a></span>
          <div class="row">
            <ion-button fill="outline" (click)="goReview()">לבדיקה המלאה</ion-button>
          </div>
        </div>
        </div>

        <div class="promises">
        <ul class="promise">
          <li><b>מה מגיע לי</b><span class="muted">פיצויים, חופשה, הבראה והודעה מוקדמת, עם הסבר לכל סכום</span></li>
          <li><b>האם ההפרשות תקינות</b><span class="muted">פנסיה, פיצויים וקרן השתלמות — מול השיעורים שבחוק</span></li>
          <li><b>מה לבקש לפני שעוזבים</b><span class="muted">צ'קליסט ומסמכים חסרים לפי מה שסיפקתם</span></li>
        </ul>
        <p class="foot muted">הערכה בלבד, לא ייעוץ משפטי. מותאם לעובד בשכר חודשי. חוזה אישי או הסכם קיבוצי יכולים להיטיב.</p>
        </div>
      </div>
    </ion-content>
  `
})
export class WelcomePage implements ViewWillEnter, OnDestroy {
  private readonly photos = inject(PhotoService);
  private readonly api = inject(ApiService);
  private readonly store = inject(WizardStore);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly workspaces = inject(WorkspaceService);

  readonly busy = signal(false);
  readonly status = signal('');
  readonly verdict = signal<'ok' | 'bad' | ''>('');
  readonly dragOver = signal(false);
  readonly phase = signal<ReadingPhase>('file');
  readonly native = Capacitor.isNativePlatform();
  private readonly alerts = inject(AlertController);
  private continueTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    addIcons({ cameraOutline, documentTextOutline, checkmarkOutline, closeOutline });
  }

  goReview(): void {
    void this.router.navigateByUrl('/review/employment');
  }

  ionViewWillEnter(): void {
    this.clearUploadState();
  }

  ngOnDestroy(): void {
    clearTimeout(this.continueTimer);
  }

  pickCamera(): Promise<void> {
    return this.read(() => this.photos.fromCamera(), 'לא הצלחנו לפתוח את המצלמה. בדקו הרשאות בהגדרות הטלפון.');
  }

  onFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    return this.readFiles(files);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    this.dragOver.set(true);
  }

  onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.dragOver.set(false);
    if (this.busy()) return Promise.resolve();
    return this.readFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  private readFiles(files: File[]): Promise<void> {
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
    this.status.set('');
    this.phase.set('file');
    this.busy.set(true);
    let images: Blob[];
    try {
      images = await load();
    } catch (err) {
      if (isUserCancel(err)) {
        this.clearUploadState();
      } else {
        this.fail(err instanceof Error && err.message ? err.message : fallback);
      }
      return;
    }
    if (images.length === 0) {
      this.clearUploadState();
      return;
    }

    let accepted = false;
    this.phase.set('reading');
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
      if (this.auth.isSignedIn()) {
        for (let i = 0; i < images.length; i++) {
          try {
            await this.workspaces.uploadDocument(images[i], `payslip-${i + 1}.jpg`, 'payslip');
          } catch { /* OCR already succeeded; document persist is best-effort */ }
        }
        this.workspaces.scheduleSave(true);
      }
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
    this.busy.set(false);
    this.verdict.set('bad');
    this.status.set(message);
  }

  private continueToReason(): void {
    clearTimeout(this.continueTimer);
    this.continueTimer = setTimeout(() => void this.router.navigateByUrl('/reason'), 900);
  }

  manual(): void {
    this.clearUploadState();
    this.store.reset();
    void this.router.navigateByUrl('/reason');
  }

  private clearUploadState(): void {
    clearTimeout(this.continueTimer);
    this.busy.set(false);
    this.status.set('');
    this.verdict.set('');
  }
}
