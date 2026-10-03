import { NgTemplateOutlet } from '@angular/common';
import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { BillingService } from '../../core/billing.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { IonButton, IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  closeOutline, cloudUploadOutline, createOutline, trashOutline,
  downloadOutline, clipboardOutline, printOutline, eyeOutline
} from 'ionicons/icons';
import { DOC_CHECKLIST, ReviewDocumentMeta } from '../../core/review.models';
import { ReviewStore } from '../../core/review.store';
import { DocumentValidationService, SECOND_FORM106_MSG } from '../../core/document-validation.service';
import { ReviewDocumentFilesService } from '../../core/review-document-files.service';
import { ReviewStepNavComponent } from './review-step-nav.component';
import { PENSION_GUIDE } from './pension-guide';

/** Basic yearly coverage — not every document type in the catalog. */
const CORE_TYPES = [
  {
    key: 'payslip',
    label: 'תלושי שכר',
    where: 'מהמעסיק או מאפליקציית השכר / פורטל העובדים.'
  },
  {
    key: 'form106',
    label: 'טופס 106',
    where: 'מהמעסיק — בדרך כלל בסוף שנת מס או בתחילת השנה שאחריה (סיכום שנתי של שכר וניכויים).'
  },
  {
    key: 'pension_report',
    label: 'דוח פנסיה / קופות',
    where: 'מאזור אישי בקופה או דרך הר הכסף. ממלא אוטומטית יתרות במסך הקופות (פנסיה / פיצויים / השתלמות).'
  }
] as const;

const ALLOWED_EXT = /\.(pdf|png|jpe?g|webp|heic)$/i;
const ALLOWED_MIME = /^(application\/pdf|image\/)/i;

interface YearGap {
  year: number;
  missing: { key: string; label: string }[];
  have: { key: string; label: string }[];
  waived: { key: string; label: string }[];
  ok: boolean;
  hasWaivers: boolean;
}

