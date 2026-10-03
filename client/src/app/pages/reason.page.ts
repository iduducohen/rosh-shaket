import { Component, HostListener, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';
import { DeskHeaderComponent } from '../core/desk-header.component';
import { EXIT_REASON_GUIDE, ExitReasonGuide } from '../core/exit-reason-guide';
import { ExitChoice } from '../core/models';
import { WizardStore } from '../core/wizard.store';
import { WorkspaceService } from '../core/workspace.service';

interface Option extends ExitReasonGuide {
  value: ExitChoice;
}

@Component({
  selector: 'app-reason',
  standalone: true,
  imports: [DeskHeaderComponent, IonHeader, IonToolbar, IonButtons, IonBackButton, IonContent, IonButton, IonIcon],
  styles: [`
    .reason-lead { color: var(--ion-color-primary); font-weight: 700; margin: 0 0 14px; }
    .option { box-shadow: var(--rs-card-shadow);
      background: var(--ion-item-background, var(--ion-background-color)); color: var(--ion-text-color);
      border: 1.5px solid var(--rs-line); border-radius: 14px; padding: 14px 16px 10px; margin: 0 0 10px;
    }
    .option.selected { border-color: var(--ion-color-primary); background: var(--rs-soft); }
    .pick {
      display: block; width: 100%; text-align: start; font: inherit; color: inherit;
      background: none; border: 0; padding: 0; cursor: pointer;
    }
    .pick b { display: block; font-weight: 700; }
    .pick span { display: block; color: var(--ion-color-medium); font-size: 14px; margin-top: 4px; }
    .more {
      background: none; border: 0; padding: 8px 0 2px; cursor: pointer;
      color: var(--ion-color-primary); font: inherit; font-weight: 700; font-size: 14.5px;
      text-decoration: underline; text-underline-offset: 3px;
    }
    @media (min-width: 992px) {
      .option:hover { border-color: var(--ion-color-primary); }
    }
    .sheet-backdrop {
      position: fixed; inset: 0; z-index: 20; background: rgba(11, 31, 38, .48);
      display: flex; align-items: flex-end; justify-content: center; padding: 12px;
    }
    /* The title and close button stay in view; only .sheet-body scrolls. */
    .sheet {
      width: min(560px, 100%); max-height: min(85vh, 720px);
      display: flex; flex-direction: column; overflow: hidden;
      background: var(--ion-background-color); color: var(--ion-text-color);
      border-radius: 18px; box-shadow: 0 18px 50px rgba(0, 0, 0, .28);
    }
    .sheet-head {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      flex: none; padding: 14px 18px 10px; border-bottom: 1px solid var(--rs-line);
    }
    .sheet-body {
      flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
      padding: 0 18px calc(16px + env(safe-area-inset-bottom, 0px));
    }
    .sheet-head h2 { margin: 0; font-size: 22px; }
    .sheet-close {
      background: none; border: 0; color: var(--ion-color-medium); cursor: pointer;
      width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; flex: none;
    }
    .sheet-close ion-icon { font-size: 24px; }
    .term { margin-top: 18px; }
    .term h3 {
      margin: 0 0 8px; padding-bottom: 4px;
      font-family: var(--ion-font-family); font-size: 14px; font-weight: 700;
      color: var(--ion-color-primary); letter-spacing: .01em;
      border-bottom: 1px solid var(--rs-soft);
    }
    .term p { margin: 0 0 8px; }
    .term ul { margin: 0 0 8px; padding-inline-start: 20px; }
    .term li { margin: 0 0 6px; line-height: 1.5; }
    .term ul.links { list-style: none; padding: 0; }
    .sheet a { font-weight: 700; }
    .sheet-note { margin: 18px 0 0; }
    @media (min-width: 992px) {
      .sheet-backdrop { align-items: center; }
    }
  `],
  template: `
    <ion-header class="ion-no-border mobile-only"><ion-toolbar><ion-buttons slot="start"><ion-back-button defaultHref="/" text="חזרה"></ion-back-button></ion-buttons></ion-toolbar></ion-header>
    <ion-content>
      <app-desk-header [step]="2"></app-desk-header>
      <div class="page narrow ion-padding">
        @if (store.fromPayslip()) {
          <p class="small" style="color: var(--ion-color-primary)">זיהינו {{ store.filledFields().length }} נתונים מהתלוש. נשארה שאלה אחת.</p>
        }
        <h2>למה אתם עוזבים?</h2>
        <p class="reason-lead">הסיבה קובעת כמעט את כל הזכויות.</p>
        <div class="desk-grid-2">
        @for (o of options; track o.value) {
          <div class="option" [class.selected]="store.choice() === o.value">
            <button type="button" class="pick" [attr.aria-pressed]="store.choice() === o.value" (click)="store.choice.set(o.value)">
              <b>{{ o.label }}</b>
              <span>{{ o.hint }}</span>
            </button>
            <button type="button" class="more" (click)="info.set(o)">מידע נוסף</button>
          </div>
        }
        </div>
        <div class="desk-actions sticky-actions">
          <ion-button fill="outline" (click)="back()">חזרה</ion-button>
          <ion-button [disabled]="!store.choice()" (click)="next()">המשך לפרטים</ion-button>
        </div>
      </div>
    </ion-content>

    @if (info(); as current) {
      <div class="sheet-backdrop" (click)="info.set(null)">
        <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="info-title" (click)="$event.stopPropagation()">
          <div class="sheet-head">
            <h2 id="info-title">{{ current.label }}</h2>
            <button type="button" class="sheet-close" (click)="info.set(null)" aria-label="סגירה">
              <ion-icon name="close-outline" aria-hidden="true"></ion-icon>
            </button>
          </div>
          <div class="sheet-body">
          @for (section of current.sections; track section.title) {
            <section class="term">
              <h3>{{ section.title }}</h3>
              @for (paragraph of section.paragraphs ?? []; track paragraph) { <p>{{ paragraph }}</p> }
              @if (section.bullets?.length) {
                <ul>@for (b of section.bullets; track b) { <li>{{ b }}</li> }</ul>
              }
            </section>
          }
          @if (current.links.length) {
            <section class="term">
              <h3>לקריאה נוספת</h3>
              <ul class="links">
                @for (l of current.links; track l.href) {
                  <li><a [href]="l.href" target="_blank" rel="noopener noreferrer">{{ l.label }}</a></li>
                }
              </ul>
            </section>
          }
          <p class="sheet-note note">הסבר על איך המחשבון מחלק את המקרים. זו הערכה, לא ייעוץ משפטי. חוזה אישי או הסכם קיבוצי יכולים לשנות את התוצאה.</p>
          </div>
        </div>
      </div>
    }
  `
})
export class ReasonPage {
  readonly store = inject(WizardStore);
  private readonly router = inject(Router);
  private readonly workspaces = inject(WorkspaceService);
  readonly info = signal<Option | null>(null);

  constructor() {
    addIcons({ closeOutline });
  }

  readonly options: Option[] = (['Fired', 'Resigned', 'ResignedJustified', 'ContractEnded', 'Considering'] as const)
    .map(value => ({ value, ...EXIT_REASON_GUIDE[value] }));

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.info.set(null);
  }

  back(): void {
    void this.router.navigateByUrl('/start');
  }

  async next(): Promise<void> {
    this.workspaces.scheduleSave(true);
    await this.router.navigateByUrl('/details');
  }
}
