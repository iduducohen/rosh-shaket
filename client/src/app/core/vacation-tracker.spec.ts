import { legalAnnualVacationDays, trackVacation, VacationFigures, VacationPayslip } from './vacation-tracker';

const slip = (year: number, month: number, vacation: Partial<VacationFigures> | null | undefined): VacationPayslip => ({
  year, month,
  vacation: vacation ? { balance: null, used: null, accrued: null, previousBalance: null, ...vacation } : vacation
});

const period = { startDate: '2023-10-22', endDate: '2024-01-31' };

describe('trackVacation', () => {
  it('finds nothing wrong when every balance follows from the month before', () => {
    const t = trackVacation({
      ...period,
      payslips: [
        slip(2023, 11, { balance: 1.0, accrued: 1.0, used: 0 }),
        slip(2023, 12, { balance: 2.0, accrued: 1.0, used: 0 }),
        slip(2024, 1, { balance: 1.0, accrued: 1.0, used: 2 })
      ],
      salaryFor: () => 22000
    });

    expect(t.mismatchCount).toBe(0);
    expect(t.findings[0].severity).toBe('ok');
    expect(t.lastBalance).toBe(1);
    expect(t.lastBalanceLabel).toBe('01/2024');
    expect(t.redemptionEstimate).toBe(1000);   // 1 day × 22,000 ÷ 22 work days
    expect(t.findings.some(f => f.title.includes('נשארו 1 ימי חופשה') && f.text.includes('החודש האחרון'))).toBeTrue();
  });

  it('flags a balance that does not equal previous + accrued − used', () => {
    const t = trackVacation({
      ...period,
      payslips: [
        slip(2023, 11, { balance: 4.25, accrued: 1, used: 0 }),
        slip(2023, 12, { balance: 3.0, accrued: 1, used: 0 })   // should be 5.25
      ]
    });

    expect(t.mismatchCount).toBe(1);
    const december = t.months[1];
    expect(december.status).toBe('mismatch');
    expect(december.expected).toBe(5.25);
    expect(december.note).toContain('2.25');
    expect(t.findings[0].severity).toBe('warn');
    expect(t.findings[0].months).toEqual(['12/2023']);
  });

  it('flags a printed previous balance that differs from last month\'s payslip', () => {
    const t = trackVacation({
      ...period,
      payslips: [slip(2023, 11, { balance: 6 }), slip(2023, 12, { previousBalance: 4, balance: 5, accrued: 1, used: 0 })]
    });
    expect(t.months[1].status).toBe('mismatch');
    expect(t.months[1].note).toContain('החודש הקודם');
  });

  it('does not compare across a missing month, and treats rounding as equal', () => {
    const t = trackVacation({
      ...period,
      payslips: [
        slip(2023, 10, { balance: 0.33, accrued: 0.33, used: 0 }),
        slip(2023, 12, { balance: 9, accrued: 1.04, used: 0 }),          // November is missing: nothing to compare with
        slip(2024, 1, { balance: 10.05, accrued: 1.04, used: 0 })        // 10.04 vs 10.05 is rounding
      ]
    });
    expect(t.mismatchCount).toBe(0);
  });

  it('notes a drop with no printed use, a low accrual and a negative balance without calling them mismatches', () => {
    const t = trackVacation({
      startDate: '2020-01-01', endDate: '2024-12-31',
      payslips: [
        slip(2024, 1, { balance: 5 }),
        slip(2024, 2, { balance: 3 }),                       // dropped by 2, use not printed
        slip(2024, 3, { balance: 3.5, accrued: 0.5, used: 0 }),   // fifth year, full time: at least 1 a month
        slip(2024, 4, { balance: -1, accrued: 1, used: 5.5 })
      ]
    });
    expect(t.mismatchCount).toBe(0);
    expect(t.months[1].status).toBe('note');
    const titles = t.findings.map(f => f.title);
    expect(titles).toContain('ירידה ביתרה בלי ניצול מודפס');
    expect(titles).toContain('צבירה חודשית נמוכה מהמינימום למשרה מלאה');
    expect(titles).toContain('יתרת חופשה שלילית');
  });

  it('counts payslips checked before vacation days were read, and has no data when none print them', () => {
    const t = trackVacation({ ...period, payslips: [slip(2023, 11, undefined), slip(2023, 12, null)] });
    expect(t.hasData).toBeFalse();
    expect(t.notReadCount).toBe(1);
    expect(t.months.every(m => m.status === 'noData')).toBeTrue();
  });

  it('knows the legal minimum by year of work', () => {
    expect(legalAnnualVacationDays(1)).toBe(12);
    expect(legalAnnualVacationDays(6)).toBe(14);
    expect(legalAnnualVacationDays(20)).toBe(20);
    expect(legalAnnualVacationDays(1, 6)).toBe(14);
  });
});
