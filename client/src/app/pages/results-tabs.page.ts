import { Component } from '@angular/core';
import { IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { cashOutline, checkboxOutline, libraryOutline, statsChartOutline } from 'ionicons/icons';

@Component({
  selector: 'app-results-tabs',
  standalone: true,
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel],
  template: `
    <ion-tabs>
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="summary" href="/results/summary">
          <ion-icon name="cash-outline"></ion-icon><ion-label>מה מגיע לי</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="reports" href="/results/reports">
          <ion-icon name="stats-chart-outline"></ion-icon><ion-label>דוחות</ion-label>
        </ion-tab-button>
        <ion-tab-button href="/checklist">
          <ion-icon name="checkbox-outline"></ion-icon><ion-label>צ'קליסט</ion-label>
        </ion-tab-button>
        <ion-tab-button href="/sources">
          <ion-icon name="library-outline"></ion-icon><ion-label>מקורות</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  `
})
export class ResultsTabsPage {
  constructor() {
    addIcons({ cashOutline, statsChartOutline, checkboxOutline, libraryOutline });
  }
}
