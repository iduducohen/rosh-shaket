import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonBadge,
  IonMenuButton
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { logOut, person } from 'ionicons/icons';
import { AuthService, User } from '../core/auth.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonBadge,
    IonMenuButton
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start">
          <ion-menu-button></ion-menu-button>
        </ion-buttons>

        <!-- Logo & Title -->
        <ion-title class="logo-title">
          <span class="logo">📊</span>
          RoshShaket
        </ion-title>

        <!-- User Menu -->
        <ion-buttons slot="end" *ngIf="currentUser$ | async as user">
          <ion-button (click)="toggleUserMenu()">
            <ion-icon slot="start" name="person"></ion-icon>
            {{ user.name }}
          </ion-button>

          <!-- User Menu Dropdown -->
          <div *ngIf="showUserMenu" class="user-menu-dropdown">
            <div class="user-info">
              <p><strong>{{ user.name }}</strong></p>
              <p style="font-size: 12px; color: #666;">{{ user.email }}</p>
            </div>
            <button (click)="logout()">
              <ion-icon name="log-out"></ion-icon>
              התנתק
            </button>
          </div>
        </ion-buttons>

        <!-- Login Button (when not logged in) -->
        <ion-buttons slot="end" *ngIf="!(currentUser$ | async)">
          <ion-button (click)="goToLogin()">
            <ion-icon slot="start" name="person"></ion-icon>
            התחבר
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
  `,
  styles: [`
    .logo-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 20px;
      font-weight: bold;
    }

    .logo {
      font-size: 24px;
    }

    .user-menu-dropdown {
      position: absolute;
      top: 100%;
      right: 0;
      background: white;
      border: 1px solid #ddd;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      z-index: 1000;
      min-width: 200px;
    }

    .user-info {
      padding: 12px;
      border-bottom: 1px solid #eee;
    }

    .user-info p {
      margin: 4px 0;
    }

    .user-menu-dropdown button {
      width: 100%;
      padding: 12px;
      border: none;
      background: none;
      text-align: right;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
    }

    .user-menu-dropdown button:hover {
      background-color: #f5f5f5;
    }

    ion-button {
      --text-color: white;
    }
  `]
})
export class AppHeaderComponent implements OnInit {
  currentUser$ = this.authService.user$;
  showUserMenu = false;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {
    addIcons({ logOut, person });
  }

  ngOnInit(): void {}

  toggleUserMenu(): void {
    this.showUserMenu = !this.showUserMenu;
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
    this.showUserMenu = false;
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