@Component({
  selector: 'app-review-documents',
  standalone: true,
  imports: [IonButton, IonIcon, IonSpinner, RouterLink, ReviewStepNavComponent, NgTemplateOutlet],
  styles: [`
    .lead { color: var(--ion-color-primary); font-weight: 700; margin: 0 0 8px; }
    .hint { font-size: 13.5px; color: var(--ion-color-medium); margin: 0 0 12px; line-height: 1.45; }
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
    .year-cube { box-shadow: var(--rs-card-shadow);
      font: inherit; cursor: pointer; border-radius: 12px; padding: 10px 8px;
      border: 1.5px solid var(--rs-line); background: var(--ion-item-background);
      color: inherit; text-align: center;
      display: flex; flex-direction: column; gap: 2px; align-items: center;
      min-height: 78px; box-sizing: border-box;
    }
    .year-cube:hover { border-color: var(--ion-color-primary); }
    .year-cube b { font-size: 15px; font-weight: 700; }
    .year-cube .st { font-size: 12.5px; line-height: 1.25; color: var(--ion-color-medium); }
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
    .year-cube.partial {
      border-color: var(--rs-line);
    }
    .toolbar {
      display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: center;
      margin: 4px 0 0; padding: 0;
    }
    .toolbar button {
      background: none; border: 0; padding: 0; cursor: pointer; font: inherit;
      font-size: 13px; font-weight: 700; color: var(--ion-color-primary);
      display: inline-flex; align-items: center; gap: 5px;
    }
    .toolbar button:disabled { opacity: .45; cursor: default; }
    .toolbar button ion-icon { font-size: 16px; }
    .toolbar .sep {
      width: 1px; height: 14px; background: var(--rs-line); flex: none;
    }

    .field { margin-bottom: 12px; }
    .field label { display: block; font-size: 12.5px; color: var(--ion-color-medium); margin-bottom: 6px; }
    .field select,
    .field input[type="text"] {
      width: 100%; box-sizing: border-box; font: inherit; color: inherit;
      background: var(--ion-item-background); border: 1px solid var(--rs-line); border-radius: 12px;
      padding: 12px 14px;
    }
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
    .type-chip b { display: block; font-size: 13px; font-weight: 700; line-height: 1.3; }
    .type-chip .meta { display: block; font-size: 12.5px; margin-top: 3px; color: var(--ion-color-medium); }
    .type-chip.need:not(.have) .meta { color: var(--ion-color-danger); font-weight: 600; }
    .type-chip .chip-waive {
      background: none; border: 0; padding: 0; cursor: pointer; font: inherit;
      font-size: 12.5px; font-weight: 700; color: var(--ion-color-danger);
      text-decoration: underline; text-underline-offset: 2px; margin-top: 4px;
      display: inline-block;
    }
    .type-chip.waived .chip-waive { color: var(--ion-color-medium-shade, #5E6F73); }
    .drop {
      border: 1.5px dashed var(--ion-color-primary); border-radius: 14px; padding: 18px 16px;
      text-align: center; margin: 0 0 10px; background: rgba(var(--ion-color-primary-rgb), .04);
      cursor: pointer; position: relative; min-height: 88px;
      display: grid; place-items: center;
    }
    .drop.over { background: rgba(var(--ion-color-primary-rgb), .12); }
    .drop.busy { cursor: wait; pointer-events: none; border-style: solid; background: rgba(var(--ion-color-primary-rgb), .08); }
    .drop b { display: block; margin-bottom: 4px; }
    .drop input { display: none; }
    .drop-busy {
      display: flex; flex-direction: column; align-items: center; gap: 8px;
      padding: 4px 8px;
    }
    .drop-busy ion-spinner { width: 28px; height: 28px; color: var(--ion-color-primary); }
    .drop-busy b { margin: 0; font-size: 14px; }
    .file-err { color: var(--ion-color-danger); font-size: 13.5px; margin: 0 0 10px; font-weight: 600; }
    .file-ok { color: var(--ion-color-success-shade, #1a7a3c); font-size: 13.5px; margin: 0 0 10px; font-weight: 600; }
    .file-list, .doc-list { margin: 0 0 10px; padding: 0; list-style: none; }
    .file-list li, .doc-list li {
      display: flex; justify-content: space-between; gap: 8px; align-items: flex-start;
      padding: 8px 0; border-bottom: 1px solid var(--rs-line); font-size: 14px;
    }
    .file-list button, .doc-list .icon-btn {
      background: none; border: 0; color: var(--ion-color-primary); cursor: pointer;
      width: 36px; height: 36px; border-radius: 10px;
      display: grid; place-items: center; padding: 0; flex: none;
      position: relative;
    }
    .doc-list .icon-btn:hover { background: var(--rs-soft); }
    .doc-list .icon-btn ion-icon { font-size: 20px; }
    .doc-list .icon-btn.danger { color: var(--ion-color-medium); }
    .doc-list .icon-btn.danger:hover { color: var(--ion-color-danger); background: rgba(var(--ion-color-danger-rgb, 235, 68, 90), .08); }
    .doc-list .row-actions { display: flex; gap: 2px; flex: none; }
    .preview-sheet {
      width: min(920px, 96vw); max-height: 92vh; display: flex; flex-direction: column;
    }
    .preview-frame {
      width: 100%; flex: 1; min-height: 60vh; border: 1px solid var(--rs-line);
      border-radius: 10px; background: #fff;
    }
    .preview-img {
      display: block; max-width: 100%; max-height: 70vh; margin: 0 auto;
      border-radius: 10px; border: 1px solid var(--rs-line);
    }

    /* Styled tooltips — web + hover only (hybrid native / touch: aria-label only). */
    @media (hover: hover) and (pointer: fine) {
      .doc-list .icon-btn.has-tip::after,
      .doc-list .icon-btn.has-tip::before {
        position: absolute;
        opacity: 0;
        pointer-events: none;
        transition: opacity .12s ease, transform .12s ease;
        z-index: 5;
      }
      .doc-list .icon-btn.has-tip::after {
        content: attr(data-tip);
        bottom: calc(100% + 8px);
        left: 50%;
        transform: translateX(-50%) translateY(4px);
        white-space: nowrap;
        padding: 6px 10px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 700;
        line-height: 1.2;
        color: #fff;
        background: #0B1F26;
        box-shadow: 0 8px 20px rgba(11, 31, 38, .22);
      }
      .doc-list .icon-btn.has-tip::before {
        content: '';
        bottom: calc(100% + 2px);
        left: 50%;
        transform: translateX(-50%) translateY(4px);
        border: 6px solid transparent;
        border-top-color: #0B1F26;
      }
      .doc-list .icon-btn.has-tip:hover::after,
      .doc-list .icon-btn.has-tip:hover::before,
      .doc-list .icon-btn.has-tip:focus-visible::after,
      .doc-list .icon-btn.has-tip:focus-visible::before {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    }
    .doc-meta { flex: 1; min-width: 0; }
    .val-line {
      margin-top: 4px; font-size: 12.5px; line-height: 1.35;
      color: var(--ion-color-medium);
    }
    .val-line.ok { color: var(--ion-color-success-shade, #1a7a3c); font-weight: 600; }
    .val-line.bad { color: var(--ion-color-danger); font-weight: 600; }
    .val-line.wait { color: var(--ion-color-primary); }
    .val-actions {
      display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; align-items: center;
    }
    .val-actions button {
      background: none; border: 0; padding: 0; cursor: pointer; font: inherit;
      font-size: 12.5px; font-weight: 700; color: var(--ion-color-primary);
      text-decoration: underline; text-underline-offset: 2px;
    }
    .manual-month {
      display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 8px;
    }
    .manual-month label {
      font-size: 12.5px; font-weight: 700; color: var(--ion-color-danger-shade, #b91c1c);
    }
    .manual-month select {
      min-width: 140px; margin: 0; padding: 6px 10px; font-size: 13px;
    }
    .status-box {
      border: 1px solid var(--rs-line); border-radius: 12px; padding: 12px 14px; margin: 0 0 12px;
      background: var(--rs-soft);
    }
    .status-box.bad {
      border-color: color-mix(in srgb, var(--ion-color-danger) 45%, var(--rs-line));
      background: rgba(var(--ion-color-danger-rgb, 235, 68, 90), .06);
    }
    .status-box.full {
      border-color: color-mix(in srgb, var(--ion-color-success) 45%, var(--rs-line));
      background: rgba(var(--ion-color-success-rgb, 45, 170, 90), .08);
    }
    .status-box ul { margin: 6px 0 0; padding-inline-start: 18px; }
    .check-list { margin: 8px 0 0; padding: 0; list-style: none; }
    .check-list li {
      display: flex; align-items: flex-start; gap: 8px;
      margin: 0 0 10px; font-size: 14.5px; font-weight: 600;
    }
    .check-list .copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .check-list .where {
      font-size: 12.5px; font-weight: 500; line-height: 1.4;
      color: var(--ion-color-medium);
    }
    .check-list li.miss .where { color: color-mix(in srgb, var(--ion-color-danger) 55%, var(--ion-color-medium)); }
    .check-list li.ok-item { color: var(--ion-color-success-shade, #1a7a3c); }
    .check-list li.waived-item { color: var(--ion-color-medium-shade, #5E6F73); }
    .check-list li.waived-item .where { color: var(--ion-color-medium); }
    .waive-btn {
      background: none; border: 0; padding: 0; cursor: pointer; font: inherit;
      font-size: 12.5px; font-weight: 700; color: var(--ion-color-medium-shade, #5E6F73);
      text-decoration: underline; text-underline-offset: 2px; margin-top: 4px;
      display: inline-block; align-self: flex-start;
    }
    .waive-btn:hover { color: var(--ion-color-primary); }
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
    .month-chip .meta { font-size: 12.5px; color: var(--ion-color-medium); }
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
    .type-chip.waived {
      border-color: color-mix(in srgb, var(--ion-color-medium) 50%, var(--rs-line));
      background: color-mix(in srgb, var(--ion-color-medium) 10%, var(--ion-background-color));
    }
    .type-chip.waived .meta { color: var(--ion-color-medium-shade, #5E6F73); font-weight: 700; }
    .waiver-note {
      margin: 10px 0 0; font-size: 13px; color: var(--ion-color-medium); line-height: 1.4;
    }
    .check-list li.miss { color: var(--ion-color-danger); }
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
      font-size: 12.5px;
    }
    .check-list li.miss .check-mark {
      background: transparent; border: 1.5px solid var(--ion-color-danger); color: var(--ion-color-danger);
      font-size: 12.5px;
    }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .count { font-size: 13px; color: var(--ion-color-medium); }
    .guide-toggle {
      background: none; border: 0; padding: 0; cursor: pointer; font: inherit;
      font-size: 13.5px; font-weight: 700; color: var(--ion-color-primary);
      text-decoration: underline; text-underline-offset: 2px; margin: 4px 0 0;
      display: inline-block;
    }
    .guide-list { margin: 6px 0 0; padding-inline-start: 18px; }
    .guide-list li { margin: 0 0 10px; font-size: 13.5px; line-height: 1.45; }
    .guide-list .co { font-weight: 700; color: var(--ion-color-primary); }
    .guide-list a { font-weight: 700; color: var(--ion-color-primary); }
    .foot { margin: 10px 0 0; font-size: 12.5px; color: var(--ion-color-medium); line-height: 1.4; }
    .paywall {
      display: grid; gap: 6px; justify-items: start; margin: 0 0 14px; padding: 14px 16px; border-radius: 14px;
      background: var(--rs-warn-bg); color: var(--rs-warn); border: 1px solid color-mix(in srgb, var(--rs-accent) 45%, transparent);
    }
    .paywall b { font-size: 15.5px; }
    .paywall span { font-size: 14px; line-height: 1.45; color: var(--ion-text-color); }
    .paywall ion-button { margin: 4px 0 0; }
    .balance { font-size: 14px; color: var(--ion-color-medium); margin: 0 0 12px; }
    .balance.low { color: var(--rs-warn); font-weight: 700; }
    .balance a { color: var(--ion-color-primary); font-weight: 700; }
    .validate-note {
      font-size: 12.5px; color: var(--ion-color-medium); margin: 0 0 10px; line-height: 1.4;
    }

    .sheet-backdrop {
      position: fixed; inset: 0; z-index: 30; background: rgba(11, 31, 38, .48);
      display: flex; align-items: center; justify-content: center; padding: 16px;
    }
    /* The title and close button stay in view; only .sheet-body scrolls. */
    .sheet {
      width: min(980px, 100%); max-height: min(90vh, 820px);
      display: flex; flex-direction: column; overflow: hidden;
      background: var(--ion-background-color); color: var(--ion-text-color);
      border-radius: 18px; box-shadow: 0 18px 50px rgba(0, 0, 0, .28);
    }
    .sheet-body {
      flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
      padding: 12px 20px calc(16px + env(safe-area-inset-bottom, 0px));
    }
    .sheet.narrow { width: min(420px, 100%); }
    .sheet.guide-sheet { width: min(520px, 100%); }
    .confirm-msg { margin: 8px 0 18px; font-size: 16px; line-height: 1.45; }
    .confirm-actions {
      display: flex; flex-wrap: wrap; gap: 10px;
      justify-content: flex-end; /* שמאל במסך RTL */
    }
    .confirm-actions ion-button { margin: 0; min-width: 110px; }
    .sheet-head {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      flex: none; padding: 16px 20px 10px; border-bottom: 1px solid var(--rs-line);
    }
    .sheet-head h2 { margin: 0; font-size: 22px; }
    .sheet-close {
      background: none; border: 0; color: var(--ion-color-medium); cursor: pointer;
      width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; flex: none;
    }
    .sheet-close ion-icon { font-size: 24px; }
    .sheet-cols { display: grid; gap: 18px; }
    @media (min-width: 860px) {
      .sheet-cols { grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); align-items: start; }
    }
  `],
  template: `
    <h2>מרכז מסמכים</h2>
    <p class="lead">לחצו על שנה כדי להוסיף או להשלים מסמכים.</p>
    <ng-container *ngTemplateOutlet="paywallBox"></ng-container>

    <ng-template #paywallBox>
      @if (validation.paywall(); as reason) {
        <div class="paywall" role="status">
          @if (reason === 'payment') {
            <b>נגמרו המסמכים בחבילה</b>
            <span>המסמכים שהעליתם נשמרו. אחרי הוספת מסמכים לחצו «לבדוק עכשיו» ליד כל מסמך שממתין.</span>
            <ion-button size="small" routerLink="/pricing">הוספת מסמכים</ion-button>
          } @else {
            <b>הבדיקה המלאה למשתמשים מחוברים</b>
            <span>התחברו כדי לקבל {{ freeDocs }} מסמכים ראשונים בחינם ולשמור את הבדיקה בחשבון.</span>
            <ion-button size="small" routerLink="/login">התחברות</ion-button>
          }
        </div>
      } @else {
        @if (billing.enabled() && billing.account(); as a) {
          <p class="balance" [class.low]="a.balance <= 3">נותרו {{ a.balance }} מסמכים לבדיקה · <a routerLink="/account">החשבון שלי</a></p>
        }
      }
    </ng-template>
    @if (!periodYears().length) {
      <p class="hint">מלאו תאריכי העסקה בשלב הקודם — ואז יופיעו כאן השנים.</p>
      <ion-button fill="outline" routerLink="/review/employment">לחזרה למילוי תקופת העסקה</ion-button>
    } @else {
      <div class="year-grid">
        @for (g of yearGaps(); track g.year) {
          <button type="button" class="year-cube"
            [class.ok]="g.ok"
            [class.waived-ok]="g.ok && g.hasWaivers"
            [class.partial]="!g.ok && g.have.length"
            (click)="openYear(g.year)">
            <b>{{ g.year }}</b>
            <span class="st" [class.miss]="!g.ok">{{ yearCubeLabel(g) }}</span>
          </button>
        }
      </div>

      @if (store.hasAnyWaiver()) {
        <p class="waiver-note">חלק מהמסמכים סומנו כלא זמינים — אפשר להמשיך לחישוב על בסיס מה שיש.</p>
      }
      <div class="toolbar" role="group" aria-label="ייצוא ורשימות">
        <button type="button" [disabled]="!periodYears().length" (click)="exportMissing()">
          <ion-icon name="download-outline" aria-hidden="true"></ion-icon>
          ייצוא לאקסל
        </button>
        <span class="sep" aria-hidden="true"></span>
        <button type="button" [disabled]="!periodYears().length" (click)="copyChecklist()">
          <ion-icon name="clipboard-outline" aria-hidden="true"></ion-icon>
          {{ copied() ? 'הועתק ✓' : 'העתקה ללוח' }}
        </button>
        <span class="sep" aria-hidden="true"></span>
        <button type="button" [disabled]="!periodYears().length" (click)="printChecklist()">
          <ion-icon name="print-outline" aria-hidden="true"></ion-icon>
          הדפסה / PDF
        </button>
      </div>
    }

    <app-review-step-nav (next)="next()" />

    @if (yearModal(); as y) {
      <div class="sheet-backdrop" (click)="closeYear()">
        <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="year-title" (click)="$event.stopPropagation()">
          <div class="sheet-head">
            <h2 id="year-title">מסמכי {{ y }}</h2>
            <button type="button" class="sheet-close" (click)="closeYear()" aria-label="סגירה">
              <ion-icon name="close-outline" aria-hidden="true"></ion-icon>
            </button>
          </div>
          <div class="sheet-body">
            <div class="sheet-cols">
              <div>
                @if (gapFor(y); as g) {
                  <div class="status-box" [class.bad]="!g.ok" [class.full]="g.ok && !g.hasWaivers">
                    <b>{{ statusBoxTitle(g) }}</b>
                    <ul class="check-list">
                      @for (row of coverageRows(y); track row.key) {
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
                              <button type="button" class="guide-toggle" (click)="openPensionGuide()">
                                איך להשיג דוח פנסיה
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
                  @for (t of coreTypes; track t.key) {
                    <div class="type-chip"
                      role="button"
                      tabindex="0"
                      [class.selected]="docType === t.key"
                      [class.have]="coverageState(y, t.key) === 'have'"
                      [class.waived]="coverageState(y, t.key) === 'waived'"
                      [class.need]="coverageState(y, t.key) === 'miss'"
                      (click)="selectDocType(t.key)"
                      (keydown.enter)="selectDocType(t.key)">
                      <b>{{ t.label }}</b>
                      @if (t.key === 'payslip') {
                        <span class="meta">{{ coverageMeta(y, t.key) }}</span>
                      } @else if (coverageState(y, t.key) === 'have') {
                        <span class="meta">יש</span>
                      } @else if (coverageState(y, t.key) === 'waived') {
                        <button type="button" class="chip-waive"
                          (click)="unwaiveType(y, t.key); $event.stopPropagation()">
                          ביטול דילוג
                        </button>
                      } @else {
                        <button type="button" class="chip-waive"
                          (click)="waiveType(y, t.key); $event.stopPropagation()">
                          לחץ אם אין
                        </button>
                      }
                    </div>
                  }
                </div>

                @if (docType === 'pension_report') {
                  <button type="button" class="guide-toggle" (click)="openPensionGuide()">
                    איך להשיג דוח פנסיה
                  </button>
                }

                <h3 class="section-title" style="margin-top:8px">מה נרשם ל־{{ y }}</h3>
                @if (!docsForYear(y).length) {
                  <p class="hint">עדיין אין מסמכים לשנה זו.</p>
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
                              [class.bad]="d.validationStatus === 'mismatch' || d.validationStatus === 'unreadable'"
                              [class.wait]="d.validationStatus === 'checking'">
                              {{ d.validationMessage }}
                            </div>
                          }
                          @if (needsManualMonth(d)) {
                            <div class="manual-month">
                              <label [attr.for]="'manual-month-' + d.id">בחירת חודש ידנית</label>
                              <select [id]="'manual-month-' + d.id" [value]="''" (change)="setManualMonth(d, $event)">
                                <option value="" disabled>בחרו חודש</option>
                                @for (m of monthOptions; track m.value) {
                                  <option [value]="m.value">{{ m.label }}</option>
                                }
                              </select>
                            </div>
                          }
                          @if (d.validationStatus === 'mismatch' || d.validationStatus === 'unreadable' || d.validationStatus === 'unavailable') {
                            <div class="val-actions">
                              @if (canApplyDetected(d)) {
                                <button type="button" (click)="applyDetected(d)">התאמה למה שזוהה</button>
                              }
                              @if (hasSourceFile(d.id)) {
                                <button type="button" (click)="revalidate(d)">{{ d.validationStatus === 'unavailable' ? 'לבדוק עכשיו' : 'בדיקה מחדש' }}</button>
                              }
                              @if (!needsManualMonth(d)) {
                                <!-- Not checked (no credits / server down): the user vouches for type and year, and no data is read from it. -->
                                <button type="button" (click)="confirmManual(d)"
                                  [attr.title]="d.validationStatus === 'unavailable' ? 'המסמך יישאר ברשימה בלי קריאת הנתונים ממנו' : null">
                                  {{ d.validationStatus === 'unavailable' ? 'להמשיך בלי בדיקה' : 'אישור ידני' }}
                                </button>
                              }
                            </div>
                          } @else if (d.validationStatus === 'checking' && !validation.isRunning(d.id) && hasSourceFile(d.id)) {
                            <div class="val-actions">
                              <button type="button" (click)="revalidate(d)">הבדיקה נקטעה — בדיקה מחדש</button>
                            </div>
                          } @else if (d.documentType === 'payslip' && d.validationStatus !== 'checking' && !isArray(d.extractedContributions) && hasSourceFile(d.id)) {
                            <div class="val-actions">
                              <button type="button" (click)="revalidate(d)">בדיקה מחדש (קריאת הפרשות)</button>
                            </div>
                          }
                        </div>
                        <div class="row-actions">
                          @if (hasSourceFile(d.id)) {
                            <button type="button" class="icon-btn"
                              [class.has-tip]="showTooltips"
                              [attr.data-tip]="showTooltips ? 'צפייה' : null"
                              (click)="openPreview(d)" aria-label="צפייה במסמך">
                              <ion-icon name="eye-outline" aria-hidden="true"></ion-icon>
                            </button>
                          }
                          <button type="button" class="icon-btn"
                            [class.has-tip]="showTooltips"
                            [attr.data-tip]="showTooltips ? 'החלפת קובץ' : null"
                            (click)="pickReplaceFile(d)" aria-label="החלפת קובץ">
                            <ion-icon name="cloud-upload-outline" aria-hidden="true"></ion-icon>
                          </button>
                          <button type="button" class="icon-btn"
                            [class.has-tip]="showTooltips"
                            [attr.data-tip]="showTooltips ? 'שינוי שם' : null"
                            (click)="openRename(d)" aria-label="שינוי שם">
                            <ion-icon name="create-outline" aria-hidden="true"></ion-icon>
                          </button>
                          <button type="button" class="icon-btn danger"
                            [class.has-tip]="showTooltips"
                            [attr.data-tip]="showTooltips ? 'מחיקה' : null"
                            (click)="askRemove(d)" aria-label="מחיקה">
                            <ion-icon name="trash-outline" aria-hidden="true"></ion-icon>
                          </button>
                        </div>
                      </li>
                    }
                  </ul>
                }
              </div>

              <div>
                <div class="drop"
                  [class.over]="dragOver() && !uploading()"
                  [class.busy]="uploading()"
                  (click)="!uploading() && fileInput.click()"
                  (dragover)="onDragOver($event)"
                  (dragleave)="dragOver.set(false)"
                  (drop)="onDrop($event)">
                  @if (uploading()) {
                    <div class="drop-busy" aria-live="polite" aria-busy="true">
                      <ion-spinner name="crescent"></ion-spinner>
                      <b>{{ uploadLabel() }}</b>
                      <span class="muted small">בודקים סוג, שנה וחודש…</span>
                    </div>
                  } @else {
                    <b>גררו קבצים או לחצו לבחירה</b>
                    <span class="muted small">PDF / תמונה · אפשר כמה יחד</span>
                  }
                  <input #fileInput type="file" accept=".pdf,image/*" multiple (change)="onFiles($event)" [disabled]="uploading()" />
                </div>
                <p class="validate-note">
                  אחרי ההעלאה בודקים אוטומטית (OCR/AI) סוג, שנה וחודש. בתלוש החודש מתמלא לבד — בלי בחירה ידנית. אי-התאמה תוצג מיד.
                </p>
                <ng-container *ngTemplateOutlet="paywallBox"></ng-container>
                @if (fileError()) { <p class="file-err" role="alert">{{ fileError() }}</p> }
                @if (validation.blockMessage()) { <p class="file-err" role="alert">{{ validation.blockMessage() }}</p> }
                @if (uploadOk()) { <p class="file-ok" role="status">{{ uploadOk() }}</p> }

                @if (pendingFiles.length && !uploading()) {
                  <ul class="file-list">
                    @for (f of pendingFiles; track f.name + f.size; let i = $index) {
                      <li>
                        <span>{{ f.name }} <span class="count">({{ sizeLabel(f.size) }})</span></span>
                        <button type="button" (click)="removePending(i)">הסרה</button>
                      </li>
                    }
                  </ul>
                  @if (docType === 'payslip') {
                    <p class="validate-note">
                      החודש יזוהה אוטומטית מהתלוש. אם הזיהוי לא יתאים לשנה הזו — תוצג התראה עם אפשרות לעדכן.
                    </p>
                  }
                  <div class="actions">
                    <ion-button (click)="addFiles(y)">הוספת {{ pendingFiles.length }} קבצים לרשימה</ion-button>
                  </div>
                }

                @if (docType === 'payslip') {
                  <div class="month-waive" style="margin-top:18px">
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
              </div>
            </div>
          </div>
        </div>
      </div>
    }

    @if (gapModal(); as g) {
      <div class="sheet-backdrop" (click)="gapModal.set(null)">
        <div class="sheet narrow" role="dialog" aria-modal="true" aria-labelledby="gap-title" (click)="$event.stopPropagation()">
          <div class="sheet-head">
            <h2 id="gap-title">חסרים ב־{{ g.year }}</h2>
            <button type="button" class="sheet-close" (click)="gapModal.set(null)" aria-label="סגירה">
              <ion-icon name="close-outline" aria-hidden="true"></ion-icon>
            </button>
          </div>
          <div class="sheet-body">
          @if (g.ok) {
            <p>{{ g.hasWaivers ? 'אפשר להמשיך — חלק מהמסמכים דולגו.' : 'כיסוי בסיסי מלא לשנה זו.' }}</p>
          } @else {
            <ul>@for (m of g.missing; track m.key) { <li class="miss">{{ m.label }}</li> }</ul>
          }
          <div class="actions">
            <ion-button (click)="openYearFromGap(g.year)">השלמה לשנה</ion-button>
            <ion-button fill="outline" (click)="exportMissing(g.year)">ייצוא שנה זו</ion-button>
          </div>
          </div>
        </div>
      </div>
    }

    @if (deleteTarget(); as doc) {
      <div class="sheet-backdrop" style="z-index:40" (click)="cancelRemove()">
        <div class="sheet narrow" role="dialog" aria-modal="true" aria-labelledby="del-title" (click)="$event.stopPropagation()">
          <div class="sheet-head">
            <h2 id="del-title">מחיקת מסמך</h2>
            <button type="button" class="sheet-close" (click)="cancelRemove()" aria-label="סגירה">
              <ion-icon name="close-outline" aria-hidden="true"></ion-icon>
            </button>
          </div>
          <div class="sheet-body">
          <p class="confirm-msg">
            למחוק את <b>{{ labelFor(doc.documentType) }}</b>
            @if (doc.fileName || doc.extractedSummary) {
              <span> ({{ doc.fileName || doc.extractedSummary }})</span>
            }
            מהרשימה?
          </p>
          <div class="confirm-actions">
            <ion-button fill="outline" (click)="cancelRemove()">ביטול</ion-button>
            <ion-button (click)="confirmRemove()">מחיקה</ion-button>
          </div>
          </div>
        </div>
      </div>
    }

    @if (renameTarget(); as doc) {
      <div class="sheet-backdrop" style="z-index:40" (click)="cancelRename()">
        <div class="sheet narrow" role="dialog" aria-modal="true" aria-labelledby="rename-title" (click)="$event.stopPropagation()">
          <div class="sheet-head">
            <h2 id="rename-title">שינוי שם מסמך</h2>
            <button type="button" class="sheet-close" (click)="cancelRename()" aria-label="סגירה">
              <ion-icon name="close-outline" aria-hidden="true"></ion-icon>
            </button>
          </div>
          <div class="sheet-body">
          <p class="hint">משנים רק את שם התצוגה ברשימה — סוג המסמך והחודש לא משתנים כאן.</p>
          <div class="field">
            <label for="rename-name">שם תצוגה</label>
            <input id="rename-name" type="text" [value]="renameName" (input)="onRenameName($event)" />
          </div>
          @if (renameError()) { <p class="file-err">{{ renameError() }}</p> }
          <div class="confirm-actions">
            <ion-button fill="outline" (click)="cancelRename()">ביטול</ion-button>
            <ion-button (click)="saveRename()">שמירה</ion-button>
          </div>
          </div>
        </div>
      </div>
    }

    @if (previewTarget(); as doc) {
      <div class="sheet-backdrop" style="z-index:42" (click)="closePreview()">
        <div class="sheet preview-sheet" role="dialog" aria-modal="true" aria-labelledby="preview-title" (click)="$event.stopPropagation()">
          <div class="sheet-head">
            <h2 id="preview-title">{{ doc.fileName || doc.extractedSummary || 'צפייה במסמך' }}</h2>
            <button type="button" class="sheet-close" (click)="closePreview()" aria-label="סגירה">
              <ion-icon name="close-outline" aria-hidden="true"></ion-icon>
            </button>
          </div>
          <div class="sheet-body">
          @if (previewUrl()) {
            @if (previewIsPdf()) {
              <iframe class="preview-frame" [src]="previewUrl()" title="תצוגת מסמך"></iframe>
            } @else {
              <img class="preview-img" [src]="previewUrl()" [alt]="doc.fileName || 'מסמך'" />
            }
          } @else {
            <p class="hint">טוענים את הקובץ…</p>
          }
          <div class="confirm-actions" style="margin-top:12px">
            <ion-button fill="outline" (click)="closePreview()">סגירה</ion-button>
          </div>
          </div>
        </div>
      </div>
    }

    @if (pensionGuideOpen()) {
      <div class="sheet-backdrop" style="z-index:45" (click)="closePensionGuide()">
        <div class="sheet guide-sheet" role="dialog" aria-modal="true" aria-labelledby="pension-guide-title" (click)="$event.stopPropagation()">
          <div class="sheet-head">
            <h2 id="pension-guide-title">איך להשיג דוח פנסיה</h2>
            <button type="button" class="sheet-close" (click)="closePensionGuide()" aria-label="סגירה">
              <ion-icon name="close-outline" aria-hidden="true"></ion-icon>
            </button>
          </div>
          <div class="sheet-body">
          <p class="hint">{{ pensionGuide.intro }}</p>
          <ul class="guide-list">
            @for (g of pensionGuide.gov; track g.name) {
              <li>
                <span class="co">{{ g.name }}</span> — {{ g.tip }}
                <div>
                  <a [href]="g.url" target="_blank" rel="noopener noreferrer">{{ g.urlLabel }}</a>
                </div>
              </li>
            }
          </ul>
          <p class="hint" style="margin-top:12px">בחברות הגדולות:</p>
          <ul class="guide-list">
            @for (c of pensionGuide.companies; track c.name) {
              <li>
                <span class="co">{{ c.name }}</span> — {{ c.tip }}
                <div>
                  <a [href]="c.url" target="_blank" rel="noopener noreferrer">{{ c.urlLabel }}</a>
                </div>
              </li>
            }
          </ul>
          <p class="foot">{{ pensionGuide.note }}</p>
          <div class="confirm-actions" style="margin-top:14px">
            <ion-button fill="outline" (click)="closePensionGuide()">סגירה</ion-button>
          </div>
          </div>
        </div>
      </div>
    }
  `
})
export class ReviewDocumentsPage implements OnInit {
  readonly store = inject(ReviewStore);
  private readonly router = inject(Router);
  readonly validation = inject(DocumentValidationService);
  readonly billing = inject(BillingService);
  private readonly auth = inject(AuthService);
  readonly freeDocs = 3;
  private readonly files = inject(ReviewDocumentFilesService);
  private readonly sanitizer = inject(DomSanitizer);
  readonly coreTypes = CORE_TYPES;
  /** Hover tooltips only in browser — native Capacitor uses aria-label only. */
  readonly showTooltips = !Capacitor.isNativePlatform();

