import { FundLine } from './models';
import { assessContributions } from './payslip-contributions';

const line = (kind: FundLine['kind'], name: string, employee: number | null, employer: number | null, unit: FundLine['unit'] = 'percent'): FundLine =>
  ({ kind, name, employee, employer, unit, detail: null });

describe('assessContributions', () => {
  it('accepts a payslip split across two funds with disability inside the employer share', () => {
    // November 2023 payslip: Migdal managers 6% / 5.8% + 0.7% disability, Clal 6% / 6.5%, severance 8.33%.
    const checks = assessContributions([
      line('pension', 'מגדל ביט', 6, 5.8),
      line('disability', 'מגדל', null, 0.7),
      line('pension', 'כלל פנסיה', 6, 6.5),
      line('severance', 'מגדל', null, 8.33),
      line('severance', 'כלל פנסיה', null, 8.33),
      line('study', 'מור', 2.5, 7.5)
    ], 34200);
    const by = Object.fromEntries(checks.map(c => [c.key, c]));
    expect(by['employee'].status).toBe('ok');
    expect(by['employer'].status).toBe('ok');
    expect(by['employer'].rate).toBe(6.5);
    expect(by['severance'].status).toBe('ok');
    expect(by['study'].status).toBe('info');
  });

  it('flags an employer share below 6.5%', () => {
    const checks = assessContributions([line('pension', 'כלל', 6, 5), line('severance', 'כלל', null, 6)], 10000);
    expect(checks.find(c => c.key === 'employer')!.status).toBe('low');
    expect(checks.find(c => c.key === 'severance')!.status).toBe('partial');
  });

  it('converts amount lines to a rate of the salary', () => {
    const checks = assessContributions([
      line('pension', 'כלל', 600, 650, 'amount'),
      line('severance', 'כלל', null, 833, 'amount')
    ], 10000);
    expect(checks.find(c => c.key === 'employee')!.rate).toBe(6);
    expect(checks.find(c => c.key === 'severance')!.status).toBe('ok');
  });

  it('explains a payslip with no pension at all', () => {
    const checks = assessContributions([], 12000);
    expect(checks[0].status).toBe('missing');
    expect(checks.find(c => c.key === 'severance')!.status).toBe('missing');
  });
});
