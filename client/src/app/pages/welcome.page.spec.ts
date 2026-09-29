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
    expect(el.textContent).toContain('העלאת תמונה או PDF');
    const input = el.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toContain('application/pdf');
    expect(input.accept).toContain('image/jpeg');
    expect(input.multiple).toBeTrue();
  });
});
