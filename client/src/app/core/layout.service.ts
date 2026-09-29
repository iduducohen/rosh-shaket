import { Injectable, signal } from '@angular/core';

const DESKTOP_QUERY = '(min-width: 992px)';

/** Desktop vs. mobile, as a signal. Layout switches at 992px (Ionic's "lg" breakpoint). */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  private readonly mq = window.matchMedia(DESKTOP_QUERY);
  readonly isDesktop = signal(this.mq.matches);

  constructor() {
    this.mq.addEventListener('change', e => this.isDesktop.set(e.matches));
  }
}
