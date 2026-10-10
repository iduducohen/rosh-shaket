import { Component, input, output, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, arrowForwardOutline } from 'ionicons/icons';

const REVIEW_STEPS = [
  '/review/employment',
  '/review/documents',
  '/review/check',
  '/review/report'
] as const;

@Component({
  selector: 'app-review-step-nav',
  standalone: true,
  imports: [IonButton, IonIcon],
  styles: [`
    :host {
      display: block;
      margin-top: 18px;
      padding-top: 12px;
      border-top: 1px solid var(--rs-line, #e5e5e5);
    }
    .nav {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      /* Back and continue sit together, not at the two edges of the page. */
      justify-content: flex-start;
      align-items: center;
    }
    /* Back and next share size, font and shape; back is the outline version of the same button. */
    .nav ion-button { margin: 0; flex: 0 0 auto; min-width: 160px; font-weight: 700; --box-shadow: none; }
    /* Back stays at the start (right in Hebrew), continue goes to the opposite end (left). */
    .nav .next { margin-inline-start: auto; }
    @media (max-width: 720px) {
      :host { border-top: 0; padding-top: 0; }
      .nav { flex-wrap: nowrap; justify-content: space-between; }
      .nav ion-button { flex: 1; min-width: 0; }
    }
  `],
  template: `
    <nav class="nav sticky-actions" aria-label="ניווט בין שלבי הבדיקה">
      <ion-button class="back" fill="outline" (click)="goBack()" [attr.aria-label]="'חזרה לשלב קודם'">
        <ion-icon slot="start" name="arrow-back-outline" aria-hidden="true"></ion-icon>
        חזרה
      </ion-button>
      @if (nextLabel()) {
        <ion-button class="next" [disabled]="nextDisabled()" (click)="next.emit()" [attr.aria-label]="nextLabel()!">
          {{ nextLabel() }}
          <ion-icon slot="end" name="arrow-forward-outline" aria-hidden="true"></ion-icon>
        </ion-button>
      }
    </nav>
  `
})
export class ReviewStepNavComponent {
  private readonly router = inject(Router);

  /** Empty / omit to hide the forward button (e.g. last step). */
  readonly nextLabel = input<string | null>('המשך');
  readonly nextDisabled = input(false);
  readonly next = output<void>();

  constructor() {
    addIcons({ arrowBackOutline, arrowForwardOutline });
  }

  goBack(): void {
    const here = this.router.url.split('?')[0];
    const i = REVIEW_STEPS.findIndex(p => here.startsWith(p));
    if (i <= 0) {
      void this.router.navigateByUrl('/start');
      return;
    }
    void this.router.navigateByUrl(REVIEW_STEPS[i - 1]);
  }
}
