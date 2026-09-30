// Mirrors the API contracts (server/src/RoshShaket.Api/Contracts).

export type ExitReason = 'Fired' | 'ResignedJustified' | 'Resigned' | 'ContractEnded';
export type ExitChoice = ExitReason | 'Considering';
export type Section14 = 'Full' | 'Partial6' | 'None' | 'Unknown';
export type Certainty = 'Estimate' | 'NeedsVerification' | 'Informational';
export type WorkWeek = 'OneDay' | 'TwoDays' | 'ThreeDays' | 'FourDays' | 'FiveDays' | 'SixDays';

export interface ProfileDto {
  startDate: string;          // yyyy-MM-dd
  endDate: string;
  monthlySalary: number;
  jobPercent: number;
  workDaysPerWeek: 1 | 2 | 3 | 4 | 5 | 6;
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

export type FundKind = 'pension' | 'severance' | 'disability' | 'study';

export interface FundLine {
  kind: FundKind;
  name: string | null;
  employee: number | null;
  employer: number | null;
  unit: 'percent' | 'amount' | null;
  detail: string | null;
}

export interface ProfileDraft {
  isPayslip: boolean;
  readable?: boolean;
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
  /** null when the server did not return fund rows. An empty array means the payslip had none. */
  funds?: FundLine[] | null;
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

export interface ChartSlice {
  key: string;
  label: string;
  value: number;
  unit: 'ils' | 'percent' | string;
}

export interface ReportComponent {
  code: string;
  title: string;
  amount: number | null;
  displayValue: string | null;
  explanation: string;
  includedInTotal: boolean;
  certainty: string;
  flag: string | null;
}

export interface ScenarioReport {
  reason: ExitReason;
  reasonLabel: string;
  seniorityYears: number;
  estimatedTotal: number;
  components: ReportComponent[];
  entitlementSlices: ChartSlice[];
  advisories: string[];
  valuesValidFrom: string;
  recuperationDayValue: number;
}

export interface ReportBasis {
  startDate: string;
  endDate: string;
  monthlySalary: number;
  jobPercent: number;
  workWeek: string;
  vacationBalanceDays: number;
  recuperationDaysPaidLastYear: number;
  section14: string;
  hasStudyFund: boolean;
  fromPayslip: boolean;
  payslipMonth: string | null;
}

export interface RightsReport {
  generatedAt: string;
  title: string;
  basis: ReportBasis;
  scenarios: ScenarioReport[];
  funds: FundLine[];
  employerFundSlices: ChartSlice[];
  employeeFundSlices: ChartSlice[];
  scenarioTotalSlices: ChartSlice[];
  disclaimer: string;
}

export const REASON_LABELS: Record<ExitReason, string> = {
  Fired: 'פיטורים',
  ResignedJustified: 'התפטרות בדין מפוטר',
  Resigned: 'התפטרות',
  ContractEnded: 'סיום חוזה'
};
