import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { cameraOutline, imagesOutline } from 'ionicons/icons';
import { ApiService, describeError } from '../core/api.service';
import { PhotoService, isUserCancel } from '../core/photo.service';
import { WizardStore } from '../core/wizard.store';

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [IonContent, IonButton, IonIcon, IonSpinner],
  styles: [`
    .promise { list-style: none; padding: 0; margin: 18px 0 22px; }
    .promise li { padding: 12px 0; border-bottom: 1px solid var(--rs-line); }
    .promise b { display: block; font-size: 17px; }
    .upload { border: 1.5px dashed var(--ion-color-primary); border-radius: 14px; padding: 14px 16px; margin-bottom: 14px;
              background: var(--ion-item-background); }
    .upload b { display: block; font-size: 17px; }
    .row { display: flex; gap: 8px; margin-top: 10px; }
    .row ion-button { flex: 1; margin: 0; }
    .status { display: flex; gap: 10px; align-items: center; font-size: 14px; margin-top: 10px; }
    .foot { font-size: 12.5px; margin-top: 22px; }
  `],
  template: `
    <ion-content class="ion-padding">
      <div class="page">
        <h1>יוצאים בראש שקט</h1>
        <p class="muted">עוזבים עבודה? צלמו תלוש, ענו על שאלה אחת, ותדעו מה מגיע לכם ומה לעשות לפני היום האחרון.</p>

        <div class="upload">
          <b>הדרך המהירה: צלמו את התלוש האחרון</b>
          <span class="muted small">נקרא ממנו את הנתונים ונחשב הערכה ראשונית. אפשר לבחור עד 5 תלושים. התמונות לא נשמרות.</span>
          <div class="row">
            <ion-button (click)="pick('camera')" [disabled]="busy()">
              <ion-icon slot="start" name="camera-outline"></ion-icon>צילום במצלמה
            </ion-button>
            <ion-button fill="outline" (click)="pick('gallery')" [disabled]="busy()">
              <ion-icon slot="start" name="images-outline"></ion-icon>מהגלריה
            </ion-button>
          </div>
          @if (busy()) {
            <div class="status" aria-live="polite"><ion-spinner name="crescent"></ion-spinner>קורא את התלוש… זה לוקח כמה שניות</div>
          } @else if (status()) {
            <div class="status" aria-live="polite">{{ status() }}</div>
          }
        </div>

        <ion-button expand="block" fill="clear" (click)="manual()">בלי תלוש, למלא ידנית</ion-button>

        <ul class="promise">
          <li><b>מה מגיע לי</b><span class="muted">פיצויים, חופשה, הבראה והודעה מוקדמת, עם הסבר לכל סכום</span></li>
          <li><b>מה לבקש לפני שעוזבים</b><span class="muted">צ'קליסט שמתאים לסיבת העזיבה</span></li>
          <li><b>מה עושים אחרי</b><span class="muted">אבטלה, פנסיה, קרן השתלמות, עם קישור למקור הרשמי</span></li>
        </ul>
        <p class="foot muted">הערכה בלבד, לא ייעוץ משפטי. מותאם לעובד בשכר חודשי. חוזה אישי או הסכם קיבוצי יכולים להיטיב.</p>
      </div>
    </ion-content>
  `
})
export class WelcomePage {
  private readonly photos = inject(PhotoService);
  private readonly api = inject(ApiService);
  private readonly store = inject(WizardStore);
  private readonly router = inject(Router);

  readonly busy = signal(false);
  readonly status = signal('');

  constructor() {
    addIcons({ cameraOutline, imagesOutline });
  }

  async pick(source: 'camera' | 'gallery'): Promise<void> {
    this.status.set('');
    let images: Blob[];
    try {
      images = source === 'camera' ? await this.photos.fromCamera() : await this.photos.fromGallery();
    } catch (err) {
      if (!isUserCancel(err)) this.status.set('לא הצלחנו לפתוח את המצלמה או הגלריה. בדקו הרשאות בהגדרות הטלפון.');
      return;
    }
    if (images.length === 0) return;

    this.busy.set(true);
    try {
      const draft = await this.api.extractPayslips(images);
      if (!draft.isPayslip) {
        this.status.set('זה לא נראה כמו תלוש שכר. נסו תמונה חדה של התלוש כולו.');
        return;
      }
      this.store.reset();
      this.store.applyDraft(draft);
      await this.router.navigateByUrl('/reason');
    } catch (err) {
      this.status.set(describeError(err).message + ' אפשר גם למלא ידנית.');
    } finally {
      this.busy.set(false);
    }
  }

  manual(): void {
    this.store.reset();
    this.router.navigateByUrl('/reason');
  }
}
