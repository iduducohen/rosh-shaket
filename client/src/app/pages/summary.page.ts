import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { assessContributions, RateStatus } from '../core/payslip-contributions';
import { Router, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonLabel, IonSegment, IonSegmentButton, ViewWillEnter } from '@ionic/angular/standalone';
import { ApiService } from '../core/api.service';
import { DeskHeaderComponent } from '../core/desk-header.component';
import { RightsSource } from '../core/models';
import { PaidHelpComponent } from '../core/paid-help.component';
import { ExperienceReviewComponent } from '../core/experience-review.component';
import { WizardStore } from '../core/wizard.store';
import { ReviewStore } from '../core/review.store';
import { WorkspaceService } from '../core/workspace.service';

const MONTHS = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

@Component({
  selector: 'app-summary',
  standalone: true,
  imports: [DeskHeaderComponent, PaidHelpComponent, ExperienceReviewComponent, DecimalPipe, RouterLink, IonContent, IonSegment, IonSegmentButton, IonLabel, IonButton],
  styles: [`
    .total { margin: 8px 0 18px; padding: 18px 0 16px; border-top: 2px solid var(--ion-text-color); border-bottom: 1px solid var(--rs-line); }
    .num { font-family: var(--rs-serif); font-size: 50px; font-weight: 700; line-height: 1; }
    .num small { font-size: 26px; }
    .item { padding: 14px 0; border-bottom: 1px solid var(--rs-line); }
    .top { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
    .name { font-weight: 700; }
    .amt { font-family: var(--rs-serif); font-size: 21px; white-space: nowrap; }
    .how { font-size: 14px; color: var(--ion-color-medium); margin-top: 2px; }
    .src {
      display: inline-block; margin-top: 8px; font-size: 14px; font-weight: 700;
      color: var(--ion-color-primary); text-decoration: underline; text-underline-offset: 3px;
    }
    .basis { margin: 18px 0 6px; padding: 12px 14px; border-radius: 12px; background: var(--rs-soft); font-size: 14.5px; }
    .rates { margin: 26px 0 0; }
    .rates h3 { margin: 0 0 6px; font-size: 18px; }
    .rates ul { list-style: none; padding: 0; margin: 0 0 8px; }
    .rates li { padding: 12px 0; border-bottom: 1px solid var(--rs-line); }
    .tag { font-size: 13px; font-weight: 800; padding: 2px 10px; border-radius: 999px; white-space: nowrap; }
    .tag.ok { background: rgba(var(--ion-color-success-rgb, 45, 170, 90), .12); color: var(--ion-color-success-shade, #1a7a3c); }
    .tag.partial { background: rgba(var(--ion-color-warning-rgb, 255, 196, 9), .18); color: var(--ion-color-warning-shade, #8a6d00); }
    .tag.low, .tag.missing { background: rgba(var(--ion-color-danger-rgb, 235, 68, 90), .1); color: var(--ion-color-danger); }
    .tag.info { background: var(--rs-soft); color: var(--ion-color-medium-shade, #5E6F73); }
    .full-cta { box-shadow: var(--rs-card-shadow); margin: 22px 0 6px; padding: 16px 18px; border-radius: 14px; border: 1px solid var(--rs-line); background: var(--ion-item-background); }
    .full-cta b { display: block; font-size: 16px; }
    .full-cta p { margin: 6px 0 10px; font-size: 14px; color: var(--ion-color-medium); line-height: 1.45; }
    .full-cta ion-button { margin: 0; }
    .results-nav {
      display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 16px;
    }
    .results-nav a {
      padding: 8px 14px; border-radius: 10px; border: 1px solid var(--rs-line);
      color: var(--ion-text-color); text-decoration: none; font-weight: 700; font-size: 14.5px;
      background: var(--ion-item-background);
    }
    .results-nav a.on { border-color: var(--ion-color-primary); background: var(--rs-soft); color: var(--ion-color-primary); }
    @media (min-width: 992px) {
      .results-nav { display: none; }
      ion-segment { max-width: 420px; margin-bottom: 8px; }
      .sum { display: grid; grid-template-columns: minmax(0, 360px) minmax(0, 1fr); grid-template-areas: "total items" "basis items"; grid-template-rows: auto 1fr; gap: 0 48px; align-items: start; }
      .sum-total { grid-area: total; position: sticky; top: 24px; }
      .sum-items { grid-area: items; }
      .sum-basis { grid-area: basis; align-self: start; }
      .total { border: 1px solid var(--rs-line); border-top: 4px solid var(--ion-color-primary); border-radius: 16px; padding: 24px; background: var(--ion-item-background); margin-top: 0; }
      .num { font-size: 60px; }
      .items { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .item { border: 1px solid var(--rs-line); border-radius: 14px; padding: 16px 18px; background: var(--ion-item-background); }
      .items .note { grid-column: 1 / -1; margin: 0; }
    }
  `],
  template: `
    <ion-content>
      <app-desk-header [step]="4" [tabs]="true"></app-desk-header>
      <div class="page ion-padding">
        <nav class="results-nav" aria-label="תוצאות">
          <a routerLink="/results/summary" class="on">מה מגיע לי</a>
          <a routerLink="/results/reports">דוחות</a>
          <a routerLink="/checklist">צ'קליסט</a>
          <a routerLink="/sources">מקורות</a>
          <a routerLink="/tax-refund">החזר מס</a>
        </nav>
        @if (store.results().length > 1) {
          <ion-segment [value]="store.activeIndex()" (ionChange)="store.activeIndex.set(+($any($event).detail.value))">
            <ion-segment-button [value]="0"><ion-label>אם אפוטר</ion-label></ion-segment-button>
            <ion-segment-button [value]="1"><ion-label>אם אתפטר</ion-label></ion-segment-button>
          </ion-segment>
        }
        @if (store.active(); as r) {
          @if (store.profile().employerName; as employer) { <p class="employer muted small">{{ employer }}</p> }
          <h2>{{ store.results().length > 1 ? (store.activeIndex() === 0 ? 'אם תפוטרו' : 'אם תתפטרו') : 'מה מגיע לכם' }}</h2>
          <div class="sum">
          <div class="sum-total">
          <div class="total">
            <div class="muted small">סה"כ משוער מהמעסיק בגמר החשבון</div>
            <div class="num"><small>₪</small>{{ r.estimatedTotal | number:'1.0-0' }}</div>
            <div class="muted small">ותק: {{ r.seniorityYears | number:'1.1-1' }} שנים</div>
          </div>
          </div>
          <div class="sum-items items">

          @for (c of r.components; track c.code) {
            <div class="item">
              <div class="top">
                <span class="name">{{ c.title }}</span>
                <span class="amt">{{ c.amount !== null ? '₪' + (c.amount | number:'1.0-0') : c.displayValue }}</span>
              </div>
              <div class="how">{{ c.explanation }}</div>
              @if (c.flag) { <span class="flag">{{ c.flag }}</span> }
              @if (sourceUrl(c.sourceKey); as url) {
                <a class="src" [href]="url" target="_blank" rel="noopener">{{ sourceTitle(c.sourceKey) }}</a>
              }
            </div>
          }
          @for (a of r.advisories; track a) { <div class="note">{{ a }}</div> }
          </div>
          <div class="sum-basis">

          <div class="basis">
            <b>{{ store.fromPayslip() ? 'חישוב ראשוני לפי התלוש' + (store.payslipMonth() ? ' (' + store.payslipMonth() + ')' : '') : 'החישוב לפי הנתונים שהזנתם' }}</b><br>
            @if (store.profile().payType === 'Hourly') {
              עובד/ת לפי שעות: ₪{{ store.profile().hourlyRate | number:'1.0-2' }} לשעה × {{ store.profile().averageMonthlyHours | number:'1.0-1' }} שעות בחודש בממוצע
              (שכר חודשי ₪{{ store.profile().monthlySalary | number:'1.0-0' }}, משרה {{ store.profile().jobPercent | number:'1.0-0' }}%),
            } @else if (store.profile().payType === 'Global') {
              שכר גלובלי: שכר יסוד ₪{{ store.profile().monthlySalary | number:'1.0-0' }}
              @if (store.profile().globalOvertime) { + שעות נוספות גלובליות ₪{{ store.profile().globalOvertime | number:'1.0-0' }} (לא נכללות בחישוב) }, משרה {{ store.profile().jobPercent }}%,
            } @else {
              שכר ₪{{ store.profile().monthlySalary | number:'1.0-0' }}, משרה {{ store.profile().jobPercent }}%,
            }
            התחלה {{ store.profile().startDate }}, סיום {{ store.profile().endDate }}, חופשה {{ store.profile().vacationBalanceDays }} ימים
            <ion-button fill="clear" size="small" (click)="edit()">משהו לא נכון? לתקן נתונים</ion-button>
          </div>
          <p class="muted small">ערך יום הבראה: ₪{{ r.recuperationDayValue }} (בתוקף מ-{{ r.valuesValidFrom }}). ברוטו, לפני מס. הערכה, לא ייעוץ משפטי.</p>
          </div>
          </div>

          @if (rateChecks(); as checks) {
            <section class="rates" aria-label="ההפרשות בתלוש">
              <h3>ההפרשות בתלוש {{ payslipMonthLabel() ? 'של ' + payslipMonthLabel() : 'האחרון' }}</h3>
              <ul>
                @for (c of checks; track c.key) {
                  <li>
                    <div class="top">
                      <span class="name">{{ c.title }}</span>
                      <span class="tag" [class]="c.status">{{ c.rate != null ? c.rate + '%' : statusLabel(c.status) }}</span>
                    </div>
                    <div class="how">{{ c.note }}</div>
                  </li>
                }
              </ul>
              <p class="muted small">זו בדיקה של חודש אחד. היא לא מראה אם הופרש בכל החודשים, ואם הכסף הגיע בפועל לקופה.</p>
            </section>
          }

          <section class="full-cta">
            <b>רוצים לוודא שהכול הופקד לאורך כל התקופה?</b>
            <p>בבדיקה המלאה מעלים את כל התלושים, טופסי 106 ודוחות הקופות — ובודקים חודש אחרי חודש מה הופרש, לאיזו קופה והאם חסר משהו.</p>
            <ion-button fill="outline" (click)="fullReview()">לבדיקה המלאה</ion-button>
          </section>
          <section class="full-cta">
            <b>אולי מגיע לכם גם החזר מס?</b>
            <p>מי שמסיים לעבוד באמצע השנה שילם לרוב יותר מס הכנסה ממה שמגיע. בדקנו לפי הנתונים שלכם אם כדאי להגיש בקשה, עם הנחיות וקישורים לתהליך.</p>
            <ion-button fill="outline" routerLink="/tax-refund">לבדיקת החזר מס</ion-button>
          </section>
          <app-paid-help></app-paid-help>
          <app-experience-review></app-experience-review>
        } @else {
          <p>עוד אין חישוב. <ion-button fill="clear" (click)="restart()">להתחיל</ion-button></p>
        }
      </div>
    </ion-content>
  `
})
export class SummaryPage implements ViewWillEnter {
  readonly store = inject(WizardStore);
  private readonly workspaces = inject(WorkspaceService);
  private readonly review = inject(ReviewStore);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  readonly sources = signal<RightsSource[]>([]);

