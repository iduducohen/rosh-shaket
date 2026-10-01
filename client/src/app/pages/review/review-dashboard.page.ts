import { DecimalPipe } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton } from '@ionic/angular/standalone';
import { healthLabel } from '../../core/review.models';
import { ReviewStore } from '../../core/review.store';

@Component({
  selector: 'app-review-dashboard',
  standalone: true,
  imports: [IonButton, RouterLink, DecimalPipe],
  styles: [`
    .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap:10px; }
    .card { background: var(--ion-item-background, #fff); border:1px solid var(--rs-line,#e5e5e5); border-radius:14px; padding:12px; }
    .card b { display:block; font-size:12px; color: var(--ion-color-medium); margin-bottom:4px; }
    .card strong { font-size:18px; }
    .health { font-size:20px; margin: 8px 0 16px; }
  `],
  template: `
    <h2>תמונת מצב</h2>
    @if (!analysis) {
      <p class="muted">אין ניתוח עדיין. טענו הדגמה או מלאו שכר והריצו ניתוח.</p>
      <ion-button (click)="run()">הרצת ניתוח</ion-button>
    } @else {
      <div class="health">{{ healthLabel(analysis.summary.health.status) }}</div>
      <p>{{ analysis.summary.health.messageHe }}</p>
      <p class="muted small">כיסוי מידע: {{ (analysis.summary.health.coverageRatio * 100) | number:'1.0-0' }}%</p>

      <div class="grid">
        <div class="card"><b>תקופת העסקה</b><strong>{{ years }} שנים</strong></div>
        <div class="card"><b>חודשים שנבדקו</b><strong>{{ analysis.summary.monthsWithData }}/{{ analysis.summary.totalMonths }}</strong></div>
        <div class="card"><b>הפקדות צפויות</b><strong>{{ store.fmt(analysis.summary.expectedTotal) }}</strong></div>
        <div class="card"><b>הפקדות מדווחות</b><strong>{{ store.fmt(analysis.summary.reportedTotal) }}</strong></div>
        <div class="card"><b>הפקדות בפועל</b><strong>{{ store.fmt(analysis.summary.actualTotal) }}</strong></div>
        <div class="card"><b>פער משוער</b><strong>{{ store.fmt(analysis.summary.gapTotal) }}</strong></div>
        <div class="card"><b>יתרות בקופות</b><strong>{{ store.fmt(fundTotal) }}</strong></div>
        <div class="card"><b>צבירה משוערת (Base)</b><strong>{{ store.fmt(baseSim) }}</strong></div>
        <div class="card"><b>חודשים עם פער</b><strong>{{ analysis.summary.monthsWithGap }}</strong></div>
        <div class="card"><b>חודשים ללא מידע</b><strong>{{ analysis.summary.monthsNoInfo }}</strong></div>
      </div>

      @if (analysis.usedEstimates) {
        <p class="muted ion-margin-top">חלק מהסימולציה מבוסס על אומדן (Reported/Expected) כי חסר Actual.</p>
      }

      <div class="ion-margin-top">
        <ion-button fill="outline" routerLink="/review/reconciliation">פירוט הפקדות</ion-button>
        <ion-button fill="outline" routerLink="/review/simulation">סימולציית צבירה</ion-button>
        <ion-button fill="outline" routerLink="/review/termination">סיום העסקה</ion-button>
      </div>
    }
  `
})
export class ReviewDashboardPage implements OnInit {
  readonly store = inject(ReviewStore);
  readonly healthLabel = healthLabel;

  get analysis() { return this.store.analysis(); }
  get years() {
    const p = this.store.review()?.period;
    if (!p) return '—';
    const a = new Date(p.startDate).getFullYear();
    const b = new Date(p.endDate).getFullYear();
    return Math.max(1, b - a + (new Date(p.endDate).getMonth() >= new Date(p.startDate).getMonth() ? 0 : 0));
  }
  get fundTotal() {
    const funds = this.store.review()?.funds ?? [];
    const vals = funds.map(f => f.balance).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) : null;
  }
  get baseSim() {
    return this.analysis?.simulations.find(s => s.scenario === 'Base')?.estimatedBalance ?? null;
  }

  async ngOnInit(): Promise<void> {
    if (this.store.review()?.months.length && !this.store.analysis()) await this.run();
  }

  async run(): Promise<void> {
    await this.store.analyze();
  }
}
