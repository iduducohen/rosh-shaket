import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonButton, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, trashOutline } from 'ionicons/icons';
import { DocumentValidationService } from '../../core/document-validation.service';
import { FundAccount, FundKind, ReviewDocumentMeta } from '../../core/review.models';
import { ReviewStore } from '../../core/review.store';
import { ReviewStepNavComponent } from './review-step-nav.component';
import { PENSION_GUIDE } from './pension-guide';

/** Slots shown in a year — includes disability (payslip signal only). */
type FundSlotKey = FundKind | 'Disability';

const FUND_DEFS: {
  key: FundSlotKey;
  label: string;
  where: string;
  needsBalance: boolean;
  payslipKind: string | null;
}[] = [
  {
    key: 'Pension',
    label: 'פנסיה',
    where: 'מדוח פנסיה / קופות, או יתרה מהאזור האישי בקופה.',
    needsBalance: true,
    payslipKind: 'pension'
  },
  {
    key: 'Severance',
    label: 'פיצויים בקופה',
    where: 'רכיב פיצויים שמופיע בדוח הקופה / ביטוח מנהלים.',
    needsBalance: true,
    payslipKind: 'severance'
  },
  {
    key: 'Study',
    label: 'קרן השתלמות',
    where: 'מדוח קרן השתלמות או מדוח קופות מרוכז.',
    needsBalance: true,
    payslipKind: 'study'
  },
  {
    key: 'Disability',
    label: 'אובדן כושר עבודה',
    where: 'מופיע בתלוש כהפרשה — אין צורך ביתרת צבירה נפרדת כאן.',
    needsBalance: false,
    payslipKind: 'disability'
  },
  {
    key: 'Managers',
    label: 'ביטוח מנהלים',
    where: 'מדוח בחברת הביטוח או מדוח קופות, אם רלוונטי.',
    needsBalance: true,
    payslipKind: null
  }
];

/** Documents that fill fund state for a year — same types / logic as documents center. */
const FUND_DOC_TYPES = [
  {
    key: 'payslip',
    label: 'תלושי שכר',
    where: 'מהמעסיק או מאפליקציית השכר / פורטל העובדים.',
    annual: false
  },
  {
    key: 'form106',
    label: 'טופס 106',
    where: 'מהמעסיק — בדרך כלל בסוף שנת מס או בתחילת השנה שאחריה (סיכום שנתי של שכר וניכויים).',
    annual: true
  },
  {
    key: 'pension_report',
    label: 'דוח פנסיה / קופות',
    where: 'מאזור אישי בקופה או דרך הר הכסף. ממלא אוטומטית יתרות במסך הקופות (פנסיה / פיצויים / השתלמות).',
    annual: true
  }
] as const;

const ALLOWED_EXT = /\.(pdf|png|jpe?g|webp|heic)$/i;
const ALLOWED_MIME = /^(application\/pdf|image\/)/i;

type SlotState = 'have' | 'miss' | 'waived' | 'from_payslip';

interface FundSlot {
  key: FundSlotKey;
  label: string;
  where: string;
  needsBalance: boolean;
  state: SlotState;
  fund: FundAccount | null;
  fromPayslip: boolean;
  statusLabel: string;
}

interface YearGap {
  year: number;
  slots: FundSlot[];
  missing: FundSlot[];
  have: FundSlot[];
  waived: FundSlot[];
  ok: boolean;
  hasWaivers: boolean;
  hasPayslipSignal: boolean;
}

interface DocYearGap {
  year: number;
  missing: { key: string; label: string }[];
  have: { key: string; label: string }[];
  waived: { key: string; label: string }[];
  ok: boolean;
  hasWaivers: boolean;
}

