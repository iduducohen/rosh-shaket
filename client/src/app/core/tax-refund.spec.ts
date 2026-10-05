import { assessTaxRefund, RefundInput } from './tax-refund';

const base: RefundInput = {
  startDate: '2021-01-01', endDate: '2026-12-31', monthlySalary: 16500, hourly: false, lumpSum: 0, today: '2026-10-05'
};

describe('assessTaxRefund', () => {
  it('finds nothing special for a full-year employee with no one-time payments', () => {
    const a = assessTaxRefund(base);
    expect(a.verdict).toBe('unlikely');
    expect(a.signals).toEqual([]);
  });

  it('says a refund is likely when the work ends in the middle of the tax year', () => {
    const a = assessTaxRefund({ ...base, endDate: '2026-09-28' });
    expect(a.verdict).toBe('likely');
    expect(a.signals.map(s => s.key)).toEqual(['partialLastYear']);
    expect(a.signals[0].title).toContain('ספטמבר 2026');
  });

  it('counts a mid-year start only inside the six open years, and one-time payments as a weaker reason', () => {
    const recent = assessTaxRefund({ ...base, startDate: '2022-06-15', lumpSum: 12345 });
    expect(recent.signals.map(s => s.key)).toEqual(['partialFirstYear', 'lumpSum']);
    expect(recent.verdict).toBe('worthChecking');
    expect(recent.signals[1].title).toContain('12,345');

    const old = assessTaxRefund({ ...base, startDate: '2015-06-15' });
    expect(old.signals).toEqual([]);
  });

  it('lists the open years of this employment and the one that closes this year', () => {
    const a = assessTaxRefund({ ...base, startDate: '2018-03-01', endDate: '2026-09-28' });
    expect(a.openYears).toEqual([2025, 2024, 2023, 2022, 2021, 2020]);
    expect(a.closingYear).toBe(2020);
    expect(a.pendingYear).toBe(2026);

    const short = assessTaxRefund({ ...base, startDate: '2023-10-22', endDate: '2024-01-31' });
    expect(short.openYears).toEqual([2024, 2023]);
    expect(short.closingYear).toBeNull();
    expect(short.pendingYear).toBeNull();
  });

  it('tempers the verdict when the salary is too low to have paid much tax', () => {
    const a = assessTaxRefund({ ...base, endDate: '2026-06-30', monthlySalary: 4500 });
    expect(a.lowIncome).toBeTrue();
    expect(a.verdict).toBe('worthChecking');
    expect(a.summary).toContain('106');
  });

  it('adds what the user ticked, and warns that two employers can also mean a debt', () => {
    const a = assessTaxRefund(base, { twoJobs: true, credits: true });
    expect(a.verdict).toBe('likely');
    expect(a.signals.every(s => !s.fromData)).toBeTrue();
    expect(a.cautions.length).toBe(1);
    expect(a.cautions[0]).toContain('חוב');
  });
});
