import { parseDocFromText } from './document-pdf-period';
import { typeMismatchMessage } from './document-validation.service';

describe('typeMismatchMessage (from the PDF text, before the paid check)', () => {
  const payslip = parseDocFromText('תלוש שכר לחודש 12/2023 שכר נטו 9,850 ימי עבודה 22 קרן פנסיה מגדל');
  const form106 = parseDocFromText('טופס 106 אישור שנתי למס לשנת המס 2023 סיכום שנתי של שכר');

  it('flags a payslip uploaded under Form 106', () => {
    expect(typeMismatchMessage('form106', payslip)).toContain('העלית תלוש שכר, אבל נבחר טופס 106');
  });

  it('flags a Form 106 uploaded under payslips', () => {
    expect(typeMismatchMessage('payslip', form106)).toContain('העלית טופס 106');
  });

  it('accepts the matching type', () => {
    expect(typeMismatchMessage('payslip', payslip)).toBeNull();
    expect(typeMismatchMessage('form106', form106)).toBeNull();
  });

  it('does not block a pension report upload just because a payslip also lists pension funds', () => {
    expect(typeMismatchMessage('pension_report', payslip)).toBeNull();
  });

  it('leaves files without readable text to the AI check', () => {
    expect(typeMismatchMessage('form106', null)).toBeNull();
    expect(typeMismatchMessage('form106', { year: null, month: null, detectedType: null })).toBeNull();
  });
});
