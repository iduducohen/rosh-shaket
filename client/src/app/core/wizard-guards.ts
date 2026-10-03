import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth/auth.service';
import { ReviewStore } from './review.store';
import { WizardStore } from './wizard.store';
import { WorkspaceService } from './workspace.service';

// A step opens only when the steps before it are done; a deep link or the browser's forward button lands on
// the first unfinished step instead. Note: inject() must run before the first await.

/** Quick check, step 3 (details): needs the exit reason from step 2. */
export const detailsStepGuard: CanActivateFn = async () => {
  const deps = quickDeps();
  await loadWizard(deps);
  return deps.store.choice() ? true : deps.router.parseUrl('/reason');
};

/** Quick check, step 4 (results): needs a finished calculation. */
export const resultsStepGuard: CanActivateFn = async () => {
  const deps = quickDeps();
  await loadWizard(deps);
  if (deps.store.results().length) return true;
  return deps.router.parseUrl(deps.store.choice() ? '/details' : '/reason');
};

/** Full review, step 2 (documents): needs the employment period. */
export const reviewDocumentsGuard: CanActivateFn = () => {
  const store = inject(ReviewStore);
  return store.hasPeriod() ? true : inject(Router).parseUrl('/review/employment');
};

/** Full review, steps 3–4 (check, results): need the period and finished documents. */
export const reviewCheckGuard: CanActivateFn = () => {
  const store = inject(ReviewStore);
  const router = inject(Router);
  if (!store.hasPeriod()) return router.parseUrl('/review/employment');
  return store.documentsBlocker() ? router.parseUrl('/review/documents') : true;
};

function quickDeps() {
  return { auth: inject(AuthService), workspaces: inject(WorkspaceService), store: inject(WizardStore), router: inject(Router) };
}

/** A signed-in refresh or deep link arrives before the saved workspace is loaded — load it before judging. */
async function loadWizard({ auth, workspaces }: ReturnType<typeof quickDeps>): Promise<void> {
  await auth.init();
  if ((auth.isSignedIn() || auth.hasSession()) && !workspaces.workspace()) {
    await workspaces.restore().catch(() => null);
  }
}
