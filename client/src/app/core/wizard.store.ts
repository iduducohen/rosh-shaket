import { Injectable, computed, signal } from '@angular/core';
import { CalculationResponse, ExitChoice, ExitReason, ProfileDraft, ProfileDto } from './models';

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
  readonly fromPayslip = signal(false);
  readonly payslipMonth = signal<string | null>(null);
  readonly results = signal<CalculationResponse[]>([]);
  readonly activeIndex = signal(0);

  readonly active = computed(() => this.results()[this.activeIndex()] ?? null);
  readonly activeReason = computed<ExitReason | null>(() => this.active()?.reason ?? null);
  readonly hasEnoughForCalculation = computed(() => !!this.profile().startDate && this.profile().monthlySalary > 0);

  applyDraft(d: ProfileDraft): void {
    const p = this.profile();
    this.profile.set({
      ...p,
      startDate: d.startDate ?? p.startDate,
      monthlySalary: d.monthlySalary ?? p.monthlySalary,
      jobPercent: d.jobPercent ?? p.jobPercent,
      workDaysPerWeek: d.workWeek === 'SixDays' ? 6 : d.workWeek === 'FiveDays' ? 5 : p.workDaysPerWeek,
      vacationBalanceDays: d.vacationBalanceDays ?? p.vacationBalanceDays,
      recuperationDaysPaidLastYear: d.recuperationDaysPaidLastYear ?? p.recuperationDaysPaidLastYear,
      section14: d.section14Suggestion ?? p.section14,
      hasStudyFund: d.hasStudyFund ?? p.hasStudyFund
    });
    this.filledFields.set(d.filled);
    this.fromPayslip.set(true);
    this.payslipMonth.set(d.payslipMonth);
  }

  reset(): void {
    this.choice.set(null);
    this.profile.set(emptyProfile());
    this.filledFields.set([]);
    this.fromPayslip.set(false);
    this.payslipMonth.set(null);
    this.results.set([]);
    this.activeIndex.set(0);
  }
}
