import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';
import { ApiService, describeError } from '../core/api.service';
import { RightsSource } from '../core/models';
import { WizardStore } from '../core/wizard.store';

@Component({
  selector: 'app-sources',
  standalone: true,
  imports: [IonContent, IonList, IonItem, IonLabel, IonButton],
  template: `
    <ion-content class="ion-padding">
      <div class="page">
        <h2>מקורות ועזרה</h2>
        <p class="muted small">כל המידע באפליקציה נשען על המקורות האלה.</p>
        @if (error()) { <div class="note">{{ error() }}</div> }
        <ion-list lines="full">
          @for (s of sources(); track s.key) {
            <ion-item [href]="s.url" target="_blank" detail="true">
              <ion-label class="ion-text-wrap"><h3>{{ s.title }}</h3><p>{{ s.description }}</p></ion-label>
            </ion-item>
          }
        </ion-list>
        <div class="note">מצאתם פער גדול, או שהמעסיק מסרב לשלם? שווה להתייעץ עם עורך דין לדיני עבודה.</div>
        <ion-button expand="block" fill="outline" (click)="restart()">להתחיל מחדש</ion-button>
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
    this.router.navigateByUrl('/');
  }
}
