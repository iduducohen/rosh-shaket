import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AuthService } from './auth/auth.service';
import { CalculationResponse, ExitChoice, FundLine, ProfileDto } from './models';
import { WizardStore } from './wizard.store';

export interface WorkspaceDocument {
  id: string;
  workspaceId: string;
  documentType: string;
  originalFileName: string;
  contentType: string;
  fileSize: number;
  version: number;
  status: string;
  uploadedAt: string;
  metadataJson: string | null;
}

export interface WorkspaceDto {
  id: string;
  name: string;
  status: string;
  currentStep: string;
  currentRoute: string;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string;
  completedAt: string | null;
  workflow: {
    currentStep: string;
    previousStep: string | null;
    status: string;
    progressPercentage: number;
    snapshot: {
      choice: ExitChoice | null;
      profile: ProfileDto;
      funds: FundLine[] | null;
      filledFields: string[] | null;
      fromPayslip: boolean;
      payslipMonth: string | null;
      results: CalculationResponse[] | null;
      activeIndex: number;
      currentRoute: string;
      currentStep: string;
      stateVersion: number;
    };
    version: number;
    startedAt: string;
    lastUpdatedAt: string;
    completedAt: string | null;
  } | null;
  documents: WorkspaceDocument[];
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Server-backed workspace sync. WizardStore stays I/O-free;
 * this service is the bridge for signed-in users only.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly store = inject(WizardStore);
  private readonly router = inject(Router);
  private readonly base = `${environment.apiBaseUrl}/api/workspaces`;

  readonly workspace = signal<WorkspaceDto | null>(null);
  readonly saveStatus = signal<SaveStatus>('idle');
  readonly saveError = signal<string | null>(null);

  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private lastStep = 'start';
  private booted = false;

  /** Load active workspace (or create) and hydrate the wizard. Call after sign-in. */
  async restore(): Promise<WorkspaceDto | null> {
    if (!this.auth.isSignedIn() && !this.auth.hasSession()) return null;
    const ws = await firstValueFrom(this.http.get<WorkspaceDto>(`${this.base}/current`));
    this.workspace.set(ws);
    const snap = ws.workflow?.snapshot;
    if (snap?.profile) {
      this.store.hydrate({
        choice: snap.choice ?? null,
        profile: snap.profile,
        filledFields: snap.filledFields ?? [],
        funds: snap.funds ?? null,
        fromPayslip: !!snap.fromPayslip,
        payslipMonth: snap.payslipMonth ?? null,
        results: snap.results ?? [],
        activeIndex: snap.activeIndex ?? 0
      });
    }
    this.lastStep = ws.currentStep || 'start';
    this.ensureAutosave();
    return ws;
  }

  resumeRoute(ws: WorkspaceDto | null = this.workspace()): string {
    const route = ws?.currentRoute || ws?.workflow?.snapshot?.currentRoute;
    if (route && route.startsWith('/') && route !== '/login') return route;
    if (ws?.workflow?.snapshot?.results?.length) return '/results/summary';
    if (ws?.workflow?.snapshot?.choice) return '/details';
    if (ws?.workflow?.snapshot?.fromPayslip || (ws?.workflow?.snapshot?.profile?.monthlySalary ?? 0) > 0) return '/reason';
    return '/start';
  }

  scheduleSave(immediate = false): void {
    if (!this.auth.isSignedIn() || !this.workspace()) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    if (immediate) {
      void this.flushSave();
      return;
    }
    this.saveTimer = setTimeout(() => void this.flushSave(), 800);
  }

