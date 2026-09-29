import { classifyPayslipText, findQualityProblem } from './payslip-quality';

describe('payslip quality', () => {
  function canvas(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    paint(c.getContext('2d')!);
    return c;
  }

  function sharpPage(): HTMLCanvasElement {
    return canvas(1000, 1400, ctx => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 1000, 1400);
      ctx.fillStyle = '#111';
      for (let y = 80; y < 1320; y += 28) ctx.fillRect(60, y, 880, 3);
    });
  }

  it('accepts a sharp page and rejects a small, dark, blank, or blurry one', () => {
    expect(findQualityProblem(sharpPage())).toBeNull();
    expect(findQualityProblem(canvas(200, 200, ctx => ctx.fillRect(0, 0, 200, 200)))).toBe('small');
    expect(findQualityProblem(canvas(1000, 1400, ctx => {
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, 1000, 1400);
    }))).toBe('dark');
    expect(findQualityProblem(canvas(1000, 1400, ctx => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 1000, 1400);
    }))).toBe('blank');

    const blurred = canvas(1000, 1400, ctx => {
      const tiny = document.createElement('canvas');
      tiny.width = 40;
      tiny.height = 56;
      const src = sharpPage();
      tiny.getContext('2d')!.drawImage(src, 0, 0, 40, 56);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(tiny, 0, 0, 1000, 1400);
    });
    expect(findQualityProblem(blurred)).toBe('blurry');
  });

  it('treats a text PDF as a payslip only when the text says so', () => {
    expect(classifyPayslipText('תלוש שכר לחודש אוגוסט. שכר ברוטו 15000. ניכוי מס הכנסה.')).toBe('payslip');
    expect(classifyPayslipText('This is a long cooking recipe about tomatoes, cheese, pasta, and olive oil for dinner.')).toBe('other');
    expect(classifyPayslipText('')).toBe('unknown');
  });
});