import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonApp, IonRouterOutlet, IonMenu, IonContent, IonList, IonItem, IonLabel, IonMenuToggle } from '@ionic/angular/standalone';
import { RouterModule } from '@angular/router';
import { AuthService } from './core/auth.service';
import { AppHeaderComponent } from './components/app-header.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    IonApp,
    IonRouterOutlet,
    IonMenu,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonMenuToggle,
    AppHeaderComponent
  ],
  template: `
    <ion-app dir="rtl">
      <!-- Header with Logo and User Info -->
      <app-header *ngIf="(authService.isLoggedIn$ | async)"></app-header>

      <!-- Side Menu -->
      <ion-menu *ngIf="(authService.isLoggedIn$ | async)" side="start" menuId="main-menu">
        <ion-header>
          <ion-toolbar color="primary">
            <ion-title>תפריט</ion-title>
          </ion-toolbar>
        </ion-header>
        <ion-content>
          <ion-list>
            <ion-menu-toggle>
              <ion-item routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">
                <ion-label>דף הבית</ion-label>
              </ion-item>
            </ion-menu-toggle>
            <ion-menu-toggle>
              <ion-item routerLink="/details" routerLinkActive="active">
                <ion-label>פרטים</ion-label>
              </ion-item>
            </ion-menu-toggle>
            <ion-menu-toggle>
              <ion-item routerLink="/results" routerLinkActive="active">
                <ion-label>תוצאות</ion-label>
              </ion-item>
            </ion-menu-toggle>
          </ion-list>
        </ion-content>
      </ion-menu>

      <!-- Main Content -->
      <ion-router-outlet id="main"></ion-router-outlet>
    </ion-app>
  `
})
export class AppComponent {
  constructor(public authService: AuthService) {}
}
