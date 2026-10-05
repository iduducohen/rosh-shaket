import { Injectable, computed, signal } from '@angular/core';
import { CalculationResponse, ExitChoice, ExitReason, FundLine, ProfileDraft, ProfileDto, hourlyMonthly } from './models';

const today = () => new Date().toISOString().slice(0, 10);

const emptyProfile = (): ProfileDto => ({
  startDate: '',
  endDate: today(),
  monthlySalary: 0,
  jobPercent: 100,
  workDaysPerWeek: 5,
  vacationBalanceDays: 0,
  recuperationDaysPaidLastYear: 0,
  section14: 'Unknown',
  hasStudyFund: false
});

/** Single source of truth for the flow (state only, no I/O). */
@Injectable({ providedIn: 'root' })
export class WizardStore {
  readonly choice = signal<ExitChoice | null>(null);
  readonly profile = signal<ProfileDto>(emptyProfile());
  readonly filledFields = signal<string[]>([]);
  readonly funds = signal<FundLine[] | null>(null);
  readonly fromPayslip = signal(false);
  readonly payslipMonth = signal<string | null>(null);
  readonly results = signal<CalculationResponse[]>([]);
  readonly activeIndex = signal(0);

  readonly active = computed(() => this.results()[this.activeIndex()] ?? null);
  readonly activeReason = computed<ExitReason | null>(() => this.active()?.reason ?? null);
  readonly hasEnoughForCalculation = computed(() => !!this.profile().startDate && this.profile().monthlySalary > 0);

  applyDraft(d: ProfileDraft): void {
    const p = this.profile();
    const hourly = d.payType === 'Hourly' && (d.hourlyRate ?? 0) > 0;
    // An hourly payslip gives a rate and this month's hours; the monthly figures are derived from them.
    const global = !hourly && d.payType === 'Global' && (d.globalOvertime ?? 0) > 0;
    const derived = hourly && d.monthlyHours ? hourlyMonthly(d.hourlyRate!, d.monthlyHours) : null;
    this.profile.set({
      ...p,
      payType: hourly ? 'Hourly' : global ? 'Global' : 'Monthly',
      globalOvertime: global ? d.globalOvertime : null,
      hourlyRate: hourly ? d.hourlyRate : null,
      averageMonthlyHours: hourly ? d.monthlyHours ?? null : null,
      startDate: d.startDate ?? p.startDate,
      monthlySalary: derived?.monthlySalary ?? d.monthlySalary ?? p.monthlySalary,
      jobPercent: derived?.jobPercent ?? d.jobPercent ?? p.jobPercent,
      workDaysPerWeek: mapWorkDays(d.workWeek) ?? p.workDaysPerWeek,
      vacationBalanceDays: d.vacationBalanceDays ?? p.vacationBalanceDays,
      recuperationDaysPaidLastYear: d.recuperationDaysPaidLastYear ?? p.recuperationDaysPaidLastYear,
      section14: d.section14Suggestion ?? p.section14,
      hasStudyFund: d.hasStudyFund ?? p.hasStudyFund,
      employerName: d.employerName ?? p.employerName ?? null
    });
    this.filledFields.set(d.filled);
    this.funds.set(d.funds ?? null);
    this.fromPayslip.set(true);
    this.payslipMonth.set(d.payslipMonth);
  }

  reset(): void {
    this.choice.set(null);
    this.profile.set(emptyProfile());
    this.filledFields.set([]);
    this.funds.set(null);
    this.fromPayslip.set(false);
    this.payslipMonth.set(null);
    this.results.set([]);
    this.activeIndex.set(0);
  }

  /** Restore from a server workspace snapshot (no I/O). */
  hydrate(snap: {
    choice: ExitChoice | null;
    profile: ProfileDto;
    filledFields: string[];
    funds: FundLine[] | null;
    fromPayslip: boolean;
    payslipMonth: string | null;
    results: CalculationResponse[];
    activeIndex: number;
  }): void {
    this.choice.set(snap.choice);
    this.profile.set({ ...emptyProfile(), ...snap.profile });
    this.filledFields.set(snap.filledFields ?? []);
    this.funds.set(snap.funds ?? null);
    this.fromPayslip.set(!!snap.fromPayslip);
    this.payslipMonth.set(snap.payslipMonth ?? null);
    this.results.set(snap.results ?? []);
    this.activeIndex.set(snap.activeIndex ?? 0);
  }

  snapshot(): {
    choice: ExitChoice | null;
    profile: ProfileDto;
    filledFields: string[];
    funds: FundLine[] | null;
    fromPayslip: boolean;
    payslipMonth: string | null;
    results: CalculationResponse[];
    activeIndex: number;
  } {
    return {
      choice: this.choice(),
      profile: this.profile(),
      filledFields: this.filledFields(),
      funds: this.funds(),
      fromPayslip: this.fromPayslip(),
      payslipMonth: this.payslipMonth(),
      results: this.results(),
      activeIndex: this.activeIndex()
    };
  }
}

const WORK_WEEK_DAYS: Record<string, 1 | 2 | 3 | 4 | 5 | 6> = {
  OneDay: 1, TwoDays: 2, ThreeDays: 3, FourDays: 4, FiveDays: 5, SixDays: 6,
  '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6
};

function mapWorkDays(value: string | number | null | undefined): 1 | 2 | 3 | 4 | 5 | 6 | null {
  if (value == null) return null;
  if (typeof value === 'number') return value >= 1 && value <= 6 ? value as 1 | 2 | 3 | 4 | 5 | 6 : null;
  return WORK_WEEK_DAYS[value] ?? null;
}
