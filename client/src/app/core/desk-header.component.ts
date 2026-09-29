import { Component, inject, input } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { WizardStore } from './wizard.store';
import { AuthService } from './auth/auth.service';
import { LogoComponent } from './logo.component';

/** Brand bar shown on desktop only (hidden by CSS below 992px). */
@Component({
  selector: 'app-desk-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, LogoComponent],
  styles: [`
    :host { display: none; }
    @media (min-width: 992px) {
      :host { display: block; border-bottom: 1px solid var(--rs-line); background: var(--ion-background-color); }
      .bar { max-width: 1120px; margin: 0 auto; padding: 16px 32px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
      .brand { font-family: var(--rs-serif); font-size: 22px; font-weight: 700; color: var(--ion-text-color); cursor: pointer; background: none; border: 0; padding: 0; }
      .steps { display: flex; gap: 22px; font-size: 14.5px; color: var(--ion-color-medium); }
      .steps span.on { color: var(--ion-color-primary); font-weight: 700; }
      .tabs { display: flex; gap: 6px; }
      .tabs a { padding: 8px 14px; border-radius: 10px; color: var(--ion-text-color); text-decoration: none; font-weight: 600; font-size: 15px; }
      .tabs a.active { background: var(--rs-soft); color: var(--ion-color-primary); }
      .end { display: flex; align-items: center; gap: 16px; }
      .who { display: flex; align-items: center; gap: 8px; font-size: 14.5px; }
      .avatar { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 14px;
                background: var(--rs-soft); color: var(--ion-color-primary); }
      .restart { background: none; border: 0; color: var(--ion-color-primary); font: inherit; font-size: 14.5px; cursor: pointer; }
    }
  `],
  template: `
    <div class="bar">
      <button class="brand" (click)="home()" aria-label="יוצאים בראש שקט – לדף הבית"><app-logo [size]="30"></app-logo></button>
      @if (tabs()) {
        <nav class="tabs" aria-label="תוצאות">
          <a routerLink="/results/summary" routerLinkActive="active">מה מגיע לי</a>
          <a routerLink="/results/checklist" routerLinkActive="active">צ'קליסט</a>
          <a routerLink="/results/sources" routerLinkActive="active">מקורות</a>
        </nav>
      } @else {
      <nav class="steps" aria-label="שלבים">
        <span [class.on]="step() === 1">1. תלוש או הזנה</span>
        <span [class.on]="step() === 2">2. סיבת העזיבה</span>
        <span [class.on]="step() === 3">3. פרטים</span>
        <span [class.on]="step() === 4">4. מה מגיע לי</span>
      </nav>
      }
      <div class="end">
        <button class="restart" (click)="home()">להתחיל מחדש</button>
        @if (auth.isSignedIn()) {
          <span class="who"><span class="avatar" aria-hidden="true">{{ initial() }}</span>{{ auth.displayName() }}</span>
          <button class="restart" (click)="signOut()">התנתקות</button>
        } @else {
          <button class="restart" (click)="signIn()">התחברות</button>
        }
      </div>
    </div>
  `
})
export class DeskHeaderComponent {
  readonly step = input(1);
  readonly tabs = input(false);
  private readonly router = inject(Router);
  private readonly store = inject(WizardStore);
  readonly auth = inject(AuthService);

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
