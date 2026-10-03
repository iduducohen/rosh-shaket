import { latestEndDate } from './date-field.component';

describe('latestEndDate', () => {
  it('is the same day next month', () => {
    expect(latestEndDate(new Date(2026, 9, 3))).toBe('2026-11-03');
  });

  it('clamps to the last day of a shorter month', () => {
    expect(latestEndDate(new Date(2026, 0, 31))).toBe('2026-02-28');
    expect(latestEndDate(new Date(2028, 0, 31))).toBe('2028-02-29');
  });

  it('rolls over the year', () => {
    expect(latestEndDate(new Date(2026, 11, 15))).toBe('2027-01-15');
  });
});
