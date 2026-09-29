import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';
import { ApiService, describeError } from '../core/api.service';
import { RightsSource } from '../core/models';
import { DeskHeaderComponent } from '../core/desk-header.component';
import { PaidHelpComponent } from '../core/paid-help.component';
import { WizardStore } from '../core/wizard.store';

@Component({
  selector: 'app-sources',
  standalone: true,
  imports: [DeskHeaderComponent, PaidHelpComponent, IonContent, IonList, IonItem, IonLabel, IonButton],
  styles: [`
    @media (min-width: 992px) {
      ion-list.desk-grid-3 { background: transparent; }
      ion-list.desk-grid-3 ion-item { --background: var(--ion-item-background); border: 1px solid var(--rs-line); border-radius: 14px; --border-width: 0; --min-height: 96px; }
      .bottom { display: grid; grid-template-columns: 1fr auto; gap: 24px; align-items: center; margin-top: 24px; }
      .bottom .note { margin: 0; }
    }
  `],
  template: `
    <ion-content>
      <app-desk-header [step]="4" [tabs]="true"></app-desk-header>
      <div class="page ion-padding">
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
export class SourcesPage {
  private readonly api = inject(ApiService);
  private readonly store = inject(WizardStore);
  private readonly router = inject(Router);
  readonly sources = signal<RightsSource[]>([]);
  readonly error = signal('');

  constructor() {
    this.api.sources().then(s => this.sources.set(s)).catch(err => this.error.set(describeError(err).message));
  }

  restart(): void {
    this.store.reset();
    this.router.navigateByUrl('/start');
  }
}
