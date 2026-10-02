import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { WelcomePage } from './welcome.page';

describe('WelcomePage', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [WelcomePage],
      providers: [provideIonicAngular(), provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    });
    localStorage.clear();
  });

  it('hides the camera in the browser and accepts an image or a PDF', () => {
    const f = TestBed.createComponent(WelcomePage);
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    expect(el.textContent).not.toContain('צילום במצלמה');
    expect(el.querySelector('.drop')?.textContent).toContain('גררו לכאן את התלוש');
    const input = el.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toContain('application/pdf');
    expect(input.accept).toContain('image/jpeg');
    expect(input.multiple).toBeTrue();
  });

  it('highlights the drop zone while a file is dragged over it', () => {
    const f = TestBed.createComponent(WelcomePage);
    f.detectChanges();
    const drop = f.nativeElement.querySelector('.drop') as HTMLElement;
    drop.dispatchEvent(new DragEvent('dragover', { cancelable: true }));
    f.detectChanges();
    expect(drop.classList).toContain('over');
    drop.dispatchEvent(new DragEvent('dragleave'));
    f.detectChanges();
    expect(drop.classList).not.toContain('over');
  });
});
