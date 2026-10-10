import { finalMonthParts, finalMonthPensionBase } from './pay-components';

describe('final month pension base', () => {
  const april = [
    { kind: 'salary', amount: 0 },
    { kind: 'overtime', amount: 4050 },
    { kind: 'recuperation', amount: 823.46 },
    { kind: 'notice', amount: 31243.41 },
    { kind: 'vacation_redemption', amount: 23904.95 },
    { kind: 'expenses', amount: 354.72 }
  ];

  it('counts the salary, the notice pay and the vacation redemption, and leaves out overtime and recuperation', () => {
    expect(finalMonthPensionBase(april)).toBeCloseTo(55148.36, 2);
  });

  it('keeps a regular month on the base the payslip prints', () => {
    expect(finalMonthPensionBase([{ kind: 'salary', amount: 34200 }, { kind: 'overtime', amount: 4050 }])).toBeNull();
    expect(finalMonthPensionBase([])).toBeNull();
    expect(finalMonthPensionBase(null)).toBeNull();
  });

  it('reports the parts for the explanation', () => {
    const parts = finalMonthParts(april);

    expect(parts.notice).toBeCloseTo(31243.41, 2);
    expect(parts.vacation).toBeCloseTo(23904.95, 2);
    expect(parts.base).toBeCloseTo(55148.36, 2);
  });
});
