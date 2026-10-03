import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth/auth.service';
import { ReviewDocumentFilesService } from './review-document-files.service';
import { EmploymentReviewCase } from './review.models';
import { ReviewStore } from './review.store';
import { WorkspaceDocument, WorkspaceDto, WorkspaceService } from './workspace.service';

describe('ReviewDocumentFilesService — syncing to the account', () => {
  let files: ReviewDocumentFilesService;
  let store: ReviewStore;
  let workspaces: WorkspaceService;
  const file = new File([new Uint8Array(72649)], 'payslip.pdf', { type: 'application/pdf' });

  function serverDoc(id: string): WorkspaceDocument {
    return { id, workspaceId: 'ws', documentType: 'payslip', originalFileName: 'payslip.pdf', contentType: 'application/pdf',
      fileSize: 72649, version: 1, status: 'Ready', uploadedAt: '', metadataJson: null };
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    files = TestBed.inject(ReviewDocumentFilesService);
    store = TestBed.inject(ReviewStore);
    workspaces = TestBed.inject(WorkspaceService);
    spyOn(TestBed.inject(AuthService), 'isSignedIn').and.returnValue(true);
    const review: EmploymentReviewCase = {
      workspaceId: 'ws', period: null, months: [], funds: [], updatedAt: new Date().toISOString(),
      documents: [{ id: 'd1', documentType: 'payslip', year: 2023, month: 11, source: 'upload', parsedOk: true, extractedSummary: null, needsManualReview: false }]
    };
    store.review.set(review);
  });

  it('links a file already in the account instead of uploading a second copy', async () => {
    workspaces.workspace.set({ documents: [serverDoc('srv-1')] } as unknown as WorkspaceDto);
    const upload = spyOn(workspaces, 'uploadDocument');

    await files.syncToServer('d1', file, 'payslip');

    expect(upload).not.toHaveBeenCalled();
    expect(store.review()!.documents[0].serverDocumentId).toBe('srv-1');
  });

  it('deletes the account copy of a removed document, but not one another entry still uses', async () => {
    const del = spyOn(workspaces, 'deleteDocument').and.returnValue(Promise.resolve());

    await files.removeFromServer('srv-9', 'd1');
    expect(del).toHaveBeenCalledOnceWith('srv-9');

    store.updateDocument('d1', { serverDocumentId: 'srv-shared' });
    await files.removeFromServer('srv-shared', 'other-doc');
    expect(del).toHaveBeenCalledTimes(1);
  });

  it('uploads once even when two triggers run at the same time', async () => {
    workspaces.workspace.set({ documents: [] } as unknown as WorkspaceDto);
    const upload = spyOn(workspaces, 'uploadDocument').and.returnValue(Promise.resolve(serverDoc('srv-2')));

    await Promise.all([files.syncToServer('d1', file, 'payslip'), files.syncToServer('d1', file, 'payslip')]);

    expect(upload).toHaveBeenCalledTimes(1);
    expect(store.review()!.documents[0].serverDocumentId).toBe('srv-2');
  });
});
