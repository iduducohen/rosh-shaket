import { Component, computed, input, model } from '@angular/core';

/** Five stars: read-only for an average, or a picker when `editable`. */
@Component({
  selector: 'app-stars',
  standalone: true,
  styles: [`
    :host { display: inline-flex; align-items: center; gap: 6px; }
    .stars { display: inline-flex; direction: ltr; }
    .star { font-size: var(--star-size, 18px); line-height: 1; color: var(--rs-line, #d6cfc1); }
    .star.on { color: #e0a800; }
    button.star { background: none; border: 0; padding: 0 1px; cursor: pointer; font-size: var(--star-size, 28px); }
    button.star:focus-visible { outline: 2px solid var(--ion-color-primary); outline-offset: 2px; border-radius: 4px; }
    .meta { font-size: 13px; color: var(--ion-color-medium); }
  `],
  template: `
    @if (editable()) {
      <span class="stars" role="radiogroup" aria-label="דירוג">
        @for (n of five; track n) {
          <button type="button" class="star" [class.on]="n <= value()" role="radio" [attr.aria-checked]="n === value()"
                  [attr.aria-label]="n + ' כוכבים'" (click)="value.set(n)">★</button>
        }
      </span>
    } @else {
      <span class="stars" [attr.aria-label]="label()">
        @for (n of five; track n) { <span class="star" [class.on]="n <= rounded()" aria-hidden="true">★</span> }
      </span>
      @if (count() != null) {
        <span class="meta">{{ meta() }}</span>
      }
    }
  `,
})
export class StarsComponent {
  readonly value = model(0);
  readonly count = input<number | null>(null);
  readonly editable = input(false);
  readonly five = [1, 2, 3, 4, 5];
  readonly rounded = computed(() => Math.round(this.value()));
  readonly label = computed(() => `דירוג ${this.value()} מתוך 5`);
  readonly meta = computed(() => {
    const n = this.count();
    if (!n) return 'עוד אין דירוגים';
    return `${this.value().toFixed(1)} · ${n === 1 ? 'דירוג אחד' : n + ' דירוגים'}`;
  });
}
