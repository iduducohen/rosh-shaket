import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot } from '@angular/router';
import { FAQ, HOME_DESCRIPTION, HOME_TITLE, SITE_NAME, SeoConfig } from './seo';

const JSON_LD_ID = 'seo-jsonld';

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  apply(root: ActivatedRouteSnapshot): void {
    const seo = this.deepest(root) ?? { title: HOME_TITLE, description: HOME_DESCRIPTION, index: true };
    const origin = location.origin;
    const path = seo.path ?? '/';
    const pageUrl = `${origin}${path}`;
    const canonical = seo.index ? pageUrl : `${origin}/`;
    const description = seo.description ?? HOME_DESCRIPTION;
    const image = `${origin}/assets/og-cover.png`;

    this.title.setTitle(seo.title);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ name: 'robots', content: seo.index ? 'index, follow' : 'noindex, follow' });
    this.meta.updateTag({ property: 'og:title', content: seo.index ? seo.title : HOME_TITLE });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:url', content: canonical });
    this.meta.updateTag({ property: 'og:image', content: image });
    this.meta.updateTag({ property: 'og:image:width', content: '1200' });
    this.meta.updateTag({ property: 'og:image:height', content: '630' });
    this.meta.updateTag({ property: 'og:image:alt', content: SITE_NAME });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:locale', content: 'he_IL' });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: seo.index ? seo.title : HOME_TITLE });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    this.meta.updateTag({ name: 'twitter:image', content: image });
    this.canonical(canonical);
    this.jsonLd(seo.index && path === '/' ? this.homeGraph(canonical, description) : null);
  }

  private deepest(route: ActivatedRouteSnapshot): SeoConfig | undefined {
    const found: SeoConfig[] = [];
    let current: ActivatedRouteSnapshot | null = route;
    while (current) {
      const seo = current.data['seo'] as SeoConfig | undefined;
      if (seo) found.push(seo);
      current = current.firstChild;
    }
    return found.at(-1);
  }

  private canonical(href: string): void {
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = href;
  }

  private jsonLd(data: unknown): void {
    document.getElementById(JSON_LD_ID)?.remove();
    if (!data) return;
    const script = document.createElement('script');
    script.id = JSON_LD_ID;
    script.type = 'application/ld+json';
    script.text = JSON.stringify(data);
    document.head.appendChild(script);
  }

  private homeGraph(url: string, description: string) {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebSite',
          name: SITE_NAME,
          url,
          inLanguage: 'he',
          description
        },
        {
          '@type': 'SoftwareApplication',
          name: SITE_NAME,
          applicationCategory: 'FinanceApplication',
          operatingSystem: 'Web, Android, iOS',
          inLanguage: 'he',
          description,
          url,
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'ILS' },
          isAccessibleForFree: true
        },
        {
          '@type': 'FAQPage',
          mainEntity: FAQ.map(item => ({
            '@type': 'Question',
            name: item.question,
            acceptedAnswer: { '@type': 'Answer', text: item.answer }
          }))
        }
      ]
    };
  }
}
