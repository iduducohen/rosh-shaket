import { TestBed } from '@angular/core/testing';
import { SocialProviders } from './social-providers';

describe('SocialProviders (web)', () => {
  it('offers all three providers through web popups in the browser', () => {
    const providers = TestBed.inject(SocialProviders);
    for (const id of ['Google', 'Apple', 'Microsoft'] as const) {
      const p = providers.get(id);
      expect(p).withContext(id).not.toBeNull();
      expect(p!.constructor.name).withContext(id).toContain('Web');
    }
  });
});
