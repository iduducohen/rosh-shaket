import { DecimalPipe } from '@angular/common';
import { Component, HostListener, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { IonButton, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';
import { healthLabel } from '../../core/review.models';
import { ReviewStore } from '../../core/review.store';
import { ReviewStepNavComponent } from './review-step-nav.component';

type DashKey =
  | 'period'
  | 'monthsChecked'
  | 'expected'
  | 'reported'
  | 'actual'
  | 'gap'
  | 'funds'
  | 'sim'
  | 'gapMonths'
  | 'noInfo';

interface DashCard {
  key: DashKey;
  title: string;
  value: string;
}

interface DashModal {
  title: string;
  checked: string[];
  missing: string[];
  details: string[];
  calc?: string[];
}

@Component({
  selector: 'app-review-dashboard',
  standalone: true,
  imports: [IonButton, IonIcon, RouterLink, DecimalPipe, ReviewStepNavComponent],
  styles: [`
    .health { font-size: 20px; margin: 8px 0 10px; font-weight: 700; color: var(--ion-color-primary); }
    .hint { font-size: 13.5px; color: var(--ion-color-medium); margin: 0 0 14px; line-height: 1.45; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
    .card {
      background: var(--ion-item-background, #fff); border: 1.5px solid var(--rs-line, #e5e5e5);
      border-radius: 14px; padding: 12px; text-align: start; cursor: pointer;
      font: inherit; color: inherit; width: 100%;
      transition: border-color .12s ease, box-shadow .12s ease;
    }
    .card:hover, .card:focus-visible {
      border-color: var(--ion-color-primary);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--ion-color-primary) 18%, transparent);
      outline: none;
    }
    .card b { display: block; font-size: 12px; color: var(--ion-color-medium); margin-bottom: 4px; font-weight: 600; }
    .card strong { font-size: 18px; font-weight: 700; }
    .card .tap { display: block; margin-top: 6px; font-size: 11px; color: var(--ion-color-primary); font-weight: 700; }

    .nav-actions {
      display: flex; flex-wrap: wrap; gap: 8px;
      justify-content: flex-end; /* שמאל במסך RTL */
      margin-top: 18px;
    }
    .nav-actions ion-button { margin: 0; }
    .tip-wrap { position: relative; display: inline-flex; }

    @media (hover: hover) and (pointer: fine) {
      .tip-wrap.has-tip::after,
      .tip-wrap.has-tip::before {
        position: absolute; opacity: 0; pointer-events: none;
        transition: opacity .12s ease, transform .12s ease; z-index: 5;
      }
      .tip-wrap.has-tip::after {
        content: attr(data-tip);
        bottom: calc(100% + 10px); left: 50%;
        transform: translateX(-50%) translateY(4px);
        max-width: 240px; white-space: normal; text-align: center;
        padding: 8px 10px; border-radius: 8px;
        font-size: 12px; font-weight: 700; line-height: 1.35; color: #fff;
        background: #0B1F26; box-shadow: 0 8px 20px rgba(11, 31, 38, .22);
      }
      .tip-wrap.has-tip::before {
        content: ''; bottom: calc(100% + 4px); left: 50%;
        transform: translateX(-50%) translateY(4px);
        border: 6px solid transparent; border-top-color: #0B1F26;
      }
      .tip-wrap.has-tip:hover::after,
      .tip-wrap.has-tip:hover::before {
        opacity: 1; transform: translateX(-50%) translateY(0);
      }
    }

    .sheet-backdrop {
      position: fixed; inset: 0; z-index: 40; background: rgba(11, 31, 38, .48);
      display: flex; align-items: center; justify-content: center; padding: 16px;
    }
    .sheet {
      width: min(520px, 100%); max-height: min(90vh, 720px); overflow: auto;
      background: var(--ion-background-color); color: var(--ion-text-color);
      border-radius: 18px; padding: 18px 20px calc(16px + env(safe-area-inset-bottom, 0px));
      box-shadow: 0 18px 50px rgba(0, 0, 0, .28);
    }
    .sheet-head {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 8px;
    }
    .sheet-head h2 { margin: 0; font-size: 18px; }
    .sheet-close {
      background: none; border: 0; cursor: pointer; width: 36px; height: 36px;
      border-radius: 10px; display: grid; place-items: center; color: var(--ion-color-medium); flex: none;
    }
    .sheet-close:hover { background: var(--rs-soft); color: var(--ion-color-primary); }
    .sheet-close ion-icon { font-size: 22px; }
    .sec { margin: 14px 0 0; }
    .sec h3 { margin: 0 0 6px; font-size: 14px; color: var(--ion-color-primary); }
    .sec ul { margin: 0; padding-inline-start: 18px; }
    .sec li { margin: 0 0 6px; font-size: 13.5px; line-height: 1.45; }
    .sec .empty { font-size: 13.5px; color: var(--ion-color-medium); margin: 0; }
  `],
  template: `
    <h2>תמונת מצב</h2>
    @if (!analysis) {
      <p class="hint">אין ניתוח עדיין. מלאו שכר והריצו ניתוח.</p>
      <ion-button (click)="run()">הרצת ניתוח</ion-button>
    } @else {
      <div class="health">{{ healthLabel(analysis.summary.health.status) }}</div>
      <p>{{ analysis.summary.health.messageHe }}</p>
      <p class="hint">כיסוי מידע: {{ (analysis.summary.health.coverageRatio * 100) | number:'1.0-0' }}% · לחצו על קוביה לפירוט</p>

      <div class="grid">
        @for (c of cards(); track c.key) {
          <button type="button" class="card" (click)="openCard(c.key)">
            <b>{{ c.title }}</b>
            <strong>{{ c.value }}</strong>
            <span class="tap">פירוט</span>
          </button>
        }
      </div>

      @if (analysis.usedEstimates) {
        <p class="hint ion-margin-top">חלק מהסימולציה מבוסס על אומדן (מדווח/צפוי) כי חסר בפועל.</p>
      }

      <div class="nav-actions">
        <span class="tip-wrap" [class.has-tip]="showTooltips" [attr.data-tip]="showTooltips ? tipReconciliation : null">
          <ion-button fill="outline" routerLink="/review/reconciliation"
            [attr.aria-label]="'פירוט הפקדות — ' + tipReconciliation">
            פירוט הפקדות
          </ion-button>
        </span>
        <span class="tip-wrap" [class.has-tip]="showTooltips" [attr.data-tip]="showTooltips ? tipSimulation : null">
          <ion-button fill="outline" routerLink="/review/simulation"
            [attr.aria-label]="'סימולציית צבירה — ' + tipSimulation">
            סימולציית צבירה
          </ion-button>
        </span>
        <span class="tip-wrap" [class.has-tip]="showTooltips" [attr.data-tip]="showTooltips ? tipTermination : null">
          <ion-button fill="outline" routerLink="/review/termination"
            [attr.aria-label]="'סיום העסקה — ' + tipTermination">
            סיום העסקה
          </ion-button>
        </span>
      </div>
    }

    <app-review-step-nav nextLabel="המשך" (next)="next()" />

    @if (modal(); as m) {
      <div class="sheet-backdrop" (click)="closeModal()">
        <div class="sheet" role="dialog" aria-modal="true" [attr.aria-labelledby]="'dash-modal-title'" (click)="$event.stopPropagation()">
          <div class="sheet-head">
            <h2 id="dash-modal-title">{{ m.title }}</h2>
            <button type="button" class="sheet-close" (click)="closeModal()" aria-label="סגירה">
              <ion-icon name="close-outline" aria-hidden="true"></ion-icon>
            </button>
          </div>

          <div class="sec">
            <h3>מה נבדק</h3>
            @if (m.checked.length) {
              <ul>@for (x of m.checked; track x) { <li>{{ x }}</li> }</ul>
            } @else {
              <p class="empty">אין עדיין נתונים שנבדקו בסעיף זה.</p>
            }
          </div>

          <div class="sec">
            <h3>מה חסר / לא ידוע</h3>
            @if (m.missing.length) {
              <ul>@for (x of m.missing; track x) { <li>{{ x }}</li> }</ul>
            } @else {
              <p class="empty">לא זוהו חוסרים בסעיף זה.</p>
            }
          </div>

          <div class="sec">
            <h3>מידע נוסף</h3>
            @if (m.details.length) {
              <ul>@for (x of m.details; track x) { <li>{{ x }}</li> }</ul>
            } @else {
              <p class="empty">—</p>
            }
          </div>

          @if (m.calc?.length) {
            <div class="sec">
              <h3>חישובים רלוונטיים</h3>
              <ul>@for (x of m.calc!; track x) { <li>{{ x }}</li> }</ul>
            </div>
          }

          <div class="nav-actions" style="margin-top:16px">
            <ion-button fill="outline" (click)="closeModal()">סגירה</ion-button>
          </div>
        </div>
      </div>
    }
  `
})
export class ReviewDashboardPage implements OnInit {
  readonly store = inject(ReviewStore);
  private readonly router = inject(Router);
  readonly healthLabel = healthLabel;
  readonly showTooltips = !Capacitor.isNativePlatform();
  readonly modal = signal<DashModal | null>(null);

  readonly tipReconciliation =
    'טבלת צפוי / מדווח / בפועל לפי שנים — איפה יש פער בהפקדות.';
  readonly tipSimulation =
    'איך היתרה בקופות הייתה יכולה להיראות לפי תשואה ודמי ניהול (אומדן).';
  readonly tipTermination =
    'סיכום לקראת סיום העסקה: מה תקין, מה חסר, ואומדן רכיב פיצויים.';

  constructor() {
    addIcons({ closeOutline });
  }

  get analysis() { return this.store.analysis(); }

  cards(): DashCard[] {
    const a = this.analysis;
    if (!a) return [];
    return [
      { key: 'period', title: 'תקופת העסקה', value: `${this.yearsLabel()} שנים` },
      { key: 'monthsChecked', title: 'חודשים שנבדקו', value: `${a.summary.monthsWithData}/${a.summary.totalMonths}` },
      { key: 'expected', title: 'הפקדות צפויות', value: this.store.fmt(a.summary.expectedTotal) },
      { key: 'reported', title: 'הפקדות מדווחות', value: this.store.fmt(a.summary.reportedTotal) },
      { key: 'actual', title: 'הפקדות בפועל', value: this.store.fmt(a.summary.actualTotal) },
      { key: 'gap', title: 'פער משוער', value: this.store.fmt(a.summary.gapTotal) },
      { key: 'funds', title: 'יתרות בקופות', value: this.store.fmt(this.fundTotal()) },
      { key: 'sim', title: 'צבירה משוערת (בסיס)', value: this.store.fmt(this.baseSim()) },
      { key: 'gapMonths', title: 'חודשים עם פער', value: String(a.summary.monthsWithGap) },
      { key: 'noInfo', title: 'חודשים ללא מידע', value: String(a.summary.monthsNoInfo) }
    ];
  }

  yearsLabel(): string {
    const p = this.store.review()?.period;
    if (!p) return '—';
    const start = new Date(p.startDate + 'T00:00:00');
    const end = new Date(p.endDate + 'T00:00:00');
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
    return String(Math.max(1, Math.round(months / 12)));
  }

  fundTotal(): number | null {
    const funds = this.store.review()?.funds ?? [];
    const vals = funds.map(f => f.balance).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) : null;
  }

  baseSim(): number | null {
    return this.analysis?.simulations.find(s => s.scenario === 'Base')?.estimatedBalance ?? null;
  }

  async ngOnInit(): Promise<void> {
    if (this.store.review()?.months.length && !this.store.analysis()) await this.run();
  }

  async run(): Promise<void> {
    await this.store.analyze();
  }

  next(): void {
    void this.router.navigateByUrl('/review/reconciliation');
  }

  openCard(key: DashKey): void {
    this.modal.set(this.buildModal(key));
  }

  closeModal(): void {
    this.modal.set(null);
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.modal()) this.closeModal();
  }

  private buildModal(key: DashKey): DashModal {
    const a = this.analysis!;
    const r = this.store.review();
    const docs = r?.documents ?? [];
    const funds = r?.funds ?? [];
    const s = a.summary;
    const anomalies = a.anomalies ?? [];

    switch (key) {
      case 'period': {
        const p = r?.period;
        return {
          title: 'תקופת העסקה',
          checked: [
            p ? `מעסיק: ${p.employerName || 'לא צוין'}` : 'לא הוגדרה תקופה',
            p ? `מתאריך ${p.startDate} עד ${p.endDate}` : '',
            p?.exitReason ? `סיבת עזיבה: ${p.exitReason}` : '',
            `אורך משוער: ${this.yearsLabel()} שנים · ${s.totalMonths} חודשי העסקה במודל`
          ].filter(Boolean),
          missing: [
            !p?.employerName ? 'שם מעסיק חסר' : '',
            !p ? 'תאריכי העסקה חסרים' : ''
          ].filter(Boolean),
          details: [
            `מסמכים שהועלו: ${docs.length}`,
            `דילוגים על מסמכים: ${r?.documentWaivers?.length ?? 0}`
          ]
        };
      }
      case 'monthsChecked':
        return {
          title: 'חודשים שנבדקו',
          checked: [
            `${s.monthsWithData} חודשים עם לפחות נתון אחד`,
            `${s.monthsOk} חודשים ללא פער מספרי ידוע`,
            `סה״כ חודשי העסקה במודל: ${s.totalMonths}`
          ],
          missing: [
            s.monthsNoInfo ? `${s.monthsNoInfo} חודשים ללא מידע` : '',
            s.monthsUnknownActual ? `${s.monthsUnknownActual} חודשים עם בפועל לא ידוע` : ''
          ].filter(Boolean),
          details: [
            '«נבדק» = יש שכר / הפקדה צפויה / מדווחת / בפועל בחודש.',
            'חודשים בלי תלוש ובלי הזנה ידנית נספרים כחסרי מידע.'
          ],
          calc: [
            `כיסוי: ${s.monthsWithData}/${s.totalMonths} = ${Math.round(s.health.coverageRatio * 100)}%`
          ]
        };
      case 'expected':
        return {
          title: 'הפקדות צפויות',
          checked: [
            s.expectedTotal != null ? `סה״כ צפוי: ${this.store.fmt(s.expectedTotal)}` : 'עדיין אין סכום צפוי'
          ],
          missing: [
            s.expectedTotal == null ? 'לא חושבו הפקדות צפויות — הריצו «חישוב הפקדות צפויות» במסך השכר / המשיכו מקופות.' : ''
          ].filter(Boolean),
          details: [
            'צפוי = לפי שכר × שיעורי פנסיה / פיצויים / השתלמות מהכללים.',
            'זה מה שהיה אמור להיות מופקד — לא מה שדווח או נכנס בפועל.'
          ],
          calc: s.expectedTotal != null ? [`ממוצע לחודש עם נתונים: ${this.store.fmt(s.expectedTotal / Math.max(1, s.monthsWithData))}`] : undefined
        };
      case 'reported':
        return {
          title: 'הפקדות מדווחות',
          checked: [
            s.reportedTotal != null ? `סה״כ מדווח: ${this.store.fmt(s.reportedTotal)}` : 'אין עדיין סכום מדווח'
          ],
          missing: [
            s.reportedTotal == null ? 'חסר דיווח מהתלושים / דוחות (מדווח).' : ''
          ].filter(Boolean),
          details: [
            'מדווח = מה שמופיע בתלוש / בדיווח המעסיק כהפרשה.',
            'אפשר לראות פירוט לפי שנה במסך «פירוט הפקדות».'
          ]
        };
      case 'actual':
        return {
          title: 'הפקדות בפועל',
          checked: [
            s.actualTotal != null ? `סה״כ בפועל: ${this.store.fmt(s.actualTotal)}` : 'אין עדיין סכום בפועל'
          ],
          missing: [
            s.actualTotal == null ? 'חסר סכום בפועל — לרוב מדוחות הקופה / תנועות הפקדה.' : '',
            s.monthsUnknownActual ? `${s.monthsUnknownActual} חודשים עם בפועל לא ידוע` : ''
          ].filter(Boolean),
          details: [
            'בפועל = מה שנכנס לקופה (אם ידוע). «לא ידוע» אינו נספר כ־0.',
            a.usedEstimates ? 'בסימולציה נעשה שימוש באומדן כי חסר סכום בפועל מלא.' : 'לא סומן שימוש באומדן במקום סכום בפועל.'
          ]
        };
      case 'gap':
        return {
          title: 'פער משוער',
          checked: [
            s.gapTotal != null ? `פער מצטבר: ${this.store.fmt(s.gapTotal)}` : 'אין פער מחושב',
            s.firstGapMonth ? `חלון פערים: ${s.firstGapMonth} – ${s.lastGapMonth}` : ''
          ].filter(Boolean),
          missing: [
            s.gapTotal == null ? 'לא ניתן לחשב פער בלי צפוי / מדווח / בפועל מספיקים.' : ''
          ].filter(Boolean),
          details: [
            'הפער משווה בין מה שצריך היה להיות מופקד לבין מה שדווח/בפועל.',
            `${anomalies.length} חריגות סומנו בניתוח.`
          ],
          calc: s.gapTotal != null && s.expectedTotal
            ? [`יחס פער לסכום הצפוי: ${Math.round(Math.abs(s.gapTotal) / Math.max(1, Math.abs(s.expectedTotal)) * 100)}%`]
            : undefined
        };
      case 'funds': {
        const withBal = funds.filter(f => f.balance != null);
        return {
          title: 'יתרות בקופות',
          checked: withBal.length
            ? withBal.map(f => `${f.kind}: ${this.store.fmt(f.balance)}${f.provider ? ` · ${f.provider}` : ''}${f.source === 'document' ? ' (מדוח)' : ' (ידני)'}`)
            : ['לא הוזנו יתרות'],
          missing: this.missingFundKinds().map(k => `חסרה יתרה ל־${k}`),
          details: [
            `סה״כ יתרות: ${this.store.fmt(this.fundTotal())}`,
            'היתרות מגיעות מדוח פנסיה/קופות או מהזנה ידנית במסך הקופות.'
          ]
        };
      }
      case 'sim': {
        const base = a.simulations.find(x => x.scenario === 'Base');
        return {
          title: 'צבירה משוערת (בסיס)',
          checked: base
            ? [
                `יתרה משוערת: ${this.store.fmt(base.estimatedBalance)}`,
                `הפקדות מצטברות בסימולציה: ${this.store.fmt(base.totalContributions)}`,
                `תשואה שנתית שהונחה: ${base.annualReturnPercent}% · דמי ניהול: ${base.managementFeePercent}%`
              ]
            : ['אין תרחיש בסיס'],
          missing: !base ? ['סימולציה לא הורצה'] : [],
          details: [
            'אומדן בלבד — לא תחזית השקעה.',
            'פירוט תרחישים נוסף במסך «סימולציית צבירה».'
          ],
          calc: base
            ? [
                `רווחים משוערים: ${this.store.fmt(base.estimatedGains)}`,
                `דמי ניהול משוערים: ${this.store.fmt(base.estimatedFees)}`
              ]
            : undefined
        };
      }
      case 'gapMonths':
        return {
          title: 'חודשים עם פער',
          checked: [
            `${s.monthsWithGap} חודשים סומנו עם פער`,
            s.firstGapMonth ? `מ־${s.firstGapMonth} עד ${s.lastGapMonth}` : ''
          ].filter(Boolean),
          missing: s.monthsWithGap === 0 ? [] : ['מומלץ לבדוק את פירוט ההפקדות לחודשים האלה'],
          details: anomalies.slice(0, 8).map(x => `${x.year}/${x.month}: ${x.explanation}`),
          calc: [`${s.monthsWithGap}/${s.totalMonths} חודשים עם פער`]
        };
      case 'noInfo':
        return {
          title: 'חודשים ללא מידע',
          checked: [`${s.monthsNoInfo} חודשים בלי שכר/הפקדות ידועים`],
          missing: [
            s.monthsNoInfo ? 'העלו תלושים או מלאו שכר ידנית לחודשים החסרים' : '',
            s.monthsNoInfo ? 'או סמנו «לחץ אם אין» במסמכים אם אין אפשרות להשיג' : ''
          ].filter(Boolean),
          details: [
            `חודשים עם נתונים: ${s.monthsWithData}`,
            `כיסוי מידע כללי: ${Math.round(s.health.coverageRatio * 100)}%`
          ]
        };
    }
  }

  private missingFundKinds(): string[] {
    const have = new Set((this.store.review()?.funds ?? []).map(f => f.kind));
    const labels: Record<string, string> = {
      Pension: 'פנסיה', Severance: 'פיצויים', Study: 'השתלמות', Managers: 'ביטוח מנהלים'
    };
    return (['Pension', 'Severance', 'Study', 'Managers'] as const)
      .filter(k => !have.has(k))
      .map(k => labels[k]);
  }
}
