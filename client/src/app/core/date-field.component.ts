import { Component, ElementRef, EmbeddedViewRef, HostListener, OnDestroy, TemplateRef, ViewContainerRef, inject, input, output, signal, viewChild } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { calendarOutline } from 'ionicons/icons';

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

interface DayCell {
  iso: string;
  day: number;
  inMonth: boolean;
  disabled: boolean;
}

@Component({
  selector: 'app-date-field',
  standalone: true,
  imports: [IonIcon],
  host: { '[class.filled]': 'filled()' },
  styles: [`
    :host { display: block; position: relative; margin-bottom: 10px; }
    :host(.in-row) { margin-bottom: 0; }
    .date-trigger {
      width: 100%; display: grid; grid-template-columns: 1fr auto; grid-template-rows: auto auto;
      align-items: center; column-gap: 12px; text-align: start; cursor: pointer; font: inherit; color: inherit;
      background: var(--ion-item-background); border: 1px solid var(--rs-line); border-radius: 12px;
      padding: 10px 14px 11px;
    }
    :host(.filled) .date-trigger { background: var(--rs-warn-bg); border-color: var(--rs-accent); }
    :host(.filled) .date-label::after { content: " · זוהה מהתלוש"; font-size: 12.5px; color: var(--rs-warn); font-weight: 700; }
    .date-trigger:focus-visible { outline: 3px solid var(--ion-color-primary); outline-offset: 2px; }
    .date-trigger.open { border-color: var(--ion-color-primary); box-shadow: 0 0 0 4px rgba(var(--ion-color-primary-rgb), .15); }
    .date-trigger.field-invalid { border-color: var(--ion-color-danger); }
    .date-trigger.field-valid { border-color: var(--ion-color-primary); }
    .date-trigger.open.field-invalid { box-shadow: 0 0 0 4px rgba(235, 68, 90, .18); }
    .date-label { grid-column: 1; grid-row: 1; font-size: 12.5px; color: var(--ion-color-medium); }
    .date-value { grid-column: 1; grid-row: 2; font-size: 16px; font-weight: 650; margin-top: 2px; }
    .date-value.placeholder { color: var(--ion-color-medium); font-weight: 500; }
    .date-trigger ion-icon { grid-column: 2; grid-row: 1 / span 2; font-size: 22px; color: var(--ion-color-primary); }
    .date-error { margin: 6px 4px 0; color: var(--ion-color-danger); font-size: 13px; }
    .cal-backdrop { position: fixed; inset: 0; z-index: 40; background: transparent; }
    .cal {
      position: fixed; z-index: 41; box-sizing: border-box;
      background: var(--ion-item-background); color: var(--ion-text-color);
      border: 1px solid var(--rs-line); border-radius: 18px; padding: 14px 12px 10px;
      box-shadow: 0 18px 40px rgba(11, 31, 38, .16);
    }
    .cal-head { display: flex; align-items: center; gap: 4px; margin-bottom: 10px; }
    .cal-title { flex: 1; text-align: center; font-family: var(--rs-serif); font-size: 20px; font-weight: 700; line-height: 1.2; }
    .nav {
      width: 32px; height: 32px; border: 0; border-radius: 10px; padding: 0; cursor: pointer;
      background: var(--rs-soft); color: var(--ion-color-primary); display: grid; place-items: center;
    }
    .nav:hover:not(:disabled) { background: var(--ion-color-primary); color: var(--ion-color-primary-contrast); }
    .nav:disabled { opacity: .35; cursor: default; }
    .nav:focus-visible { outline: 3px solid var(--ion-color-primary); outline-offset: 2px; }
    .chev { width: 14px; height: 14px; display: block; }
    .chevs { display: flex; }
    .chevs .chev { width: 12px; height: 12px; margin-inline: -4px; }
    .weekdays, .days { display: grid; grid-template-columns: repeat(7, 1fr); }
    .weekdays { margin-bottom: 4px; padding-bottom: 6px; border-bottom: 1px solid var(--rs-soft); }
    .weekdays span { text-align: center; font-size: 12px; font-weight: 700; color: var(--ion-color-medium); }
    .day {
      width: 36px; height: 36px; margin: 1px auto; border: 0; border-radius: 50%; padding: 0;
      background: transparent; color: inherit; font: inherit; font-weight: 650; cursor: pointer;
    }
    .day.outside { color: var(--ion-color-medium); font-weight: 500; }
    .day.today { box-shadow: inset 0 0 0 1.5px var(--ion-color-primary); }
    .day.selected { background: var(--ion-color-primary); color: var(--ion-color-primary-contrast); box-shadow: none; }
    .day:hover:not(:disabled):not(.selected) { background: var(--rs-soft); }
    .day:disabled { opacity: .28; cursor: default; }
    .day:focus-visible { outline: 3px solid var(--ion-color-primary); outline-offset: 1px; }
    .today-btn {
      display: block; width: 100%; margin-top: 6px; border: 0; background: none; cursor: pointer;
      color: var(--ion-color-primary); font: inherit; font-weight: 700; padding: 8px;
    }
    .today-btn:hover { background: var(--rs-soft); border-radius: 10px; }
    .today-btn:focus-visible { outline: 3px solid var(--ion-color-primary); outline-offset: 2px; }
    @media (min-width: 992px) { :host { margin-bottom: 0; } }
  `],
  template: `
    <button #trigger type="button" class="date-trigger" [class.field-invalid]="state() === 'invalid'" [class.field-valid]="state() === 'valid'"
            [class.open]="open()" [attr.aria-expanded]="open()" aria-haspopup="dialog" (click)="toggle()">
      <span class="date-label">{{ label() }}</span>
      <span class="date-value" [class.placeholder]="!value()">{{ display() }}</span>
      <ion-icon name="calendar-outline" aria-hidden="true"></ion-icon>
    </button>
    @if (error()) { <p class="date-error">{{ error() }}</p> }
    <ng-template #pop>
      <div class="cal-backdrop" (click)="close()"></div>
      <div class="cal" role="dialog" aria-modal="true" [attr.aria-label]="label()"
           [style.top.px]="pos().top" [style.left.px]="pos().left" [style.width.px]="pos().width"
           (click)="$event.stopPropagation()">
        <div class="cal-head">
          <button type="button" class="nav" aria-label="שנה קודמת" [disabled]="!canShift(-12)" (click)="shift(-12)">
            <span class="chevs" aria-hidden="true"><svg class="chev" viewBox="0 0 16 16"><path d="M5 3l6 5-6 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><svg class="chev" viewBox="0 0 16 16"><path d="M5 3l6 5-6 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          </button>
          <button type="button" class="nav" aria-label="חודש קודם" [disabled]="!canShift(-1)" (click)="shift(-1)">
            <svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <div class="cal-title">{{ monthTitle() }}</div>
          <button type="button" class="nav" aria-label="חודש הבא" [disabled]="!canShift(1)" (click)="shift(1)">
            <svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button type="button" class="nav" aria-label="שנה הבאה" [disabled]="!canShift(12)" (click)="shift(12)">
            <span class="chevs" aria-hidden="true"><svg class="chev" viewBox="0 0 16 16"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><svg class="chev" viewBox="0 0 16 16"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          </button>
        </div>
        <div class="weekdays">
          @for (name of weekdays; track name) { <span>{{ name }}</span> }
        </div>
        <div class="days">
          @for (cell of cells(); track cell.iso) {
            <button type="button" class="day" [class.outside]="!cell.inMonth" [class.today]="cell.iso === today" [class.selected]="cell.iso === value()"
                    [disabled]="cell.disabled" [attr.aria-label]="hebrew(cell.iso)" [attr.aria-pressed]="cell.iso === value()"
                    (click)="pick(cell)">{{ cell.day }}</button>
          }
        </div>
        @if (!max() || today <= max()!) {
          <button type="button" class="today-btn" (click)="pickToday()">היום</button>
        }
      </div>
    </ng-template>
  `
})
export class DateFieldComponent implements OnDestroy {
  readonly label = input.required<string>();
  readonly value = input('');
  readonly max = input<string | null>(null);
  readonly filled = input(false);
  readonly state = input<'valid' | 'invalid' | ''>('');
  readonly error = input('');
  readonly valueChange = output<string>();

