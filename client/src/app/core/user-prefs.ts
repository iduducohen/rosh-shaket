import { RefundAnswers } from './tax-refund';

/**
 * The user's own marks. A guest keeps them in this browser; a signed-in user also has them
 * in the workspace snapshot, so another device shows the same ticks.
 */
export interface UserPrefs {
  /** Checklist item key → ticked. */
  checklist?: Record<string, boolean>;
  taxRefund?: RefundAnswers;
}

const CHECKLIST_KEY = 'rs-checked';
const TAX_REFUND_KEY = 'rs-tax-refund';

export function readLocalPrefs(): UserPrefs {
  return { checklist: read(CHECKLIST_KEY), taxRefund: read(TAX_REFUND_KEY) };
}

export function writeLocalPrefs(prefs: UserPrefs): void {
  try {
    localStorage.setItem(CHECKLIST_KEY, JSON.stringify(prefs.checklist ?? {}));
    localStorage.setItem(TAX_REFUND_KEY, JSON.stringify(prefs.taxRefund ?? {}));
  } catch { /* storage full or blocked: keep in memory */ }
}

export function clearLocalPrefs(): void {
  try {
    localStorage.removeItem(CHECKLIST_KEY);
    localStorage.removeItem(TAX_REFUND_KEY);
  } catch { /* ignore */ }
}

function read<T extends object>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : undefined;
  } catch {
    return undefined;
  }
}
