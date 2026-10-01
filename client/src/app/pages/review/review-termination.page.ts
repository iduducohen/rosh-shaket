import { Component, computed, inject, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonButton } from '@ionic/angular/standalone';
import { DOC_CHECKLIST, healthLabel } from '../../core/review.models';
import { ReviewStore } from '../../core/review.store';
import { WizardStore } from '../../core/wizard.store';
import { CalculationFacade } from '../../core/calculation.facade';
import { ReviewStepNavComponent } from './review-step-nav.component';

@Component({
  selector: 'app-review-termination',
  standalone: true,
  imports: [IonButton, RouterLink, ReviewStepNavComponent],
  styles: [`
    .box { border-radius:12px; padding:12px; margin:10px 0; border:1px solid var(--rs-line,#ddd); }
    .ok { border-color: var(--ion-color-success); }
    .warn { border-color: var(--ion-color-warning); }
    .bad { border-color: var(--ion-color-danger); }
  `],
  template: `
    <h2>סיום העסקה</h2>
    <p class="muted">הפרדה חשובה: מה שהופקד לקופה ≠ בהכרח מה שעשוי להגיע כפיצויי פיטורים.</p>

    <div class="box">
      <b>מה נבדק</b>
      <p>{{ store.monthCount() }} חודשים · {{ store.docCount() }} מסמכים · {{ healthLabel(status()) }}</p>
    </div>

    <div class="box ok">
      <b>מה נמצא תקין / עם מידע</b>
      <p>{{ analysis()?.summary?.monthsOk ?? 0 }} חודשים ללא פער מספרי ידוע</p>
    </div>

    <div class="box warn">
      <b>מה דורש בדיקה</b>
      <p>{{ analysis()?.summary?.monthsWithGap ?? 0 }} חודשים עם פער · {{ analysis()?.summary?.monthsUnknownActual ?? 0 }} עם בפועל לא ידוע</p>
    </div>

    <div class="box bad">
      <b>מה חסר / לבקש מהמעסיק או מהקופה</b>
      <ul>
        @for (d of missingDocs(); track d) { <li>{{ d }}</li> }
      </ul>
      @if (store.hasAnyWaiver()) {
        <p class="muted small">חלק מהמסמכים סומנו כלא זמינים ולא נכללים ברשימת החסרים — החישוב ישתמש במה שיש.</p>
      }
    </div>

    <div class="box">
      <b>אומדן מצב הקופות</b>
      <p>יתרות שהוזנו: {{ store.fmt(fundTotal()) }}</p>
      <p>צבירה משוערת (בסיס): {{ store.fmt(baseSim()) }}</p>
      <p class="muted small">אומדן בלבד — תלוי בתשואות ודמי ניהול שהונחו.</p>
    </div>

    <div class="box">
      <b>אומדן רכיב פיצויים בעת סיום</b>
      @if (exitTotal() != null) {
        <p>{{ store.fmt(exitTotal()) }} (ממחשבון הסיום הקיים — הערכה)</p>
        <ion-button fill="outline" size="small" routerLink="/results/summary">לפירוט הערכת הסיום</ion-button>
      } @else {
        <p class="muted">ניתן להריץ הערכת סיום מהירה על בסיס השכר האחרון.</p>
        <ion-button size="small" (click)="runExitEstimate()" [disabled]="busy">חישוב אומדן סיום</ion-button>
      }
    </div>

    <p><b>אין כאן קביעה משפטית.</b> על בסיס המידע שסיפקתם אנו מעריכים / מסמנים מה דורש בדיקה נוספת.</p>
    <app-review-step-nav (next)="goNext()" />
  `
})
export class ReviewTerminationPage implements OnInit {
  readonly store = inject(ReviewStore);
  private readonly wizard = inject(WizardStore);
  private readonly calc = inject(CalculationFacade);
  private readonly router = inject(Router);
  readonly healthLabel = healthLabel;
  busy = false;

  analysis = computed(() => this.store.analysis());
  status = computed(() => this.analysis()?.summary.health.status ?? 'InsufficientData');

  missingDocs = computed(() => {
    const types = new Set((this.store.review()?.documents ?? []).map(d => d.documentType));
    return DOC_CHECKLIST.filter(d => !types.has(d.key)).map(d => d.label);
  });

  fundTotal = computed(() => {
    const vals = (this.store.review()?.funds ?? []).map(f => f.balance).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) : null;
  });

  baseSim = computed(() => this.analysis()?.simulations.find(s => s.scenario === 'Base')?.estimatedBalance ?? null);
  exitTotal = computed(() => this.wizard.active()?.estimatedTotal ?? null);

  async ngOnInit(): Promise<void> {
    if (!this.store.analysis()) await this.store.analyze();
  }

  goNext(): void {
    void this.router.navigateByUrl('/review/report');
  }

  async runExitEstimate(): Promise<void> {
    const r = this.store.review();
    if (!r?.period) return;
    const last = [...r.months].reverse().find(m => m.grossSalary != null);
    if (!last?.grossSalary) return;
    this.busy = true;
    try {
      const reason = ['Fired', 'Resigned', 'ResignedJustified', 'ContractEnded'].includes(r.period.exitReason ?? '')
        ? (r.period.exitReason as 'Fired' | 'Resigned' | 'ResignedJustified' | 'ContractEnded')
        : 'Fired';
      this.wizard.choice.set(reason);
      this.wizard.profile.set({
        ...this.wizard.profile(),
        startDate: r.period.startDate,
        endDate: r.period.endDate,
        monthlySalary: last.grossSalary
      });
      await this.calc.calculate();
    } finally {
      this.busy = false;
    }
  }
}
