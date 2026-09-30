import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import { WizardStore } from './wizard.store';
import { WorkspaceService } from './workspace.service';

/** Orchestrates "calculate" for the pages: one scenario, or both when the user is still deciding. */
@Injectable({ providedIn: 'root' })
export class CalculationFacade {
  private readonly api = inject(ApiService);
  private readonly store = inject(WizardStore);
  private readonly workspaces = inject(WorkspaceService);

  async calculate(): Promise<void> {
    const choice = this.store.choice();
    if (!choice) throw new Error('No exit reason selected');
    const profile = this.store.profile();
    const fromPayslip = this.store.fromPayslip();

    const results = choice === 'Considering'
      ? await this.api.compare(profile, fromPayslip)
      : [await this.api.calculate(profile, choice, fromPayslip)];

    this.store.results.set(results);
    this.store.activeIndex.set(0);
    this.workspaces.scheduleSave(true);
  }
}
