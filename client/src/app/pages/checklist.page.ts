import { Component, computed, effect, inject, signal } from '@angular/core';
import { IonCheckbox, IonContent, IonItem, IonList, IonListHeader, IonLabel } from '@ionic/angular/standalone';
import { ApiService, describeError } from '../core/api.service';
import { ChecklistItem, REASON_LABELS, RightsSource } from '../core/models';
import { WizardStore } from '../core/wizard.store';

const STORAGE_KEY = 'rs-checked';

@Component({
  selector: 'app-checklist',
  standalone: true,
  imports: [IonContent, IonList, IonListHeader, IonItem, IonCheckbox, IonLabel],
  styles: [`.done { color: var(--ion-color-medium); text-decoration: line-through; } a { font-size: 13.5px; display: block; }`],
  template: `
    <ion-content class="ion-padding">
      <div class="page">
        <h2>הצ'קליסט שלכם</h2>
        @if (reasonLabel()) { <p class="muted small">מותאם ל{{ reasonLabel() }}. הסימונים נשמרים במכשיר.</p> }
        @if (error()) { <div class="note">{{ error() }}</div> }
        @for (g of groups(); track g.name) {
          <ion-list lines="full">
            <ion-list-header><ion-label><b>{{ g.name }}</b></ion-label></ion-list-header>
            @for (i of g.items; track i.key) {
              <ion-item>
                <ion-checkbox slot="start" [checked]="checked()[i.key]" (ionChange)="toggle(i.key, $any($event).detail.checked)"></ion-checkbox>
                <ion-label class="ion-text-wrap" [class.done]="checked()[i.key]">
                  {{ i.text }}
                  @if (i.sourceKey && sourceUrl(i.sourceKey)) { <a [href]="sourceUrl(i.sourceKey)" target="_blank" rel="noopener">מה אומר החוק</a> }
                </ion-label>
              </ion-item>
            }
          </ion-list>
        }
      </div>
    </ion-content>
  `
})
export class ChecklistPage {
  private readonly api = inject(ApiService);
  private readonly store = inject(WizardStore);

  readonly items = signal<ChecklistItem[]>([]);
  readonly sources = signal<RightsSource[]>([]);
  readonly error = signal('');
  readonly checked = signal<Record<string, boolean>>(load());
  readonly reasonLabel = computed(() => { const r = this.store.activeReason(); return r ? REASON_LABELS[r] : ''; });

  readonly groups = computed(() => {
    const map = new Map<string, ChecklistItem[]>();
    for (const i of this.items()) map.set(i.group, [...(map.get(i.group) ?? []), i]);
    return [...map.entries()].map(([name, items]) => ({ name, items }));
  });

  constructor() {
    this.api.sources().then(s => this.sources.set(s)).catch(() => undefined);
    effect(() => {
      const reason = this.store.activeReason();
      if (!reason) return;
      this.api.checklist(reason)
        .then(items => this.items.set(items))
        .catch(err => this.error.set(describeError(err).message));
    });
  }

  sourceUrl(key: string): string | null {
    return this.sources().find(s => s.key === key)?.url ?? null;
  }

  toggle(key: string, value: boolean): void {
    const next = { ...this.checked(), [key]: value };
    this.checked.set(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* storage full or blocked: keep in memory */ }
  }
}

function load(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'); } catch { return {}; }
}
