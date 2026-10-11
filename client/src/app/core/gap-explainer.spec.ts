import { explainReview } from './gap-explainer';
import { AnalyzeResponse, EmploymentMonth, EmploymentReviewCase, LineReconciliation, emptyTriplet } from './review.models';

/** The real case from testing: four months at מלם מערכות, Oct 2023 – Jan 2024. */
type Line = [code: string, expected: number, reported: number];

function line([code, expected, reported]: Line): LineReconciliation {
  return { code, fund: 'Pension', expected, reported, actual: null, gapReportedVsExpected: reported - expected, gapActualVsExpected: null };
}

function build(rows: Array<{ y: number; m: number; salary: number | null; lines: Line[] }>): { review: EmploymentReviewCase; analysis: AnalyzeResponse } {
  const months: EmploymentMonth[] = rows.map(r => ({
    id: `${r.y}-${r.m}`, periodId: 'p', workspaceId: 'ws', year: r.y, month: r.m,
    grossSalary: r.salary, pensionableSalary: r.salary,
    employeePension: emptyTriplet(), employerPension: emptyTriplet(), employeeCompensation: emptyTriplet(),
    employerCompensation: emptyTriplet(), trainingFundEmployee: emptyTriplet(), trainingFundEmployer: emptyTriplet(),
    otherExpected: null, otherReported: null, otherActual: null, contributionDate: null, sourceDocumentId: null,
    confidence: 'High', flags: r.salary ? 'from_payslip' : null
  }));
  const review = { workspaceId: 'ws', period: null, months, funds: [], documents: [], updatedAt: '' } as unknown as EmploymentReviewCase;
  const analysis = {
    summary: {
      totalMonths: rows.length, monthsWithData: rows.filter(r => r.salary).length, monthsOk: 0, monthsWithGap: 0,
      monthsNoInfo: rows.filter(r => !r.salary).length, monthsUnknownActual: rows.length,
      expectedTotal: null, reportedTotal: null, actualTotal: null, gapTotal: null, firstGapMonth: null, lastGapMonth: null,
      health: { status: 'GapsFound', score: 0, coverageRatio: 1, messageHe: '' },
      months: rows.map(r => ({ year: r.y, month: r.m, hasAnyData: !!r.salary, hasGap: false, hasUnknownActual: true, confidence: 'High', lines: r.lines.map(line) }))
    },
    anomalies: [], matrix: { years: [], payroll: [], form106: [], pension: [], study: [] }, simulations: [], usedEstimates: false
  } as unknown as AnalyzeResponse;
  return { review, analysis };
}

const FULL: Line[] = [['EmployeePension', 2052, 2052], ['EmployerPension', 2223, 2223.01], ['EmployerCompensation', 2848.86, 2848.86],
  ['TrainingFundEmployee', 392.8, 392.8], ['TrainingFundEmployer', 1178.4, 1178.4]];

