import { summarizeProducts, totalOf } from './product-summary';
import { ExtractedContribution, ReviewDocumentMeta } from './review.models';

function line(kind: string, payer: 'employee' | 'employer', provider: string, amount: number,
  forYear: number | null = null, forMonth: number | null = null): ExtractedContribution {
  return { kind: kind as ExtractedContribution['kind'], payer, provider, ratePercent: null, amount, forYear, forMonth };
}

function doc(documentType: string, year: number, month: number | null, lines: ExtractedContribution[]): ReviewDocumentMeta {
  return {
    id: `${documentType}-${year}-${month}`, documentType, year, month, source: 'upload', parsedOk: true,
    extractedSummary: null, needsManualReview: false, extractedContributions: lines
  };
}

describe('summary by product', () => {
  const today = new Date(2026, 9, 10);

  // March 2024: Clal pension, Migdal managers insurance and pension, Mor study fund, and a disability premium.
  const march = doc('payslip', 2024, 3, [
    line('pension', 'employee', 'כלל פנס', 1401.78),
    line('pension', 'employer', 'כלל פיצ', 1518.6),
    line('severance', 'employer', 'פיצ', 1946.14),
    line('managers', 'employee', 'מגדל ביט', 650.22),
    line('managers', 'employer', 'מגדל ביט', 628.55),
    line('pension', 'employee', 'מור קה"ג', 392.8),
    line('study', 'employer', 'מור', 1178.4),
    line('disability', 'employer', 'אוב', 75.86)
  ]);

  const clalReport = (employer = 1518.6) => doc('pension_report', 2024, null, [
    line('pension', 'employee', 'כלל פנסיה וגמל', 1401.78, 2024, 3),
    line('pension', 'employer', 'כלל פנסיה וגמל', employer, 2024, 3),
    line('severance', 'employer', 'כלל פנסיה וגמל', 1946.14, 2024, 3)
  ]);

  it('gives one card per product, with the study fund known by its name and the disability premium left out', () => {
    const { products } = summarizeProducts([march], today);

    expect(products.map(p => p.product)).toEqual(['pension', 'managers', 'study']);
    const study = products.find(p => p.product === 'study')!;
    expect(study.payslip.employee).toBeCloseTo(392.8, 2);
    expect(study.payslip.employer).toBeCloseTo(1178.4, 2);
    expect(products.find(p => p.product === 'pension')!.payslip.severance).toBeCloseTo(1946.14, 2);
  });

  it('matches the report to the same fund, including a severance line the payslip printed without a company', () => {
    const { products } = summarizeProducts([march, clalReport()], today);

    const pension = products.find(p => p.product === 'pension')!;
    expect(pension.report).not.toBeNull();
    expect(pension.compare!.missing).toBe(0);
    expect(totalOf(pension.compare!.should)).toBeCloseTo(totalOf(pension.compare!.found), 2);
    // No report for the other two products.
    expect(products.find(p => p.product === 'managers')!.report).toBeNull();
    expect(products.find(p => p.product === 'study')!.compare).toBeNull();
  });

  it('shows what should have been deposited, what was found and the shortfall', () => {
    const { products, total } = summarizeProducts([march, clalReport(1000)], today);

    const pension = products.find(p => p.product === 'pension')!;
    expect(pension.compare!.missing).toBeCloseTo(518.6, 2);
    expect(pension.compare!.should.employer).toBeCloseTo(1518.6, 2);
    expect(pension.compare!.found.employer).toBeCloseTo(1000, 2);
    expect(total.compare!.missing).toBeCloseTo(518.6, 2);
  });

  it('does not call a report with its two employer columns swapped a shortfall', () => {
    const swapped = doc('pension_report', 2024, null, [
      line('pension', 'employee', 'כלל פנסיה וגמל', 1401.78, 2024, 3),
      line('pension', 'employer', 'כלל פנסיה וגמל', 1946.14, 2024, 3),
      line('severance', 'employer', 'כלל פנסיה וגמל', 1518.6, 2024, 3)
    ]);

    const pension = summarizeProducts([march, swapped], today).products.find(p => p.product === 'pension')!;

    expect(pension.compare!.missing).toBe(0);
  });

  it('leaves the latest two months out of the comparison, since a deposit can take that long', () => {
    const recent = doc('payslip', 2026, 9, [line('pension', 'employee', 'כלל', 1400)]);
    const report = doc('pension_report', 2026, null, [line('pension', 'employee', 'כלל', 1, 2026, 1)]);

    const pension = summarizeProducts([recent, report], today).products.find(p => p.product === 'pension')!;

    expect(pension.compare).toBeNull();
  });
});
