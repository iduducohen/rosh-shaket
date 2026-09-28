import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
  template: `<ion-app dir="rtl"><ion-router-outlet></ion-router-outlet></ion-app>`
})
export class AppComponent {}