describe('explainReview', () => {
  it('explains the first-month gap of the real case as something to check, not a violation', () => {
    const { review, analysis } = build([
      { y: 2023, m: 10, salary: 11032.26, lines: [['EmployeePension', 661.94, 0], ['EmployerPension', 717.1, 717.1], ['EmployerCompensation', 918.99, 918.99], ['TrainingFundEmployee', 275.81, 0], ['TrainingFundEmployer', 827.42, 827.42]] },
      { y: 2023, m: 11, salary: 34200, lines: FULL }, { y: 2023, m: 12, salary: 34200, lines: FULL }, { y: 2024, m: 1, salary: 34200, lines: FULL }
    ]);

    const e = explainReview(review, analysis);

    expect(e.headline).toContain('₪');
    expect(e.payslipGap).toBeCloseTo(937.73, 1);
    const first = e.findings.filter(f => f.id.endsWith('-first-month'));
    expect(first.map(f => f.id)).toEqual(['EmployeePension-first-month', 'TrainingFundEmployee-first-month']);
    expect(first.every(f => f.severity === 'check')).toBeTrue();
    expect(first[0].months).toEqual(['אוקטובר 2023']);
    expect(first[0].what).toContain('הפרשים');
    expect(e.findings.some(f => f.id === 'no-fund-report')).toBeTrue();
  });

  it('reads a training fund paid up to the ceiling as common and legal', () => {
    const { review, analysis } = build([{ y: 2023, m: 11, salary: 34200, lines: [['TrainingFundEmployer', 2565, 1178.4]] }]);

    const f = explainReview(review, analysis).findings.find(x => x.id === 'TrainingFundEmployer-lower')!;

    expect(f.severity).toBe('info');
    expect(f.what).toContain('3.45%');
    expect(f.why[0]).toContain('תקרת השכר');
  });

  it('flags a pension deposit below the legal minimum as serious and points to a lawyer when it is missing', () => {
    const low = build([{ y: 2024, m: 3, salary: 10000, lines: [['EmployerPension', 650, 400]] }]);
    expect(explainReview(low.review, low.analysis).findings[0].severity).toBe('serious');

    const missing = build([
      { y: 2024, m: 3, salary: 10000, lines: [['EmployerPension', 650, 650]] },
      { y: 2024, m: 4, salary: 10000, lines: [['EmployerPension', 650, 0]] }
    ]);
    const f = explainReview(missing.review, missing.analysis).findings[0];
    expect(f.severity).toBe('serious');
    expect(f.actions.some(a => a.link === '/help/lawyers')).toBeTrue();
  });

  it('estimates the months without a payslip instead of counting them as zero', () => {
    const { review, analysis } = build([
      { y: 2024, m: 1, salary: 10000, lines: [['EmployerPension', 650, 650]] },
      { y: 2024, m: 2, salary: null, lines: [] },
      { y: 2024, m: 3, salary: null, lines: [] }
    ]);

    const e = explainReview(review, analysis);

    expect(e.monthsWithoutPayslip).toBe(2);
    expect(e.estimatedForMissing).toBe(1300);
    expect(e.findings.find(f => f.id === 'no-payslip')!.what).toContain('אומדן');
    expect(e.headline).toContain('תואמות');
  });

  const FIRST: Array<{ y: number; m: number; salary: number; lines: Line[] }> = [
    { y: 2023, m: 10, salary: 11032.26, lines: [['EmployeePension', 661.94, 0], ['TrainingFundEmployee', 275.81, 0]] },
    { y: 2023, m: 11, salary: 34200, lines: FULL }
  ];

  it('takes the first-month deduction from the "differences" rows of the next payslip, with no manual check', () => {
    const { review, analysis } = build(FIRST);
    (review as any).documents = [{
      documentType: 'payslip', year: 2023, month: 11,
      extractedContributions: [
        { kind: 'pension', payer: 'employee', provider: 'כלל', amount: 661.94, forYear: 2023, forMonth: 10, ratePercent: null },
        { kind: 'study', payer: 'employee', provider: 'מור', amount: 275.81, forYear: 2023, forMonth: 10, ratePercent: null }
      ]
    }];

    const f = explainReview(review, analysis).findings;

    expect(f.some(x => x.id.endsWith('-first-month'))).toBeFalse();
    expect(f.some(x => x.id.endsWith('-in-report') || x.id.endsWith('-missing'))).toBeFalse();
  });

  it('says the amount is for the part-month when the job started after the 1st', () => {
    const { review, analysis } = build(FIRST);
    (review as any).period = { startDate: '2023-10-22', endDate: '2024-01-31' };

    const f = explainReview(review, analysis).findings.find(x => x.id === 'EmployeePension-first-month')!;

    expect(f.what).toContain('22/10/2023');
  });

  it('does not report a salary jump that is only a part-month before a full one', () => {
    const { review, analysis } = build(FIRST);
    (review as any).period = { startDate: '2023-10-22', endDate: '2024-01-31' };
    (analysis as any).anomalies = [{ kind: 'UnusualChange', year: 2023, month: 11, explanation: 'x' }];

    expect(explainReview(review, analysis).findings.some(x => x.id.startsWith('salary-'))).toBeFalse();
  });

  it('does not call a bonus month, or the regular pay after it, a salary change', () => {
    const { review, analysis } = build([
      { y: 2024, m: 11, salary: 38250, lines: FULL },
      { y: 2024, m: 12, salary: 80194, lines: FULL },
      { y: 2025, m: 1, salary: 38250, lines: FULL }
    ]);
    (review as any).documents = [{
      documentType: 'payslip', year: 2024, month: 12,
      extractedComponents: [{ kind: 'salary', amount: 38250 }, { kind: 'bonus', amount: 41944 }]
    }];
    (analysis as any).anomalies = [
      { kind: 'UnusualChange', year: 2024, month: 12, explanation: 'x' },
      { kind: 'UnusualChange', year: 2025, month: 1, explanation: 'x' }
    ];

    expect(explainReview(review, analysis).findings.some(f => f.id.startsWith('salary-'))).toBeFalse();
  });

  it('still reports a real raise that stays', () => {
    const { review, analysis } = build([
      { y: 2024, m: 5, salary: 20000, lines: FULL }, { y: 2024, m: 6, salary: 30000, lines: FULL }, { y: 2024, m: 7, salary: 30000, lines: FULL }
    ]);
    (analysis as any).anomalies = [{ kind: 'UnusualChange', year: 2024, month: 6, explanation: 'x' }];

    expect(explainReview(review, analysis).findings.some(f => f.id === 'salary-2024-6')).toBeTrue();
  });
});
