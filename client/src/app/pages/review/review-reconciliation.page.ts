import { DecimalPipe } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton } from '@ionic/angular/standalone';
import { confidenceLabel, severityLabel } from '../../core/review.models';
import { ReviewStore } from '../../core/review.store';
import { ReviewStepNavComponent } from './review-step-nav.component';

@Component({
  selector: 'app-review-reconciliation',
  standalone: true,
  imports: [IonButton, DecimalPipe, ReviewStepNavComponent],
  styles: [`
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th, td { border-bottom:1px solid var(--rs-line,#ddd); padding:6px 4px; text-align:right; }
    .gap { color: var(--ion-color-danger); }
    .unk { color: var(--ion-color-medium); }
  `],
  template: `
    <h2>התאמת הפקדות (צפוי / מדווח / בפועל)</h2>
    <p class="muted">פנסיה, פיצויים וקרן השתלמות — בנפרד בתוך השורות. ״לא ידוע״ אינו 0.</p>
    <ion-button size="small" (click)="run()">רענון ניתוח</ion-button>

    @if (analysis; as a) {
      <p>
        נבדקו {{ a.summary.monthsWithData }} · תקינים {{ a.summary.monthsOk }} ·
        עם פער {{ a.summary.monthsWithGap }} · ללא מידע {{ a.summary.monthsNoInfo }} ·
        בפועל לא ידוע {{ a.summary.monthsUnknownActual }}
      </p>
      @if (a.summary.firstGapMonth) {
        <p class="muted">חלון פערים: {{ a.summary.firstGapMonth }} – {{ a.summary.lastGapMonth }}</p>
      }

      <h3>התאמת נתונים לפי שנה</h3>
      <table>
        <thead>
          <tr>
            <th>מקור</th>
            @for (y of a.matrix.years; track y) { <th>{{ y }}</th> }
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>תלושי שכר</td>
            @for (y of a.matrix.years; track y) { <td>{{ yearAmount(a.matrix.payroll, y) }}</td> }
          </tr>
          <tr>
            <td>טופס 106</td>
            @for (y of a.matrix.years; track y) { <td>{{ yearAmount(a.matrix.form106, y) }}</td> }
          </tr>
          <tr>
            <td>פנסיה</td>
            @for (y of a.matrix.years; track y) { <td>{{ yearAmount(a.matrix.pension, y) }}</td> }
          </tr>
          <tr>
            <td>קרן השתלמות</td>
            @for (y of a.matrix.years; track y) { <td>{{ yearAmount(a.matrix.study, y) }}</td> }
          </tr>
        </tbody>
      </table>

      <h3 class="ion-margin-top">חריגות</h3>
      <table>
        <thead><tr><th>חודש</th><th>חומרה</th><th>הסבר</th><th>ביטחון</th></tr></thead>
        <tbody>
          @for (x of a.anomalies.slice(0, 50); track x.id) {
            <tr>
              <td>{{ x.month | number:'2.0-0' }}/{{ x.year }}</td>
              <td>{{ severityLabel(x.severity) }}</td>
              <td>{{ x.explanation }}</td>
              <td>{{ confidenceLabel(x.confidence) }}</td>
            </tr>
          }
        </tbody>
      </table>

      <h3 class="ion-margin-top">דגימת חודשים</h3>
      <table>
        <thead><tr><th>חודש</th><th>צפוי</th><th>בתלוש</th><th>בפועל</th><th>פער</th></tr></thead>
        <tbody>
          @for (m of sampleMonths; track m.year + '-' + m.month) {
            <tr [class.gap]="m.hasGap">
              <td>{{ m.month | number:'2.0-0' }}/{{ m.year }}</td>
              <td>{{ sum(m, 'expected') }}</td>
              <td>{{ sum(m, 'reported') }}</td>
              <td [class.unk]="m.hasUnknownActual">{{ sum(m, 'actual') }}</td>
              <td>{{ gap(m) }}</td>
            </tr>
          }
        </tbody>
      </table>
    }

    <app-review-step-nav nextLabel="המשך" (next)="goNext()" />
  `
})
export class ReviewReconciliationPage implements OnInit {
  readonly store = inject(ReviewStore);
  private readonly router = inject(Router);
  readonly severityLabel = severityLabel;
  readonly confidenceLabel = confidenceLabel;

  get analysis() { return this.store.analysis(); }
  get sampleMonths() {
    const months = this.analysis?.summary.months ?? [];
    const interesting = months.filter(m => m.hasGap || m.hasUnknownActual || !m.hasAnyData);
    const base = interesting.length ? interesting : months;
    return base.slice(0, 24);
  }

  async ngOnInit(): Promise<void> {
    if (!this.store.analysis()) await this.run();
  }

  async run(): Promise<void> {
    await this.store.analyze();
  }

  goNext(): void {
    void this.router.navigateByUrl('/review/simulation');
  }

  yearAmount(rows: { year: number; amount: number | null }[], year: number): string {
    const hit = rows.find(r => r.year === year);
    return this.store.fmt(hit?.amount ?? null);
  }

  sum(m: { lines: { expected: number | null; reported: number | null; actual: number | null }[] }, key: 'expected' | 'reported' | 'actual'): string {
    let s = 0; let any = false;
    for (const l of m.lines) {
      const v = l[key];
      if (v == null) continue;
      any = true; s += v;
    }
    return any ? this.store.fmt(s) : 'לא ידוע';
  }

  gap(m: { lines: { gapActualVsExpected: number | null }[]; hasUnknownActual: boolean }): string {
    if (m.hasUnknownActual) return '?';
    let s = 0; let any = false;
    for (const l of m.lines) {
      if (l.gapActualVsExpected == null) continue;
      any = true; s += l.gapActualVsExpected;
    }
    return any ? this.store.fmt(s) : '—';
  }
}
