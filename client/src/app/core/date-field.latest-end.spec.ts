import { earliestEndDate, latestEndDate, latestStartDate } from './date-field.component';

describe('employment length rules', () => {
  it('the end date is at least 3 months after the start', () => {
    expect(earliestEndDate('2023-10-01')).toBe('2024-01-01');
    expect(earliestEndDate('2023-11-30')).toBe('2024-02-29', 'clamped to the last day of a short month');
    expect(earliestEndDate('')).toBeNull();
  });

  it('the latest start leaves 3 months before the latest allowed end', () => {
    // Latest end is 3 Nov 2026, so a start after 3 Aug 2026 could never reach 3 months.
    expect(latestStartDate(new Date(2026, 9, 3))).toBe('2026-08-03');
  });
});

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
