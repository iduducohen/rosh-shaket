import { parseDocFromText } from './document-pdf-period';

describe('parseDocFromText', () => {
  it('recognises a pension report whose text is stored letter by letter', () => {
    // As pdf.js reads the annual member report of a pension fund: spaced letters, digits reversed.
    const text =
      '240063 כלל פנסיה וגמל בע”מ ת א ר י ך ה ד ו " ח : 3 2 0 2 . 2 1 . 1 3 ' +
      'ד ו ח ש נ ת י מ פ ו ר ט ל ע מ י ת י ם ב ק ר ן פ נ ס י ה ח ד ש ה ' +
      'ד ו ח ש נ ת י ל ת ק ו פ ה 3 2 0 2 . 1 0 . 1 0 - 3 2 0 2 . 2 1 . 1 3';

    const hint = parseDocFromText(text);

    expect(hint.detectedType).toBe('pension_report');
    expect(hint.year).toBe(2023);
  });

  it('still recognises plain text', () => {
    expect(parseDocFromText('תלוש שכר לחודש 05/2024 ברוטו לחודש').detectedType).toBe('payslip');
    expect(parseDocFromText('טופס 106 לשנת המס 2023').detectedType).toBe('form106');
    expect(parseDocFromText('דוח שנתי קרן פנסיה חדשה 12/2023').detectedType).toBe('pension_report');
  });

  it('still calls unrelated text "other"', () => {
    expect(parseDocFromText('חשבונית מס מספר 123 עבור שירותי ניקיון').detectedType).toBe('other');
  });
});
