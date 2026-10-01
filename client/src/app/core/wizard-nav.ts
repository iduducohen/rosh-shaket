import { NavigationStart, Router } from '@angular/router';
import { WizardStore } from './wizard.store';

const RETURN_KEY = 'rs-side-return';

/** Remember the wizard page the user left when opening checklist/sources. */
export function rememberReturnUrl(url: string): void {
  const path = url.split('?')[0];
  if (!path || path.startsWith('/checklist') || path.startsWith('/sources') || path.startsWith('/login')) return;
  try { sessionStorage.setItem(RETURN_KEY, path); } catch { /* private mode */ }
}

export function clearReturnUrl(): void {
  try { sessionStorage.removeItem(RETURN_KEY); } catch { /* ignore */ }
}

/** Where to send the user when leaving checklist/sources. */
export function wizardReturn(store: WizardStore): { url: string; label: string } {
  try {
    const saved = sessionStorage.getItem(RETURN_KEY);
    if (saved) return { url: saved, label: labelFor(saved) };
  } catch { /* ignore */ }

  if (store.results().length) return { url: '/results/summary', label: 'חזרה לתוצאות' };
  if (store.profile().startDate && store.profile().monthlySalary > 0) return { url: '/details', label: 'חזרה לפרטים' };
  if (store.choice()) return { url: '/reason', label: 'חזרה לסיבת העזיבה' };
  return { url: '/start', label: 'חזרה להתחלה' };
}

function labelFor(url: string): string {
  if (url.startsWith('/results')) return 'חזרה לתוצאות';
  if (url.startsWith('/details')) return 'חזרה לפרטים';
  if (url.startsWith('/reason')) return 'חזרה לסיבת העזיבה';
  if (url.startsWith('/review')) return 'חזרה לבדיקה';
  if (url.startsWith('/start') || url === '/') return 'חזרה להתחלה';
  return 'חזרה';
}

let trackerInstalled = false;

/** Capture the page the user was on right before entering checklist/sources. */
export function installReturnTracker(router: Router): void {
  if (trackerInstalled) return;
  trackerInstalled = true;
  router.events.subscribe(event => {
    if (!(event instanceof NavigationStart)) return;
    const from = router.url.split('?')[0];
    const to = event.url.split('?')[0];
    const enteringSide = to === '/checklist' || to === '/sources';
    const leavingWizard = !from.startsWith('/checklist') && !from.startsWith('/sources');
    if (enteringSide && leavingWizard && from && from !== to) rememberReturnUrl(from);
  });
}
