/** Client models for the multi-year employment & pension review flow. */

export type FundKind = 'Pension' | 'Severance' | 'Study' | 'Managers';
export type DataConfidence = 'High' | 'Medium' | 'Low' | 'Unknown';
export type HealthStatus = 'Healthy' | 'NeedsReview' | 'GapsFound' | 'InsufficientData';

export interface ContributionTriplet {
  expected: number | null;
  reported: number | null;
  actual: number | null;
}

export interface EmploymentPeriod {
  id: string;
  workspaceId: string;
  employerName: string | null;
  startDate: string;
  endDate: string;
  sameEmployerThroughout: boolean;
  exitReason: string | null;
  hadWorkBreak: boolean;
  multiplePeriods: boolean;
  notes: string | null;
}

export interface EmploymentMonth {
  id: string;
  periodId: string;
  workspaceId: string;
  year: number;
  month: number;
  grossSalary: number | null;
  pensionableSalary: number | null;
  employeePension: ContributionTriplet;
  employerPension: ContributionTriplet;
  employeeCompensation: ContributionTriplet;
  employerCompensation: ContributionTriplet;
  trainingFundEmployee: ContributionTriplet;
  trainingFundEmployer: ContributionTriplet;
  otherExpected: number | null;
  otherReported: number | null;
  otherActual: number | null;
  contributionDate: string | null;
  sourceDocumentId: string | null;
  confidence: DataConfidence;
  flags: string | null;
}

export interface FundAccount {
  id: string;
  workspaceId: string;
  kind: FundKind;
  balance: number | null;
  asOf: string | null;
  provider: string | null;
  feeAnnualPercent: number | null;
  returnAnnualPercent: number | null;
  track: string | null;
  confidence: DataConfidence;
}

export interface ReviewDocumentMeta {
  id: string;
  documentType: string;
  year: number | null;
  month: number | null;
  source: string | null;
  parsedOk: boolean;
  extractedSummary: string | null;
  needsManualReview: boolean;
}

export interface EmploymentReviewCase {
  workspaceId: string;
  period: EmploymentPeriod | null;
  months: EmploymentMonth[];
  funds: FundAccount[];
  documents: ReviewDocumentMeta[];
  updatedAt: string;
}

export interface HealthScoreResult {
  status: HealthStatus;
  coverageRatio: number;
  messageHe: string;
}

export interface ReconciliationSummary {
  totalMonths: number;
  monthsWithData: number;
  monthsOk: number;
  monthsWithGap: number;
  monthsNoInfo: number;
  monthsUnknownActual: number;
  expectedTotal: number | null;
  reportedTotal: number | null;
  actualTotal: number | null;
  gapTotal: number | null;
  firstGapMonth: string | null;
  lastGapMonth: string | null;
  health: HealthScoreResult;
  months: MonthReconciliation[];
}

export interface MonthReconciliation {
  year: number;
  month: number;
  hasAnyData: boolean;
  hasGap: boolean;
  hasUnknownActual: boolean;
  confidence: DataConfidence;
  lines: LineReconciliation[];
}

export interface LineReconciliation {
  code: string;
  fund: FundKind;
  expected: number | null;
  reported: number | null;
  actual: number | null;
  gapReportedVsExpected: number | null;
  gapActualVsExpected: number | null;
}

export interface Anomaly {
  id: string;
  workspaceId: string;
  year: number;
  month: number;
  fund: FundKind | null;
  kind: string;
  severity: string;
  explanation: string;
  confidence: DataConfidence;
}

export interface SimulationResult {
  scenario: string;
  annualReturnPercent: number;
  managementFeePercent: number;
  totalContributions: number;
  estimatedGains: number;
  estimatedFees: number;
  estimatedBalance: number;
  timeline: { year: number; month: number; cumulativeContributions: number; estimatedBalance: number; estimatedGains: number }[];
}

export interface AnalyzeResponse {
  summary: ReconciliationSummary;
  anomalies: Anomaly[];
  matrix: {
    years: number[];
    payroll: { year: number; amount: number | null }[];
    form106: { year: number; amount: number | null }[];
    pension: { year: number; amount: number | null }[];
    study: { year: number; amount: number | null }[];
  };
  simulations: SimulationResult[];
  usedEstimates: boolean;
}

export interface SalarySegmentDto {
  from: string;
  to: string | null;
  grossSalary: number;
  pensionableSalary: number | null;
}

export const DOC_CHECKLIST: { key: string; label: string }[] = [
  { key: 'payslip', label: 'תלושי שכר' },
  { key: 'form106', label: 'טופסי 106' },
  { key: 'pension_report', label: 'דוח הפקדות פנסיה' },
  { key: 'study_report', label: 'דוח קרן השתלמות' },
  { key: 'managers_report', label: 'דוח ביטוח מנהלים אם קיים' },
  { key: 'balance_report', label: 'דוח יתרות עדכני' },
  { key: 'fees', label: 'נתוני דמי ניהול' },
  { key: 'returns', label: 'נתוני תשואות' },
  { key: 'termination', label: 'מסמכי סיום העסקה' }
];

export function emptyTriplet(): ContributionTriplet {
  return { expected: null, reported: null, actual: null };
}

export function money(v: number | null | undefined): string {
  if (v == null) return 'לא ידוע';
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(v);
}

export function healthLabel(status: HealthStatus): string {
  switch (status) {
    case 'Healthy': return '🟢 תקין';
    case 'NeedsReview': return '🟡 דורש בדיקה';
    case 'GapsFound': return '🔴 נמצאו פערים';
    default: return '⚪ לא ניתן לקבוע';
  }
}
