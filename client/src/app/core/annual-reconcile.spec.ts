import { reconcileWithForm106, verifiedYears } from './annual-reconcile';
import { ExtractedContribution, ExtractedFundTotal, ReviewDocumentMeta } from './review.models';

function line(kind: string, payer: 'employee' | 'employer', provider: string, amount: number): ExtractedContribution {
  return { kind: kind as ExtractedContribution['kind'], payer, provider, ratePercent: null, amount, forYear: null, forMonth: null };
}

function payslip(year: number, month: number, lines: ExtractedContribution[]): ReviewDocumentMeta {
  return {
    id: `p-${year}-${month}`, documentType: 'payslip', year, month, source: 'upload', parsedOk: true, extractedSummary: null,
    needsManualReview: false, validationStatus: 'ok', extractedContributions: lines
  } as ReviewDocumentMeta;
}

function form106(year: number, totals: ExtractedFundTotal[] | null): ReviewDocumentMeta {
  return {
    id: `f-${year}`, documentType: 'form106', year, month: null, source: 'upload', parsedOk: true, extractedSummary: null,
    needsManualReview: false, validationStatus: 'ok', extractedFundTotals: totals ?? undefined
  } as ReviewDocumentMeta;
}

describe('payslips against the per-fund totals of Form 106', () => {
  // 2023, as printed on the form: what each fund received over the year, employee and employer.
  const totals: ExtractedFundTotal[] = [
    { kind: 'managers', provider: 'מגדל', employee: 1300, employer: 1257 },
    { kind: 'severance', provider: 'מגדל', employee: 0, employer: 1805 },
    { kind: 'disability', provider: 'מגדל', employee: 0, employer: 152 },
    { kind: 'pension', provider: 'כלל פנסיה', employee: 3466, employer: 3754 },
    { kind: 'severance', provider: 'כלל פנסיה', employee: 0, employer: 4811 },
    { kind: 'study', provider: 'מור קה"ש', employee: 1061, employer: 3184 }
  ];

  // Two payslips that together give those totals, with the names cut short as a payslip prints them.
  const first = [
    line('pension', 'employee', 'כלל פנס', 1733),
    line('pension', 'employer', 'כלל פנס', 1877),
    line('severance', 'employer', 'פיצ', 2405.5),
    line('managers', 'employee', 'מגדל ביט', 650),
    line('managers', 'employer', 'מגדל ביט', 628.5),
    line('severance', 'employer', 'מגד', 902.5),
    line('disability', 'employer', 'אוב מגד', 76),
    line('study', 'employee', 'מור קה"ג', 530.5),
    line('study', 'employer', 'מור קה"ג', 1592)
  ];
  // The other month names the same fund in full, as a payslip often does.
  const second = first.map(l => (l.provider === 'פיצ' ? { ...l, provider: 'כלל' } : { ...l }));

  it('matches fund by fund when every payslip line was read, however the names were cut', () => {
    const docs = [payslip(2023, 11, first), payslip(2023, 12, second), form106(2023, totals)];

    const result = reconcileWithForm106(docs, 2023, { allPayslipsPresent: true });

    expect(result?.state).toBe('ready');
    if (result?.state !== 'ready') return;
    expect(result.mismatches).toBe(0);
    expect(result.rows.length).toBe(6);
    const clal = result.rows.find(r => r.company === 'כלל' && r.label === 'פנסיה / ביטוח מנהלים')!;
    expect(clal.payslipEmployee).toBeCloseTo(3466, 0);
    expect(clal.payslipEmployer).toBeCloseTo(3754, 0);
  });

  it('shows the fund whose payslips fall short, which is what a line that was never read looks like', () => {
    const missing = second.filter(l => !(l.kind === 'severance' && l.provider === 'מגד'));
    const docs = [payslip(2023, 11, first), payslip(2023, 12, missing), form106(2023, totals)];

    const result = reconcileWithForm106(docs, 2023, { allPayslipsPresent: true });

    expect(result?.state).toBe('ready');
    if (result?.state !== 'ready') return;
    expect(result.mismatches).toBe(1);
    const migdal = result.rows.find(r => !r.match)!;
    expect(migdal.company).toBe('מגדל');
    expect(migdal.label).toBe('פיצויים');
    expect(migdal.payslipEmployer).toBeCloseTo(902.5, 1);
    expect(migdal.formEmployer).toBe(1805);
  });

  it('says what to do when the form was read before its table of funds was, or has none', () => {
    expect(reconcileWithForm106([form106(2023, null)], 2023, { allPayslipsPresent: true })?.state).toBe('unread');
    expect(reconcileWithForm106([form106(2023, [])], 2023, { allPayslipsPresent: true })?.state).toBe('noTable');
    expect(reconcileWithForm106([payslip(2023, 1, first)], 2023, { allPayslipsPresent: true })).toBeNull();
  });

  it('lists a fund that the payslips show and the form does not', () => {
    const extra = [...first, line('pension', 'employee', 'הראל', 500)];
    const docs = [payslip(2023, 11, extra), payslip(2023, 12, second), form106(2023, totals)];

    const result = reconcileWithForm106(docs, 2023, { allPayslipsPresent: true });

    if (result?.state !== 'ready') throw new Error('not ready');
    const harel = result.rows.find(r => r.company === 'הראל')!;
    expect(harel.formEmployee).toBeNull();
    expect(harel.match).toBeFalse();
  });

  it('counts a year as confirmed only when every month has a payslip and the funds add up', () => {
    const period = { startDate: '2023-11-01', endDate: '2023-12-31' };
    const both = [payslip(2023, 11, first), payslip(2023, 12, second), form106(2023, totals)];
    const oneMissing = [payslip(2023, 11, first), form106(2023, totals)];
    const gap = [payslip(2023, 11, first), payslip(2023, 12, second.slice(1)), form106(2023, totals)];

    expect([...verifiedYears(both, period)]).toEqual([2023]);
    expect([...verifiedYears(oneMissing, period)]).toEqual([]);
    expect([...verifiedYears(gap, period)]).toEqual([]);
    expect([...verifiedYears(both, null)]).toEqual([]);
  });
});