  readonly yearModal = signal<number | null>(null);
  readonly gapModal = signal<YearGap | null>(null);
  readonly deleteTarget = signal<ReviewDocumentMeta | null>(null);
  readonly renameTarget = signal<ReviewDocumentMeta | null>(null);
  readonly renameError = signal('');
  readonly previewTarget = signal<ReviewDocumentMeta | null>(null);
  readonly previewUrl = signal<SafeResourceUrl | null>(null);
  readonly previewIsPdf = signal(false);
  private previewObjectUrl: string | null = null;
  readonly dragOver = signal(false);
  readonly fileError = signal('');
  readonly uploading = signal(false);
  readonly uploadLabel = signal('');
  readonly uploadOk = signal('');
  readonly copied = signal(false);
  readonly pensionGuideOpen = signal(false);
  readonly pensionGuide = PENSION_GUIDE;

  docType = 'payslip';
  uploadMonth: number | null = null;
  renameName = '';
  pendingFiles: File[] = [];
  readonly monthOptions = [
    { value: 1, label: 'ינואר' }, { value: 2, label: 'פברואר' }, { value: 3, label: 'מרץ' },
    { value: 4, label: 'אפריל' }, { value: 5, label: 'מאי' }, { value: 6, label: 'יוני' },
    { value: 7, label: 'יולי' }, { value: 8, label: 'אוגוסט' }, { value: 9, label: 'ספטמבר' },
    { value: 10, label: 'אוקטובר' }, { value: 11, label: 'נובמבר' }, { value: 12, label: 'דצמבר' }
  ];

