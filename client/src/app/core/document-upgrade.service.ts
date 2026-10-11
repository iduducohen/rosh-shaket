import { Injectable, computed, inject, signal } from '@angular/core';
import { DocumentValidationService } from './document-validation.service';
import { EXTRACTION_VERSION } from './review.models';
import { ReviewDocumentFilesService } from './review-document-files.service';
import { ReviewStore } from './review.store';

const KINDS = new Set(['payslip', 'form106', 'pension_report']);

/** After this many failures in a row the run stops: the server is away, or the person is signed out. */
const MAX_FAILURES_IN_A_ROW = 3;

/**
 * Brings documents that were read by an older version of the reading up to date, from the saved files,
 * with no click and no credit. Each document is read once per session at most; one that cannot be read
 * keeps what it had.
 */
@Injectable({ providedIn: 'root' })
export class DocumentUpgradeService {
  private readonly store = inject(ReviewStore);
  private readonly files = inject(ReviewDocumentFilesService);
  private readonly validation = inject(DocumentValidationService);

  private running = false;
  private readonly tried = new Set<string>();

  /** null when nothing is being updated. */
  readonly progress = signal<{ done: number; total: number } | null>(null);
  readonly active = computed(() => this.progress() != null);

  /** Documents that were read by an older version and have not been tried in this session. */
  pending(): string[] {
    return (this.store.review()?.documents ?? [])
      .filter(d => d.validationStatus === 'ok'
        && KINDS.has(d.documentType)
        && (d.extractionVersion ?? 0) < EXTRACTION_VERSION
        && !this.tried.has(d.id))
      .map(d => d.id);
  }

  async run(): Promise<void> {
    if (this.running) return;
    const ids = this.pending();
    if (!ids.length) return;
    this.running = true;
    let done = 0;
    let failures = 0;
    this.progress.set({ done, total: ids.length });
    try {
      for (const id of ids) {
        this.tried.add(id);
        const doc = this.store.review()?.documents.find(d => d.id === id);
        if (!doc || this.validation.isRunning(id)) continue;
        const file = await this.files.get(id).catch(() => null);
        const ok = file ? await this.validation.upgradeDocument(id, file) : false;
        failures = ok ? 0 : failures + 1;
        done += 1;
        this.progress.set({ done, total: ids.length });
        if (failures >= MAX_FAILURES_IN_A_ROW) break;
      }
    } finally {
      this.running = false;
      this.progress.set(null);
    }
  }
}