@Component({
  selector: 'app-review-funds',
  standalone: true,
  imports: [FormsModule, IonButton, IonIcon, RouterLink, ReviewStepNavComponent],
  styles: [`
    .lead { color: var(--ion-color-primary); font-weight: 700; margin: 0 0 8px; }
    .hint { font-size: 13.5px; color: var(--ion-color-medium); margin: 0 0 14px; line-height: 1.45; }
    .section-title { margin: 18px 0 8px; font-size: 18px; }

    .year-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
      gap: 8px;
      margin: 0 0 12px;
    }
    @media (min-width: 900px) {
      .year-grid { grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); }
    }
    .year-cube {
      font: inherit; cursor: pointer; border-radius: 12px; padding: 10px 8px;
      border: 1.5px solid var(--rs-line); background: var(--ion-item-background);
      color: inherit; text-align: center;
      display: flex; flex-direction: column; gap: 2px; align-items: center;
      min-height: 78px; box-sizing: border-box;
    }
    .year-cube:hover { border-color: var(--ion-color-primary); }
    .year-cube b { font-size: 15px; font-weight: 700; }
    .year-cube .st { font-size: 11.5px; line-height: 1.25; color: var(--ion-color-medium); }
    .year-cube.ok {
      border-color: var(--ion-color-success);
      background: rgba(var(--ion-color-success-rgb, 45, 170, 90), .1);
    }
    .year-cube.ok .st { color: var(--ion-color-success-shade, #1a7a3c); font-weight: 700; }
    .year-cube.ok.waived-ok {
      border-color: color-mix(in srgb, var(--ion-color-medium) 45%, var(--rs-line));
      background: color-mix(in srgb, var(--ion-color-medium) 10%, var(--ion-background-color));
    }
    .year-cube.ok.waived-ok .st { color: var(--ion-color-medium-shade, #5E6F73); font-weight: 700; }
    .year-cube .st.miss { color: var(--ion-color-danger); font-weight: 700; }
    .year-cube.partial { border-color: var(--rs-line); }

    .waiver-note {
      margin: 0 0 12px; font-size: 13px; color: var(--ion-color-medium); line-height: 1.4;
    }

    .sheet-backdrop {
      position: fixed; inset: 0; z-index: 30; background: rgba(11, 31, 38, .48);
      display: flex; align-items: center; justify-content: center; padding: 16px;
    }
    .sheet {
      width: min(980px, 100%); max-height: min(90vh, 820px); overflow: auto;
      background: var(--ion-background-color); color: var(--ion-text-color);
      border-radius: 18px; padding: 18px 20px calc(16px + env(safe-area-inset-bottom, 0px));
      box-shadow: 0 18px 50px rgba(0, 0, 0, .28);
    }
    .sheet.narrow { width: min(480px, 100%); }
    .sheet.guide-sheet { width: min(520px, 100%); }
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
    .sheet-cols { display: grid; gap: 18px; }
    @media (min-width: 860px) {
      .sheet-cols { grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); align-items: start; }
      .sheet { overflow: hidden; display: flex; flex-direction: column; }
      .sheet-scroll { overflow: auto; flex: 1; min-height: 0; }
    }

    .status-box {
      border-radius: 12px; padding: 12px 14px; margin: 0 0 14px;
      border: 1.5px solid var(--rs-line); background: var(--ion-item-background);
    }
    .status-box.full {
      border-color: var(--ion-color-success);
      background: rgba(var(--ion-color-success-rgb, 45, 170, 90), .08);
    }
    .status-box.bad {
      border-color: color-mix(in srgb, var(--ion-color-danger) 45%, var(--rs-line));
      background: rgba(var(--ion-color-danger-rgb, 235, 68, 90), .06);
    }
    .status-box b { display: block; margin-bottom: 6px; }
    .status-box > p { margin: 0 0 10px; font-size: 13.5px; line-height: 1.45; color: var(--ion-color-medium); }

    .check-list { margin: 8px 0 0; padding: 0; list-style: none; }
    .check-list li {
      display: flex; gap: 10px; align-items: flex-start;
      padding: 8px 0; border-bottom: 0;
    }
    .check-list .copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .check-list .where {
      font-size: 12.5px; font-weight: 500; line-height: 1.4;
      color: var(--ion-color-medium);
    }
    .check-list li.miss { color: var(--ion-color-danger); }
    .check-list li.miss .where { color: color-mix(in srgb, var(--ion-color-danger) 55%, var(--ion-color-medium)); }
    .check-list li.ok-item { color: var(--ion-color-success-shade, #1a7a3c); }
    .check-list li.waived-item { color: var(--ion-color-medium-shade, #5E6F73); }
    .check-list li.waived-item .where { color: var(--ion-color-medium); }
    .check-mark {
      width: 20px; height: 20px; border-radius: 50%; flex: none;
      display: grid; place-items: center; font-size: 12px; font-weight: 700;
    }
    .check-list li.ok-item .check-mark {
      background: var(--ion-color-success); color: #fff;
    }
    .check-list li.waived-item .check-mark {
      background: color-mix(in srgb, var(--ion-color-medium) 35%, transparent);
      color: var(--ion-color-medium-shade, #5E6F73);
      font-size: 11px;
    }
    .check-list li.miss .check-mark {
      background: transparent; border: 1.5px solid var(--ion-color-danger); color: var(--ion-color-danger);
      font-size: 10px;
    }
    .waive-btn {
      background: none; border: 0; padding: 0; cursor: pointer; font: inherit;
      font-size: 12.5px; font-weight: 700; color: var(--ion-color-medium-shade, #5E6F73);
      text-decoration: underline; text-underline-offset: 2px; margin-top: 4px;
      display: inline-block; align-self: flex-start;
    }
    .waive-btn:hover { color: var(--ion-color-primary); }
    .balance-link {
      background: none; border: 0; padding: 0; cursor: pointer; font: inherit;
      font-size: 12.5px; font-weight: 700; color: var(--ion-color-primary);
      text-decoration: underline; text-underline-offset: 2px; margin-top: 2px;
      display: inline-block; align-self: flex-start;
    }

    .guide-toggle {
      background: none; border: 0; padding: 0; cursor: pointer; font: inherit;
      font-size: 13.5px; font-weight: 700; color: var(--ion-color-primary);
      text-decoration: underline; text-underline-offset: 2px; margin: 4px 0 0;
      display: inline-block;
    }

    .field { margin-bottom: 12px; }
    .field label { display: block; font-size: 12.5px; color: var(--ion-color-medium); margin-bottom: 6px; }
    .field select,
    .field input {
      width: 100%; box-sizing: border-box; font: inherit; color: inherit;
      background: var(--ion-item-background); border: 1px solid var(--rs-line); border-radius: 12px;
      padding: 12px 14px;
    }
    .field-err { margin: -4px 0 10px; font-size: 13px; color: var(--ion-color-danger); }

    .type-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin: 0 0 10px;
    }
    .type-chip {
      text-align: start; font: inherit; color: inherit; cursor: pointer;
      background: var(--ion-item-background); border: 1.5px solid var(--rs-line);
      border-radius: 12px; padding: 10px 12px;
    }
    .type-chip.selected { border-color: var(--ion-color-primary); background: var(--rs-soft); }
    .type-chip.have { border-color: color-mix(in srgb, var(--ion-color-success) 55%, var(--rs-line)); }
    .type-chip.need:not(.have):not(.selected) {
      border-color: color-mix(in srgb, var(--ion-color-danger) 40%, var(--rs-line));
    }
    .type-chip.waived {
      border-color: color-mix(in srgb, var(--ion-color-medium) 50%, var(--rs-line));
      background: color-mix(in srgb, var(--ion-color-medium) 10%, var(--ion-background-color));
    }
    .type-chip b { display: block; font-size: 13px; font-weight: 700; line-height: 1.3; }
    .type-chip .meta { display: block; font-size: 11.5px; margin-top: 3px; color: var(--ion-color-medium); }
    .type-chip.need:not(.have) .meta { color: var(--ion-color-danger); font-weight: 600; }
    .type-chip.waived .meta { color: var(--ion-color-medium-shade, #5E6F73); font-weight: 700; }
    .type-chip .chip-waive {
      background: none; border: 0; padding: 0; cursor: pointer; font: inherit;
      font-size: 11.5px; font-weight: 700; color: var(--ion-color-danger);
      text-decoration: underline; text-underline-offset: 2px; margin-top: 4px;
      display: inline-block;
    }
    .type-chip.waived .chip-waive { color: var(--ion-color-medium-shade, #5E6F73); }

    .month-waive { margin: 0 0 14px; }
    .month-chip-row {
      display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px;
    }
    @media (min-width: 520px) {
      .month-chip-row { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    }
    .month-chip {
      border: 1.5px solid var(--rs-line); border-radius: 12px; padding: 8px 6px;
      background: var(--ion-item-background); color: inherit; cursor: pointer;
      font: inherit; text-align: center; display: flex; flex-direction: column; gap: 2px;
    }
    .month-chip b { font-size: 13px; font-weight: 700; }
    .month-chip .meta { font-size: 11px; color: var(--ion-color-medium); }
    .month-chip.have {
      border-color: var(--ion-color-success);
      background: rgba(var(--ion-color-success-rgb, 45, 170, 90), .1);
    }
    .month-chip.have .meta { color: var(--ion-color-success-shade, #1a7a3c); font-weight: 700; }
    .month-chip.waived {
      border-color: color-mix(in srgb, var(--ion-color-medium) 50%, var(--rs-line));
      background: color-mix(in srgb, var(--ion-color-medium) 10%, var(--ion-background-color));
    }
    .month-chip.waived .meta { color: var(--ion-color-medium-shade, #5E6F73); font-weight: 700; }
    .month-chip.need .meta { color: var(--ion-color-danger); font-weight: 700; }

    .drop {
      border: 1.5px dashed var(--ion-color-primary); border-radius: 14px; padding: 18px 16px;
      text-align: center; margin: 0 0 10px; background: rgba(var(--ion-color-primary-rgb), .04);
      cursor: pointer;
    }
    .drop.over { background: rgba(var(--ion-color-primary-rgb), .12); }
    .drop b { display: block; margin-bottom: 4px; }
    .drop input { display: none; }
    .validate-note {
      font-size: 12.5px; color: var(--ion-color-medium); margin: 0 0 10px; line-height: 1.4;
    }
    .file-err { color: var(--ion-color-danger); font-size: 13.5px; margin: 0 0 10px; }
    .file-list, .doc-list { margin: 0 0 10px; padding: 0; list-style: none; }
    .file-list li, .doc-list li {
      display: flex; justify-content: space-between; gap: 8px; align-items: flex-start;
      padding: 8px 0; border-bottom: 1px solid var(--rs-line); font-size: 14px;
    }
    .file-list button {
      background: none; border: 0; color: var(--ion-color-primary); cursor: pointer; font: inherit; font-weight: 700;
    }
    .doc-list .icon-btn {
      background: none; border: 0; color: var(--ion-color-medium); cursor: pointer;
      width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; padding: 0; flex: none;
    }
    .doc-list .icon-btn:hover { color: var(--ion-color-danger); background: rgba(var(--ion-color-danger-rgb, 235, 68, 90), .08); }
    .doc-list .icon-btn ion-icon { font-size: 20px; }
    .doc-meta b { display: block; }
    .count { font-size: 13px; color: var(--ion-color-medium); }
    .val-line { font-size: 12.5px; margin-top: 4px; color: var(--ion-color-medium); }
    .val-line.ok { color: var(--ion-color-success-shade, #1a7a3c); }
    .val-line.bad { color: var(--ion-color-danger); }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .actions ion-button { margin: 0; }

    .detail-row {
      display: flex; justify-content: space-between; gap: 12px;
      padding: 8px 0; border-bottom: 1px solid var(--rs-line); font-size: 14px;
    }
    .detail-row:last-child { border-bottom: 0; }
    .detail-row .k { color: var(--ion-color-medium); }
    .detail-row .v { font-weight: 700; }
    .sheet-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 0; }
    .sheet-actions ion-button { margin: 0; }
    .co-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 6px; margin: 0 0 12px;
    }
    .co-chip {
      font: inherit; font-size: 12.5px; font-weight: 700; text-align: center; cursor: pointer;
      border: 1.5px solid var(--rs-line); border-radius: 10px; padding: 8px 6px;
      background: var(--ion-item-background); color: inherit;
    }
    .co-chip:hover, .co-chip.on {
      border-color: var(--ion-color-primary); background: var(--rs-soft);
    }
    .guide-list { margin: 0; padding-inline-start: 18px; }
    .guide-list li { margin: 0 0 10px; font-size: 13.5px; line-height: 1.45; }
    .guide-list .co { font-weight: 700; color: var(--ion-color-primary); }
    .guide-list a { color: var(--ion-color-primary); font-weight: 700; }
    .foot { font-size: 12.5px; color: var(--ion-color-medium); line-height: 1.4; margin: 12px 0 0; }
  `],
  template: `
    <h2>מצב נוכחי בקופות</h2>
    <p class="lead">לחצו על שנה כדי להשלים או לעדכן יתרות.</p>
    <p class="hint">
      סוגי הקופות מזוהים מהתלושים. היתרות מתמלאות מדוח קופות — אפשר להעלות כאן או במסמכים.
    </p>

    @if (!periodYears().length) {
      <p class="hint">מלאו תאריכי העסקה בשלב הקודם — ואז יופיעו כאן השנים.</p>
      <ion-button fill="outline" routerLink="/review/employment">לחזרה למילוי תקופת העסקה</ion-button>
    } @else {
      <div class="year-grid">
        @for (g of docYearGaps(); track g.year) {
          <button type="button" class="year-cube"
            [class.ok]="g.ok"
            [class.waived-ok]="g.ok && g.hasWaivers"
            [class.partial]="!g.ok && g.have.length"
            (click)="openYear(g.year)">
            <b>{{ g.year }}</b>
            <span class="st" [class.miss]="!g.ok">{{ docYearCubeLabel(g) }}</span>
          </button>
        }
      </div>

      @if (hasAnyDocWaiver()) {
        <p class="waiver-note">חלק מהמסמכים סומנו כלא זמינים — אפשר להמשיך על בסיס מה שיש.</p>
      }
    }

    <app-review-step-nav (next)="next()" />

    @if (yearModal(); as y) {
      <div class="sheet-backdrop" (click)="closeYear()">
        <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="fund-year-title" (click)="$event.stopPropagation()">
          <div class="sheet-head">
            <h2 id="fund-year-title">קופות {{ y }}</h2>
            <button type="button" class="sheet-close" (click)="closeYear()" aria-label="סגירה">
              <ion-icon name="close-outline" aria-hidden="true"></ion-icon>
            </button>
          </div>
          <div class="sheet-scroll">
            <div class="sheet-cols">
              <div>
                @if (docGapFor(y); as g) {
                  <div class="status-box" [class.bad]="!g.ok" [class.full]="g.ok && !g.hasWaivers">
                    <b>{{ docStatusTitle(g) }}</b>
                    <ul class="check-list">
                      @for (row of docCoverageRows(y); track row.key) {
                        <li
                          [class.ok-item]="row.state === 'have'"
                          [class.waived-item]="row.state === 'waived'"
                          [class.miss]="row.state === 'miss'">
                          <span class="check-mark" aria-hidden="true">
                            {{ row.state === 'have' ? '✓' : row.state === 'waived' ? '–' : '!' }}
                          </span>
                          <span class="copy">
                            <span>{{ row.label }}</span>
                            @if (row.state === 'miss' && row.where) {
                              <span class="where">{{ row.where }}</span>
                            }
                            @if (row.state === 'waived') {
                              <span class="where">דולג — אין אפשרות להשיג</span>
                            }
                            @if (row.state === 'miss' && row.key === 'pension_report') {
                              <button type="button" class="guide-toggle" (click)="openGuide()">
                                איך להשיג דוח פנסיה
                              </button>
                            }
                            @if (row.state === 'miss') {
                              <button type="button" class="waive-btn" (click)="waiveDoc(y, row.key)">
                                לחץ אם אין
                              </button>
                            }
                            @if (row.state === 'waived') {
                              <button type="button" class="waive-btn" (click)="unwaiveDoc(y, row.key)">
                                ביטול דילוג
                              </button>
                            }
                          </span>
                        </li>
                      }
                    </ul>
                  </div>
                }

                <label class="field" style="margin-bottom:6px">מה צריך לשנה הזו</label>
                <div class="type-grid">
                  @for (t of fundDocTypes; track t.key) {
                    <div class="type-chip"
                      role="button"
                      tabindex="0"
                      [class.selected]="docType === t.key"
                      [class.have]="docCoverage(y, t.key) === 'have'"
                      [class.waived]="docCoverage(y, t.key) === 'waived'"
                      [class.need]="docCoverage(y, t.key) === 'miss'"
                      (click)="selectDocType(t.key)"
                      (keydown.enter)="selectDocType(t.key)">
                      <b>{{ t.label }}</b>
                      @if (!t.annual) {
                        <span class="meta">{{ docCoverageMeta(y, t.key) }}</span>
                      } @else if (docCoverage(y, t.key) === 'have') {
                        <span class="meta">יש</span>
                      } @else if (docCoverage(y, t.key) === 'waived') {
                        <button type="button" class="chip-waive"
                          (click)="unwaiveDoc(y, t.key); $event.stopPropagation()">
                          ביטול דילוג
                        </button>
                      } @else {
                        <button type="button" class="chip-waive"
                          (click)="waiveDoc(y, t.key); $event.stopPropagation()">
                          לחץ אם אין
                        </button>
                      }
                    </div>
                  }
                </div>

                @if (docType === 'pension_report') {
                  <button type="button" class="guide-toggle" (click)="openGuide()">
                    איך להשיג דוח פנסיה
                  </button>
                }

                @if (docType === 'payslip') {
                  <div class="month-waive">
                    <label class="field" style="margin-bottom:6px">חודשי תלוש ב־{{ y }}</label>
                    <div class="month-chip-row">
                      @for (m of monthsInEmploymentYear(y); track m) {
                        <button type="button" class="month-chip"
                          [class.have]="hasPayslipMonth(y, m)"
                          [class.waived]="!hasPayslipMonth(y, m) && isPayslipMonthWaived(y, m)"
                          [class.need]="!hasPayslipMonth(y, m) && !isPayslipMonthWaived(y, m)"
                          [disabled]="hasPayslipMonth(y, m)"
                          (click)="togglePayslipMonthWaiver(y, m)">
                          <b>{{ monthLabel(m) }}</b>
                          <span class="meta">{{ payslipMonthMeta(y, m) }}</span>
                        </button>
                      }
                    </div>
                    <p class="validate-note" style="margin-top:8px">
                      לחצו על חודש חסר כדי לסמן שאין. לחצו שוב לביטול.
                    </p>
                  </div>
                }

                @if (gapFor(y); as fg) {
                  <h3 class="section-title" style="margin-top:8px">יתרות קופות</h3>
                  <ul class="check-list">
                    @for (slot of fg.slots; track slot.key) {
                      <li
                        [class.ok-item]="slot.state === 'have' || slot.state === 'from_payslip'"
                        [class.waived-item]="slot.state === 'waived'"
                        [class.miss]="slot.state === 'miss'">
                        <span class="check-mark" aria-hidden="true">
                          {{ slot.state === 'have' || slot.state === 'from_payslip' ? '✓' : slot.state === 'waived' ? '–' : '!' }}
                        </span>
                        <span class="copy">
                          <span>{{ slot.label }}@if (slot.state === 'have' && slot.fund?.balance != null) { · {{ store.fmt(slot.fund!.balance) }} }@if (slot.fromPayslip && slot.state !== 'miss') { · מהתלוש }</span>
                          @if (slot.state === 'miss' && slot.where) {
                            <span class="where">{{ slot.where }}</span>
                          }
                          @if (slot.needsBalance && slot.state === 'have') {
                            <button type="button" class="balance-link" (click)="openSlot(slot.key)">עריכת יתרה</button>
                          }
                          @if (slot.needsBalance && slot.state === 'miss') {
                            <button type="button" class="balance-link" (click)="openSlot(slot.key)">הזנת יתרה ידנית</button>
                          }
                          @if (slot.state === 'miss') {
                            <button type="button" class="waive-btn" (click)="waive(slot.key, y)">לחץ אם אין</button>
                          }
                          @if (slot.state === 'waived') {
                            <button type="button" class="waive-btn" (click)="unwaive(slot.key, y)">ביטול דילוג</button>
                          }
                        </span>
                      </li>
                    }
                  </ul>
                }

                <h3 class="section-title" style="margin-top:8px">מה נרשם ל־{{ y }}</h3>
                @if (!docsForYear(y).length) {
                  <p class="hint">עדיין אין מסמכי קופות לשנה זו.</p>
                } @else {
                  <ul class="doc-list">
                    @for (d of docsForYear(y); track d.id) {
                      <li>
                        <div class="doc-meta">
                          <b>{{ labelFor(d.documentType) }}</b>
                          @if (d.month) { <span class="count"> · {{ monthLabel(d.month) }}</span> }
                          <div class="count">{{ d.fileName || d.extractedSummary || '—' }}</div>
                          @if (d.validationMessage) {
                            <div class="val-line"
                              [class.ok]="d.validationStatus === 'ok' || d.validationStatus === 'manual'"
                              [class.bad]="d.validationStatus === 'mismatch' || d.validationStatus === 'unreadable'">
                              {{ d.validationMessage }}
                            </div>
                          }
                        </div>
                        <button type="button" class="icon-btn" (click)="removeDoc(d)" aria-label="מחיקה">
                          <ion-icon name="trash-outline" aria-hidden="true"></ion-icon>
                        </button>
                      </li>
                    }
                  </ul>
                }
              </div>

              <div>
                <div class="drop" [class.over]="dragOver()"
                  (click)="fileInput.click()"
                  (dragover)="onDragOver($event)"
                  (dragleave)="dragOver.set(false)"
                  (drop)="onDrop($event)">
                  <b>גררו קבצים או לחצו לבחירה</b>
                  <span class="hint" style="margin:0">PDF / תמונה · אפשר כמה יחד</span>
                  <input #fileInput type="file" accept=".pdf,image/*" multiple (change)="onFiles($event)" />
                </div>
                <p class="validate-note">
                  אחרי ההעלאה בודקים אוטומטית (OCR/AI) שהקובץ תואם לסוג ולשנה. מדוח קופות נשלפות יתרות; מתלוש מזהים סוגי הפרשות.
                </p>
                @if (fileError()) { <p class="file-err">{{ fileError() }}</p> }

                @if (pendingFiles.length) {
                  <ul class="file-list">
                    @for (f of pendingFiles; track f.name + f.size; let i = $index) {
                      <li>
                        <span>{{ f.name }} <span class="count">({{ sizeLabel(f.size) }})</span></span>
                        <button type="button" (click)="removePending(i)">הסרה</button>
                      </li>
                    }
                  </ul>
                  @if (docType === 'payslip') {
                    <div class="field">
                      <label for="fund-pay-month">חודש של התלוש</label>
                      <select id="fund-pay-month" [value]="uploadMonth ?? ''" (change)="onUploadMonth($event)">
                        <option value="">בחרו חודש</option>
                        @for (m of monthOptions; track m.value) {
                          <option [value]="m.value">{{ m.label }}</option>
                        }
                      </select>
                    </div>
                  }
                  <div class="actions">
                    <ion-button (click)="addFiles(y)">הוספת {{ pendingFiles.length }} קבצים לרשימה</ion-button>
                  </div>
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    }

    @if (activeSlot(); as slot) {
      <div class="sheet-backdrop" style="z-index:40" (click)="closeSlot()">
        <div class="sheet narrow" role="dialog" aria-modal="true" aria-labelledby="fund-slot-title" (click)="$event.stopPropagation()">
          <div class="sheet-head">
            <h2 id="fund-slot-title">{{ slot.label }}</h2>
            <button type="button" class="sheet-close" (click)="closeSlot()" aria-label="סגירה">
              <ion-icon name="close-outline" aria-hidden="true"></ion-icon>
            </button>
          </div>

          @if (slot.state === 'have' && slot.fund && !editing()) {
            <div class="status-box full">
              <b>יש יתרה</b>
              <p>{{ slot.fund.source === 'document' ? 'נשלף מדוח שהועלה' : 'הוזן ידנית' }}</p>
            </div>
            <div class="detail-row"><span class="k">יתרה</span><span class="v">{{ store.fmt(slot.fund.balance) }}</span></div>
            <div class="detail-row"><span class="k">גוף מנהל</span><span class="v">{{ slot.fund.provider || '—' }}</span></div>
            <div class="detail-row"><span class="k">תאריך דוח</span><span class="v">{{ slot.fund.asOf || '—' }}</span></div>
            <div class="sheet-actions">
              <ion-button fill="outline" (click)="startEdit(slot)">עריכה</ion-button>
              <ion-button fill="outline" (click)="clearFund(slot.key)">הסרה</ion-button>
            </div>
          } @else {
            <div class="status-box bad">
              <b>השלמה ידנית</b>
              <p>רק אם אין דוח מתאים להעלאה.</p>
              <span class="where">{{ slot.where }}</span>
            </div>

            <button type="button" class="guide-toggle" (click)="openGuide()">איך להשיג דוח פנסיה</button>

            <label class="field" style="margin-bottom:6px">גוף מנהל מוכר</label>
            <div class="co-grid">
              @for (c of pensionGuide.companies; track c.name) {
                <button type="button" class="co-chip" [class.on]="provider === c.name" (click)="pickCompany(c.name)">
                  {{ c.name }}
                </button>
              }
            </div>

            <div class="field">
              <label for="fund-provider">גוף מנהל</label>
              <input id="fund-provider" type="text" [(ngModel)]="provider" placeholder="או הקלידו שם אחר" />
            </div>
            <div class="field">
              <label for="fund-balance">יתרה נוכחית (₪)</label>
              <input id="fund-balance" type="number" inputmode="decimal" [(ngModel)]="balance" />
            </div>
            @if (formError()) { <p class="field-err">{{ formError() }}</p> }
            <div class="field">
              <label for="fund-asof">תאריך הדוח</label>
              <input id="fund-asof" type="date" [(ngModel)]="asOf" />
            </div>
            <div class="field">
              <label for="fund-fee">דמי ניהול שנתיים %</label>
              <input id="fund-fee" type="number" inputmode="decimal" [(ngModel)]="fee" />
            </div>
            <div class="field">
              <label for="fund-ret">תשואה שנתית %</label>
              <input id="fund-ret" type="number" inputmode="decimal" [(ngModel)]="ret" />
            </div>

            <div class="sheet-actions">
              <ion-button fill="outline" (click)="saveManual(slot.key)">שמירה</ion-button>
              <ion-button fill="outline" (click)="cancelEdit()">ביטול</ion-button>
            </div>
            @if (yearModal(); as y) {
              <button type="button" class="waive-btn" (click)="waive(slot.key, y); closeSlot()">לחץ אם אין</button>
            }
          }
        </div>
      </div>
    }

    @if (guideOpen()) {
      <div class="sheet-backdrop" style="z-index:45" (click)="closeGuide()">
        <div class="sheet guide-sheet" role="dialog" aria-modal="true" aria-labelledby="fund-guide-title" (click)="$event.stopPropagation()">
          <div class="sheet-head">
            <h2 id="fund-guide-title">איך להשיג דוח פנסיה</h2>
            <button type="button" class="sheet-close" (click)="closeGuide()" aria-label="סגירה">
              <ion-icon name="close-outline" aria-hidden="true"></ion-icon>
            </button>
          </div>
          <p class="hint">{{ pensionGuide.intro }}</p>
          <ul class="guide-list">
            @for (g of pensionGuide.gov; track g.name) {
              <li>
                <span class="co">{{ g.name }}</span> — {{ g.tip }}
                <div><a [href]="g.url" target="_blank" rel="noopener noreferrer">{{ g.urlLabel }}</a></div>
              </li>
            }
          </ul>
          <p class="hint" style="margin-top:12px">בחברות הגדולות:</p>
          <ul class="guide-list">
            @for (c of pensionGuide.companies; track c.name) {
              <li>
                <span class="co">{{ c.name }}</span> — {{ c.tip }}
                <div><a [href]="c.url" target="_blank" rel="noopener noreferrer">{{ c.urlLabel }}</a></div>
              </li>
            }
          </ul>
          <p class="foot">{{ pensionGuide.note }}</p>
          <div class="sheet-actions" style="margin-top:14px">
            <ion-button fill="outline" (click)="closeGuide()">סגירה</ion-button>
          </div>
        </div>
      </div>
    }
  `
})
export class ReviewFundsPage implements OnInit {
  readonly store = inject(ReviewStore);
  private readonly router = inject(Router);
  private readonly validation = inject(DocumentValidationService);

