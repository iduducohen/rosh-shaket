import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonItem, IonLabel, IonList, ViewWillEnter } from '@ionic/angular/standalone';
import { ApiService, describeError } from '../core/api.service';
import { RightsSource } from '../core/models';
import { DeskHeaderComponent } from '../core/desk-header.component';
import { PaidHelpComponent } from '../core/paid-help.component';
import { WizardStore } from '../core/wizard.store';

@Component({
  selector: 'app-sources',
  standalone: true,
  imports: [DeskHeaderComponent, PaidHelpComponent, RouterLink, IonContent, IonList, IonItem, IonLabel, IonButton],
  styles: [`
    .results-nav {
      display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 16px;
    }
    .results-nav a {
      padding: 8px 14px; border-radius: 10px; border: 1px solid var(--rs-line);
      color: var(--ion-text-color); text-decoration: none; font-weight: 700; font-size: 14.5px;
      background: var(--ion-item-background);
    }
    .results-nav a.on { border-color: var(--ion-color-primary); background: var(--rs-soft); color: var(--ion-color-primary); }
    @media (min-width: 992px) {
      .results-nav { display: none; }
      ion-list.desk-grid-3 { background: transparent; }
      ion-list.desk-grid-3 ion-item { --background: var(--ion-item-background); border: 1px solid var(--rs-line); border-radius: 14px; --border-width: 0; --min-height: 96px; }
      .bottom { display: grid; grid-template-columns: 1fr auto; gap: 24px; align-items: center; margin-top: 24px; }
      .bottom .note { margin: 0; }
    }
  `],
  template: `
    <ion-content>
      <app-desk-header [step]="headerStep()" [tabs]="!!store.results().length"></app-desk-header>
      <div class="page ion-padding">
        <nav class="results-nav" aria-label="ניווט">
          @if (store.results().length) {
            <a routerLink="/results/summary">מה מגיע לי</a>
            <a routerLink="/results/reports">דוחות</a>
          }
          <a routerLink="/checklist">צ'קליסט</a>
          <a routerLink="/sources" class="on">מקורות</a>
        </nav>
        <h2>מקורות ועזרה</h2>
        <p class="muted small">כל המידע באפליקציה נשען על המקורות האלה.</p>
        @if (error()) { <div class="note">{{ error() }}</div> }
        <ion-list lines="full" class="desk-grid-3">
          @for (s of sources(); track s.key) {
            <ion-item [href]="s.url" target="_blank" detail="true">
              <ion-label class="ion-text-wrap"><h3>{{ s.title }}</h3><p>{{ s.description }}</p></ion-label>
            </ion-item>
          }
        </ion-list>
        <app-paid-help></app-paid-help>
        <div class="bottom">
        <ion-button expand="block" fill="outline" (click)="restart()">להתחיל מחדש</ion-button>
        </div>
      </div>
    </ion-content>
  `
})
export class SourcesPage implements ViewWillEnter {
  private readonly api = inject(ApiService);
  readonly store = inject(WizardStore);
  private readonly router = inject(Router);
  readonly sources = signal<RightsSource[]>([]);
  readonly error = signal('');
  readonly headerStep = computed(() => {
    if (this.store.results().length) return 4;
    if (this.store.profile().startDate && this.store.profile().monthlySalary > 0) return 3;
    if (this.store.choice()) return 2;
    return 1;
  });

  constructor() {
    void this.load();
  }

  ionViewWillEnter(): void {
    void this.load();
  }

  restart(): void {
    this.store.reset();
    void this.router.navigateByUrl('/start');
  }

  private async load(): Promise<void> {
    try {
      this.sources.set(await this.api.sources());
      this.error.set('');
    } catch (err) {
      this.error.set(describeError(err).message);
    }
  }
}
