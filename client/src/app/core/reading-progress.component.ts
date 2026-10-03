import { Component, OnDestroy, computed, effect, input, signal } from '@angular/core';
import { IonSpinner } from '@ionic/angular/standalone';

export type ReadingPhase = 'file' | 'reading';

/** What the model is typically working on by this point — reassurance, not a measured stage. */
const READING_HINTS: { from: number; text: string }[] = [
  { from: 0, text: 'מזהים את סוג המסמך, השנה והחודש' },
  { from: 8, text: 'קוראים שכר, ותק ויתרות' },
  { from: 20, text: 'קוראים את טבלת ההפרשות לקופות' },
  { from: 35, text: 'עוד רגע — תלושים מפורטים לוקחים יותר זמן' }
];

/**
 * Two real stages: opening the file on the device, then reading on the server.
 * Shows elapsed seconds so a long OCR call does not look frozen.
 */
@Component({
  selector: 'app-reading-progress',
  standalone: true,
  imports: [IonSpinner],
  styles: [`
    :host { display: block; text-align: start; width: 100%; max-width: 360px; margin: 0 auto; }
    ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    li { display: grid; grid-template-columns: 24px 1fr; gap: 10px; align-items: start; font-size: 15px; }
    .mark { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; font-size: 13px; font-weight: 800; }
    .done .mark { background: var(--ion-color-primary); color: var(--ion-color-primary-contrast); }
    .wait .mark { border: 1.5px solid var(--rs-line); }
    .now ion-spinner { width: 22px; height: 22px; color: var(--ion-color-primary); }
    b { display: block; font-weight: 700; }
    .wait b { color: var(--ion-color-medium); font-weight: 600; }
    .sub { display: block; font-size: 13.5px; color: var(--ion-color-medium); margin-top: 2px; }
  `],
  template: `
    <ol aria-live="polite">
      <li [class.done]="phase() === 'reading'" [class.now]="phase() === 'file'">
        @if (phase() === 'reading') { <span class="mark" aria-hidden="true">✓</span> } @else { <ion-spinner name="crescent"></ion-spinner> }
        <span><b>פותחים את הקובץ</b></span>
      </li>
      <li [class.now]="phase() === 'reading'" [class.wait]="phase() === 'file'">
        @if (phase() === 'reading') { <ion-spinner name="crescent"></ion-spinner> } @else { <span class="mark" aria-hidden="true"></span> }
        <span>
          <b>{{ label() }}</b>
          @if (phase() === 'reading') {
            <span class="sub">{{ hint() }} · {{ seconds() }} שניות</span>
          }
        </span>
      </li>
    </ol>
  `
})
export class ReadingProgressComponent implements OnDestroy {
  readonly phase = input.required<ReadingPhase>();
  readonly label = input('קוראים את התלוש');

  readonly seconds = signal(0);
  readonly hint = computed(() => [...READING_HINTS].reverse().find(h => this.seconds() >= h.from)!.text);
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    effect(() => {
      const reading = this.phase() === 'reading';
      clearInterval(this.timer);
      this.seconds.set(0);
      if (reading) this.timer = setInterval(() => this.seconds.update(s => s + 1), 1000);
    }, { allowSignalWrites: true });
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }
}
