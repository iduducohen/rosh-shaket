import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { star, starOutline } from 'ionicons/icons';
import { ApiService, describeError } from './api.service';

const SENT_KEY = 'rs-review-sent';

@Component({
  selector: 'app-experience-review',
  standalone: true,
  imports: [FormsModule, IonIcon, IonSpinner],
  styles: [`
    :host { display: block; margin-top: 22px; }
    .card {
      background: var(--ion-item-background); border: 1px solid var(--rs-line); border-radius: 16px; padding: 18px;
    }
    h3 { margin: 0 0 6px; font-family: var(--rs-serif); font-size: 22px; }
    .row { margin-top: 14px; }
    .row b { display: block; margin-bottom: 6px; }
    .stars { display: flex; gap: 4px; }
    .star {
      font: inherit; cursor: pointer; border: 0; background: transparent; color: var(--rs-line); padding: 2px;
    }
    .star ion-icon { font-size: 28px; }
    .star.on { color: var(--rs-accent); }
    label { font-weight: 700; font-size: 14px; display: block; margin-top: 14px; }
    textarea {
      width: 100%; font: inherit; color: var(--ion-text-color); background: var(--ion-background-color);
      border: 1px solid var(--rs-line); border-radius: 12px; padding: 10px 12px; min-height: 88px; resize: vertical;
    }
    .field-error { color: var(--rs-warn); font-size: 13px; margin-top: 4px; }
    button.send {
      margin-top: 12px; font: inherit; font-weight: 700; cursor: pointer; border: 0; border-radius: 12px; padding: 12px 16px;
      background: var(--ion-color-primary); color: var(--ion-color-primary-contrast);
    }
    button.send:disabled { opacity: .6; cursor: default; }
    .done b { display: block; margin-bottom: 4px; }
  `],
  template: `
    <section class="card" aria-labelledby="review-title">
      @if (sent()) {
        <div class="done">
          <b>תודה על הדירוג.</b>
          <p class="muted">הביקורת התקבלה.</p>
        </div>
      } @else {
        <h3 id="review-title">איך היה?</h3>
        <p class="muted">דירוג קצר למערכת ולחוויה. אפשר גם להוסיף ביקורת.</p>

        <div class="row">
          <b>המערכת</b>
          <div class="stars" dir="ltr" role="radiogroup" aria-label="דירוג המערכת">
            @for (n of stars; track n) {
              <button type="button" class="star" role="radio" [class.on]="systemRating() >= n"
                      [attr.aria-checked]="systemRating() === n" [attr.aria-label]="n + ' מתוך 5'"
                      (click)="systemRating.set(n)">
                <ion-icon [name]="systemRating() >= n ? 'star' : 'star-outline'" aria-hidden="true"></ion-icon>
              </button>
            }
          </div>
          @if (fieldErrors()['systemRating']) { <div class="field-error">{{ fieldErrors()['systemRating'] }}</div> }
        </div>

        <div class="row">
          <b>החוויה</b>
          <div class="stars" dir="ltr" role="radiogroup" aria-label="דירוג החוויה">
            @for (n of stars; track n) {
              <button type="button" class="star" role="radio" [class.on]="experienceRating() >= n"
                      [attr.aria-checked]="experienceRating() === n" [attr.aria-label]="n + ' מתוך 5'"
                      (click)="experienceRating.set(n)">
                <ion-icon [name]="experienceRating() >= n ? 'star' : 'star-outline'" aria-hidden="true"></ion-icon>
              </button>
            }
          </div>
          @if (fieldErrors()['experienceRating']) { <div class="field-error">{{ fieldErrors()['experienceRating'] }}</div> }
        </div>

        <label for="review-text">ביקורת</label>
        <textarea id="review-text" name="text" [(ngModel)]="text" [disabled]="busy()" placeholder="מה עבד, ומה כדאי לשפר"></textarea>
        @if (fieldErrors()['text']) { <div class="field-error">{{ fieldErrors()['text'] }}</div> }
        @if (error()) { <div class="note">{{ error() }}</div> }
        <button type="button" class="send" [disabled]="busy()" (click)="submit()">
          @if (busy()) { <ion-spinner name="crescent"></ion-spinner> } @else { שליחת דירוג }
        </button>
      }
    </section>
  `
})
export class ExperienceReviewComponent {
  private readonly api = inject(ApiService);

  readonly stars = [1, 2, 3, 4, 5];
  readonly systemRating = signal(0);
  readonly experienceRating = signal(0);
  readonly busy = signal(false);
  readonly sent = signal(sessionStorage.getItem(SENT_KEY) === '1');
  readonly error = signal('');
  readonly fieldErrors = signal<Record<string, string>>({});

  text = '';

  constructor() {
    addIcons({ star, starOutline });
  }

  async submit(): Promise<void> {
    const errors: Record<string, string> = {};
    if (this.systemRating() < 1) errors['systemRating'] = 'דרגו את המערכת.';
    if (this.experienceRating() < 1) errors['experienceRating'] = 'דרגו את החוויה.';
    this.fieldErrors.set(errors);
    this.error.set('');
    if (Object.keys(errors).length) return;

    this.busy.set(true);
    try {
      await this.api.submitReview({
        systemRating: this.systemRating(),
        experienceRating: this.experienceRating(),
        text: this.text.trim() || null
      });
      sessionStorage.setItem(SENT_KEY, '1');
      this.sent.set(true);
    } catch (err) {
      const described = describeError(err);
      this.error.set(described.message);
      this.fieldErrors.set(described.fields);
    } finally {
      this.busy.set(false);
    }
  }
}
