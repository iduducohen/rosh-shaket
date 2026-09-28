// Mirrors the API contracts (server/src/RoshShaket.Api/Contracts).

export type ExitReason = 'Fired' | 'ResignedJustified' | 'Resigned' | 'ContractEnded';
export type ExitChoice = ExitReason | 'Considering';
export type Section14 = 'Full' | 'Partial6' | 'None' | 'Unknown';
export type Certainty = 'Estimate' | 'NeedsVerification' | 'Informational';
export type WorkWeek = 'FiveDays' | 'SixDays';

export interface ProfileDto {
  startDate: string;          // yyyy-MM-dd
  endDate: string;
  monthlySalary: number;
  jobPercent: number;
  workDaysPerWeek: 5 | 6;
  vacationBalanceDays: number;
  recuperationDaysPaidLastYear: number;
  section14: Section14;
  hasStudyFund: boolean;
}

export interface ComponentDto {
  code: string;
  title: string;
  amount: number | null;
  displayValue: string | null;
  explanation: string;
  certainty: Certainty;
  includedInTotal: boolean;
  sourceKey: string | null;
  flag: string | null;
}

export interface CalculationResponse {
  reason: ExitReason;
  seniorityYears: number;
  estimatedTotal: number;
  components: ComponentDto[];
  advisories: string[];
  valuesValidFrom: string;
  recuperationDayValue: number;
}

export interface ProfileDraft {
  isPayslip: boolean;
  payslipMonth: string | null;
  startDate: string | null;
  monthlySalary: number | null;
  jobPercent: number | null;
  workWeek: WorkWeek | null;
  vacationBalanceDays: number | null;
  recuperationDaysPaidLastYear: number | null;
  section14Suggestion: Section14 | null;
  hasStudyFund: boolean | null;
  filled: string[];
  missing: string[];
}

export interface ChecklistItem {
  key: string;
  group: string;
  order: number;
  text: string;
  tags: string[];
  sourceKey: string | null;
}

export interface RightsSource {
  key: string;
  title: string;
  url: string;
  description: string;
}

export const REASON_LABELS: Record<ExitReason, string> = {
  Fired: 'פיטורים',
  ResignedJustified: 'התפטרות בדין מפוטר',
  Resigned: 'התפטרות',
  ContractEnded: 'סיום חוזה'
};
