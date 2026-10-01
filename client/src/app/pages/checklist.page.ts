import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  IonBackButton, IonButton, IonButtons, IonCheckbox, IonContent, IonHeader, IonItem, IonLabel, IonList, IonListHeader,
  IonToolbar, ViewWillEnter
} from '@ionic/angular/standalone';
import { ApiService, describeError } from '../core/api.service';
import { ChecklistItem, REASON_LABELS, RightsSource } from '../core/models';
import { DeskHeaderComponent } from '../core/desk-header.component';
import { installReturnTracker, wizardReturn } from '../core/wizard-nav';
import { WizardStore } from '../core/wizard.store';

const STORAGE_KEY = 'rs-checked';

@Component({
  selector: 'app-checklist',
  standalone: true,
  imports: [
    DeskHeaderComponent, RouterLink,
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonButton, IonContent, IonList, IonListHeader, IonItem, IonCheckbox, IonLabel
  ],
  styles: [`
    .done { color: var(--ion-color-medium); text-decoration: line-through; }
    a.law {
      display: inline-block; margin-top: 6px; font-size: 13.5px; font-weight: 700;
      color: var(--ion-color-primary); text-decoration: underline; text-underline-offset: 2px;
    }
    .back-row { margin: 0 0 12px; }
    .footer-back { margin: 28px 0 8px; }
    .results-nav {
      display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 16px;
    }
    .results-nav a {
      padding: 8px 14px; border-radius: 10px; border: 1px solid var(--rs-line);
      color: var(--ion-text-color); text-decoration: none; font-weight: 700; font-size: 14.5px;
      background: var(--ion-item-background);
    }
    .results-nav a.on { border-color: var(--ion-color-primary); background: var(--rs-soft); color: var(--ion-color-primary); }
    @media (min-width: 992px) {
      .results-nav { display: none; }
      ion-list { border: 1px solid var(--rs-line); border-radius: 16px; padding: 6px 4px; margin: 0; }
    }
  `],
  template: `
    <ion-header class="ion-no-border mobile-only">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button [defaultHref]="back().url" [text]="back().label"></ion-back-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <app-desk-header [step]="headerStep()" [tabs]="!!store.results().length"></app-desk-header>
      <div class="page ion-padding">
        <div class="back-row">
          <ion-button fill="outline" size="small" [routerLink]="back().url">{{ back().label }}</ion-button>
        </div>
        <nav class="results-nav" aria-label="ניווט">
          @if (store.results().length) {
            <a routerLink="/results/summary">מה מגיע לי</a>
            <a routerLink="/results/reports">דוחות</a>
          }
          <a routerLink="/checklist" class="on">צ'קליסט</a>
          <a routerLink="/sources">מקורות</a>
        </nav>
        <h2>הצ'קליסט</h2>
        <p class="muted small">
          @if (reasonLabel(); as label) {
            מותאם ל{{ label }}. הסימונים נשמרים במכשיר.
          } @else {
            רשימה קבועה לסיום עבודה. אחרי בחירת סיבת העזיבה היא תותאם אליכם. הסימונים נשמרים במכשיר.
          }
        </p>
        @if (error()) { <div class="note">{{ error() }}</div> }
        @if (loading()) {
          <p class="muted">טוען את הצ'קליסט…</p>
        } @else if (!groups().length) {
          <p class="muted">לא נמצאו פריטים לצ'קליסט כרגע.</p>
        } @else {
          <div class="desk-grid-3">
          @for (g of groups(); track g.name) {
            <ion-list lines="full">
              <ion-list-header><ion-label><b>{{ g.name }}</b></ion-label></ion-list-header>
              @for (i of g.items; track i.key) {
                <ion-item>
                  <ion-checkbox slot="start" [checked]="checked()[i.key]" (ionChange)="toggle(i.key, $any($event).detail.checked)"></ion-checkbox>
                  <ion-label class="ion-text-wrap" [class.done]="checked()[i.key]">
                    {{ i.text }}
                    @if (sourceUrl(i.sourceKey); as url) {
                      <a class="law" [href]="url" target="_blank" rel="noopener">מה אומר החוק</a>
                    }
                  </ion-label>
                </ion-item>
              }
            </ion-list>
          }
          </div>
        }
        <div class="footer-back">
          <ion-button expand="block" fill="outline" [routerLink]="back().url">{{ back().label }}</ion-button>
        </div>
      </div>
    </ion-content>
  `
})
export class ChecklistPage implements ViewWillEnter {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly store = inject(WizardStore);

  readonly items = signal<ChecklistItem[]>([]);
  readonly sources = signal<RightsSource[]>([]);
  readonly error = signal('');
  readonly loading = signal(true);
  readonly checked = signal<Record<string, boolean>>(load());
  readonly back = computed(() => wizardReturn(this.store));
  readonly reason = computed(() => this.store.activeReason() ?? mapChoice(this.store.choice()));
  readonly reasonLabel = computed(() => {
    const r = this.reason();
    return r ? REASON_LABELS[r] : '';
  });
  readonly headerStep = computed(() => {
    if (this.store.results().length) return 4;
    if (this.store.profile().startDate && this.store.profile().monthlySalary > 0) return 3;
    if (this.store.choice()) return 2;
    return 1;
  });

  readonly groups = computed(() => {
    const map = new Map<string, ChecklistItem[]>();
    for (const i of this.items()) map.set(i.group, [...(map.get(i.group) ?? []), i]);
    return [...map.entries()].map(([name, items]) => ({ name, items }));
  });

  private loadToken = 0;

  constructor() {
    installReturnTracker(this.router);
  }

  ionViewWillEnter(): void {
    void this.reload();
  }

  sourceUrl(key: string | null): string | null {
    return key ? this.sources().find(s => s.key === key)?.url ?? null : null;
  }

  toggle(key: string, value: boolean): void {
    const next = { ...this.checked(), [key]: value };
    this.checked.set(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* storage full or blocked: keep in memory */ }
  }

  private async reload(): Promise<void> {
    const reason = this.reason();
    const token = ++this.loadToken;
    this.loading.set(true);
    this.error.set('');
    try {
      const needSources = !this.sources().length;
      const [items, sources] = await Promise.all([
        this.api.checklist(reason),
        needSources ? this.api.sources() : Promise.resolve(this.sources())
      ]);
      if (token !== this.loadToken) return;
      this.items.set(items);
      if (needSources) this.sources.set(sources);
    } catch (err) {
      if (token !== this.loadToken) return;
      this.items.set([]);
      this.error.set(describeError(err).message);
    } finally {
      if (token === this.loadToken) this.loading.set(false);
    }
  }
}

function mapChoice(choice: string | null): 'Fired' | 'ResignedJustified' | 'Resigned' | 'ContractEnded' | null {
  if (choice === 'Fired' || choice === 'ResignedJustified' || choice === 'Resigned' || choice === 'ContractEnded') return choice;
  return null;
}

function load(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'); } catch { return {}; }
}