  readonly yearModal = signal<number | null>(null);
  readonly openKind = signal<FundSlotKey | null>(null);
  readonly editing = signal(false);
  readonly guideOpen = signal(false);
  readonly formError = signal('');
  readonly dragOver = signal(false);
  readonly fileError = signal('');
  readonly pensionGuide = PENSION_GUIDE;
  readonly fundDocTypes = FUND_DOC_TYPES;

  docType: string = 'pension_report';
  uploadMonth: number | null = null;
  pendingFiles: File[] = [];
  private readonly sourceFiles = new Map<string, File>();

  provider = '';
  balance: number | null = null;
  asOf = '';
  fee: number | null = null;
  ret: number | null = null;

  readonly monthOptions = [
    { value: 1, label: 'ינואר' }, { value: 2, label: 'פברואר' }, { value: 3, label: 'מרץ' },
    { value: 4, label: 'אפריל' }, { value: 5, label: 'מאי' }, { value: 6, label: 'יוני' },
    { value: 7, label: 'יולי' }, { value: 8, label: 'אוגוסט' }, { value: 9, label: 'ספטמבר' },
    { value: 10, label: 'אוקטובר' }, { value: 11, label: 'נובמבר' }, { value: 12, label: 'דצמבר' }
  ];

  constructor() {
    addIcons({ closeOutline, trashOutline });
  }

