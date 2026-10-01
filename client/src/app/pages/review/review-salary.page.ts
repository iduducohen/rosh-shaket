import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonButton, IonInput, IonItem, IonList } from '@ionic/angular/standalone';
import { ReviewStore } from '../../core/review.store';
import { SalarySegmentDto } from '../../core/review.models';

@Component({
  selector: 'app-review-salary',
  standalone: true,
  imports: [FormsModule, IonButton, IonInput, IonItem, IonList],
  styles: [`
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { border-bottom: 1px solid var(--rs-line, #ddd); padding: 6px 4px; text-align: right; }
  `],
  template: `
    <h2>היסטוריית שכר</h2>
    <p class="muted">אפשר להזין לפי שנים (או להשתמש בהדגמה). שינוי באמצע שנה — הוסיפו מקטע נוסף.</p>

    <ion-list>
      <ion-item><ion-input type="number" label="שנה" labelPlacement="stacked" [(ngModel)]="year"></ion-input></ion-item>
      <ion-item><ion-input type="number" label="שכר חודשי ברוטו" labelPlacement="stacked" [(ngModel)]="salary"></ion-input></ion-item>
    </ion-list>
    <ion-button (click)="addYear()">הוספת / עדכון שנה</ion-button>
    <ion-button fill="outline" (click)="applyPreset()">מילוי דוגמה 2016–2025</ion-button>
    <ion-button fill="clear" (click)="fillExpected()">חישוב הפקדות צפויות (אומדן)</ion-button>

    <h3 class="ion-margin-top">Timeline</h3>
    <table>
      <thead><tr><th>שנה</th><th>שכר ממוצע</th><th>חודשים עם שכר</th></tr></thead>
      <tbody>
        @for (y of years(); track y.year) {
          <tr><td>{{ y.year }}</td><td>{{ store.fmt(y.avg) }}</td><td>{{ y.count }}</td></tr>
        }
      </tbody>
    </table>

    <ion-button expand="block" class="ion-margin-top" (click)="next()">המשך לקופות</ion-button>
  `
})
export class ReviewSalaryPage {
  readonly store = inject(ReviewStore);
  private readonly router = inject(Router);
  private segments: SalarySegmentDto[] = [];

  year = 2024;
  salary = 18000;

  years(): { year: number; avg: number; count: number }[] {
    const months = this.store.review()?.months ?? [];
    const map = new Map<number, number[]>();
    for (const m of months) {
      if (m.grossSalary == null) continue;
      const arr = map.get(m.year) ?? [];
      arr.push(m.grossSalary);
      map.set(m.year, arr);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([year, vals]) => ({
      year,
      avg: vals.reduce((s, v) => s + v, 0) / vals.length,
      count: vals.length
    }));
  }

  addYear(): void {
    if (!this.store.review()) return;
    const from = `${this.year}-01-01`;
    const to = `${this.year}-12-31`;
    this.segments = [...this.segments.filter(s => !s.from.startsWith(String(this.year))), {
      from, to, grossSalary: this.salary, pensionableSalary: this.salary
    }];
    this.store.applySalarySegments(this.segments.length ? this.segments : [{
      from, to, grossSalary: this.salary, pensionableSalary: this.salary
    }]);
    // re-apply all known from current months + this year
    const existing = this.collectFromMonths();
    existing.set(this.year, this.salary);
    this.applyMap(existing);
  }

  applyPreset(): void {
    const preset: [number, number][] = [
      [2016, 8000], [2017, 8500], [2018, 9500], [2019, 10500], [2020, 11500],
      [2021, 13000], [2022, 15000], [2023, 16500], [2024, 18000], [2025, 20000]
    ];
    this.applyMap(new Map(preset));
  }

  async fillExpected(): Promise<void> {
    await this.store.fillExpectedFromServer();
  }

  next(): void {
    void this.router.navigateByUrl('/review/funds');
  }

  private collectFromMonths(): Map<number, number> {
    const map = new Map<number, number>();
    for (const y of this.years()) map.set(y.year, y.avg);
    return map;
  }

  private applyMap(map: Map<number, number>): void {
    const segments: SalarySegmentDto[] = [...map.entries()].map(([year, salary]) => ({
      from: `${year}-01-01`,
      to: `${year}-12-31`,
      grossSalary: salary,
      pensionableSalary: salary
    }));
    this.segments = segments;
    this.store.applySalarySegments(segments);
  }
}
