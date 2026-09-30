import { Component, input } from '@angular/core';

let uid = 0;

/**
 * Brand mark: a quiet head in profile – calm mind when leaving work.
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
      <!-- Head profile facing left (RTL) -->
      <path
        d="M25.2 31.5
           C29.5 27.8 31.2 22.2 29.6 16.8
           C28.2 11.8 23.6 9.2 18.4 9.8
           C15.2 10.2 12.8 12 11.8 14.6
           C11.2 16.2 10.2 17.2 9.6 18
           L12.8 19.4
           C11.8 21.2 11.6 23 12.8 24.8
           C14.2 26.8 16.4 28.2 18.2 29.2
           L19.2 31.5"
        fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- Calm mind: line broken around a quiet point -->
      <path d="M14 16.4h3.6M22.4 16.4H26" fill="none" stroke="#FFFFFF" stroke-width="1.55" stroke-linecap="round"/>
      <circle cx="20" cy="16.4" r="1.9" fill="none" stroke="#FFFFFF" stroke-width="1.55"/>
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
