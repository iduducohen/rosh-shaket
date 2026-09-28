import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonCard,
  IonCardContent,
  IonButton,
  IonInput,
  IonItem,
  IonLabel,
  IonText,
  IonSpinner,
  IonImg
} from '@ionic/angular/standalone';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonCard,
    IonCardContent,
    IonButton,
    IonInput,
    IonItem,
    IonLabel,
    IonText,
    IonSpinner,
    IonImg
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>התחברות למערכת</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding" dir="rtl">
      <div class="login-container">
        <!-- Logo -->
        <div class="logo-container">
          <div class="logo">📊</div>
          <h1>RoshShaket</h1>
          <p>מערכת חישוב זכויות עובדים</p>
        </div>

        <!-- Login Form -->
        <ion-card>
          <ion-card-content>
            <form [formGroup]="loginForm" (ngSubmit)="onLogin()">
              <!-- Email -->
              <ion-item>
                <ion-label position="floating">דוא"ל</ion-label>
                <ion-input
                  formControlName="email"
                  type="email"
                  placeholder="הכנס דוא״ל"
                  dir="rtl">
                </ion-input>
              </ion-item>

              <!-- Password -->
              <ion-item>
                <ion-label position="floating">סיסמה</ion-label>
                <ion-input
                  formControlName="password"
                  type="password"
                  placeholder="הכנס סיסמה"
                  dir="rtl">
                </ion-input>
              </ion-item>

              <!-- Error Message -->
              <div *ngIf="errorMessage" class="error-message">
                <ion-text color="danger">
                  <p>{{ errorMessage }}</p>
                </ion-text>
              </div>

              <!-- Submit Button -->
              <ion-button
                expand="block"
                color="primary"
                type="submit"
                [disabled]="!loginForm.valid || isLoading">
                <ion-spinner *ngIf="isLoading" name="dots"></ion-spinner>
                <span *ngIf="!isLoading">התחבר</span>
              </ion-button>
            </form>

            <!-- Demo Credentials -->
            <div class="demo-info">
              <p><strong>נתוני דוגמה:</strong></p>
              <p>דוא"ל: demo@example.com</p>
              <p>סיסמה: demo123</p>
            </div>
          </ion-card-content>
        </ion-card>
      </div>
    </ion-content>
  `,
  styles: [`
    .login-container {
      max-width: 400px;
      margin: 0 auto;
      padding-top: 40px;
    }

    .logo-container {
      text-align: center;
      margin-bottom: 40px;
    }

    .logo {
      font-size: 64px;
      margin-bottom: 16px;
    }

    .logo-container h1 {
      margin: 8px 0;
      font-size: 28px;
      font-weight: bold;
    }

    .logo-container p {
      margin: 4px 0;
      color: #666;
      font-size: 14px;
    }

    .error-message {
      margin: 12px 0;
      padding: 8px;
      background-color: #f8d7da;
      border-radius: 4px;
    }

    .demo-info {
      margin-top: 20px;
      padding: 12px;
      background-color: #e8f4f8;
      border-radius: 4px;
      font-size: 12px;
      color: #555;
      text-align: center;
    }

    .demo-info p {
      margin: 4px 0;
    }

    ion-button[disabled] {
      opacity: 0.6;
    }
  `]
})
export class LoginPage implements OnInit {
  loginForm!: FormGroup;
  isLoading = false;
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initializeForm();
  }

  initializeForm(): void {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  onLogin(): void {
    if (!this.loginForm.valid) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    const credentials = this.loginForm.value;

    this.authService.login(credentials).subscribe({
      next: () => {
        this.isLoading = false;
        this.router.navigate(['/']);
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error.message || 'התחברות נכשלה. בדוק את הנתונים שהכנסת.';
      }
    });
  }
}
