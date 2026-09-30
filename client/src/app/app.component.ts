import { Component, OnInit, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { filter } from 'rxjs';
import { SeoService } from './core/seo.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
  styles: [`
    .boot {
      position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center;
      background: #F6F4EF; color: #5E6F73;
      font-family: "Segoe UI", Arial, sans-serif;
    }
    .boot-in { display: grid; justify-items: center; gap: 14px; }
    .boot p { margin: 0; font-size: 15px; }
    @media (prefers-color-scheme: dark) {
      .boot { background: #0B1A1F; color: #9DB1B7; }
    }
  `],
  template: `
    @if (booting()) {
      <div class="boot" role="status" aria-live="polite">
        <div class="boot-in">
          <svg width="44" height="44" viewBox="0 0 40 40" aria-hidden="true">
            <defs>
              <linearGradient id="app-boot-g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#14967F"/><stop offset="1" stop-color="#0B5F53"/>
              </linearGradient>
              <clipPath id="app-boot-c"><path d="M13 31V19.5a7 7 0 0 1 14 0V31z"/></clipPath>
            </defs>
            <rect width="40" height="40" rx="11" fill="url(#app-boot-g)"/>
            <path d="M13 31V19.5a7 7 0 0 1 14 0V31z" fill="#FFFFFF"/>
            <g clip-path="url(#app-boot-c)">
              <circle cx="20" cy="25.2" r="4.2" fill="#F2A93B"/>
              <rect x="12" y="25.2" width="16" height="6" fill="#FFFFFF"/>
              <rect x="12" y="24.7" width="16" height="1" fill="#0E7C6B" opacity=".35"/>
            </g>
            <rect x="10" y="31" width="20" height="2.2" rx="1.1" fill="#FFFFFF" opacity=".55"/>
          </svg>
          <p>טוען…</p>
        </div>
      </div>
    }
    <ion-app><ion-router-outlet></ion-router-outlet></ion-app>
  `
})
export class AppComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly seo = inject(SeoService);
  readonly booting = signal(true);

  ngOnInit(): void {
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
      this.booting.set(false);
      this.seo.apply(this.router.routerState.snapshot.root);
    });
  }
}
