import { buildDepositIndex, depositCoverage, depositGaps, fundKey, isStudyFund, suspectedUnread, unifyFunds } from './pension-deposits';
import { ExtractedContribution, ReviewDocumentMeta } from './review.models';

function line(kind: ExtractedContribution['kind'], payer: 'employee' | 'employer', provider: string, amount: number,
  forYear: number | null = null, forMonth: number | null = null): ExtractedContribution {
  return { kind, payer, provider, ratePercent: null, amount, forYear, forMonth };
}

function doc(documentType: string, year: number, month: number | null, lines: ExtractedContribution[]): ReviewDocumentMeta {
  return {
    id: `${documentType}-${year}-${month}`, documentType, year, month, source: 'upload', parsedOk: true,
    extractedSummary: null, needsManualReview: false, extractedContributions: lines
  };
}

describe('pension deposits against the fund reports', () => {
  // March 2024: two pension funds, a study fund and a disability premium, as printed on the payslip.
  const payslip = doc('payslip', 2024, 3, [
    line('pension', 'employee', 'כלל פנס', 1401.78),
    line('pension', 'employer', 'כלל פיצ', 1518.6),
    line('severance', 'employer', 'פיצ', 1946.14),
    line('pension', 'employee', 'מגדל בינ', 650.22),
    line('pension', 'employer', 'מגדל בי', 628.55),
    line('severance', 'employer', 'מגד', 902.72),
    line('study', 'employee', 'מור קה"ג', 392.8),
    line('disability', 'employer', 'אוב', 75.86)
  ]);

  const clalReport = (employee = 1401.78) => doc('pension_report', 2024, null, [
    line('pension', 'employee', 'כלל פנסיה וגמל', employee, 2024, 3),
    line('pension', 'employer', 'כלל פנסיה וגמל', 1518.6, 2024, 3),
    line('severance', 'employer', 'כלל פנסיה וגמל', 1946.14, 2024, 3)
  ]);

  it('matches a fund by its company even when the payslip cuts the name short', () => {
    expect(fundKey('כלל פנס')).toBe('כלל');
    expect(fundKey('כלל פנסיה וגמל בע"מ')).toBe('כלל');
    expect(fundKey('מגדל בינ')).toBe('מגדל');
    expect(fundKey('קרן הפניקס')).toBe('הפניקס');
    expect(fundKey(null)).toBe('');
  });

  it('finds nothing wrong when the fund received what its own payslip lines say', () => {
    const index = buildDepositIndex([payslip, clalReport()]);

    expect(depositGaps(index, 2024, 3)).toEqual([]);
  });

  it('does not count the second fund as missing money just because only one report was uploaded', () => {
    const index = buildDepositIndex([payslip, clalReport()]);

    const coverage = depositCoverage(index, 2024);

    expect(coverage.checked).toEqual(['כלל פנסיה וגמל']);
    expect(coverage.unchecked).toEqual(['מגדל']);
  });

  it('flags a fund whose report shows less than its payslip line', () => {
    const index = buildDepositIndex([payslip, clalReport(1000)]);

    const gaps = depositGaps(index, 2024, 3);

    expect(gaps.length).toBe(1);
    expect(gaps[0].line).toBe('employeePension');
    expect(gaps[0].reported).toBeCloseTo(1401.78);
    expect(gaps[0].deposited).toBe(1000);
  });

  it('flags a month the report has no deposit for, once the year is covered', () => {
    const index = buildDepositIndex([doc('payslip', 2024, 4, [line('pension', 'employee', 'כלל', 1401.78)]), clalReport()]);

    const gaps = depositGaps(index, 2024, 4);

    expect(gaps.length).toBe(1);
    expect(gaps[0].deposited).toBe(0);
  });

  it('judges nothing for a year with no fund report at all', () => {
    const index = buildDepositIndex([payslip]);

    expect(depositGaps(index, 2024, 3)).toEqual([]);
    expect(depositCoverage(index, 2024)).toEqual({ checked: [], unchecked: [] });
  });

  it('takes the larger of two reports for the same month instead of adding them up', () => {
    const second = { ...clalReport(), id: 'second' };
    const index = buildDepositIndex([payslip, clalReport(), second]);

    expect(depositGaps(index, 2024, 3)).toEqual([]);
  });

  it('merges the cut-short and garbled spellings from a real payslip into one company each', () => {
    const names = ['מגדל', 'מגדל ביג', 'מגדל בינלאומי', 'מגדל בי', 'מגד', 'פיצ מגד', 'אוב מגד',
      'כלל', 'כלל פנס', 'כלל פנסיה', 'כלל פיצ', 'פיצת כלז', 'מור', 'מור קה', 'מור קה"ג', 'מור בינ', 'פיצ', 'אוב'];
    const company = unifyFunds(names);

    for (const n of ['מגדל', 'מגדל ביג', 'מגדל בינלאומי', 'מגדל בי', 'מגד', 'פיצ מגד', 'אוב מגד']) expect(company(n)).toBe('מגדל');
    for (const n of ['כלל', 'כלל פנס', 'כלל פנסיה', 'כלל פיצ', 'פיצת כלז']) expect(company(n)).toBe('כלל');
    for (const n of ['מור', 'מור קה', 'מור קה"ג', 'מור בינ']) expect(company(n)).toBe('מור');
    // Only the kind of line is printed: no company to give it to.
    expect(company('פיצ')).toBe('');
    expect(company('אוב')).toBe('');
  });

  it('knows a study fund by its abbreviation even when the line was filed under another kind', () => {
    expect(isStudyFund({ kind: 'pension', provider: 'מור קה"ג' })).toBeTrue();
    expect(isStudyFund({ kind: 'severance', provider: 'מור קה"' })).toBeTrue();
    expect(isStudyFund({ kind: 'disability', provider: 'מור קה' })).toBeTrue();
    expect(isStudyFund({ kind: 'pension', provider: 'כלל פנסיה' })).toBeFalse();
    expect(isStudyFund({ kind: 'study', provider: null })).toBeTrue();
  });

  it('does not flag a report whose two employer columns were read the wrong way round', () => {
    const swappedReport = doc('pension_report', 2024, null, [
      line('pension', 'employee', 'כלל פנסיה וגמל', 1401.78, 2024, 3),
      line('pension', 'employer', 'כלל פנסיה וגמל', 1946.14, 2024, 3),
      line('severance', 'employer', 'כלל פנסיה וגמל', 1518.6, 2024, 3)
    ]);
    const index = buildDepositIndex([payslip, swappedReport]);

    expect(depositGaps(index, 2024, 3)).toEqual([]);
  });

  it('still flags an employer amount that is really short', () => {
    const shortReport = doc('pension_report', 2024, null, [
      line('pension', 'employee', 'כלל פנסיה וגמל', 1401.78, 2024, 3),
      line('pension', 'employer', 'כלל פנסיה וגמל', 1000, 2024, 3),
      line('severance', 'employer', 'כלל פנסיה וגמל', 1946.14, 2024, 3)
    ]);
    const index = buildDepositIndex([payslip, shortReport]);

    const gaps = depositGaps(index, 2024, 3);

    expect(gaps.map(g => g.line)).toEqual(['employerPension']);
  });

  it('suspects a line the two months before both had and this month lacks', () => {
    const month = (extra: Array<{ provider: string; kind: string; payer: string; amount: number }>) => [
      { provider: 'כלל', kind: 'pension', payer: 'employee', amount: 1401.78 },
      { provider: 'מגדל', kind: 'severance', payer: 'employer', amount: 1125.97 },
      { provider: 'מור קה"ג', kind: 'study', payer: 'employee', amount: 392.8 },
      ...extra
    ];
    const resolve = unifyFunds(['כלל', 'מגדל', 'מור קה"ג']);
    // December: the Migdal severance line is missing, and the study line was filed under severance.
    const december = [
      { provider: 'כלל', kind: 'pension', payer: 'employee', amount: 1401.78 },
      { provider: 'מור קה"ג', kind: 'severance', payer: 'employee', amount: 392.8 }
    ];

    const suspects = suspectedUnread(december, month([]), month([]), resolve);

    expect(suspects.map(l => l.company + ':' + l.kind)).toEqual(['מגדל:severance']);
  });

  it('suspects nothing when the line was never there, or only the month before had it', () => {
    const resolve = unifyFunds(['כלל', 'מגדל']);
    const withMigdal = [{ provider: 'מגדל', kind: 'severance', payer: 'employer', amount: 900 }];

    expect(suspectedUnread([], withMigdal, [], resolve)).toEqual([]);
    expect(suspectedUnread([], [], withMigdal, resolve)).toEqual([]);
  });
});
