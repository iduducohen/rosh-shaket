import { Component, inject, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { IonContent, IonSpinner } from '@ionic/angular/standalone';
import { filter } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DeskHeaderComponent } from '../../core/desk-header.component';
import { AuthService } from '../../core/auth/auth.service';
import { ReviewStore } from '../../core/review.store';
import { WorkspaceService } from '../../core/workspace.service';
import { SiteFooterComponent } from '../../core/site-footer.component';

const LEGACY_STEPS: Record<string, string> = {
  '/review/salary': '/review/check',
  '/review/funds': '/review/check',
  '/review/dashboard': '/review/check',
  '/review/reconciliation': '/review/check',
  '/review/simulation': '/review/report',
  '/review/termination': '/review/report'
};

@Component({
  selector: 'app-review-shell',
  standalone: true,
  imports: [SiteFooterComponent, IonContent, IonSpinner, RouterOutlet, RouterLink, RouterLinkActive, DeskHeaderComponent],
  styles: [`
    .note { font-size: 13px; color: var(--ion-color-medium); margin-bottom: 12px; }
    /* Less empty space between the step buttons and the footer. */
    .page { padding-bottom: 12px; }
    app-site-footer { margin-top: 20px; }
    .busy-row { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; font-size: 13px; color: var(--ion-color-medium); }

    /* Same language as desk-header wizard steps */
    .steps {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 4px;
      margin: 0 0 16px; padding: 12px 0;
      border-top: 1px solid var(--rs-line); border-bottom: 1px solid var(--rs-line);
      font-size: 13.5px; color: var(--ion-color-medium); font-weight: 500;
    }
    .steps a, .steps .locked {
      display: inline-flex; align-items: center; gap: 7px;
      padding: 4px 8px; white-space: nowrap;
      text-decoration: none; color: inherit; border-radius: 8px;
    }
    /* A step whose earlier steps aren't done: visible but not clickable. */
    .steps .locked { opacity: .45; cursor: not-allowed; }
    .steps > * + *::before {
      content: ""; width: 18px; height: 1px; background: var(--rs-line);
      margin-inline-end: 8px; flex: none;
    }
    .steps .n {
      width: 24px; height: 24px; border-radius: 50%; border: 1px solid var(--rs-line);
      display: grid; place-items: center; font-size: 12px; font-weight: 700; flex: none;
      color: var(--ion-color-medium); background: transparent;
    }
    .steps a.on { color: var(--ion-color-primary); font-weight: 700; }
    .steps a.on .n {
      background: var(--ion-color-primary); border-color: var(--ion-color-primary);
      color: var(--ion-color-primary-contrast, #fff);
    }
    .steps a:hover { color: var(--ion-color-primary); }
    .steps a:hover .n { border-color: var(--ion-color-primary); }

    @media (max-width: 720px) {
      .steps {
        justify-content: flex-start;
        flex-wrap: nowrap;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        gap: 2px;
        font-size: 12.5px;
      }
      .steps > * + *::before { width: 12px; margin-inline-end: 4px; }
    }
  `],
  template: `
    <ion-content>
      <app-desk-header [step]="1"></app-desk-header>
      <div class="page ion-padding">
        <h1>בדיקת תקופת העסקה</h1>
        <p class="note">הערכה ואומדן בלבד — לא ייעוץ משפטי. חודש בלי מידע מוצג כ״לא ידוע״, לא כ־0. ההתקדמות נשמרת אוטומטית. עם התחברות — גם במכשיר אחר.</p>
        <nav class="steps" aria-label="שלבי הבדיקה">
          @for (s of steps; track s.path; let i = $index) {
            @if (lockedReason(s.path); as why) {
              <span class="locked" aria-disabled="true" [attr.title]="why">
                <span class="n" aria-hidden="true">{{ i + 1 }}</span>{{ s.label }}
              </span>
            } @else {
              <a [routerLink]="s.path" routerLinkActive="on">
                <span class="n" aria-hidden="true">{{ i + 1 }}</span>{{ s.label }}
              </a>
            }
          }
        </nav>
        @if (store.busy()) {
          <div class="busy-row"><ion-spinner name="crescent"></ion-spinner> שומר / מחשב…</div>
        }
        @if (store.error()) { <p class="muted" style="color:var(--ion-color-danger)">{{ store.error() }}</p> }
        <router-outlet></router-outlet>
      </div>
      <app-site-footer></app-site-footer>
    </ion-content>
  `
})
export class ReviewShellPage implements OnInit {
  readonly store = inject(ReviewStore);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly workspaces = inject(WorkspaceService);
  private resumed = false;

  readonly steps = [
    { path: '/review/employment', label: 'התחלה' },
    { path: '/review/documents', label: 'מסמכים' },
    { path: '/review/check', label: 'בדיקה' },
    { path: '/review/report', label: 'תוצאות' }
  ];

  constructor() {
    this.store.setCurrentStep(this.normalize(this.router.url));
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      takeUntilDestroyed()
    ).subscribe(e => {
      this.store.setCurrentStep(this.normalize(e.urlAfterRedirects));
    });
  }

  async ngOnInit(): Promise<void> {
    if (this.auth.isSignedIn() || this.auth.hasSession()) {
      try {
        const ws = await this.workspaces.restore();
        if (ws?.id) this.store.useWorkspaceId(ws.id);
      } catch {
        // Offline / auth expired — continue with local draft.
      }
    }
    const savedStep = await this.store.hydrateFromServer();
    this.store.setCurrentStep(this.normalize(this.router.url));
    if (this.resumed) return;
    this.resumed = true;
    const here = this.normalize(this.router.url);
    if (savedStep && savedStep !== here && savedStep.startsWith('/review/') && here === '/review/employment') {
      const target = LEGACY_STEPS[savedStep] ?? savedStep;
      if (this.steps.some(s => s.path === target)) void this.router.navigateByUrl(target);
    }
  }

  /** Why a step can't be opened yet (null = open). Mirrors the route guards in core/wizard-guards. */
  lockedReason(path: string): string | null {
    if (path === '/review/employment') return null;
    if (!this.store.hasPeriod()) return 'מלאו קודם את תקופת ההעסקה';
    if (path === '/review/documents') return null;
    return this.store.documentsBlocker();
  }

  private normalize(url: string): string {
    const path = url.split('?')[0];
    return path.startsWith('/review') ? path : '/review/employment';
  }
}
