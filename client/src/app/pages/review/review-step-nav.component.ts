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
      margin-top: 28px;
      padding-top: 16px;
      border-top: 1px solid var(--rs-line, #e5e5e5);
    }
    .nav {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      justify-content: flex-end;
    }
    .nav ion-button {
      margin: 0;
      min-width: 132px;
      flex: 0 0 auto;
    }
  `],
  template: `
    <nav class="nav" aria-label="ניווט בין שלבי הבדיקה">
      <ion-button fill="outline" (click)="goBack()" [attr.aria-label]="'חזרה לשלב קודם'">
        <ion-icon slot="start" name="arrow-back-outline" aria-hidden="true"></ion-icon>
        חזרה
      </ion-button>
      @if (nextLabel()) {
        <ion-button fill="outline" [disabled]="nextDisabled()" (click)="next.emit()" [attr.aria-label]="nextLabel()!">
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
