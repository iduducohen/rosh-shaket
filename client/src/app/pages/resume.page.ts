import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonSpinner } from '@ionic/angular/standalone';
import { AuthService } from '../core/auth/auth.service';
import { DeskHeaderComponent } from '../core/desk-header.component';
import { WorkspaceDto, WorkspaceService } from '../core/workspace.service';

@Component({
  selector: 'app-resume',
  standalone: true,
  imports: [DeskHeaderComponent, IonContent, IonButton, IonSpinner, DatePipe],
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
              <div>שלב אחרון: <b>{{ stepLabel(w.currentStep) }}</b></div>
              <div>מסמכים שנשמרו: <b>{{ w.documents.length }}</b></div>
              <div>עודכן לאחרונה: <b>{{ w.updatedAt | date:'dd/MM/yyyy HH:mm' }}</b></div>
              @if (w.workflow?.snapshot?.results?.length) {
                <div>יש תוצאות חישוב שמורות</div>
              }
            </div>
            <div class="actions">
              <ion-button fill="outline" (click)="startFresh()">התחלה מחדש</ion-button>
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

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const ws = await this.workspaces.restore();
      this.ws.set(ws);
      // Brand-new empty workspace → skip the resume card.
      if (ws && isEmpty(ws)) {
        await this.router.navigateByUrl('/start');
      }
    } catch {
      this.error.set('לא הצלחנו לטעון את העבודה השמורה.');
    } finally {
      this.loading.set(false);
    }
  }

  continueWork(): void {
    void this.router.navigateByUrl(this.workspaces.resumeRoute(this.ws()));
  }

  async startFresh(): Promise<void> {
    await this.workspaces.restartFlow();
    await this.router.navigateByUrl('/start', { replaceUrl: true });
  }

  stepLabel(step: string): string {
    switch (step) {
      case 'reason': return 'סיבת העזיבה';
      case 'details': return 'פרטים';
      case 'results': return 'מה מגיע לי';
      case 'checklist': return "צ'קליסט";
      case 'sources': return 'מקורות';
      default: return 'צילום תלוש';
    }
  }
}

function isEmpty(w: WorkspaceDto): boolean {
  const s = w.workflow?.snapshot;
  if (!s) return true;
  const hasProfile = !!s.profile?.startDate || (s.profile?.monthlySalary ?? 0) > 0;
  return !s.choice && !hasProfile && !(s.results?.length) && w.documents.length === 0 && (w.currentRoute === '/start' || !w.currentRoute);
}