  async flushSave(): Promise<void> {
    const ws = this.workspace();
    if (!ws || !this.auth.isSignedIn()) return;
    this.saveStatus.set('saving');
    this.saveError.set(null);
    const snap = this.store.snapshot();
    const route = this.router.url.split('?')[0] || '/start';
    const step = stepFromRoute(route);
    const progress = progressFromStep(step);
    const status = snap.results.length ? 'Calculated' : 'InProgress';
    try {
      const body = {
        name: ws.name,
        currentStep: step,
        previousStep: this.lastStep,
        currentRoute: route,
        status,
        progressPercentage: progress,
        expectedVersion: ws.version,
        snapshot: {
          choice: snap.choice,
          profile: snap.profile,
          funds: snap.funds,
          filledFields: snap.filledFields,
          fromPayslip: snap.fromPayslip,
          payslipMonth: snap.payslipMonth,
          results: snap.results,
          activeIndex: snap.activeIndex,
          currentRoute: route,
          currentStep: step,
          stateVersion: 1
        }
      };
      const updated = await firstValueFrom(this.http.put<WorkspaceDto>(`${this.base}/${ws.id}/state`, body));
      this.workspace.set(updated);
      this.lastStep = step;
      this.saveStatus.set('saved');
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 409) {
        try {
          await this.restore();
          this.saveError.set('המצב עודכן במכשיר אחר. סנכנו מחדש.');
        } catch {
          this.saveError.set('לא הצלחנו לשמור. ננסה שוב.');
        }
      } else {
        this.saveError.set('לא הצלחנו לשמור. ננסה שוב.');
      }
      this.saveStatus.set('error');
      // Retry once after a short delay.
      setTimeout(() => void this.flushSave(), 2500);
    }
  }

  async createNew(name = 'חישוב זכויות'): Promise<WorkspaceDto> {
    const ws = await firstValueFrom(this.http.post<WorkspaceDto>(`${this.base}`, { name }));
    this.workspace.set(ws);
    this.store.reset();
    this.lastStep = 'start';
    this.ensureAutosave();
    return ws;
  }

  /**
   * Full wizard restart: drop in-memory state and start a clean workspace.
   * Do not flush-save before this — that would re-persist the abandoned progress.
   */
  async restartFlow(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.store.reset();
    this.saveStatus.set('idle');
    this.saveError.set(null);
    if (this.auth.isSignedIn() || this.auth.hasSession()) {
      try {
        await this.createNew();
      } catch {
        this.clearLocal();
      }
    } else {
      this.clearLocal();
    }
  }

  async uploadDocument(file: Blob, fileName: string, documentType = 'payslip'): Promise<WorkspaceDocument> {
    let ws = this.workspace();
    if (!ws) ws = await this.restore() ?? undefined as never;
    if (!ws) throw new Error('No workspace');
    const form = new FormData();
    form.append('file', file, fileName);
    form.append('documentType', documentType);
    const doc = await firstValueFrom(
      this.http.post<WorkspaceDocument>(`${this.base}/${ws.id}/documents`, form)
    );
    // Refresh list without blocking upload success.
    void this.restore().catch(() => undefined);
    return doc;
  }

  /** Download a previously uploaded workspace document (requires sign-in). */
  async downloadDocument(documentId: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${environment.apiBaseUrl}/api/documents/${documentId}`, { responseType: 'blob' })
    );
  }

  /** Delete a document from the account: the server marks the row deleted and removes the stored file. */
  async deleteDocument(documentId: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${environment.apiBaseUrl}/api/documents/${documentId}`));
  }

  clearLocal(): void {
    this.workspace.set(null);
    this.saveStatus.set('idle');
    this.saveError.set(null);
    if (this.saveTimer) clearTimeout(this.saveTimer);
  }

  private ensureAutosave(): void {
    if (this.booted) return;
    this.booted = true;
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => this.scheduleSave(true));
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        if (this.auth.isSignedIn() && this.workspace()) this.scheduleSave(true);
      });
    }
  }
}

function stepFromRoute(route: string): string {
  if (route.startsWith('/results')) return 'results';
  if (route.startsWith('/details')) return 'details';
  if (route.startsWith('/reason')) return 'reason';
  if (route.startsWith('/checklist')) return 'checklist';
  if (route.startsWith('/sources')) return 'sources';
  return 'start';
}

function progressFromStep(step: string): number {
  switch (step) {
    case 'start': return 10;
    case 'reason': return 35;
    case 'details': return 60;
    case 'results': return 90;
    case 'checklist':
    case 'sources': return 95;
    default: return 20;
  }
}