  readonly periodYears = computed(() => {
    const p = this.store.review()?.period;
    if (!p?.startDate || !p?.endDate) return [] as number[];
    const a = Number(String(p.startDate).slice(0, 4));
    const b = Number(String(p.endDate).slice(0, 4));
    if (!Number.isFinite(a) || !Number.isFinite(b) || a > b) return [];
    const years: number[] = [];
    for (let y = a; y <= b; y++) years.push(y);
    return years;
  });

  readonly yearGaps = computed((): YearGap[] =>
    this.periodYears().map(year => this.buildYearGap(year))
  );

  readonly docYearGaps = computed((): DocYearGap[] =>
    this.periodYears().map(year => this.buildDocYearGap(year))
  );

  readonly activeSlot = computed((): FundSlot | null => {
    const kind = this.openKind();
    const year = this.yearModal();
    if (!kind || year == null) return null;
    return this.gapFor(year)?.slots.find(s => s.key === kind) ?? null;
  });

  ngOnInit(): void {
    this.store.syncFundsFromDocuments();
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.guideOpen()) this.closeGuide();
    else if (this.openKind()) this.closeSlot();
    else if (this.yearModal() != null) this.closeYear();
  }

  gapFor(year: number): YearGap | undefined {
    return this.yearGaps().find(g => g.year === year);
  }

  docGapFor(year: number): DocYearGap | undefined {
    return this.docYearGaps().find(g => g.year === year);
  }

  docYearCubeLabel(g: DocYearGap): string {
    if (!g.ok) return `${g.missing.length} חסרים`;
    if (g.hasWaivers) return 'אפשר להמשיך';
    return 'תקין';
  }

  docStatusTitle(g: DocYearGap): string {
    if (!g.ok) return 'חסר לשנה הזו';
    if (g.hasWaivers) return 'אפשר להמשיך — חלק מהמסמכים דולגו';
    return 'יש את כל מה שצריך לשנה';
  }

  docCoverageRows(year: number): { key: string; label: string; where: string; state: 'have' | 'waived' | 'miss' }[] {
    return FUND_DOC_TYPES.map(t => ({
      key: t.key,
      label: t.label,
      where: t.where,
      state: this.docCoverage(year, t.key)
    }));
  }

  yearCubeLabel(g: YearGap): string {
    if (!g.ok) return `${g.missing.length} חסרים`;
    if (g.hasWaivers) return 'אפשר להמשיך';
    return 'תקין';
  }

  statusBoxTitle(g: YearGap): string {
    if (!g.ok) return 'חסר לשנה הזו';
    if (g.hasWaivers) return 'אפשר להמשיך — חלק מהקופות דולגו';
    return 'יש את כל מה שצריך לשנה';
  }

  openYear(year: number): void {
    this.yearModal.set(year);
    this.openKind.set(null);
    this.editing.set(false);
    this.formError.set('');
    this.pendingFiles = [];
    this.uploadMonth = null;
    this.fileError.set('');
    this.dragOver.set(false);
    const missingDoc = FUND_DOC_TYPES.find(t => this.docCoverage(year, t.key) === 'miss');
    this.docType = missingDoc?.key ?? 'pension_report';
  }

  closeYear(): void {
    this.yearModal.set(null);
    this.openKind.set(null);
    this.editing.set(false);
    this.formError.set('');
    this.pendingFiles = [];
    this.uploadMonth = null;
    this.fileError.set('');
    this.dragOver.set(false);
  }

  selectDocType(key: string): void {
    this.docType = key;
    if (key !== 'payslip') this.uploadMonth = null;
  }

  docCoverage(year: number, key: string): 'have' | 'miss' | 'waived' {
    const docs = this.store.review()?.documents ?? [];
    if (key === 'payslip') {
      if (this.store.isWaived('payslip', year, null)) return 'waived';
      const months = this.monthsInEmploymentYear(year);
      if (!months.length) return docs.some(d => d.year === year && d.documentType === 'payslip') ? 'have' : 'miss';
      const allCovered = months.every(m => this.hasPayslipMonth(year, m) || this.isPayslipMonthWaived(year, m));
      const anyHave = months.some(m => this.hasPayslipMonth(year, m));
      if (allCovered && anyHave) return 'have';
      if (allCovered) return 'waived';
      return 'miss';
    }
    if (docs.some(d => d.year === year && d.documentType === key)) return 'have';
    if (this.store.isWaived(key, year, null)) return 'waived';
    return 'miss';
  }

  docCoverageMeta(year: number, key: string): string {
    const s = this.docCoverage(year, key);
    if (s === 'have') return 'יש';
    if (s === 'waived') return 'דולג';
    return 'חסר';
  }

  waiveDoc(year: number, key: string): void {
    this.store.waiveDocument(key, year, null);
  }

  unwaiveDoc(year: number, key: string): void {
    this.store.unwaiveDocument(key, year, null);
  }

  monthsInEmploymentYear(year: number): number[] {
    const p = this.store.review()?.period;
    if (!p) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const start = new Date(p.startDate + 'T00:00:00');
    const end = new Date(p.endDate + 'T00:00:00');
    const months: number[] = [];
    for (let m = 1; m <= 12; m++) {
      const first = new Date(year, m - 1, 1);
      const last = new Date(year, m, 0);
      if (last >= start && first <= end) months.push(m);
    }
    return months;
  }

  hasPayslipMonth(year: number, month: number): boolean {
    return (this.store.review()?.documents ?? []).some(
      d => d.documentType === 'payslip' && d.year === year && d.month === month
    );
  }

  isPayslipMonthWaived(year: number, month: number): boolean {
    return this.store.isWaived('payslip', year, month) || this.store.isWaived('payslip', year, null);
  }

  payslipMonthMeta(year: number, month: number): string {
    if (this.hasPayslipMonth(year, month)) return 'יש';
    if (this.isPayslipMonthWaived(year, month)) return 'דולג';
    return 'לחץ אם אין';
  }

  togglePayslipMonthWaiver(year: number, month: number): void {
    if (this.hasPayslipMonth(year, month)) return;
    if (this.store.isWaived('payslip', year, null)) {
      this.store.unwaiveDocument('payslip', year, null);
    }
    if (this.store.isWaived('payslip', year, month)) this.store.unwaiveDocument('payslip', year, month);
    else this.store.waiveDocument('payslip', year, month);
  }

  docsForYear(year: number): ReviewDocumentMeta[] {
    const allowed = new Set(FUND_DOC_TYPES.map(t => t.key as string));
    return (this.store.review()?.documents ?? []).filter(
      d => d.year === year && allowed.has(d.documentType)
    );
  }

  labelFor(key: string): string {
    return FUND_DOC_TYPES.find(t => t.key === key)?.label ?? key;
  }

  monthLabel(month: number): string {
    return this.monthOptions.find(m => m.value === month)?.label ?? String(month);
  }

  onUploadMonth(ev: Event): void {
    const v = (ev.target as HTMLSelectElement).value;
    this.uploadMonth = v ? Number(v) : null;
  }

  onDragOver(ev: DragEvent): void {
    ev.preventDefault();
    this.dragOver.set(true);
  }

  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    this.dragOver.set(false);
    const files = ev.dataTransfer?.files;
    if (files?.length) this.acceptFiles(Array.from(files));
  }

  onFiles(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const list = input.files;
    const files = list ? Array.from(list) : [];
    input.value = '';
    this.acceptFiles(files);
  }

  removePending(i: number): void {
    this.pendingFiles = this.pendingFiles.filter((_, idx) => idx !== i);
  }

  sizeLabel(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  addFiles(year: number): void {
    if (!this.pendingFiles.length) return;
    if (this.docType === 'payslip' && this.uploadMonth == null) {
      this.fileError.set('בחרו חודש לתלוש לפני השמירה.');
      return;
    }
    const queued = [...this.pendingFiles];
    for (const file of queued) {
      const id = crypto.randomUUID();
      this.store.addDocument({
        id,
        documentType: this.docType,
        year,
        month: this.docType === 'payslip' ? this.uploadMonth : null,
        source: 'upload',
        parsedOk: false,
        extractedSummary: file.name,
        needsManualReview: true,
        fileName: file.name,
        storageKey: null,
        validationStatus: 'pending',
        validationMessage: 'ממתין לבדיקת תוכן…'
      });
      this.sourceFiles.set(id, file);
      void this.validation.validateDocument(id, file);
    }
    this.pendingFiles = [];
    this.uploadMonth = null;
    this.fileError.set('');
    // Re-sync balances after OCR may complete asynchronously — also sync now for any cached data.
    this.store.syncFundsFromDocuments();
  }

  removeDoc(d: ReviewDocumentMeta): void {
    this.store.removeDocument(d.id);
    this.sourceFiles.delete(d.id);
    this.store.syncFundsFromDocuments();
  }

  openSlot(key: FundSlotKey): void {
    if (key === 'Disability') return;
    this.openKind.set(key);
    this.editing.set(false);
    this.formError.set('');
    this.resetForm();
    const slot = this.activeSlot();
    if (slot?.fund) this.startEdit(slot);
  }

  closeSlot(): void {
    this.openKind.set(null);
    this.editing.set(false);
    this.formError.set('');
  }

  openGuide(): void {
    this.guideOpen.set(true);
  }

  closeGuide(): void {
    this.guideOpen.set(false);
  }

  pickCompany(name: string): void {
    this.provider = name;
  }

  startEdit(slot: FundSlot): void {
    const f = slot.fund;
    if (!f) {
      this.editing.set(true);
      this.resetForm();
      return;
    }
    this.provider = f.provider ?? '';
    this.balance = f.balance;
    this.asOf = f.asOf ?? '';
    this.fee = f.feeAnnualPercent;
    this.ret = f.returnAnnualPercent;
    this.editing.set(true);
    this.formError.set('');
  }

  cancelEdit(): void {
    const slot = this.activeSlot();
    if (slot?.state === 'have') this.editing.set(false);
    else this.closeSlot();
  }

  saveManual(key: FundSlotKey): void {
    if (key === 'Disability') return;
    const r = this.store.review();
    const year = this.yearModal();
    if (!r || year == null) return;
    if (this.balance == null || this.balance <= 0) {
      this.formError.set('הזינו יתרה גדולה מ־0.');
      return;
    }
    this.unwaive(key, year);
    const fund: FundAccount = {
      id: crypto.randomUUID(),
      workspaceId: r.workspaceId,
      kind: key,
      balance: this.balance,
      asOf: this.asOf || null,
      provider: this.provider.trim() || null,
      feeAnnualPercent: this.fee,
      returnAnnualPercent: this.ret,
      track: null,
      confidence: 'Medium',
      source: 'manual',
      sourceDocumentId: null
    };
    this.store.setFunds([...(r.funds.filter(f => f.kind !== key)), fund]);
    this.editing.set(false);
    this.formError.set('');
    this.closeSlot();
  }

  clearFund(key: FundSlotKey): void {
    if (key === 'Disability') return;
    const r = this.store.review();
    if (!r) return;
    this.store.setFunds(r.funds.filter(f => f.kind !== key));
    this.closeSlot();
  }

  waive(key: FundSlotKey, year: number): void {
    this.store.waiveDocument(this.waiverType(key), year);
    if (key !== 'Disability') this.clearFundQuiet(key);
  }

  unwaive(key: FundSlotKey, year: number): void {
    this.store.unwaiveDocument(this.waiverType(key), year);
  }

  hasAnyWaived(): boolean {
    return this.yearGaps().some(g => g.hasWaivers);
  }

  hasAnyDocWaiver(): boolean {
    return this.docYearGaps().some(g => g.hasWaivers);
  }

  private buildDocYearGap(year: number): DocYearGap {
    const rows = this.docCoverageRows(year);
    const missing = rows.filter(r => r.state === 'miss').map(r => ({ key: r.key, label: r.label }));
    const have = rows.filter(r => r.state === 'have').map(r => ({ key: r.key, label: r.label }));
    const waived = rows.filter(r => r.state === 'waived').map(r => ({ key: r.key, label: r.label }));
    return {
      year,
      missing,
      have,
      waived,
      ok: missing.length === 0,
      hasWaivers: waived.length > 0
    };
  }

  async next(): Promise<void> {
    await this.store.fillExpectedFromServer();
    await this.store.analyze();
    await this.router.navigateByUrl('/review/dashboard');
  }

  private acceptFiles(files: File[]): void {
    const ok: File[] = [];
    const bad: string[] = [];
    for (const f of files) {
      const mimeOk = !f.type || ALLOWED_MIME.test(f.type);
      const extOk = ALLOWED_EXT.test(f.name);
      if (mimeOk || extOk) ok.push(f);
      else bad.push(f.name);
    }
    if (bad.length) this.fileError.set(`לא נתמך: ${bad.join(', ')}`);
    else this.fileError.set('');
    if (ok.length) this.pendingFiles = [...this.pendingFiles, ...ok];
  }

  private buildYearGap(year: number): YearGap {
    const slots = this.slotsForYear(year);
    const missing = slots.filter(s => s.state === 'miss');
    const have = slots.filter(s => s.state === 'have' || s.state === 'from_payslip');
    const waived = slots.filter(s => s.state === 'waived');
    return {
      year,
      slots,
      missing,
      have,
      waived,
      ok: missing.length === 0,
      hasWaivers: waived.length > 0,
      hasPayslipSignal: this.payslipKindsForYear(year).size > 0 || this.hasPayslipDoc(year)
    };
  }

  private slotsForYear(year: number): FundSlot[] {
    const relevant = this.relevantKeysForYear(year);
    const funds = this.store.review()?.funds ?? [];
    const payslipKinds = this.payslipKindsForYear(year);

    return FUND_DEFS
      .filter(d => relevant.has(d.key))
      .map(d => {
        const fromPayslip = d.payslipKind != null && payslipKinds.has(d.payslipKind);
        const fund = d.needsBalance
          ? (funds.find(f => f.kind === d.key) ?? null)
          : null;
        const waived = this.store.isWaived(this.waiverType(d.key), year);

        let state: SlotState = 'miss';
        if (waived) state = 'waived';
        else if (!d.needsBalance && fromPayslip) state = 'from_payslip';
        else if (fund && fund.balance != null) state = 'have';
        else if (!d.needsBalance) state = 'from_payslip';

        let statusLabel = 'חסר';
        if (state === 'have') {
          statusLabel = fund?.balance != null ? this.store.fmt(fund.balance) : 'יש יתרה';
        } else if (state === 'from_payslip') {
          statusLabel = 'זוהה בתלוש';
        } else if (state === 'waived') {
          statusLabel = 'דולג';
        }

        return {
          key: d.key,
          label: d.label,
          where: d.where,
          needsBalance: d.needsBalance,
          state,
          fund,
          fromPayslip,
          statusLabel
        };
      });
  }

  private relevantKeysForYear(year: number): Set<FundSlotKey> {
    const keys = new Set<FundSlotKey>(['Pension']);
    const payslipKinds = this.payslipKindsForYear(year);
    const docs = this.store.review()?.documents ?? [];
    const funds = this.store.review()?.funds ?? [];

    if (payslipKinds.size) {
      for (const def of FUND_DEFS) {
        if (def.payslipKind && payslipKinds.has(def.payslipKind)) keys.add(def.key);
      }
    } else if (this.hasPayslipDoc(year) || this.hasSalaryMonth(year)) {
      keys.add('Severance');
    } else {
      keys.add('Severance');
    }

    if (docs.some(d => d.documentType === 'study_report' && d.year === year)) keys.add('Study');
    if (docs.some(d => d.documentType === 'managers_report' && d.year === year)) keys.add('Managers');
    if (funds.some(f => f.kind === 'Study' && f.balance != null)) keys.add('Study');
    if (funds.some(f => f.kind === 'Managers' && f.balance != null)) keys.add('Managers');
    if (funds.some(f => f.kind === 'Severance' && f.balance != null)) keys.add('Severance');

    if (!payslipKinds.has('disability')) keys.delete('Disability');

    return keys;
  }

  private payslipKindsForYear(year: number): Set<string> {
    const docs = this.store.review()?.documents ?? [];
    const kinds = new Set<string>();
    for (const d of docs) {
      if (d.documentType !== 'payslip' || d.year !== year) continue;
      for (const k of d.extractedContributionKinds ?? []) {
        kinds.add(String(k).toLowerCase());
      }
    }
    return kinds;
  }

  private hasPayslipDoc(year: number): boolean {
    return (this.store.review()?.documents ?? []).some(
      d => d.documentType === 'payslip' && d.year === year
    );
  }

  private hasSalaryMonth(year: number): boolean {
    return (this.store.review()?.months ?? []).some(
      m => m.year === year && m.grossSalary != null && m.grossSalary > 0
    );
  }

  private waiverType(key: FundSlotKey): string {
    return `fund_${key}`;
  }

  private clearFundQuiet(key: FundSlotKey): void {
    if (key === 'Disability') return;
    const r = this.store.review();
    if (!r) return;
    if (!r.funds.some(f => f.kind === key)) return;
    this.store.setFunds(r.funds.filter(f => f.kind !== key));
  }

  private resetForm(): void {
    this.provider = '';
    this.balance = null;
    this.asOf = '';
    this.fee = null;
    this.ret = null;
  }
}
