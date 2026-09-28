import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
}

export interface LoginCredentials {
  email: string;
  password: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private currentUser = new BehaviorSubject<User | null>(this.getUserFromStorage());
  public user$ = this.currentUser.asObservable();
  private isLoggedIn = new BehaviorSubject<boolean>(!!this.getUserFromStorage());
  public isLoggedIn$ = this.isLoggedIn.asObservable();

  constructor() {
    // Try to restore session
    const user = this.getUserFromStorage();
    if (user) {
      this.currentUser.next(user);
      this.isLoggedIn.next(true);
    }
  }

  login(credentials: LoginCredentials): Observable<User> {
    // Simulate login - in production, call API
    return new Observable(observer => {
      // Simulate API call delay
      setTimeout(() => {
        const user: User = {
          id: '1',
          email: credentials.email,
          name: credentials.email.split('@')[0],
          role: 'user'
        };

        // Save to localStorage
        localStorage.setItem('auth_user', JSON.stringify(user));
        localStorage.setItem('auth_token', 'dummy_token_' + Date.now());

        this.currentUser.next(user);
        this.isLoggedIn.next(true);
        observer.next(user);
        observer.complete();
      }, 1000);
    });
  }

  logout(): void {
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_token');
    this.currentUser.next(null);
    this.isLoggedIn.next(false);
  }

  getCurrentUser(): User | null {
    return this.currentUser.value;
  }

  isAuthenticated(): boolean {
    return !!this.currentUser.value;
  }

  getToken(): string | null {
    return localStorage.getItem('auth_token');
  }

  private getUserFromStorage(): User | null {
    try {
      const user = localStorage.getItem('auth_user');
      return user ? JSON.parse(user) : null;
    } catch {
      return null;
    }
  }
}
