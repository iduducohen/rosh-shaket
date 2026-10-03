import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth/auth.service';
import { ReviewStore } from './review.store';
import { WorkspaceService } from './workspace.service';

const DB_NAME = 'rs-review-doc-files';
const STORE = 'files';
const DB_VERSION = 1;

/**
 * Keeps uploaded review files in memory + IndexedDB, and syncs to the server
 * when the user is signed in (cross-device resume).
 */
@Injectable({ providedIn: 'root' })
export class ReviewDocumentFilesService {
  private readonly mem = new Map<string, File>();
  /** Reactive set of ids that have a local file available. */
  private readonly ids = signal<ReadonlySet<string>>(new Set());
  private readonly auth = inject(AuthService);
  private readonly workspaces = inject(WorkspaceService);
  private readonly store = inject(ReviewStore);

  has(id: string): boolean {
    return this.ids().has(id) || this.mem.has(id);
  }

  /** Sync lookup — prefer after hydrate / put. */
  peek(id: string): File | undefined {
    return this.mem.get(id);
  }

  async get(id: string): Promise<File | null> {
    const cached = this.mem.get(id);
    if (cached) return cached;
    const fromDb = await this.idbGet(id);
    if (fromDb) {
      this.mem.set(id, fromDb);
      this.mark(id);
      return fromDb;
    }
    return this.pullFromServer(id);
  }

  async put(id: string, file: File): Promise<void> {
    this.mem.set(id, file);
    this.mark(id);
    try {
      await this.idbPut(id, file);
    } catch {
      // Quota / private mode — memory-only is still OK for this session.
    }
  }

  async remove(id: string): Promise<void> {
    this.mem.delete(id);
    this.unmark(id);
    try {
      await this.idbDelete(id);
    } catch { /* ignore */ }
  }

  /** Load any known doc ids from IndexedDB (and server when needed). */
  async hydrate(ids: string[]): Promise<void> {
    await Promise.all(ids.map(async id => {
      if (this.mem.has(id)) {
        this.mark(id);
        return;
      }
      const f = await this.idbGet(id);
      if (f) {
        this.mem.set(id, f);
        this.mark(id);
        return;
      }
      await this.pullFromServer(id);
    }));
  }

  /**
   * After a successful local accept — also upload to workspace storage when signed in.
   * Soft-fails so local progress is never blocked by cloud sync.
   */
  async syncToServer(docId: string, file: File, documentType: string): Promise<void> {
    if (!this.auth.isSignedIn() && !this.auth.hasSession()) return;
    const meta = this.store.review()?.documents.find(d => d.id === docId);
    if (meta?.serverDocumentId || this.syncing.has(docId)) return;
    this.syncing.add(docId);
    try {
      // The file may already be in the account (an earlier upload whose id never reached this case): link, don't copy.
      const ws = this.workspaces.workspace() ?? await this.workspaces.restore().catch(() => null);
      const existing = ws?.documents.find(s =>
        s.originalFileName === file.name && s.fileSize === file.size && s.documentType === documentType
        && !this.linkedElsewhere(s.id, docId));
      const serverId = existing?.id ?? (await this.workspaces.uploadDocument(file, file.name, documentType)).id;
      this.store.updateDocument(docId, { serverDocumentId: serverId, storageKey: serverId });
    } catch {
      // Keep local-only; user can still continue on this device.
    } finally {
      this.syncing.delete(docId);
    }
  }

  /**
   * Remove a document's copy from the account (row + stored file), unless another entry in the case still
   * points at it. Soft-fails: the local list is the user's intent either way.
   */
  async removeFromServer(serverDocumentId: string | null | undefined, exceptDocId: string): Promise<void> {
    if (!serverDocumentId || (!this.auth.isSignedIn() && !this.auth.hasSession())) return;
    if (this.linkedElsewhere(serverDocumentId, exceptDocId)) return;
    try {
      await this.workspaces.deleteDocument(serverDocumentId);
    } catch {
      // Already gone or offline — nothing more to do here.
    }
  }

  /** Uploads in flight, so a second trigger (page re-init, replace) never sends the same document twice. */
  private readonly syncing = new Set<string>();

  private linkedElsewhere(serverId: string, docId: string): boolean {
    return (this.store.review()?.documents ?? []).some(d => d.id !== docId && d.serverDocumentId === serverId);
  }

  /**
   * Upload documents that are on this device but never reached the account (e.g. the storage was down
   * at upload time). Only the stored file is sent — no new AI check, so no credit is used.
   */
  async syncPending(): Promise<void> {
    if (!this.auth.isSignedIn() && !this.auth.hasSession()) return;
    const pending = (this.store.review()?.documents ?? []).filter(d => !d.serverDocumentId);
    for (const d of pending) {
      const file = await this.idbGet(d.id).catch(() => null) ?? this.mem.get(d.id) ?? null;
      if (file) await this.syncToServer(d.id, file, d.documentType);
    }
  }

  private async pullFromServer(docId: string): Promise<File | null> {
    if (!this.auth.isSignedIn() && !this.auth.hasSession()) return null;
    const meta = this.store.review()?.documents.find(d => d.id === docId);
    const serverId = meta?.serverDocumentId;
    if (!serverId) return null;
    try {
      const blob = await this.workspaces.downloadDocument(serverId);
      const name = meta?.fileName || 'document.pdf';
      const type = blob.type || (name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
      const file = new File([blob], name, { type });
      await this.put(docId, file);
      return file;
    } catch {
      return null;
    }
  }

  private mark(id: string): void {
    this.ids.update(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  private unmark(id: string): void {
    this.ids.update(prev => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  private openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    });
  }

  private async idbPut(id: string, file: File): Promise<void> {
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(file, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB put failed'));
    });
    db.close();
  }

  private async idbGet(id: string): Promise<File | null> {
    const db = await this.openDb();
    const file = await new Promise<File | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve((req.result as File | undefined) ?? null);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB get failed'));
    });
    db.close();
    return file;
  }

  private async idbDelete(id: string): Promise<void> {
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
    });
    db.close();
  }
}
