import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { RouteReuseStrategy, provideRouter } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { defineCustomElements } from '@ionic/pwa-elements/loader';
import { inject } from '@vercel/analytics';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';

// Web fallback UI for the Capacitor camera (native apps use the OS camera and gallery).
defineCustomElements(window);

// Vercel serves the insights script only for the web deployment.
if (!Capacitor.isNativePlatform()) {
  inject();
}

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({ mode: 'md' }),
    provideRouter(routes),
    provideHttpClient()
  ]
}).catch(err => console.error(err));
