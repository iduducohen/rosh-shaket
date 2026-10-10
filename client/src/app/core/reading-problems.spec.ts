import { findReadingProblems } from './reading-problems';
import { ExtractedContribution, ReviewDocumentMeta } from './review.models';

function line(kind: string, payer: 'employee' | 'employer', provider: string, amount: number,
  forYear: number | null = null, forMonth: number | null = null): ExtractedContribution {
  return { kind: kind as ExtractedContribution['kind'], payer, provider, ratePercent: null, amount, forYear, forMonth };
}

function payslip(year: number, month: number, lines: ExtractedContribution[] | null): ReviewDocumentMeta {
  return {
    id: `p-${year}-${month}`, documentType: 'payslip', year, month, source: 'upload', parsedOk: true, extractedSummary: null,
    needsManualReview: false, validationStatus: 'ok', fileName: `slip-${month}.pdf`, extractedContributions: lines ?? undefined
  } as ReviewDocumentMeta;
}

function report(year: number, lines: ExtractedContribution[] | null, pensionKind: 'annual' | 'deposits' = 'annual'): ReviewDocumentMeta {
  return {
    id: `r-${year}`, documentType: 'pension_report', pensionKind, year, month: null, source: 'upload', parsedOk: true,
    extractedSummary: null, needsManualReview: false, validationStatus: 'ok', fileName: 'Report.pdf',
    extractedContributions: lines ?? undefined
  } as ReviewDocumentMeta;
}

describe('files that were read only in part', () => {
  const today = new Date(2026, 9, 10);
  const regular = () => [
    line('pension', 'employee', 'כלל', 1401.78),
    line('severance', 'employer', 'מגדל', 1125.97),
    line('study', 'employee', 'מור קה"ג', 392.8)
  ];

  it('names the payslip whose fund line vanished, the way the December payslip looked', () => {
    const docs = [
      payslip(2025, 10, regular()),
      payslip(2025, 11, regular()),
      payslip(2025, 12, [line('pension', 'employee', 'כלל', 1401.78), line('severance', 'employee', 'מור קה"ג', 392.8)])
    ];

    const problems = findReadingProblems(docs, today);

    expect(problems.length).toBe(1);
    expect(problems[0].where).toBe('תלוש דצמבר 2025');
    expect(problems[0].text).toContain('מגדל');
    expect(problems[0].text).toContain('פיצויים');
  });

  it('names a payslip whose contribution table came back empty among months that have one', () => {
    const docs = [payslip(2025, 5, regular()), payslip(2025, 6, regular()), payslip(2025, 7, [])];

    const problems = findReadingProblems(docs, today);

    expect(problems.map(p => p.where)).toEqual(['תלוש יולי 2025']);
    expect(problems[0].text).toContain('לא נקראו שורות הפרשה');
  });

  it('reports nothing for months that read the same, and for a payslip with no earlier months to compare', () => {
    expect(findReadingProblems([payslip(2025, 1, regular()), payslip(2025, 2, regular()), payslip(2025, 3, regular())], today)).toEqual([]);
    expect(findReadingProblems([payslip(2025, 1, [])], today)).toEqual([]);
  });

  it('names a report with no deposit table, and one checked before deposits were read', () => {
    const empty = findReadingProblems([report(2024, [])], today);
    const old = findReadingProblems([report(2023, null)], today);

    expect(empty[0].text).toContain('טבלת הפקדות');
    expect(old[0].text).toContain('נבדק לפני');
  });

  it('names the months a report is missing when the payslips of the same fund have them', () => {
    const slips = [1, 2, 3, 4].map(m => payslip(2024, m, [line('pension', 'employee', 'כלל', 1401.78)]));
    const reportLines = [1, 2, 3].map(m => line('pension', 'employee', 'כלל פנסיה וגמל', 1401.78, 2024, m));

    const problems = findReadingProblems([...slips, report(2024, reportLines)], today);

    const reportProblem = problems.find(p => p.kind === 'pension_report')!;
    expect(reportProblem.text).toContain('אפריל');
    expect(reportProblem.where).toBe('דוח שנתי 2024');
  });

  it('does not call a step change a loss: the amounts of the month after are the new ones', () => {
    const old = [line('pension', 'employee', 'מגדל', 650), line('pension', 'employer', 'מגדל', 612)];
    const raised = [line('pension', 'employee', 'מגדל', 811), line('pension', 'employer', 'מגדל', 764)];
    const docs = [payslip(2025, 5, old), payslip(2025, 6, old), payslip(2025, 7, raised), payslip(2025, 8, raised)];

    expect(findReadingProblems(docs, today)).toEqual([]);
  });

  it('still names a line the months on both sides have', () => {
    const migdal = [line('severance', 'employer', 'מגדל', 903)];
    const docs = [payslip(2025, 3, migdal), payslip(2025, 4, migdal), payslip(2025, 5, [line('pension', 'employee', 'כלל', 1400)]), payslip(2025, 6, migdal)];

    const problems = findReadingProblems(docs, today);

    expect(problems.map(p => p.where)).toEqual(['תלוש מאי 2025']);
  });

  it('does not ask about the empty table of the last payslip when it has notice pay or a vacation redemption', () => {
    const last = payslip(2025, 7, []);
    (last as { extractedComponents?: unknown }).extractedComponents = [
      { kind: 'notice', amount: 30000 }, { kind: 'vacation_redemption', amount: 20000 }
    ];
    const docs = [payslip(2025, 5, regular()), payslip(2025, 6, regular()), last];

    expect(findReadingProblems(docs, today)).toEqual([]);
  });
});
