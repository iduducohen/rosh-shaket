import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { IonButton, IonContent, IonSpinner } from '@ionic/angular/standalone';
import { DeskHeaderComponent } from '../../core/desk-header.component';
import { ReviewStore } from '../../core/review.store';

@Component({
  selector: 'app-review-shell',
  standalone: true,
  imports: [IonContent, IonButton, IonSpinner, RouterOutlet, RouterLink, RouterLinkActive, DeskHeaderComponent],
  styles: [`
    .bar { display:flex; flex-wrap:wrap; gap:8px; margin: 8px 0 16px; }
    .bar a, .bar button { font-size: 13px; }
    .nav { display:flex; flex-wrap:wrap; gap:6px; margin-bottom: 12px; }
    .nav a { padding:6px 10px; border-radius: 999px; background: var(--ion-color-light); text-decoration:none; color: inherit; font-size: 13px; }
    .nav a.active { background: var(--ion-color-primary); color: #fff; }
    .note { font-size: 13px; color: var(--ion-color-medium); margin-bottom: 12px; }
  `],
  template: `
    <ion-content>
      <app-desk-header [step]="1"></app-desk-header>
      <div class="page ion-padding">
        <h1>בדיקת תקופת העסקה</h1>
        <p class="note">הערכה ואומדן בלבד — לא ייעוץ משפטי. חודש בלי מידע מוצג כ״לא ידוע״, לא כ־0.</p>
        <div class="nav">
          @for (s of steps; track s.path) {
            <a [routerLink]="s.path" routerLinkActive="active">{{ s.label }}</a>
          }
        </div>
        <div class="bar">
          <ion-button size="small" fill="outline" (click)="demo()" [disabled]="store.busy()">טען הדגמה (10 שנים)</ion-button>
          <ion-button size="small" fill="clear" routerLink="/start">חזרה לבחירת מסלול</ion-button>
          @if (store.busy()) { <ion-spinner name="crescent"></ion-spinner> }
        </div>
        @if (store.error()) { <p class="muted" style="color:var(--ion-color-danger)">{{ store.error() }}</p> }
        <router-outlet></router-outlet>
      </div>
    </ion-content>
  `
})
export class ReviewShellPage {
  readonly store = inject(ReviewStore);
  private readonly router = inject(Router);

  readonly steps = [
    { path: '/review/employment', label: '1. העסקה' },
    { path: '/review/documents', label: '2. מסמכים' },
    { path: '/review/salary', label: '3. שכר' },
    { path: '/review/funds', label: '4. קופות' },
    { path: '/review/dashboard', label: '5. לוח מצב' },
    { path: '/review/reconciliation', label: '6. הפקדות' },
    { path: '/review/simulation', label: '7. צבירה' },
    { path: '/review/termination', label: '8. סיום' },
    { path: '/review/report', label: '9. דוח' }
  ];

  async demo(): Promise<void> {
    await this.store.loadDemo();
    await this.router.navigateByUrl('/review/dashboard');
  }
}
