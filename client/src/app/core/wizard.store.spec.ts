import { TestBed } from '@angular/core/testing';
import { WizardStore } from './wizard.store';

describe('WizardStore', () => {
  let store: WizardStore;
  beforeEach(() => { store = TestBed.inject(WizardStore); store.reset(); });

  it('applies a payslip draft and marks the source', () => {
    store.applyDraft({
      isPayslip: true, payslipMonth: '2026-08', startDate: '2021-03-01', monthlySalary: 16500, jobPercent: 100,
      workWeek: 'SixDays', vacationBalanceDays: 9, recuperationDaysPaidLastYear: null, section14Suggestion: 'Partial6',
      hasStudyFund: true, filled: ['startDate', 'monthlySalary'], missing: []
    });
    const p = store.profile();
    expect(p.monthlySalary).toBe(16500);
    expect(p.workDaysPerWeek).toBe(6);
    expect(p.section14).toBe('Partial6');
    expect(p.recuperationDaysPaidLastYear).toBe(0); // null keeps the default
    expect(store.fromPayslip()).toBeTrue();
    expect(store.hasEnoughForCalculation()).toBeTrue();
  });

  it('turns an hourly payslip into an hourly profile with derived monthly figures', () => {
    store.applyDraft({
      isPayslip: true, payslipMonth: '2026-08', startDate: '2023-01-01', monthlySalary: null, jobPercent: null,
      workWeek: 'FiveDays', vacationBalanceDays: 4, recuperationDaysPaidLastYear: null, section14Suggestion: null,
      hasStudyFund: null, filled: ['hourlyRate', 'averageMonthlyHours'], missing: [],
      payType: 'Hourly', hourlyRate: 50, monthlyHours: 91
    });
    const p = store.profile();
    expect(p.payType).toBe('Hourly');
    expect(p.hourlyRate).toBe(50);
    expect(p.averageMonthlyHours).toBe(91);
    expect(p.monthlySalary).toBe(4550);   // 50 × 91
    expect(p.jobPercent).toBe(50);        // 91 of 182 hours
    expect(store.hasEnoughForCalculation()).toBeTrue();
  });

  it('keeps a monthly payslip monthly, and caps hourly overtime at a full-time month', () => {
    store.applyDraft({
      isPayslip: true, payslipMonth: null, startDate: null, monthlySalary: 9000, jobPercent: 100, workWeek: null,
      vacationBalanceDays: null, recuperationDaysPaidLastYear: null, section14Suggestion: null, hasStudyFund: null,
      filled: [], missing: [], payType: 'Monthly', hourlyRate: null, monthlyHours: null
    });
    expect(store.profile().payType).toBe('Monthly');
    expect(store.profile().hourlyRate).toBeNull();

    store.applyDraft({
      isPayslip: true, payslipMonth: null, startDate: null, monthlySalary: null, jobPercent: null, workWeek: null,
      vacationBalanceDays: null, recuperationDaysPaidLastYear: null, section14Suggestion: null, hasStudyFund: null,
      filled: [], missing: [], payType: 'Hourly', hourlyRate: 40, monthlyHours: 200
    });
    expect(store.profile().monthlySalary).toBe(40 * 182);
    expect(store.profile().jobPercent).toBe(100);
  });

  it('reset clears everything', () => {
    store.choice.set('Fired');
    store.reset();
    expect(store.choice()).toBeNull();
    expect(store.fromPayslip()).toBeFalse();
    expect(store.hasEnoughForCalculation()).toBeFalse();
  });
});
