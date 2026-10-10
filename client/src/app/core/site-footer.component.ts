import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SITE_NAME } from './seo';

interface FooterGroup {
  title: string;
  links: Array<{ label: string; path: string }>;
}

/** Bottom of every page: where to read how the service works, what the terms mean, and the legal pages. */
@Component({
  selector: 'app-site-footer',
  standalone: true,
  imports: [RouterLink],
  styles: [`
    :host { display: block; margin-top: 56px; border-top: 1px solid var(--rs-line); background: var(--rs-soft); }
    footer { max-width: 1120px; margin: 0 auto; padding: 28px 20px 24px; }
    .groups { display: grid; grid-template-columns: 1fr 1fr; gap: 22px 16px; }
    h2 { margin: 0 0 8px; font-size: 14px; font-weight: 800; color: var(--ion-text-color); }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
    a { color: var(--ion-color-medium-shade, #5E6F73); text-decoration: none; font-size: 14.5px; }
    a:hover { color: var(--ion-color-primary); text-decoration: underline; text-underline-offset: 3px; }
    .fine { margin: 22px 0 0; padding-top: 14px; border-top: 1px solid var(--rs-line); font-size: 13px; line-height: 1.5; color: var(--ion-color-medium); }
    @media (min-width: 720px) {
      footer { padding: 36px 32px 28px; }
      .groups { grid-template-columns: repeat(4, 1fr); }
    }
  `],
  template: `
    <footer aria-label="קישורים ומידע">
      <div class="groups">
        @for (g of groups; track g.title) {
          <nav [attr.aria-label]="g.title">
            <h2>{{ g.title }}</h2>
            <ul>
              @for (l of g.links; track l.path) {
                <li><a [routerLink]="l.path" target="_blank" rel="noopener">{{ l.label }}</a></li>
              }
            </ul>
          </nav>
        }
      </div>
      <p class="fine">{{ siteName }} נותן הערכה והמלצה בלבד. זה לא ייעוץ משפטי, ייעוץ מס או ייעוץ פנסיוני.</p>
    </footer>
  `
})
export class SiteFooterComponent {
  readonly siteName = SITE_NAME;
  readonly groups: FooterGroup[] = [
    {
      title: 'המערכת',
      links: [
        { label: 'איך זה עובד', path: '/how-it-works' },
        { label: 'אודות', path: '/about' },
        { label: 'מחירון', path: '/pricing' }
      ]
    },
    {
      title: 'מידע',
      links: [
        { label: 'מילון מונחים', path: '/glossary' },
        { label: 'מקורות ועזרה', path: '/sources' },
        { label: 'צ\'קליסט לסיום עבודה', path: '/checklist' },
        { label: 'החזר מס', path: '/tax-refund' }
      ]
    },
    {
      title: 'עזרה מקצועית',
      links: [
        { label: 'אנשי מקצוע', path: '/help/professionals' },
        { label: 'עורכי דין לדיני עבודה', path: '/help/lawyers' }
      ]
    },
    {
      title: 'משפטי',
      links: [
        { label: 'תקנון ותנאי שימוש', path: '/terms' },
        { label: 'מדיניות הפרטיות', path: '/privacy' }
      ]
    }
  ];
}
