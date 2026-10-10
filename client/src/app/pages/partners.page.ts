import { Location } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonSpinner, ViewWillEnter } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, linkOutline } from 'ionicons/icons';
import { ApiService, describeError, PartnerOffer } from '../core/api.service';
import { DeskHeaderComponent } from '../core/desk-header.component';
import { StarsComponent } from '../core/stars.component';
import { WizardStore } from '../core/wizard.store';
import { SiteFooterComponent } from '../core/site-footer.component';

type HelpKind = 'Professional' | 'Lawyer';

@Component({
  selector: 'app-partners',
  standalone: true,
  imports: [SiteFooterComponent, DeskHeaderComponent, RouterLink, IonContent, IonButton, IonIcon, IonSpinner, StarsComponent],
  styles: [`
    .back { margin: 0 0 12px; }
    .grid { display: grid; gap: 14px; }
    @media (min-width: 992px) { .grid { grid-template-columns: 1fr 1fr; } }
    .card {
      display: grid; gap: 10px; text-align: start;
      background: var(--ion-item-background); border: 1px solid var(--rs-line);
      border-radius: 16px; padding: 18px 18px 14px;
    }
    .card h3 { margin: 0; font-size: 20px; font-family: var(--rs-serif); }
    .specialty { color: var(--ion-color-primary); font-weight: 700; font-size: 14px; margin: 0; }
    .badges { display: flex; flex-wrap: wrap; gap: 6px; }
    .badge {
      font-size: 12px; font-weight: 700; color: var(--ion-color-primary); background: var(--rs-soft);
      border-radius: 999px; padding: 2px 8px;
    }
    .recs { margin: 0; padding: 0 18px; display: grid; gap: 4px; color: var(--ion-color-medium); font-size: 14px; }
    .links { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
    .site {
      display: inline-flex; align-items: center; gap: 6px; font-weight: 700; font-size: 14px;
      color: var(--ion-color-primary); text-decoration: underline; text-underline-offset: 3px;
    }
    .site ion-icon { font-size: 16px; }
    .sort { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0 0 14px; font-size: 14px; }
    .sort button {
      font: inherit; font-weight: 700; padding: 6px 12px; border-radius: 999px; cursor: pointer;
      border: 1px solid var(--rs-line); background: transparent; color: var(--ion-text-color);
    }
    .sort button[aria-pressed="true"] { border-color: var(--ion-color-primary); color: var(--ion-color-primary); background: var(--rs-soft); }
    .how { margin: 0 0 16px; font-size: 14px; color: var(--ion-color-medium); line-height: 1.5; }
  `],
  template: `
    <ion-content>
      <app-desk-header [step]="headerStep()" [tabs]="!!store.results().length"></app-desk-header>
      <div class="page ion-padding">
        <ion-button class="back" fill="clear" (click)="back()">
          <ion-icon slot="start" name="arrow-back-outline"></ion-icon>
          חזרה
        </ion-button>

        <h2>{{ title() }}</h2>
        <p class="muted">{{ lead() }}</p>
        <p class="how">אנחנו רק מחברים אתכם: הפנייה, ההצעה והתשלום נעשים ישירות מולם. הדירוגים והתגובות נכתבו על ידי משתמשים שפנו אליהם.</p>
        @if (partners().length > 1) {
          <div class="sort" role="group" aria-label="סידור הרשימה">
            <span class="muted">סידור:</span>
            <button type="button" [attr.aria-pressed]="sortBy() === 'recommended'" (click)="sortBy.set('recommended')">מומלצים</button>
            <button type="button" [attr.aria-pressed]="sortBy() === 'rating'" (click)="sortBy.set('rating')">לפי דירוג</button>
          </div>
        }

        @if (busy()) {
          <p><ion-spinner name="crescent"></ion-spinner> טוענים…</p>
        } @else if (error()) {
          <div class="note">{{ error() }}</div>
        } @else if (!partners().length) {
          <p class="muted">עוד אין רשימה להצגה כרגע. נסו שוב מאוחר יותר.</p>
        } @else {
          <div class="grid">
            @for (p of sorted(); track p.id) {
              <article class="card">
                <div>
                  <h3>{{ p.name }}</h3>
                  @if (p.specialty) { <p class="specialty">{{ p.specialty }}</p> }
                  <app-stars [value]="p.ratingAverage ?? 0" [count]="p.ratingCount ?? 0" />
                </div>
                <div class="badges">
                  @if (p.cooperation) { <span class="badge">שיתוף פעולה</span> }
                  @if (p.discountPercent > 0) { <span class="badge">הנחה {{ p.discountPercent }}%</span> }
                </div>
                @if (p.summary) { <p class="muted small" style="margin:0">{{ p.summary }}</p> }
                @if (p.recommendations?.length) {
                  <ul class="recs">
                    @for (r of p.recommendations; track r) { <li>{{ r }}</li> }
                  </ul>
                }
                <div class="links">
                  @if (p.website) {
                    <a class="site" [href]="p.website" target="_blank" rel="noopener noreferrer">
                      <ion-icon name="link-outline" aria-hidden="true"></ion-icon>
                      לאתר / מידע נוסף
                    </a>
                  }
                </div>
                <ion-button expand="block" (click)="open(p)">דירוגים, תגובות והשארת פרטים</ion-button>
              </article>
            }
          </div>
        }
      </div>
      <app-site-footer></app-site-footer>
    </ion-content>
  `
})
export class PartnersPage implements ViewWillEnter {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly store = inject(WizardStore);