  readonly open = signal(false);
  readonly pos = signal({ top: 0, left: 0, width: 320 });
  readonly weekdays = WEEKDAYS;
  readonly today = localToday();
  viewYear = new Date().getFullYear();
  viewMonth = new Date().getMonth();

  private readonly viewContainer = inject(ViewContainerRef);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly pop = viewChild.required<TemplateRef<unknown>>('pop');
  private embedded: EmbeddedViewRef<unknown> | null = null;
  private readonly onScroll = () => {
    if (this.open()) this.place();
  };

  constructor() {
    addIcons({ calendarOutline });
    document.addEventListener('scroll', this.onScroll, true);
  }

  ngOnDestroy(): void {
    document.removeEventListener('scroll', this.onScroll, true);
    this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  @HostListener('window:resize')
  onResize(): void {
    if (this.open()) this.place();
  }

  display(): string {
    return this.value() ? hebrewDate(this.value()) : 'בחרו תאריך';
  }

  monthTitle(): string {
    return `${MONTHS[this.viewMonth]} ${this.viewYear}`;
  }

  hebrew(iso: string): string {
    return hebrewDate(iso);
  }

  toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }
    const base = this.value() || this.today;
    const [year, month] = base.split('-').map(Number);
    this.viewYear = year;
    this.viewMonth = month - 1;
    this.place();
    this.open.set(true);
    this.mount();
  }

  close(): void {
    this.open.set(false);
    this.embedded?.destroy();
    this.embedded = null;
  }

  private mount(): void {
    this.embedded?.destroy();
    const view = this.viewContainer.createEmbeddedView(this.pop());
    this.embedded = view;
    for (const node of view.rootNodes) {
      if (node instanceof Node) document.body.appendChild(node);
    }
  }

  private place(): void {
    const rect = this.trigger().nativeElement.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 300), window.innerWidth - 24);
    const height = 400;
    let top = rect.bottom + 8;
    if (top + height > window.innerHeight - 12) top = Math.max(12, rect.top - height - 8);
    let left = rect.left;
    if (left + width > window.innerWidth - 12) left = window.innerWidth - width - 12;
    if (left < 12) left = 12;
    this.pos.set({ top, left, width });
  }

  canShift(offset: number): boolean {
    const date = new Date(this.viewYear, this.viewMonth + offset, 1);
    if (date.getFullYear() < 1970) return false;
    const limit = this.max();
    return !limit || isoDate(date) <= limit;
  }

  shift(offset: number): void {
    if (!this.canShift(offset)) return;
    const date = new Date(this.viewYear, this.viewMonth + offset, 1);
    this.viewYear = date.getFullYear();
    this.viewMonth = date.getMonth();
  }

  cells(): DayCell[] {
    const first = new Date(this.viewYear, this.viewMonth, 1);
    const start = new Date(this.viewYear, this.viewMonth, 1 - first.getDay());
    const limit = this.max();
    const cells: DayCell[] = [];
    for (let i = 0; i < 42; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const iso = isoDate(date);
      cells.push({
        iso,
        day: date.getDate(),
        inMonth: date.getMonth() === this.viewMonth,
        disabled: !!limit && iso > limit
      });
    }
    return cells;
  }

  pick(cell: DayCell): void {
    if (cell.disabled) return;
    this.valueChange.emit(cell.iso);
    this.close();
  }

  pickToday(): void {
    const limit = this.max();
    if (limit && this.today > limit) return;
    this.valueChange.emit(this.today);
    this.close();
  }
}

function hebrewDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return '';
  return `${day} ב${MONTHS[month - 1]} ${year}`;
}

function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function localToday(): string {
  return isoDate(new Date());
}
