import { Component, input } from '@angular/core';

let uid = 0;

/**
 * Brand mark: a doorway with a sun rising inside it – leaving, calmly, toward something brighter.
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
        <clipPath [attr.id]="cid"><path d="M13 31V19.5a7 7 0 0 1 14 0V31z"/></clipPath>
      </defs>
      <rect width="40" height="40" rx="11" [attr.fill]="'url(#' + gid + ')'"/>
      <path d="M13 31V19.5a7 7 0 0 1 14 0V31z" fill="#FFFFFF"/>
      <g [attr.clip-path]="'url(#' + cid + ')'">
        <circle cx="20" cy="25.2" r="4.2" fill="#F2A93B"/>
        <rect x="12" y="25.2" width="16" height="6" fill="#FFFFFF"/>
        <rect x="12" y="24.7" width="16" height="1" fill="#0E7C6B" opacity=".35"/>
      </g>
      <rect x="10" y="31" width="20" height="2.2" rx="1.1" fill="#FFFFFF" opacity=".55"/>
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
  protected readonly cid = `rs-logo-c-${uid}`;
}