  private readonly location = inject(Location);
  readonly kind = signal<HelpKind>('Professional');
  readonly sortBy = signal<'recommended' | 'rating'>('recommended');
  /** "Recommended" keeps the server order (partners first); "rating" puts the best-rated first, unrated last. */
  readonly sorted = computed(() => this.sortBy() === 'recommended'
    ? this.partners()
    : [...this.partners()].sort((a, b) => (b.ratingAverage ?? -1) - (a.ratingAverage ?? -1) || (b.ratingCount ?? 0) - (a.ratingCount ?? 0)));
  readonly partners = signal<PartnerOffer[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly headerStep = computed(() => this.store.results().length ? 4 : 3);
  readonly title = computed(() => this.kind() === 'Lawyer' ? 'עורכי דין לדיני עבודה' : 'אנשי מקצוע');
  readonly lead = computed(() => this.kind() === 'Lawyer'
    ? 'בחרו משרד, קראו עליו, ואז השאירו פרטים כדי שיחזרו אליכם עם הצעה.'
    : 'בחרו איש מקצוע לבדיקת שכר ותלוש, קראו המלצות, ואז השאירו פרטים.');

  constructor() {
    addIcons({ arrowBackOutline, linkOutline });
  }

  ionViewWillEnter(): void {
    const fromData = this.route.snapshot.data['kind'] as string | undefined;
    const url = this.route.snapshot.url.map(s => s.path).join('/');
    const raw = fromData ?? (url.includes('lawyers') ? 'lawyers' : 'professionals');
    this.kind.set(raw === 'lawyers' ? 'Lawyer' : 'Professional');
    void this.load();
  }

  async load(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      this.partners.set(await this.api.partners(this.kind()));
    } catch (err) {
      this.error.set(describeError(err).message);
    } finally {
      this.busy.set(false);
    }
  }

  /** Back to wherever the user came from (results, report); straight from a link → the quick-check results. */
  back(): void {
    if (window.history.length > 1) this.location.back();
    else void this.router.navigateByUrl('/results/summary');
  }

  open(p: PartnerOffer): void {
    const segment = this.kind() === 'Lawyer' ? 'lawyers' : 'professionals';
    void this.router.navigateByUrl(`/help/${segment}/${p.id}`);
  }
}
