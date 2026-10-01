import { Component, inject, OnInit } from '@angular/core';
import { IonButton } from '@ionic/angular/standalone';
import { healthLabel } from '../../core/review.models';
import { ReviewStore } from '../../core/review.store';

@Component({
  selector: 'app-review-report',
  standalone: true,
  imports: [IonButton],
  template: `
    <h2>דוח מסכם</h2>
    <p class="muted">הדוח כולל תקופה, שכר, צפוי/מדווח/בפועל, פערים, קופות, אומדן תשואה ומה שחסר. הערכה בלבד.</p>

    @if (a; as analysis) {
      <ol>
        <li>מעסיק: {{ store.review()?.period?.employerName || '—' }}</li>
        <li>תקופה: {{ store.review()?.period?.startDate }} – {{ store.review()?.period?.endDate }}</li>
        <li>סיבה: {{ store.review()?.period?.exitReason || '—' }}</li>
        <li>שכר לאורך השנים: ראו מסך שכר / הדגמה</li>
        <li>צפוי: {{ store.fmt(analysis.summary.expectedTotal) }}</li>
        <li>מדווח: {{ store.fmt(analysis.summary.reportedTotal) }}</li>
        <li>בפועל: {{ store.fmt(analysis.summary.actualTotal) }}</li>
        <li>פער: {{ store.fmt(analysis.summary.gapTotal) }}</li>
        <li>חודשים בעייתיים: {{ analysis.summary.monthsWithGap }}</li>
        <li>מצב בריאות נתונים: {{ healthLabel(analysis.summary.health.status) }}</li>
        <li>חריגות שנמצאו: {{ analysis.anomalies.length }}</li>
        <li>צבירה Base: {{ store.fmt(baseBalance(analysis)) }}</li>
      </ol>
    }

    <ion-button (click)="dl('html')">הורדת HTML</ion-button>
    <ion-button fill="outline" (click)="dl('csv')">CSV</ion-button>
    <ion-button fill="outline" (click)="dl('json')">JSON</ion-button>
    <ion-button fill="clear" (click)="print()">הדפסה / PDF</ion-button>
  `
})
export class ReviewReportPage implements OnInit {
  readonly store = inject(ReviewStore);
  readonly healthLabel = healthLabel;
  get a() { return this.store.analysis(); }

  async ngOnInit(): Promise<void> {
    if (!this.store.analysis()) await this.store.analyze();
  }

  baseBalance(analysis: NonNullable<ReturnType<ReviewStore['analysis']>>): number | null {
    return analysis.simulations.find(s => s.scenario === 'Base')?.estimatedBalance ?? null;
  }

  async dl(format: 'html' | 'csv' | 'json'): Promise<void> {
    await this.store.downloadReport(format);
  }

  print(): void {
    window.print();
  }
}
