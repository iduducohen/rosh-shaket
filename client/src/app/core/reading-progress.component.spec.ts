import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { ReadingProgressComponent } from './reading-progress.component';

describe('ReadingProgressComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [ReadingProgressComponent], providers: [provideIonicAngular()] }));

  it('marks the file step done only once reading starts, and counts seconds while reading', fakeAsync(() => {
    const f = TestBed.createComponent(ReadingProgressComponent);
    f.componentRef.setInput('phase', 'file');
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    expect(el.querySelector('li.done')).toBeNull();
    expect(el.textContent).not.toContain('שניות');

    f.componentRef.setInput('phase', 'reading');
    f.detectChanges();
    tick(21000);
    f.detectChanges();
    expect(el.querySelector('li.done')?.textContent).toContain('פותחים את הקובץ');
    expect(el.textContent).toContain('21 שניות');
    expect(el.textContent).toContain('טבלת ההפרשות');
    f.destroy();
  }));
});
