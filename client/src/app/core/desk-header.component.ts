import { Component, inject, input } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkboxOutline, libraryOutline, logInOutline, logOutOutline, refreshOutline } from 'ionicons/icons';
import { WizardStore } from './wizard.store';
import { AuthService } from './auth/auth.service';
import { LogoComponent } from './logo.component';

/** Brand bar shown on desktop only (hidden by CSS below 992px). */
@Component({
  selector: 'app-desk-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, LogoComponent, IonIcon],
  styles: [`
    :host { display: none; }
    @media (min-width: 992px) {
      :host { display: block; border-bottom: 1px solid var(--rs-line); background: var(--ion-background-color); }
      .bar {
        max-width: 1120px; margin: 0 auto; padding: 14px 32px 12px;
        display: grid;
        grid-template-columns: minmax(0, auto) minmax(0, 1fr);
        grid-template-rows: auto auto;
        column-gap: 28px; row-gap: 12px;
        align-items: center;
      }
      .brand {
        grid-column: 1; grid-row: 1;
        font-family: var(--rs-serif); font-size: 22px; font-weight: 700; color: var(--ion-text-color);
        cursor: pointer; background: none; border: 0; padding: 0; justify-self: start;
      }

      .end {
        grid-column: 2; grid-row: 1;
        display: flex; align-items: center; justify-content: flex-end; gap: 8px;
        min-width: 0;
      }
      .actions {
        display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px;
      }
      .action {
        display: inline-flex; align-items: center; gap: 6px;
        height: 38px; padding: 0 12px; border-radius: 10px;
        border: 1px solid var(--rs-line); background: var(--ion-item-background);
        color: var(--ion-text-color); font: inherit; font-size: 13.5px; font-weight: 700;
        text-decoration: none; cursor: pointer; white-space: nowrap;
      }
      .action ion-icon { font-size: 17px; color: var(--ion-color-primary); flex: none; }
      .action:hover { border-color: var(--ion-color-primary); color: var(--ion-color-primary); }
      .action.active {
        background: var(--rs-soft); border-color: var(--ion-color-primary); color: var(--ion-color-primary);
      }
      .who { display: flex; align-items: center; gap: 8px; font-size: 14px; }
      .avatar {
        width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center;
        font-weight: 700; font-size: 14px; background: var(--rs-soft); color: var(--ion-color-primary);
      }

      /* Progress on its own row so it never collides with actions */
      .steps, .tabs {
        grid-column: 1 / -1; grid-row: 2;
        justify-self: stretch;
        padding-top: 2px;
        border-top: 1px solid var(--rs-line);
      }
      .steps {
        display: flex; align-items: center; justify-content: center; gap: 4px;
        font-size: 13.5px; color: var(--ion-color-medium); font-weight: 500;
        padding-top: 12px;
      }
      .steps span {
        display: inline-flex; align-items: center; gap: 7px;
        padding: 0 8px; white-space: nowrap;
      }
      .steps span + span::before {
        content: ""; width: 22px; height: 1px; background: var(--rs-line);
        margin-inline-end: 8px; flex: none;
      }
      .steps .n {
        width: 24px; height: 24px; border-radius: 50%; border: 1px solid var(--rs-line);
        display: grid; place-items: center; font-size: 12px; font-weight: 700; flex: none;
        color: var(--ion-color-medium); background: transparent;
      }
      .steps span.on { color: var(--ion-color-primary); font-weight: 700; }
      .steps span.on .n {
        background: var(--ion-color-primary); border-color: var(--ion-color-primary);
        color: var(--ion-color-primary-contrast);
      }

      .tabs {
        display: flex; gap: 6px; padding-top: 10px; justify-content: center;
      }
      .tabs a {
        padding: 8px 14px; border-radius: 10px; color: var(--ion-text-color);
        text-decoration: none; font-weight: 600; font-size: 15px;
      }
      .tabs a.active { background: var(--rs-soft); color: var(--ion-color-primary); }
    }
  `],
  template: `
    <div class="bar">
      <button class="brand" (click)="home()" aria-label="יוצאים בראש שקט – לדף הבית"><app-logo [size]="30"></app-logo></button>

      <div class="end">
        <nav class="actions" aria-label="פעולות קבועות">
          @if (step() > 1) {
            <button type="button" class="action" (click)="home()">
              <ion-icon name="refresh-outline" aria-hidden="true"></ion-icon>
              להתחיל מחדש
            </button>
          }
          <a class="action" routerLink="/checklist" routerLinkActive="active">
            <ion-icon name="checkbox-outline" aria-hidden="true"></ion-icon>
            צ'קליסט
          </a>
          <a class="action" routerLink="/sources" routerLinkActive="active">
            <ion-icon name="library-outline" aria-hidden="true"></ion-icon>
            מקורות
          </a>
          @if (auth.isSignedIn()) {
            <span class="who"><span class="avatar" aria-hidden="true">{{ initial() }}</span>{{ auth.displayName() }}</span>
            <button type="button" class="action" (click)="signOut()">
              <ion-icon name="log-out-outline" aria-hidden="true"></ion-icon>
              התנתקות
            </button>
          } @else {
            <button type="button" class="action" (click)="signIn()">
              <ion-icon name="log-in-outline" aria-hidden="true"></ion-icon>
              התחברות
            </button>
          }
        </nav>
      </div>

      @if (tabs()) {
        <nav class="tabs" aria-label="תוצאות">
          <a routerLink="/results/summary" routerLinkActive="active">מה מגיע לי</a>
          <a routerLink="/results/reports" routerLinkActive="active">דוחות</a>
          <a routerLink="/checklist" routerLinkActive="active">צ'קליסט</a>
          <a routerLink="/sources" routerLinkActive="active">מקורות</a>
        </nav>
      } @else {
        <nav class="steps" aria-label="שלבי התהליך">
          <span [class.on]="step() === 1"><span class="n" aria-hidden="true">1</span>תלוש שכר</span>
          <span [class.on]="step() === 2"><span class="n" aria-hidden="true">2</span>סיבת העזיבה</span>
          <span [class.on]="step() === 3"><span class="n" aria-hidden="true">3</span>פרטים</span>
          <span [class.on]="step() === 4"><span class="n" aria-hidden="true">4</span>מה מגיע לי</span>
        </nav>
      }
    </div>
  `
})
export class DeskHeaderComponent {
  readonly step = input(1);
  readonly tabs = input(false);
  private readonly router = inject(Router);
  private readonly store = inject(WizardStore);
  readonly auth = inject(AuthService);

  constructor() {
    addIcons({ refreshOutline, checkboxOutline, libraryOutline, logInOutline, logOutOutline });
  }

  initial(): string {
    return (this.auth.displayName() ?? '?').charAt(0).toUpperCase();
  }

  signOut(): void {
    this.auth.signOut();
    this.store.reset();
    this.router.navigateByUrl('/login');
  }

  signIn(): void {
    this.auth.signOut();
    this.router.navigateByUrl('/login');
  }

  home(): void {
    this.store.reset();
    this.router.navigateByUrl('/start');
  }
}
