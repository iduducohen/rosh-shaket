import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  IonBackButton, IonButtons, IonContent, IonHeader, IonToolbar, ViewWillEnter
} from '@ionic/angular/standalone';
import { ApiService, describeError } from '../core/api.service';
import { RightsSource } from '../core/models';
import { DeskHeaderComponent } from '../core/desk-header.component';
import { PaidHelpComponent } from '../core/paid-help.component';
import { installReturnTracker, wizardReturn } from '../core/wizard-nav';
import { WizardStore } from '../core/wizard.store';
import { SiteFooterComponent } from '../core/site-footer.component';

@Component({
  selector: 'app-sources',
  standalone: true,
  imports: [SiteFooterComponent, 
    DeskHeaderComponent, PaidHelpComponent, RouterLink,
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonContent
  ],
  styles: [`
    .title-row {
      display: flex; align-items: baseline; justify-content: space-between; gap: 16px;
      margin: 0 0 6px;
    }
    .title-row h2 { margin: 0; }
    .back-to {
      flex: none; font-size: 15px; font-weight: 700;
      color: var(--ion-color-primary); text-decoration: none; white-space: nowrap;
    }
    .back-to:hover { text-decoration: underline; text-underline-offset: 3px; }
    .lead { margin: 0 0 20px; }
    .source-list {
      list-style: none; margin: 0; padding: 0;
      display: grid; gap: 0;
      border-top: 1px solid var(--rs-line);
    }
    .source-list a {
      display: grid; gap: 4px; padding: 14px 4px 15px;
      border-bottom: 1px solid var(--rs-line);
      color: inherit; text-decoration: none;
    }
    .source-list a:hover .title { color: var(--ion-color-primary); }
    .source-list .title {
      font-size: 16.5px; font-weight: 700; line-height: 1.3;
      display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
    }
    .source-list .title::after {
      content: "↗"; font-size: 13px; font-weight: 500; color: var(--ion-color-medium); flex: none;
    }
    .source-list .desc { font-size: 14px; color: var(--ion-color-medium); line-height: 1.4; max-width: 52ch; }
    @media (min-width: 992px) {
      .source-list {
        grid-template-columns: 1fr 1fr;
        column-gap: 40px;
        border-top: 0;
      }
      .source-list li:nth-child(1),
      .source-list li:nth-child(2) { border-top: 1px solid var(--rs-line); }
      .source-list a { padding: 16px 0; }
    }
  `],
  template: `
    <ion-header class="ion-no-border mobile-only">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button [defaultHref]="back().url" text="חזרה"></ion-back-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <app-desk-header [step]="headerStep()" [tabs]="!!store.results().length"></app-desk-header>
      <div class="page narrow ion-padding">
        <div class="title-row">
          <h2>מקורות ועזרה</h2>
          <a class="back-to" [routerLink]="back().url">חזרה</a>
        </div>
        <p class="lead muted small">כל המידע באפליקציה נשען על המקורות האלה.</p>
        @if (error()) { <div class="note">{{ error() }}</div> }
        <ul class="source-list">
          @for (s of sources(); track s.key) {
            <li>
              <a [href]="s.url" target="_blank" rel="noopener">
                <span class="title">{{ s.title }}</span>
                <span class="desc">{{ s.description }}</span>
              </a>
            </li>
          }
        </ul>
        <app-paid-help></app-paid-help>
      </div>
      <app-site-footer></app-site-footer>
    </ion-content>
  `
})
export class SourcesPage implements ViewWillEnter {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly store = inject(WizardStore);
  readonly sources = signal<RightsSource[]>([]);
  readonly error = signal('');
  readonly back = computed(() => wizardReturn(this.store));
  readonly headerStep = computed(() => {
    if (this.store.results().length) return 4;
    if (this.store.profile().startDate && this.store.profile().monthlySalary > 0) return 3;
    if (this.store.choice()) return 2;
    return 1;
  });

  constructor() {
    installReturnTracker(this.router);
    void this.load();
  }

  ionViewWillEnter(): void {
    void this.load();
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
