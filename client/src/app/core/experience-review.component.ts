import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { star, starOutline } from 'ionicons/icons';
import { ApiService, describeError } from './api.service';

const SENT_KEY = 'rs-review-sent';

const STAR_MEANINGS: Record<number, string> = {
  1: 'גרוע מאוד',
  2: 'לא טוב',
  3: 'בסדר',
  4: 'טוב',
  5: 'מצוין'
};

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
    .row { margin-top: 16px; }
    .row b { display: block; margin-bottom: 8px; }
    .stars { display: flex; gap: 6px; flex-wrap: wrap; }
    .star {
      font: inherit; cursor: pointer; border: 1px solid var(--rs-line); background: transparent;
      color: var(--ion-color-medium); padding: 8px 6px 6px; min-width: 54px; border-radius: 12px;
      display: flex; flex-direction: column; align-items: center; gap: 2px;
    }
    .star ion-icon { font-size: 22px; color: var(--rs-line); }
    .star .n { font-size: 13px; font-weight: 700; line-height: 1; }
    .star .m { font-size: 11px; line-height: 1.2; max-width: 5.5em; text-align: center; }
    .star.on {
      border-color: var(--rs-accent); background: var(--rs-warn-bg); color: var(--rs-warn);
    }
    .star.on ion-icon { color: var(--rs-accent); }
    .star:focus-visible { outline: 3px solid var(--ion-color-primary); outline-offset: 2px; }
    .picked { margin: 8px 0 0; font-size: 14px; color: var(--ion-color-medium); }
    .picked strong { color: var(--ion-text-color); }
    label { font-weight: 700; font-size: 14px; display: block; margin-top: 14px; }
    textarea {
      width: 100%; font: inherit; color: var(--ion-text-color); background: var(--ion-background-color);
      border: 1px solid var(--rs-line); border-radius: 12px; padding: 10px 12px; min-height: 88px; resize: vertical;
    }
    .field-error { color: var(--rs-warn); font-size: 13px; margin-top: 4px; }
    .actions { display: flex; justify-content: flex-end; margin-top: 14px; }
    button.send {
      font: inherit; font-weight: 700; cursor: pointer; border: 0; border-radius: 12px; padding: 12px 18px;
      background: var(--ion-color-primary); color: var(--ion-color-primary-contrast);
      min-width: 148px; display: inline-flex; align-items: center; justify-content: center;
    }
    button.send:disabled { opacity: .6; cursor: default; }
    button.send ion-spinner { width: 20px; height: 20px; }
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
        <p class="muted">דרגו בכוכבים 1 עד 5. בכל כוכב רשום המספר ומה הוא אומר.</p>

        <div class="row">
          <b>המערכת</b>
          <div class="stars" role="radiogroup" aria-label="דירוג המערכת">
            @for (n of stars; track n) {
              <button type="button" class="star" role="radio" [class.on]="systemRating() === n"
                      [attr.aria-checked]="systemRating() === n"
                      [attr.aria-label]="n + ' כוכבים, ' + meaning(n)"
                      (click)="systemRating.set(n)">
                <ion-icon [name]="systemRating() >= n ? 'star' : 'star-outline'" aria-hidden="true"></ion-icon>
                <span class="n">{{ n }}*</span>
                <span class="m">{{ meaning(n) }}</span>
              </button>
            }
          </div>
          @if (systemRating(); as score) {
            <p class="picked">נבחר: <strong>{{ score }}*</strong> · {{ meaning(score) }}</p>
          }
          @if (fieldErrors()['systemRating']) { <div class="field-error">{{ fieldErrors()['systemRating'] }}</div> }
        </div>

        <div class="row">
          <b>החוויה</b>
          <div class="stars" role="radiogroup" aria-label="דירוג החוויה">
            @for (n of stars; track n) {
              <button type="button" class="star" role="radio" [class.on]="experienceRating() === n"
                      [attr.aria-checked]="experienceRating() === n"
                      [attr.aria-label]="n + ' כוכבים, ' + meaning(n)"
                      (click)="experienceRating.set(n)">
                <ion-icon [name]="experienceRating() >= n ? 'star' : 'star-outline'" aria-hidden="true"></ion-icon>
                <span class="n">{{ n }}*</span>
                <span class="m">{{ meaning(n) }}</span>
              </button>
            }
          </div>
          @if (experienceRating(); as score) {
            <p class="picked">נבחר: <strong>{{ score }}*</strong> · {{ meaning(score) }}</p>
          }
          @if (fieldErrors()['experienceRating']) { <div class="field-error">{{ fieldErrors()['experienceRating'] }}</div> }
        </div>

        <label for="review-text">ביקורת</label>
        <textarea id="review-text" name="text" [(ngModel)]="text" [disabled]="busy()" placeholder="מה עבד, ומה כדאי לשפר"></textarea>
        @if (fieldErrors()['text']) { <div class="field-error">{{ fieldErrors()['text'] }}</div> }
        @if (error()) { <div class="note">{{ error() }}</div> }
        <div class="actions">
          <button type="button" class="send" [disabled]="busy()" (click)="submit()">
            @if (busy()) { <ion-spinner name="crescent"></ion-spinner> } @else { שליחת דירוג }
          </button>
        </div>
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

  meaning(n: number): string {
    return STAR_MEANINGS[n] ?? '';
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
