import { ExtractedPayComponent } from './review.models';

/**
 * The part of a final payslip that pension contributions are normally due on: the salary for the days worked,
 * the payment in lieu of notice and the vacation redemption. Overtime, recuperation pay, expenses and severance
 * pay are not part of it.
 *
 * Returns null unless the payslip has a notice or vacation-redemption line, so a regular month keeps using the
 * base the payslip prints (or its gross).
 */
export function finalMonthPensionBase(components: readonly ExtractedPayComponent[] | null | undefined): number | null {
  if (!components?.length) return null;
  const sum = (kind: string) => components.filter(c => c.kind === kind).reduce((s, c) => s + c.amount, 0);
  const notice = sum('notice');
  const vacation = sum('vacation_redemption');
  if (notice <= 0 && vacation <= 0) return null;
  return Math.round((sum('salary') + notice + vacation) * 100) / 100;
}

/** Notice pay and vacation redemption of a payslip, for the explanation of a final month. */
export function finalMonthParts(components: readonly ExtractedPayComponent[] | null | undefined): { notice: number; vacation: number; base: number | null } {
  const sum = (kind: string) => (components ?? []).filter(c => c.kind === kind).reduce((s, c) => s + c.amount, 0);
  return { notice: sum('notice'), vacation: sum('vacation_redemption'), base: finalMonthPensionBase(components) };
}