  constructor() {
    addIcons({
      closeOutline, cloudUploadOutline, createOutline, trashOutline,
      downloadOutline, clipboardOutline, printOutline, eyeOutline
    });
  }

  ngOnInit(): void {
    const ids = (this.store.review()?.documents ?? []).map(d => d.id);
    void this.files.hydrate(ids).then(() => this.files.syncPending());
    this.billing.plans().catch(() => undefined);
    if (this.auth.isSignedIn()) this.billing.refresh().catch(() => undefined);
    // A purchase or sign-in since the last refusal means checks can run again.
    if (this.auth.isSignedIn() && this.validation.paywall() === 'signin') this.validation.paywall.set(null);
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

  readonly yearGaps = computed((): YearGap[] => {
    return this.periodYears().map(year => {
      const rows = this.coverageRows(year);
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
    });
  });

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.pensionGuideOpen()) this.closePensionGuide();
    else if (this.renameTarget()) this.cancelRename();
    else if (this.previewTarget()) this.closePreview();
    else if (this.deleteTarget()) this.cancelRemove();
    else if (this.gapModal()) this.gapModal.set(null);
    else if (this.yearModal() != null) this.closeYear();
  }

  openPensionGuide(): void {
    this.pensionGuideOpen.set(true);
  }

  closePensionGuide(): void {
    this.pensionGuideOpen.set(false);
  }

  gapFor(year: number): YearGap | undefined {
    return this.yearGaps().find(g => g.year === year);
  }

  yearCubeLabel(g: YearGap): string {
    if (!g.ok) return `${g.missing.length} חסרים`;
    if (g.hasWaivers) return 'אפשר להמשיך';
    return 'תקין';
  }

  statusBoxTitle(g: YearGap): string {
    if (!g.ok) return 'חסר לשנה הזו';
    if (g.hasWaivers) return 'אפשר להמשיך — חלק מהמסמכים דולגו';
    return 'יש את כל מה שצריך לשנה';
  }

  coverageRows(year: number): { key: string; label: string; where: string; state: 'have' | 'waived' | 'miss' }[] {
    return CORE_TYPES.map(t => ({
      key: t.key,
      label: t.label,
      where: t.where,
      state: this.coverageState(year, t.key)
    }));
  }

  coverageState(year: number, key: string): 'have' | 'waived' | 'miss' {
    if (key === 'payslip') return this.payslipCoverageState(year);
    if (this.typesPresent(year).has(key)) return 'have';
    if (this.store.isWaived(key, year, null)) return 'waived';
    return 'miss';
  }

  coverageMeta(year: number, key: string): string {
    const s = this.coverageState(year, key);
    if (s === 'have') return 'יש';
    if (s === 'waived') return 'דולג';
    return 'חסר';
  }

  private payslipCoverageState(year: number): 'have' | 'waived' | 'miss' {
    if (this.store.isWaived('payslip', year, null)) return 'waived';
    const months = this.monthsInEmploymentYear(year);
    if (!months.length) {
      return this.typesPresent(year).has('payslip') ? 'have' : 'miss';
    }
    const allHave = months.every(m => this.hasPayslipMonth(year, m));
    if (allHave) return 'have';
    const allCovered = months.every(m => this.hasPayslipMonth(year, m) || this.isPayslipMonthWaived(year, m));
    if (allCovered) return 'waived';
    return 'miss';
  }

  hasPayslipMonth(year: number, month: number): boolean {
    return (this.store.review()?.documents ?? []).some(
      d => d.documentType === 'payslip'
        && d.year === year
        && d.month === month
        && d.validationStatus !== 'pending'
        && d.validationStatus !== 'checking'
    );
  }

  isPayslipMonthWaived(year: number, month: number): boolean {
    return this.store.isWaived('payslip', year, month);
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
      return;
    }
    if (this.isPayslipMonthWaived(year, month)) this.store.unwaiveDocument('payslip', year, month);
    else this.store.waiveDocument('payslip', year, month);
  }

  waiveType(year: number, key: string): void {
    this.store.waiveDocument(key, year, null);
  }

  unwaiveType(year: number, key: string): void {
    this.store.unwaiveDocument(key, year, null);
  }

  typesPresent(year: number): Set<string> {
    return new Set(
      (this.store.review()?.documents ?? [])
        .filter(d => d.year === year)
        .map(d => d.documentType)
    );
  }

  docsForYear(year: number): ReviewDocumentMeta[] {
    return (this.store.review()?.documents ?? []).filter(d =>
      d.year === year
      && d.validationStatus !== 'pending'
      && d.validationStatus !== 'checking'
    );
  }

  openYear(year: number): void {
    this.ensurePeriod();
    this.yearModal.set(year);
    this.pendingFiles = [];
    this.uploadMonth = null;
    this.fileError.set('');
    this.uploadOk.set('');
    this.validation.clearBlockMessage();
    this.docType = this.gapFor(year)?.missing[0]?.key ?? 'payslip';
  }

  selectDocType(key: string): void {
    this.docType = key;
  }

  closeYear(): void {
    this.yearModal.set(null);
    this.pendingFiles = [];
    this.uploadMonth = null;
    this.dragOver.set(false);
    this.fileError.set('');
    this.uploadOk.set('');
    this.uploading.set(false);
    this.uploadLabel.set('');
    this.validation.clearBlockMessage();
  }

  onUploadMonth(ev: Event): void {
    const v = (ev.target as HTMLSelectElement).value;
    this.uploadMonth = v ? Number(v) : null;
  }

  openYearFromGap(year: number): void {
    this.gapModal.set(null);
    this.openYear(year);
  }

  onDragOver(ev: DragEvent): void {
    ev.preventDefault();
    this.dragOver.set(true);
  }

  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    this.dragOver.set(false);
    if (this.uploading()) return;
    const files = ev.dataTransfer?.files;
    if (files?.length) this.acceptFiles(Array.from(files));
  }

  onFiles(ev: Event): void {
    if (this.uploading()) return;
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

  labelFor(key: string): string {
    return CORE_TYPES.find(d => d.key === key)?.label
      ?? DOC_CHECKLIST.find(d => d.key === key)?.label
      ?? key;
  }

  async addFiles(year: number): Promise<void> {
    if (!this.pendingFiles.length || this.uploading()) return;
    this.ensurePeriod();
    const queued = [...this.pendingFiles];
    this.pendingFiles = [];
    this.uploadMonth = null;
    this.fileError.set('');
    this.uploadOk.set('');
    this.validation.clearBlockMessage();

    const seenInBatch = new Set<string>();
    let keptCount = 0;
    let waitingCount = 0;
    this.uploading.set(true);
    try {
      for (const file of queued) {
        const key = `${file.name.trim().toLowerCase()}|${file.size}`;
        if (seenInBatch.has(key) || this.validation.isDuplicateFile(year, file)) {
          this.validation.setBlockMessage(this.validation.duplicateFileMessage(file.name));
          continue;
        }
        seenInBatch.add(key);
        if (this.docType === 'form106' && this.hasForm106(year)) {
          this.validation.setBlockMessage(SECOND_FORM106_MSG);
          break;
        }

        this.uploadLabel.set(`בודקים את ${file.name}…`);
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
          fileSize: file.size,
          storageKey: null,
          validationStatus: 'checking',
          validationMessage: 'בודקים את המסמך…'
        });
        await this.files.put(id, file);
        const kept = await this.validation.validateDocument(id, file);
        if (!kept) await this.files.remove(id);
        else {
          keptCount++;
          if (this.store.review()?.documents.find(d => d.id === id)?.validationStatus === 'unavailable') waitingCount++;
          void this.files.syncToServer(id, file, this.docType);
        }
      }
    } finally {
      this.uploading.set(false);
      this.uploadLabel.set('');
    }

    if (keptCount > 0 && !this.validation.blockMessage()) {
      const checked = keptCount - waitingCount;
      // Saved but not checked yet (no credits / server down) is not "checked" — say so.
      this.uploadOk.set(
        waitingCount === 0
          ? (keptCount === 1 ? 'המסמך נבדק ונוסף לרשימה.' : `${keptCount} מסמכים נבדקו ונוספו לרשימה.`)
          : checked === 0
          ? (waitingCount === 1 ? 'המסמך נשמר וממתין לבדיקה.' : `${waitingCount} מסמכים נשמרו וממתינים לבדיקה.`)
          : `${checked} נבדקו, ${waitingCount} נשמרו וממתינים לבדיקה.`
      );
    }
  }

  /** A form 106 already registered for the year (rejected uploads are removed, so anything left counts). */
  private hasForm106(year: number): boolean {
    return (this.store.review()?.documents ?? []).some(d => d.year === year && d.documentType === 'form106');
  }

  monthLabel(month: number): string {
    return this.monthOptions.find(m => m.value === month)?.label ?? String(month);
  }

  openRename(d: ReviewDocumentMeta): void {
    this.renameTarget.set(d);
    this.renameName = d.fileName || d.extractedSummary || '';
    this.renameError.set('');
  }

  onRenameName(ev: Event): void {
    this.renameName = (ev.target as HTMLInputElement).value;
  }

  cancelRename(): void {
    this.renameTarget.set(null);
    this.renameError.set('');
  }

  saveRename(): void {
    const d = this.renameTarget();
    if (!d) return;
    const name = this.renameName.trim();
    if (!name) {
      this.renameError.set('נא להזין שם תצוגה.');
      return;
    }
    this.store.updateDocument(d.id, {
      fileName: name,
      extractedSummary: name
    });
    this.cancelRename();
  }

  async openPreview(d: ReviewDocumentMeta): Promise<void> {
    const file = await this.files.get(d.id);
    if (!file) {
      this.fileError.set('אין קובץ זמין לצפייה במכשיר זה. העלו שוב אם צריך.');
      return;
    }
    this.closePreview();
    const url = URL.createObjectURL(file);
    this.previewObjectUrl = url;
    this.previewIsPdf.set(
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    );
    this.previewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
    this.previewTarget.set(d);
  }

  closePreview(): void {
    this.previewTarget.set(null);
    this.previewUrl.set(null);
    this.previewIsPdf.set(false);
    if (this.previewObjectUrl) {
      URL.revokeObjectURL(this.previewObjectUrl);
      this.previewObjectUrl = null;
    }
  }

  pickReplaceFile(d: ReviewDocumentMeta): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const err = this.validateUploadFile(file);
      if (err) {
        this.fileError.set(err);
        return;
      }
      void this.applyFileReplace(d.id, file);
      this.fileError.set('');
    };
    input.click();
  }

  hasSourceFile(id: string): boolean {
    return this.files.has(id);
  }

  canApplyDetected(d: ReviewDocumentMeta): boolean {
    return d.detectedYear != null
      || d.detectedMonth != null
      || (d.detectedType != null && ['payslip', 'form106', 'pension_report'].includes(d.detectedType));
  }

  /** Manual month only when OCR finished and did not detect a payslip month. */
  needsManualMonth(d: ReviewDocumentMeta): boolean {
    if (d.documentType !== 'payslip' || d.month != null || d.detectedMonth != null) return false;
    const s = d.validationStatus;
    return s === 'mismatch' || s === 'unreadable' || s === 'unavailable' || s === 'manual';
  }

  setManualMonth(d: ReviewDocumentMeta, ev: Event): void {
    const v = (ev.target as HTMLSelectElement).value;
    const month = v ? Number(v) : null;
    if (month == null || month < 1 || month > 12 || d.year == null) return;
    const monthIssue = this.manualMonthIssue(d.year, month, d.id);
    if (monthIssue) {
      (ev.target as HTMLSelectElement).value = '';
      this.validation.setBlockMessage(monthIssue);
      return;
    }
    this.validation.clearBlockMessage();
    this.store.updateDocument(d.id, { month });
    const file = this.files.peek(d.id);
    if (file) {
      void this.validation.validateDocument(d.id, file).then(kept => {
        if (!kept) void this.files.remove(d.id);
      });
      return;
    }
    this.store.updateDocument(d.id, {
      validationStatus: 'manual',
      validationMessage: `חודש נקבע ידנית: ${this.monthLabel(month)}.`,
      parsedOk: false,
      needsManualReview: true
    });
  }

  private manualMonthIssue(year: number, month: number, excludeDocId: string): string | null {
    const months = this.monthsInEmploymentYear(year);
    const label = this.monthLabel(month);
    if (!months.includes(month)) {
      return `העלית תלוש ל־${label}, אבל החודש הזה לא בתקופת העסקה לשנת ${year}.`;
    }
    const alreadyHave = (this.store.review()?.documents ?? []).some(
      d => d.id !== excludeDocId && d.documentType === 'payslip' && d.year === year && d.month === month
    );
    if (alreadyHave) return `העלית תלוש ל־${label}, אבל החודש הזה כבר קיים ברשימה.`;
    if (this.isPayslipMonthWaived(year, month) || this.store.isWaived('payslip', year, null)) {
      return `העלית תלוש ל־${label}, אבל החודש הזה מסומן כדולג — בטלו את הדילוג אם רוצים להעלות.`;
    }
    return null;
  }

  applyDetected(d: ReviewDocumentMeta): void {
    this.validation.applyDetected(d.id);
  }

  confirmManual(d: ReviewDocumentMeta): void {
    this.validation.confirmManual(d.id);
  }

  readonly isArray = Array.isArray;

  revalidate(d: ReviewDocumentMeta): void {
    void this.files.get(d.id).then(file => {
      if (!file) return;
      void this.validation.validateDocument(d.id, file).then(kept => {
        if (!kept) void this.files.remove(d.id);
      });
    });
  }

  private async applyFileReplace(id: string, file: File): Promise<void> {
    await this.files.put(id, file);
    this.store.updateDocument(id, {
      fileName: file.name,
      extractedSummary: file.name,
      source: 'upload',
      parsedOk: false,
      needsManualReview: true,
      storageKey: null,
      validationStatus: 'checking',
      validationMessage: 'בודקים את המסמך…',
      detectedType: null,
      detectedYear: null,
      detectedMonth: null,
      detectedPeriodLabel: null
    });
    const kept = await this.validation.validateDocument(id, file);
    if (!kept) await this.files.remove(id);
    else void this.files.syncToServer(id, file, this.store.review()?.documents.find(d => d.id === id)?.documentType ?? 'payslip');
  }

  private validateUploadFile(file: File): string | null {
    const mimeOk = !file.type || ALLOWED_MIME.test(file.type);
    const extOk = ALLOWED_EXT.test(file.name);
    if (mimeOk || extOk) return null;
    return `לא ניתן להעלות: ${file.name}. רק PDF או תמונה.`;
  }

  askRemove(d: ReviewDocumentMeta): void {
    this.deleteTarget.set(d);
  }

  cancelRemove(): void {
    this.deleteTarget.set(null);
  }

  confirmRemove(): void {
    const d = this.deleteTarget();
    if (!d) return;
    void this.files.remove(d.id);
    this.store.removeDocument(d.id);
    this.deleteTarget.set(null);
  }

  exportMissing(onlyYear?: number): void {
    const built = this.buildExportRows(onlyYear);
    if (!built) return;
    const { rows, onlyYear: y } = built;

    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const bodyRows = rows.map(r => {
      if (!r.year && !r.kind) {
        return `<tr><td colspan="4" style="border-bottom:2px solid #0E7C6B;height:8px;background:#F6F4EF"></td></tr>`;
      }
      const statusColor = r.status.startsWith('קיים') ? '#1a7a3c' : r.status === 'דולג' ? '#5E6F73' : '#c0392b';
      const statusWeight = r.status === 'חסר' ? '700' : '600';
      return `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #E3DED3;text-align:center;white-space:nowrap">${esc(r.year)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E3DED3;text-align:center;white-space:nowrap">${esc(r.kind)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E3DED3;text-align:center;white-space:nowrap">${esc(r.month)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E3DED3;text-align:center;white-space:nowrap;color:${statusColor};font-weight:${statusWeight}">${esc(r.status)}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>מסמכים לפי שנים</title></head>
<body style="font-family:Arial,Helvetica,sans-serif">
<table style="border-collapse:collapse;width:auto;table-layout:auto">
  <colgroup>
    <col style="width:70px" />
    <col style="width:110px" />
    <col style="width:100px" />
    <col style="width:70px" />
  </colgroup>
  <thead>
    <tr>
      <th style="padding:8px 10px;background:#0E7C6B;color:#fff;font-weight:700;text-align:center;white-space:nowrap">שנה</th>
      <th style="padding:8px 10px;background:#0E7C6B;color:#fff;font-weight:700;text-align:center;white-space:nowrap">סוג מסמך</th>
      <th style="padding:8px 10px;background:#0E7C6B;color:#fff;font-weight:700;text-align:center;white-space:nowrap">חודש</th>
      <th style="padding:8px 10px;background:#0E7C6B;color:#fff;font-weight:700;text-align:center;white-space:nowrap">סטטוס</th>
    </tr>
  </thead>
  <tbody>${bodyRows}</tbody>
</table>
</body></html>`;

    this.downloadBlob(
      html,
      'application/vnd.ms-excel;charset=utf-8',
      y != null ? `מסמכים-${y}.xls` : 'מסמכים-לפי-שנים.xls'
    );
  }

  /** רשימה קצרה לוואטסאפ / מייל למעסיק או לקופה. */
  async copyChecklist(): Promise<void> {
    const text = this.buildShareText();
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      window.prompt('העתיקו את הרשימה:', text);
    }
  }

  /** נפתח חלון להדפסה או שמירה כ־PDF מהדפדפן. */
  printChecklist(): void {
    const built = this.buildExportRows();
    if (!built) return;
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const blocks = this.periodYears().map(year => {
      const yearRows = built.rows.filter(r => r.year === String(year));
      const missing = yearRows.filter(r => r.status === 'חסר');
      const waived = yearRows.filter(r => r.status === 'דולג');
      const lines = [
        ...missing.map(r => `<li><b>${esc(r.kind)}</b>${r.month !== '—' ? ` · ${esc(r.month)}` : ''} — חסר</li>`),
        ...waived.map(r => `<li style="color:#5E6F73"><b>${esc(r.kind)}</b>${r.month !== '—' ? ` · ${esc(r.month)}` : ''} — דולג</li>`)
      ].join('') || '<li style="color:#1a7a3c">הכל קיים לשנה זו</li>';
      return `<section style="margin:0 0 18px;page-break-inside:avoid">
        <h2 style="margin:0 0 8px;font-size:18px;border-bottom:2px solid #0E7C6B;padding-bottom:4px">${year}</h2>
        <ul style="margin:0;padding-inline-start:18px;line-height:1.6">${lines}</ul>
      </section>`;
    }).join('');

    const html = `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>רשימת מסמכים חסרים</title>
<style>body{font-family:Arial,Helvetica,sans-serif;padding:24px;color:#0E2229} @media print{button{display:none}}</style>
</head><body>
  <h1 style="margin:0 0 6px">רשימת מסמכים לבדיקת העסקה</h1>
  <p style="color:#5E6F73;margin:0 0 20px">להשלים מול המעסיק / קופת הפנסיה. הערכה בלבד — לא ייעוץ משפטי.${this.store.hasAnyWaiver() ? ' חלק מהמסמכים סומנו כלא הושגו.' : ''}</p>
  ${blocks}
  <script>window.onload=function(){window.print()}</script>
</body></html>`;

    const w = window.open('', '_blank', 'noopener,noreferrer,width=800,height=900');
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  private buildShareText(onlyYear?: number): string {
    const years = this.periodYears().filter(y => onlyYear == null || y === onlyYear);
    const parts = ['רשימת מסמכים לבדיקת העסקה', ''];
    for (const year of years) {
      const g = this.gapFor(year);
      const miss: string[] = [];
      const waived: string[] = [];
      for (const m of this.monthsInEmploymentYear(year)) {
        if (this.hasPayslipMonth(year, m)) continue;
        if (this.isPayslipMonthWaived(year, m)) waived.push(`תלוש ${m}/${year}`);
        else miss.push(`תלוש ${m}/${year}`);
      }
      if (this.coverageState(year, 'form106') === 'miss') miss.push('טופס 106');
      else if (this.coverageState(year, 'form106') === 'waived') waived.push('טופס 106');
      if (this.coverageState(year, 'pension_report') === 'miss') miss.push('דוח פנסיה');
      else if (this.coverageState(year, 'pension_report') === 'waived') waived.push('דוח פנסיה');

      parts.push(`שנת ${year}`);
      if (!miss.length && !waived.length && g?.ok) parts.push('  ✓ הכל קיים');
      else {
        for (const m of miss) parts.push(`  • חסר: ${m}`);
        for (const w of waived) parts.push(`  • דולג (אין לי): ${w}`);
      }
      parts.push('');
    }
    if (this.store.hasAnyWaiver()) {
      parts.push('הערה: חלק מהמסמכים לא הושגו — החישוב מתבסס על מה שקיים.');
      parts.push('');
    }
    parts.push('תודה');
    return parts.join('\n');
  }

  private buildExportRows(onlyYear?: number): { rows: { year: string; kind: string; month: string; status: string }[]; onlyYear?: number } | null {
    const years = this.periodYears().filter(y => onlyYear == null || y === onlyYear);
    if (!years.length) return null;

    const monthName = (m: number) =>
      ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'][m - 1] ?? String(m);

    const rows: { year: string; kind: string; month: string; status: string }[] = [];

    for (const year of years) {
      for (const m of this.monthsInEmploymentYear(year)) {
        let status = 'חסר';
        if (this.hasPayslipMonth(year, m)) status = 'קיים';
        else if (this.isPayslipMonthWaived(year, m)) status = 'דולג';
        rows.push({
          year: String(year),
          kind: 'תלוש שכר',
          month: monthName(m),
          status
        });
      }
      const s106 = this.coverageState(year, 'form106');
      rows.push({
        year: String(year),
        kind: 'טופס 106',
        month: '—',
        status: s106 === 'have' ? 'קיים' : s106 === 'waived' ? 'דולג' : 'חסר'
      });
      const sPen = this.coverageState(year, 'pension_report');
      rows.push({
        year: String(year),
        kind: 'דוח פנסיה',
        month: '—',
        status: sPen === 'have' ? 'קיים' : sPen === 'waived' ? 'דולג' : 'חסר'
      });
      rows.push({ year: '', kind: '', month: '', status: '' });
    }
    if (rows.length && !rows[rows.length - 1].year) rows.pop();
    return { rows, onlyYear };
  }

  /** חודשי העסקה בתוך שנה נתונה (לא 12 אם התחלה/סיום באמצע שנה). */
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

  private downloadBlob(body: string, mime: string, name: string): void {
    const blob = new Blob(['\uFEFF' + body], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  next(): void {
    void this.router.navigateByUrl('/review/check');
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
    this.fileError.set(bad.length
      ? `לא ניתן להעלות: ${bad.join(', ')}. רק PDF או תמונה.`
      : '');
    this.uploadOk.set('');
    this.validation.clearBlockMessage();
    if (!ok.length) return;
    this.pendingFiles = [...this.pendingFiles, ...ok];
    const y = this.yearModal();
    if (y != null) void this.addFiles(y);
  }

  private ensurePeriod(): void {
    if (this.store.review()?.period) return;
    // Never invent a demo 2016–2025 range — send the user to set real dates first.
    void this.router.navigateByUrl('/review/employment');
  }
}