  readonly rateChecks = computed(() => {
    const funds = this.store.funds();
    if (!this.store.fromPayslip() || funds == null) return null;
    return assessContributions(funds, this.store.profile().monthlySalary);
  });

  readonly payslipMonthLabel = computed(() => {
    const raw = this.store.payslipMonth();
    const m = raw?.match(/^(\d{4})-(\d{1,2})/);
    if (!m) return raw;
    return `${MONTHS[Number(m[2])] ?? m[2]} ${m[1]}`;
  });

  statusLabel(s: RateStatus): string {
    return s === 'missing' ? 'אין' : s === 'low' ? 'נמוך' : s === 'info' ? 'לא ידוע' : '';
  }

  fullReview(): void {
    void this.router.navigateByUrl('/review/employment');
  }

  constructor() {
    void this.loadSources();
  }

  ionViewWillEnter(): void {
    void this.loadSources();
  }

  sourceUrl(key: string | null): string | null {
    return key ? this.sources().find(s => s.key === key)?.url ?? null : null;
  }

  sourceTitle(key: string | null): string {
    return this.sources().find(s => s.key === key)?.title ?? 'המקור הרשמי';
  }

  edit(): void { void this.router.navigateByUrl('/details'); }

  async restart(): Promise<void> {
    if (!(await this.workspaces.confirmRestart())) return;
    this.review.clear();
    await this.workspaces.restartFlow();
    await this.router.navigateByUrl('/start', { replaceUrl: true });
  }

  private async loadSources(): Promise<void> {
    try {
      this.sources.set(await this.api.sources());
    } catch {
      /* keep whatever was already loaded */
    }
  }
}
