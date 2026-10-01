import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { briefcaseOutline, scaleOutline } from 'ionicons/icons';

/** Entry cards on the results page — navigate to partner directories. */
@Component({
  selector: 'app-paid-help',
  standalone: true,
  imports: [IonIcon],
  styles: [`
    :host { display: block; margin-top: 28px; padding-top: 22px; border-top: 1px solid var(--rs-line); }
    h3 { margin: 0 0 6px; font-family: var(--rs-serif); font-size: 22px; }
    .kinds { display: grid; gap: 8px; margin-top: 14px; }
    @media (min-width: 640px) { .kinds { grid-template-columns: 1fr 1fr; } }
    .kind {
      display: flex; align-items: flex-start; gap: 10px; text-align: start; font: inherit; cursor: pointer;
      background: var(--rs-field); color: var(--ion-text-color);
      border: 1px solid var(--rs-line); border-radius: 12px; padding: 12px 14px;
    }
    .kind:hover { border-color: var(--ion-color-primary); background: var(--rs-soft); }
    .kind ion-icon { font-size: 22px; color: var(--ion-color-primary); flex: none; margin-top: 2px; }
    .kind b { display: block; }
    .kind small { display: block; color: var(--ion-color-medium); font-size: 13.5px; margin-top: 2px; }
  `],
  template: `
    <section aria-labelledby="paid-help-title">
      <h3 id="paid-help-title">רוצים שמישהו יבדוק את זה?</h3>
      <p class="muted">ההערכה כאן נשארת בלי עלות. אפשר לבחור איש מקצוע או עורך דין, לקרוא עליו, ולהשאיר פרטים כדי שיחזרו אליכם.</p>
      <div class="kinds">
        <button type="button" class="kind" (click)="go('professionals')">
          <ion-icon name="briefcase-outline" aria-hidden="true"></ion-icon>
          <span><b>איש מקצוע</b><small>בדיקת שכר, תלוש וזכויות בסיום העבודה</small></span>
        </button>
        <button type="button" class="kind" (click)="go('lawyers')">
          <ion-icon name="scale-outline" aria-hidden="true"></ion-icon>
          <span><b>עורך דין לדיני עבודה</b><small>כשיש מחלוקת, סירוב לשלם, או צורך בייצוג</small></span>
        </button>
      </div>
    </section>
  `
})
export class PaidHelpComponent {
  private readonly router = inject(Router);

  constructor() {
    addIcons({ briefcaseOutline, scaleOutline });
  }

  go(kind: 'professionals' | 'lawyers'): void {
    void this.router.navigateByUrl(`/help/${kind}`);
  }
}
