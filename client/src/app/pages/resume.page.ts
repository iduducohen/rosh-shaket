import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonSpinner } from '@ionic/angular/standalone';
import { AuthService } from '../core/auth/auth.service';
import { DeskHeaderComponent } from '../core/desk-header.component';
import { WorkspaceDto, WorkspaceService } from '../core/workspace.service';
import { SiteFooterComponent } from '../core/site-footer.component';

@Component({
  selector: 'app-resume',
  standalone: true,
  imports: [SiteFooterComponent, DeskHeaderComponent, IonContent, IonButton, IonSpinner, DatePipe],
  styles: [`
    .card {
      background: var(--ion-item-background); border: 1px solid var(--rs-line);
      border-radius: 16px; padding: 22px 20px; margin-top: 12px;
    }
    .meta { display: grid; gap: 8px; margin: 16px 0 20px; font-size: 15px; }
    .meta b { font-weight: 700; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; }
    .err { color: var(--ion-color-danger); }
  `],
  template: `
    <ion-content>
      <app-desk-header [step]="1"></app-desk-header>
      <div class="page narrow ion-padding">
        @if (ws(); as w) {
          <h2>ברוכים השבים{{ name() ? ', ' + name() : '' }}</h2>
          <p class="muted">אפשר להמשיך בדיוק מהמקום שעצרתם.</p>
          <div class="card">
            <div class="meta">
              <div>עצרתם ב: <b>{{ placeLabel(w) }}</b></div>
              <div>עודכן לאחרונה: <b>{{ w.updatedAt | date:'dd/MM/yyyy HH:mm' }}</b></div>
              @if (w.documents.length) {
                <div>המסמכים שהעליתם שמורים בחשבון: <b>{{ w.documents.length }}</b></div>
              }
              @if (w.workflow?.snapshot?.results?.length) {
                <div>יש חישוב שמור של מה שמגיע לכם</div>
              }
            </div>
            <div class="actions">
              <ion-button (click)="continueWork()">המשך</ion-button>
            </div>
          </div>
        } @else if (loading()) {
          <p><ion-spinner name="crescent"></ion-spinner> טוענים את העבודה השמורה…</p>
        } @else if (error()) {
          <p class="err">{{ error() }}</p>
          <ion-button (click)="load()">נסו שוב</ion-button>
        }
      </div>
      <app-site-footer></app-site-footer>
    </ion-content>
  `
})
export class ResumePage {
  private readonly workspaces = inject(WorkspaceService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly ws = signal<WorkspaceDto | null>(null);
  readonly name = () => this.auth.displayName();

  constructor() {
    void this.load();
  }

  /** Ionic keeps the page alive: after signing out and in again, load the account that is signed in now. */
  ionViewWillEnter(): void {
    if (!this.loading()) void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.ws.set(null);
    try {
      const ws = await this.workspaces.restore();
      // Brand-new empty workspace → skip the resume card.
      if (ws && isEmpty(ws)) {
        await this.router.navigateByUrl('/start', { replaceUrl: true });
        return;
      }
      this.ws.set(ws);
    } catch {
      this.error.set('לא הצלחנו לטעון את העבודה השמורה.');
    } finally {
      this.loading.set(false);
    }
  }

  continueWork(): void {
    void this.router.navigateByUrl(this.workspaces.resumeRoute(this.ws()));
  }

  /** The screen "המשך" opens, in words: the track and the step inside it. */
  placeLabel(w: WorkspaceDto): string {
    const route = this.workspaces.resumeRoute(w);
    const place = PLACES.find(([prefix]) => route.startsWith(prefix));
    return place ? place[1] : 'תחילת הבדיקה';
  }
}

/** Route prefix → what the user sees there. The first match wins. */
const PLACES: Array<[string, string]> = [
  ['/review/employment', 'בדיקה מלאה · תקופת ההעסקה'],
  ['/review/documents', 'בדיקה מלאה · העלאת מסמכים'],
  ['/review/check', 'בדיקה מלאה · בדיקת ההפקדות'],
  ['/review/report', 'בדיקה מלאה · תוצאות'],
  ['/review', 'בדיקה מלאה'],
  ['/results/reports', 'בדיקה מהירה · דוחות'],
  ['/results', 'בדיקה מהירה · מה מגיע לי'],
  ['/details', 'בדיקה מהירה · פרטי ההעסקה'],
  ['/reason', 'בדיקה מהירה · סיבת העזיבה'],
  ['/checklist', 'הצ\'קליסט'],
  ['/sources', 'מקורות ועזרה'],
  ['/tax-refund', 'החזר מס'],
  ['/help', 'אנשי מקצוע'],
  ['/pricing', 'מחירון'],
  ['/account', 'החשבון שלי']
];

function isEmpty(w: WorkspaceDto): boolean {
  const s = w.workflow?.snapshot;
  if (!s) return true;
  const hasProfile = !!s.profile?.startDate || (s.profile?.monthlySalary ?? 0) > 0;
  return !s.choice && !hasProfile && !(s.results?.length) && w.documents.length === 0 && (w.currentRoute === '/start' || !w.currentRoute);
}
