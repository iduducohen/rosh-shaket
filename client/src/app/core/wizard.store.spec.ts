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

  it('reset clears everything', () => {
    store.choice.set('Fired');
    store.reset();
    expect(store.choice()).toBeNull();
    expect(store.fromPayslip()).toBeFalse();
    expect(store.hasEnoughForCalculation()).toBeFalse();
  });
});
