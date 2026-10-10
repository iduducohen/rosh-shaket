import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  IonBackButton, IonButtons, IonCheckbox, IonContent, IonHeader, IonItem, IonLabel, IonList, IonListHeader,
  IonToolbar, ViewWillEnter
} from '@ionic/angular/standalone';
import { ApiService, describeError } from '../core/api.service';
import { ChecklistItem, REASON_LABELS, RightsSource } from '../core/models';
import { DeskHeaderComponent } from '../core/desk-header.component';
import { installReturnTracker, wizardReturn } from '../core/wizard-nav';
import { WizardStore } from '../core/wizard.store';
import { WorkspaceService } from '../core/workspace.service';

@Component({
  selector: 'app-checklist',
  standalone: true,
  imports: [
    DeskHeaderComponent, RouterLink,
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonContent, IonList, IonListHeader, IonItem, IonCheckbox, IonLabel
  ],
  styles: [`
    .title-row {
      display: flex; align-items: baseline; justify-content: space-between; gap: 16px;
      margin: 0 0 6px;
    }
    .title-row h2 { margin: 0; }
    .back-to {
      flex: none; font-size: 15px; font-weight: 700;
      color: var(--ion-color-primary); text-decoration: none; white-space: nowrap;
    }
    .back-to:hover { text-decoration: underline; text-underline-offset: 3px; }
    .done { color: var(--ion-color-medium); text-decoration: line-through; }
    a.law {
      display: inline-block; margin-top: 6px; font-size: 13.5px; font-weight: 700;
      color: var(--ion-color-primary); text-decoration: underline; text-underline-offset: 2px;
    }
    @media (min-width: 992px) {
      ion-list { border: 1px solid var(--rs-line); border-radius: 16px; padding: 6px 4px; margin: 0; }
    }
  `],
  template: `
    <ion-header class="ion-no-border mobile-only">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button [defaultHref]="back().url" text="חזרה"></ion-back-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <app-desk-header [step]="headerStep()" [tabs]="!!store.results().length"></app-desk-header>
      <div class="page ion-padding">
        <div class="title-row">
          <h2>הצ'קליסט</h2>
          <a class="back-to" [routerLink]="back().url">חזרה</a>
        </div>
        <p class="muted small">
          @if (reasonLabel(); as label) {
            מותאם ל{{ label }}. {{ savedWhere }}
          } @else {
            רשימה קבועה לסיום עבודה. אחרי בחירת סיבת העזיבה היא תותאם אליכם. {{ savedWhere }}
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
      </div>
    </ion-content>
  `
})
export class ChecklistPage implements ViewWillEnter {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly store = inject(WizardStore);
  private readonly workspaces = inject(WorkspaceService);

  readonly items = signal<ChecklistItem[]>([]);
  readonly sources = signal<RightsSource[]>([]);
  readonly error = signal('');
  readonly loading = signal(true);
  readonly checked = computed<Record<string, boolean>>(() => this.store.prefs().checklist ?? {});
  get savedWhere(): string {
    return this.workspaces.workspace() ? 'הסימונים נשמרים בחשבון שלכם.' : 'הסימונים נשמרים במכשיר.';
  }
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
    this.store.setPref('checklist', { ...this.checked(), [key]: value });
    this.workspaces.scheduleSave();
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
