import { Component, input } from '@angular/core';

let uid = 0;

/**
 * Brand mark: scattered paperwork settles into one clear answer —
 * the product promise (payslip / docs → “מה מגיע לי”).
 * Original artwork. `tone` switches the wordmark for dark backgrounds.
 */
@Component({
  selector: 'app-logo',
  standalone: true,
  styles: [`
    :host { display: inline-flex; align-items: center; gap: 10px; }
    .word { font-family: var(--rs-serif); font-weight: 700; line-height: 1; white-space: nowrap; }
    .word small { display: block; font-family: var(--ion-font-family); font-weight: 400; font-size: .5em; opacity: .7; margin-top: 4px; letter-spacing: .01em; }
    :host(.light) .word { color: #F6F4EF; }
  `],
  host: { '[class.light]': "tone() === 'light'" },
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient [attr.id]="gid" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#14967F"/><stop offset="1" stop-color="#0B5F53"/>
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" [attr.fill]="'url(#' + gid + ')'"/>

      <!-- Back sheet (tilted) -->
      <rect x="9" y="10" width="18" height="22" rx="2.5"
            fill="none" stroke="#FFFFFF" stroke-width="1.5" opacity=".45"
            transform="rotate(-8 18 21)"/>
      <!-- Front sheet -->
      <rect x="12" y="9" width="18" height="22" rx="2.5"
            fill="none" stroke="#FFFFFF" stroke-width="1.65"/>
      <!-- Line summary on the sheet -->
      <path d="M16 15.5h10M16 19h8M16 22.5h6" fill="none" stroke="#FFFFFF"
            stroke-width="1.45" stroke-linecap="round" opacity=".85"/>
      <!-- Clear answer: check in a calm circle (בראש שקט) -->
      <circle cx="27.5" cy="27.5" r="6.2" fill="#0B5F53" stroke="#FFFFFF" stroke-width="1.5"/>
      <path d="M24.6 27.6l1.9 1.9 4.1-4.2" fill="none" stroke="#FFFFFF"
            stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    @if (wordmark()) {
      <span class="word" [style.font-size.px]="size() * 0.55">יוצאים בראש שקט
        @if (tagline()) { <small>זכויות בסיום עבודה, בפשטות</small> }
      </span>
    }
  `
})
export class LogoComponent {
  readonly size = input(36);
  readonly wordmark = input(true);
  readonly tagline = input(false);
  readonly tone = input<'dark' | 'light'>('dark');
  protected readonly gid = `rs-logo-g-${++uid}`;
}
