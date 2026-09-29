import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonSpinner, IonToolbar } from '@ionic/angular/standalone';
import { DeskHeaderComponent } from '../core/desk-header.component';
import { describeError } from '../core/api.service';
import { CalculationFacade } from '../core/calculation.facade';
import { ExitChoice } from '../core/models';
import { WizardStore } from '../core/wizard.store';

interface Option { value: ExitChoice; label: string; hint?: string; }

@Component({
  selector: 'app-reason',
  standalone: true,
  imports: [DeskHeaderComponent, IonHeader, IonToolbar, IonButtons, IonBackButton, IonContent, IonButton, IonSpinner],
  template: `
    <ion-header class="ion-no-border mobile-only"><ion-toolbar><ion-buttons slot="start"><ion-back-button defaultHref="/" text="חזרה"></ion-back-button></ion-buttons></ion-toolbar></ion-header>
    <ion-content>
      <app-desk-header [step]="2"></app-desk-header>
      <div class="page narrow ion-padding">
        @if (store.fromPayslip()) {
          <p class="small" style="color: var(--ion-color-primary)">זיהינו {{ store.filledFields().length }} נתונים מהתלוש. נשארה שאלה אחת.</p>
        }
        <h2>למה אתם עוזבים?</h2>
        <p class="muted small">הסיבה קובעת כמעט את כל הזכויות.</p>
        <div class="desk-grid-2">
        @for (o of options; track o.value) {
          <button class="choice" [class.selected]="store.choice() === o.value" [attr.aria-pressed]="store.choice() === o.value"
                  (click)="store.choice.set(o.value)">
            {{ o.label }} @if (o.hint) { <small>{{ o.hint }}</small> }
          </button>
        }
        </div>
        @if (error()) { <div class="note">{{ error() }}</div> }
        <div class="desk-actions"><ion-button expand="block" [disabled]="!store.choice() || busy()" (click)="next()">
          @if (busy()) { <ion-spinner name="crescent"></ion-spinner> } @else { המשך }
        </ion-button></div>
      </div>
    </ion-content>
  `
})
export class ReasonPage {
  readonly store = inject(WizardStore);
  private readonly facade = inject(CalculationFacade);
  private readonly router = inject(Router);
  readonly busy = signal(false);
  readonly error = signal('');

  readonly options: Option[] = [
    { value: 'Fired', label: 'פוטרתי', hint: 'או שקיבלתי זימון לשימוע' },
    { value: 'ResignedJustified', label: 'התפטרתי מסיבה מוצדקת', hint: 'הרעת תנאים, מצב בריאותי, מעבר דירה' },
    { value: 'Resigned', label: 'התפטרתי', hint: 'מסיבה אחרת, למשל עבודה חדשה' },
    { value: 'ContractEnded', label: 'החוזה הסתיים ולא חודש' },
    { value: 'Considering', label: 'עוד שוקל לעזוב', hint: 'נראה לכם את שני התרחישים' }
  ];

  async next(): Promise<void> {
    // From a payslip with enough data: calculate right away and let the user correct afterwards.
    if (this.store.fromPayslip() && this.store.hasEnoughForCalculation()) {
      this.busy.set(true);
      this.error.set('');
      try {
        await this.facade.calculate();
        await this.router.navigateByUrl('/results/summary');
        return;
      } catch (err) {
        this.error.set(describeError(err).message);
      } finally {
        this.busy.set(false);
      }
    }
    await this.router.navigateByUrl('/details');
  }
}
