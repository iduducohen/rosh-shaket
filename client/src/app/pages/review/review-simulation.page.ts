import { Component, computed, inject, OnInit } from '@angular/core';
import { IonButton } from '@ionic/angular/standalone';
import { ReviewStore } from '../../core/review.store';

@Component({
  selector: 'app-review-simulation',
  standalone: true,
  imports: [IonButton],
  styles: [`
    .charts { display:grid; gap:16px; }
    .bar-row { display:flex; align-items:flex-end; gap:2px; height:160px; overflow-x:auto; padding-bottom:4px; }
    .bar { width:8px; background: var(--ion-color-primary); border-radius:2px 2px 0 0; flex:none; }
    .bar.gains { background: var(--ion-color-secondary, #6c8); opacity:.7; position:absolute; }
    .scen { border:1px solid var(--rs-line,#ddd); border-radius:12px; padding:12px; margin:8px 0; }
    .wrap { position:relative; }
  `],
  template: `
    <h2>אומדן צבירה לאורך זמן</h2>
    <p class="muted">כל הפקדה צוברת מתאריך אחר (לא סכום × (1+r)^n). תרחישים ניתנים להגדרה בשרת — לא hard-coded במסך.</p>
    <ion-button size="small" (click)="run()">רענון</ion-button>

    @if (store.analysis()?.usedEstimates) {
      <p><b>אומדן:</b> חלק מההפקדות מבוססות על מדווח/צפוי כי חסר בפועל מהקופה.</p>
    }

    @for (s of sims(); track s.scenario) {
      <div class="scen">
        <h3>{{ label(s.scenario) }} · תשואה {{ s.annualReturnPercent }}% · דמי ניהול {{ s.managementFeePercent }}%</h3>
        <div>סך הפקדות: {{ store.fmt(s.totalContributions) }}</div>
        <div>רווח משוער: {{ store.fmt(s.estimatedGains) }}</div>
        <div>דמי ניהול משוערים: {{ store.fmt(s.estimatedFees) }}</div>
        <div><b>יתרה משוערת: {{ store.fmt(s.estimatedBalance) }}</b></div>
        <div class="bar-row" [attr.aria-label]="'גרף צבירה ' + s.scenario">
          @for (p of downsample(s.timeline); track p.year + '-' + p.month) {
            <div class="bar" [style.height.%]="pct(p.estimatedBalance, s.estimatedBalance)"
                 [title]="p.month + '/' + p.year + ': ' + store.fmt(p.estimatedBalance)"></div>
          }
        </div>
        <p class="muted small">ציר X = זמן · גובה = יתרה משוערת (המחשה של ריבית דריבית)</p>
      </div>
    }
  `
})
export class ReviewSimulationPage implements OnInit {
  readonly store = inject(ReviewStore);
  readonly sims = computed(() => this.store.analysis()?.simulations ?? []);

  async ngOnInit(): Promise<void> {
    if (!this.store.analysis()) await this.run();
  }

  async run(): Promise<void> {
    await this.store.analyze();
  }

  label(s: string): string {
    return s === 'Conservative' ? 'שמרני' : s === 'Optimistic' ? 'אופטימי' : 'בסיס';
  }

  downsample<T>(arr: T[]): T[] {
    if (arr.length <= 60) return arr;
    const step = Math.ceil(arr.length / 60);
    return arr.filter((_, i) => i % step === 0);
  }

  pct(v: number, max: number): number {
    if (max <= 0) return 0;
    return Math.max(2, Math.round((v / max) * 100));
  }
}
