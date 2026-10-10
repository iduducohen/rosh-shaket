import { DecimalPipe } from '@angular/common';
import { PENSION_COVERAGE_KEYS, PensionKind, pensionKindOf } from '../../core/review.models';
import { productsInYear } from '../../core/product-summary';
import { ReadingProblemsComponent } from '../../core/reading-problems.component';
import { findReadingProblems } from '../../core/reading-problems';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton } from '@ionic/angular/standalone';
import { CalculationFacade } from '../../core/calculation.facade';
import { REASON_LABELS, type ExitReason } from '../../core/models';
import { FindingSeverity, explainReview } from '../../core/gap-explainer';
import { ReviewStore } from '../../core/review.store';
import { VacationSeverity, trackVacation } from '../../core/vacation-tracker';
import { WizardStore } from '../../core/wizard.store';
import { ReviewStepNavComponent } from './review-step-nav.component';

const MONTH_LABELS = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

@Component({
  selector: 'app-review-report',
  standalone: true,
  imports: [IonButton, RouterLink, DecimalPipe, ReviewStepNavComponent, ReadingProblemsComponent],
  styles: [`
    .verdict {
      margin: 8px 0 18px; padding: 14px 16px;
      border-inline-start: 4px solid var(--ion-color-primary);
      background: var(--rs-soft, color-mix(in srgb, var(--ion-color-primary) 8%, transparent));
      border-radius: 0 12px 12px 0;
    }
    .verdict .status {
      margin: 0 0 6px; font-size: 22px; font-weight: 800; line-height: 1.25;
      color: var(--ion-color-primary);
    }
    .verdict p { margin: 0; font-size: 14.5px; line-height: 1.45; color: var(--ion-text-color); }
    .verdict .cover {
      display: block; margin-top: 8px; font-size: 13px; color: var(--ion-color-medium);
    }

    .sec { margin: 0 0 22px; }
    .sec h3 {
      margin: 0 0 4px; font-size: 15px; font-weight: 800;
      color: var(--ion-color-primary);
    }
    .sec .lead {
      margin: 0 0 12px; font-size: 13.5px; line-height: 1.4;
      color: var(--ion-color-medium);
    }

    .facts { margin: 0; padding: 0; list-style: none; }
    .facts li {
      display: flex; justify-content: space-between; gap: 12px; align-items: baseline;
      padding: 8px 0; border-bottom: 1px solid var(--rs-line, #e5e5e5);
      font-size: 14.5px;
    }
    .facts li:last-child { border-bottom: 0; }
    .facts .k { color: var(--ion-color-medium); }
    .facts .v { font-weight: 700; text-align: start; }

    .money { margin: 0; padding: 0; list-style: none; }
    .money li {
      display: grid; grid-template-columns: 1fr auto; gap: 4px 16px;
      padding: 10px 0; border-bottom: 1px solid var(--rs-line, #e5e5e5);
    }
    .money li:last-child { border-bottom: 0; }
    .money .k { font-size: 14.5px; font-weight: 700; }
    .money .hint { grid-column: 1 / -1; font-size: 12.5px; color: var(--ion-color-medium); line-height: 1.35; }
    .money .v { font-size: 16px; font-weight: 800; }
    .money .v.warn { color: var(--ion-color-danger); }
    .money .v.muted { color: var(--ion-color-medium); font-weight: 700; }

    .attention {
      margin: 0; padding: 0; list-style: none;
    }
    .attention li {
      position: relative; padding: 8px 0 8px 0; padding-inline-start: 14px;
      font-size: 14px; line-height: 1.45;
      border-bottom: 1px solid var(--rs-line, #e5e5e5);
    }
    .attention li:last-child { border-bottom: 0; }
    .attention li::before {
      content: ''; position: absolute; inset-inline-start: 0; top: 14px;
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--ion-color-warning, #c9a227);
    }
    .ok-note {
      margin: 0 0 6px; font-size: 14px; line-height: 1.45; color: var(--ion-color-medium);
    }
    .ok-note a, .attention a, .estimate a {
      color: var(--ion-color-primary); font-weight: 700; text-decoration: none;
    }
    .ok-note a:hover, .attention a:hover, .estimate a:hover { text-decoration: underline; }

    .estimate .big {
      margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.02em;
    }
    .estimate .sub {
      margin: 4px 0 0; font-size: 13px; color: var(--ion-color-medium); line-height: 1.4;
    }
    .estimate a { display: inline-block; margin-top: 8px; font-size: 13.5px; }

    .exports {
      display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
      margin-top: 8px;
    }
    /* Four equal choices: same size and style, none highlighted. */
    .exports ion-button { margin: 0; min-width: 120px; font-weight: 700; --box-shadow: none; }

    .verdict.sev-serious { border-inline-start-color: var(--ion-color-danger); background: color-mix(in srgb, var(--ion-color-danger) 7%, transparent); }
    .verdict.sev-serious .status { color: var(--ion-color-danger); }
    .verdict.sev-check { border-inline-start-color: var(--rs-warn, #9a6b00); background: var(--rs-warn-bg, #fdf3dc); }
    .verdict.sev-check .status { color: var(--rs-warn, #9a6b00); }
    .verdict p + p { margin-top: 6px; }

    .vac-table { width: 100%; border-collapse: collapse; margin: 12px 0 4px; font-size: 14px; }
    .vac-table th, .vac-table td { padding: 8px 6px; text-align: start; border-bottom: 1px solid var(--rs-line); white-space: nowrap; }
    .vac-table th { font-size: 12.5px; font-weight: 700; color: var(--ion-color-medium); }
    .vac-table td.num, .vac-table th.num { text-align: end; font-variant-numeric: tabular-nums; }
    .vac-table tr.mismatch td { background: color-mix(in srgb, var(--ion-color-danger) 7%, transparent); }
    .vac-table tr.mismatch td.state { color: var(--ion-color-danger); font-weight: 800; }
    .vac-table tr.note td.state { color: var(--rs-warn, #9a6b00); font-weight: 700; }
    .vac-table tr.noData td { color: var(--ion-color-medium); }
    .vac-table tr.why td { white-space: normal; font-size: 13px; line-height: 1.4; color: var(--ion-text-color); border-bottom: 1px solid var(--rs-line); }
    .vac-wrap { overflow-x: auto; }
    .sec > details > summary { cursor: pointer; margin-top: 12px; font-size: 14px; font-weight: 700; color: var(--ion-color-primary); }

    .findings { display: grid; gap: 12px; }
    .finding {
      background: var(--ion-item-background, #fff); border: 1px solid var(--rs-line); border-radius: 14px;
      padding: 14px 16px; border-inline-start: 4px solid var(--rs-line);
    }
    .finding.sev-serious { border-inline-start-color: var(--ion-color-danger); }
    .finding.sev-check { border-inline-start-color: var(--rs-warn, #c9a227); }
    .finding.sev-info { border-inline-start-color: var(--ion-color-primary); }
    .finding header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; }
    .finding h4 { margin: 0; font-size: 15.5px; font-weight: 800; flex: 1 1 240px; }
    .finding .amount { font-size: 16px; white-space: nowrap; }
    .finding .chip { font-size: 12px; font-weight: 800; padding: 2px 9px; border-radius: 20px; background: var(--rs-soft); color: var(--ion-color-primary); }
    .finding.sev-serious .chip { background: color-mix(in srgb, var(--ion-color-danger) 12%, transparent); color: var(--ion-color-danger); }
    .finding.sev-check .chip { background: var(--rs-warn-bg, #fdf3dc); color: var(--rs-warn, #9a6b00); }
    .finding .months { margin: 4px 0 0; font-size: 13px; color: var(--ion-color-medium); }
    .finding .what { margin: 8px 0; font-size: 14.5px; line-height: 1.55; }
    .finding details { margin: 6px 0; font-size: 14px; }
    .finding summary { cursor: pointer; font-weight: 700; color: var(--ion-color-primary); }
    .finding ul { margin: 6px 0 0; padding-inline-start: 20px; line-height: 1.5; }
    .finding .todo { margin-top: 8px; font-size: 14px; }
    .finding .todo a { color: var(--ion-color-primary); font-weight: 700; }

    .why-docs { margin: 10px 0; padding-inline-start: 20px; font-size: 13.5px; line-height: 1.5; color: var(--ion-color-medium); }
    .why-docs b { color: var(--ion-text-color); }

    .expert-cards { display: grid; gap: 10px; }
    @media (min-width: 720px) { .expert-cards { grid-template-columns: 1fr 1fr; } }
    .expert {
      display: grid; gap: 4px; padding: 14px 16px; border-radius: 14px; text-decoration: none; color: inherit;
      border: 1px solid var(--rs-line); background: var(--ion-item-background, #fff);
    }
    .expert:hover { border-color: var(--ion-color-primary); }
    .expert b { color: var(--ion-color-primary); font-size: 15px; }
    .expert span { font-size: 13.5px; color: var(--ion-color-medium); line-height: 1.45; }

    .legal {
      margin: 16px 0 0; font-size: 12.5px; line-height: 1.4;
      color: var(--ion-color-medium);
    }
  `],
  template: `
    <h2>הסיכום שלכם</h2>
    <app-reading-problems [problems]="readingProblems()" />

    @if (a(); as analysis) {
      @if (explanation(); as e) {
        <section [class]="'verdict sev-' + e.headlineSeverity" aria-label="מסקנה">
          <div class="status">{{ e.headline }}</div>
          @for (line of e.story; track line) { <p>{{ line }}</p> }
          <span class="cover">
            נבדקו {{ e.monthsWithPayslip }} מתוך {{ e.monthsWithPayslip + e.monthsWithoutPayslip }} חודשים · כיסוי מידע {{ (analysis.summary.health.coverageRatio * 100) | number:'1.0-0' }}%
          </span>
        </section>

        <section class="sec" aria-label="מה מצאנו">
          <h3>מה מצאנו — ומה זה אומר</h3>
          @if (e.findings.length) {
            <p class="lead">כל ממצא מוסבר: מה ראינו, למה זה יכול לקרות, ומה כדאי לעשות. לא כל פער הוא הפרה — חלק מהפערים מוסברים ומקובלים.</p>
            <div class="findings">
              @for (f of e.findings; track f.id) {
                <article [class]="'finding sev-' + f.severity">
                  <header>
                    <span class="chip">{{ severityLabel(f.severity) }}</span>
                    <h4>{{ f.title }}</h4>
                    @if (f.amount != null) { <b class="amount">{{ store.fmt(f.amount) }}</b> }
                  </header>
                  @if (f.months.length) { <p class="months">{{ f.months.join(' · ') }}</p> }
                  <p class="what">{{ f.what }}</p>
                  <details>
                    <summary>למה זה יכול לקרות?</summary>
                    <ul>@for (w of f.why; track w) { <li>{{ w }}</li> }</ul>
                  </details>
                  <div class="todo">
                    <b>מה לעשות</b>
                    <ul>
                      @for (act of f.actions; track act.text) {
                        <li>{{ act.text }} @if (act.link) { <a [routerLink]="act.link">{{ act.linkLabel }}</a> }</li>
                      }
                    </ul>
                  </div>
                </article>
              }
            </div>
          } @else {
            <p class="ok-note">לא נמצאו פערים בנתונים שיש. עדיין מומלץ לעבור על פירוט ההפקדות. <a routerLink="/review/check">לפירוט הפקדות</a></p>
          }
        </section>

        <section class="sec" aria-label="ימי חופשה">
          <h3>ימי חופשה</h3>
          @if (vacation(); as v) {
            @if (v.hasData) {
              <p class="lead">עקבנו אחרי יתרת ימי החופשה מתלוש לתלוש: היתרה הקודמת, ועוד מה שנצבר, פחות מה שנוצל, צריכה להיות שווה ליתרה שמודפסת.</p>
              <div class="findings">
                @for (f of v.findings; track f.title) {
                  <article [class]="'finding sev-' + vacationSeverity(f.severity)">
                    <header>
                      <span class="chip">{{ severityLabel(vacationSeverity(f.severity)) }}</span>
                      <h4>{{ f.title }}</h4>
                    </header>
                    @if (f.months.length) { <p class="months">{{ f.months.join(' · ') }}</p> }
                    <p class="what">{{ f.text }}</p>
                  </article>
                }
              </div>
              <details>
                <summary>פירוט לפי חודשים</summary>
                <div class="vac-wrap">
                  <table class="vac-table">
                    <thead>
                      <tr><th>חודש</th><th class="num">יתרה קודמת</th><th class="num">נצבר</th><th class="num">נוצל</th><th class="num">יתרה בתלוש</th><th>מצב</th></tr>
                    </thead>
                    <tbody>
                      @for (m of v.months; track m.label) {
                        <tr [class]="m.status">
                          <td>{{ m.label }}</td>
                          <td class="num">{{ dayCell(m.opening) }}</td>
                          <td class="num">{{ dayCell(m.accrued) }}</td>
                          <td class="num">{{ dayCell(m.used) }}</td>
                          <td class="num">{{ dayCell(m.balance) }}</td>
                          <td class="state">{{ vacationState(m.status) }}</td>
                        </tr>
                        @if (m.note) { <tr class="why"><td colspan="6">{{ m.note }}</td></tr> }
                      }
                    </tbody>
                  </table>
                </div>
              </details>
            } @else {
              <p class="ok-note">בתלושים שנבדקו לא מודפסים נתוני ימי חופשה, ולכן אי אפשר לעקוב אחרי היתרה. בקשו מהמעסיק פירוט של ימי החופשה: כמה נצברו, כמה נוצלו ומה היתרה.</p>
            }
            @if (v.notReadCount) {
              <p class="ok-note">{{ v.notReadCount }} תלושים נבדקו לפני שהמערכת קראה ימי חופשה, ולכן הם לא נכללים כאן. כדי לכלול אותם, בדקו אותם מחדש בשלב המסמכים. <a routerLink="/review/documents">למסמכים</a></p>
            }
          }
        </section>

        <section class="sec" aria-label="המספרים">
          <h3>המספרים</h3>
          <p class="lead">סיכום ההפקדות לפנסיה, לפיצויים ולקרן ההשתלמות בחודשים שיש להם תלוש.</p>
          <ul class="money">
            <li>
              <span class="k">היה צריך להיות מופקד</span>
              <span class="v" [class.muted]="analysis.summary.expectedTotal == null">{{ store.fmt(analysis.summary.expectedTotal) }}</span>
              <span class="hint">חישוב שלנו: השכר בכל חודש כפול שיעורי ההפרשה (פנסיה, פיצויים, וקרן השתלמות עד התקרה — אם יש).</span>
            </li>
            <li>
              <span class="k">מופיע בתלושים</span>
              <span class="v" [class.muted]="analysis.summary.reportedTotal == null">{{ store.fmt(analysis.summary.reportedTotal) }}</span>
              <span class="hint">מה שהמעסיק דיווח בתלוש שניכה מהשכר והפריש.</span>
            </li>
            <li>
              <span class="k">ההפרש בין השניים</span>
              <span class="v" [class.warn]="(e.payslipGap ?? 0) > 1" [class.muted]="e.payslipGap == null">{{ store.fmt(e.payslipGap) }}</span>
              <span class="hint">הפירוט וההסבר — למעלה, ב"מה מצאנו".</span>
            </li>
            <li>
              <span class="k">נכנס בפועל לקופות</span>
              <span class="v" [class.muted]="analysis.summary.actualTotal == null">{{ store.fmt(analysis.summary.actualTotal) }}</span>
              <span class="hint">{{ analysis.summary.actualTotal == null ? 'לא ידוע — נדע רק מדוח הפקדות של הקופה.' : 'לפי דוחות הקופה שהועלו.' }}</span>
            </li>
            @if (e.estimatedForMissing != null) {
              <li>
                <span class="k">אומדן לחודשים בלי תלוש</span>
                <span class="v muted">{{ store.fmt(e.estimatedForMissing) }}</span>
                <span class="hint">{{ e.monthsWithoutPayslip }} חודשים · הערכה לפי השכר בשאר החודשים — לא נכללת בהפרש.</span>
              </li>
            }
          </ul>
        </section>
      }

      <section class="sec" aria-label="על התקופה">
        <h3>על התקופה</h3>
        <p class="lead">המעסיק, התקופה וסיבת הסיום שעליהם מבוססת הבדיקה.</p>
        <ul class="facts">
          <li><span class="k">מעסיק</span><span class="v">{{ employer() }}</span></li>
          <li><span class="k">תקופה</span><span class="v">{{ periodLabel() }}</span></li>
          <li><span class="k">סיבת סיום</span><span class="v">{{ reasonLabel() }}</span></li>
        </ul>
      </section>

      <section class="sec" aria-label="מסמכים חסרים">
        <h3>מה חסר — ולמה זה חשוב</h3>
        @if (missingDocs().length) {
          <p class="lead">כל מסמך שמתווסף משפר את הבדיקה:</p>
          <ul class="attention">
            @for (d of missingDocs(); track d) { <li>{{ d }}</li> }
          </ul>
          <ul class="why-docs">
            <li><b>תלוש שכר</b> — מראה מה נוכה מהשכר ומה המעסיק הפריש בכל חודש. בלעדיו החודש לא נבדק.</li>
            <li><b>טופס 106</b> — סיכום שנתי של השכר. עוזר לוודא שלא חסרים תלושים ושהשכר נקרא נכון. הוא לא משנה את חישוב ההפרש.</li>
            <li><b>דוח פנסיה / קופות</b> — הדרך היחידה לדעת שהכסף שדווח בתלוש באמת נכנס לקופה, ומתי.</li>
          </ul>
          <p class="ok-note"><a routerLink="/review/documents">להעלאת מסמכים</a></p>
        } @else {
          <p class="ok-note">כל המסמכים הבסיסיים הועלו או סומנו כלא זמינים.</p>
        }
      </section>

      <section class="sec experts" aria-label="בדיקה עם איש מקצוע">
        <h3>רוצים שמישהו יבדוק לעומק?</h3>
        <p class="lead">הבדיקה כאן היא הערכה. כשיש פער שלא מוסבר, מחלוקת עם המעסיק, או צורך בתביעה — כדאי לפנות לגורם מקצועי. אפשר לקרוא דירוגים והמלצות של משתמשים אחרים ולבחור.</p>
        <div class="expert-cards">
          <a class="expert" routerLink="/help/professionals">
            <b>בודקי שכר ופנסיה</b>
            <span>אנשי מקצוע שבודקים תלושים, הפקדות לפנסיה ולקרן השתלמות, ומכינים דרישה מסודרת מהמעסיק.</span>
          </a>
          <a class="expert" routerLink="/help/lawyers">
            <b>עורכי דין לדיני עבודה</b>
            <span>כשצריך לפנות למעסיק באופן רשמי, לנהל משא ומתן, או להגיש תביעה.</span>
          </a>
        </div>
      </section>

      <section class="sec experts" aria-label="החזר מס">
        <h3>אולי מגיע לכם גם החזר מס?</h3>
        <p class="lead">מי שמסיים לעבוד באמצע השנה שילם לרוב יותר מס הכנסה ממה שמגיע. אפשר לבקש את ההפרש מרשות המסים עד 6 שנים אחורה.</p>
        <div class="expert-cards">
          <a class="expert" routerLink="/tax-refund">
            <b>לבדיקת החזר מס</b>
            <span>הערכה לפי הנתונים שלכם, הנחיות להגשה וקישורים רשמיים.</span>
          </a>
        </div>
      </section>

      @if (ongoing()) {
        <section class="sec" aria-label="בדיקה קבועה">
          <h3>כדאי לבדוק שוב כל כמה חודשים</h3>
          <p class="lead">מעלים את התלושים החדשים ואת דוח ההפקדות העדכני, והבדיקה מתעדכנת עד החודש האחרון.</p>
          <a routerLink="/review/documents">להעלאת מסמכים חדשים</a>
        </section>
      }

      <section class="sec estimate" aria-label="אומדן סיום">
        <h3>{{ ongoing() ? 'מה היה מגיע אם תסיימו היום' : 'מה מגיע בסיום העבודה' }}</h3>
        <p class="lead">{{ ongoing() ? 'הערכה בלבד, לפי השכר האחרון. היא מניחה פיטורים ביום הבדיקה.' : 'מה שהופקד לקופה אינו בהכרח מה שמגיע כפיצויי פיטורים.' }}</p>
        @if (exitTotal() != null) {
          <p class="big">{{ store.fmt(exitTotal()) }}</p>
          <p class="sub">הערכה לפי השכר האחרון וסיבת הסיום.</p>
          <a routerLink="/results/summary">לפירוט הזכויות</a>
        } @else {
          <p class="sub">אפשר לחשב הערכה לפי השכר האחרון שנקרא מהתלושים.</p>
          <ion-button size="small" (click)="runExitEstimate()" [disabled]="exitBusy() || !lastSalary()">חישוב אומדן סיום</ion-button>
        }
      </section>

      @if (sims().length) {
        <details class="sec">
          <summary><b>אומדן צבירה עתידית (רשות)</b></summary>
          <p class="lead">הערכה בלבד, לא תחזית השקעה. מבוסס על ההפקדות הידועות ועל הנחות תשואה ודמי ניהול.</p>
          <ul class="money">
            @for (s of sims(); track s.scenario) {
              <li>
                <span class="k">{{ simLabel(s.scenario) }} · תשואה {{ s.annualReturnPercent }}% · דמי ניהול {{ s.managementFeePercent }}%</span>
                <span class="v">{{ store.fmt(s.estimatedBalance) }}</span>
              </li>
            }
          </ul>
        </details>
      }

      <section class="sec" aria-label="שמירה">
        <h3>שמירה והדפסה</h3>
        <p class="lead">לשמירה אצלכם או לשיתוף עם יועץ — לא חובה להבין את הפורמט.</p>
        <div class="exports">
          <ion-button fill="outline" (click)="dl('html')">הורדת דוח</ion-button>
          <ion-button fill="outline" (click)="print()">הדפסה / PDF</ion-button>
          <ion-button fill="outline" (click)="dl('csv')">CSV</ion-button>
          <ion-button fill="outline" (click)="dl('json')">JSON</ion-button>
        </div>
      </section>

      <p class="legal">הערכה ואומדן בלבד — לא ייעוץ משפטי או פיננסי. חודש בלי מידע מוצג כ״לא ידוע״, לא כ־0.</p>
    } @else {
      <p class="ok-note">עדיין אין ניתוח. חזרו לשלבים הקודמים והריצו ניתוח.</p>
    }

    <app-review-step-nav [nextLabel]="null" />
  `
})
export class ReviewReportPage implements OnInit {
  readonly store = inject(ReviewStore);
  private readonly wizard = inject(WizardStore);
  private readonly calc = inject(CalculationFacade);

  readonly a = computed(() => this.store.analysis());

  /** Conclusions in plain words: every gap with its likely cause and what to do about it. */
  readonly explanation = computed(() => {
    const analysis = this.a();
    const review = this.store.review();
    return analysis && review ? explainReview(review, analysis) : null;
  });

  /** The vacation-days balance followed from payslip to payslip, with the months that do not add up. */
  readonly vacation = computed(() => {
    const review = this.store.review();
    if (!review?.period) return null;
    const payslips = review.documents
      .filter(d => d.documentType === 'payslip' && d.validationStatus === 'ok' && d.year != null && d.month != null)
      .map(d => ({ year: d.year!, month: d.month!, vacation: d.extractedVacation }));
    if (!payslips.length) return null;
    return trackVacation({
      payslips,
      startDate: review.period.startDate,
      endDate: review.period.endDate,
      salaryFor: (year, month) => review.months.find(m => m.year === year && m.month === month)?.grossSalary ?? null
    });
  });

  vacationSeverity(s: VacationSeverity): FindingSeverity {
    return s === 'warn' ? 'check' : s;
  }

  vacationState(status: string): string {
    return status === 'mismatch' ? 'לא מסתדר' : status === 'note' ? 'לבדוק' : status === 'noData' ? 'אין נתונים' : 'תקין';
  }

  dayCell(value: number | null): string {
    return value == null ? '—' : String(Math.round(value * 100) / 100);
  }

  severityLabel(s: FindingSeverity): string {
    return s === 'serious' ? 'חשוב לבדוק' : s === 'check' ? 'כדאי לבדוק' : s === 'info' ? 'לידיעה' : 'תקין';
  }

  readonly employer = computed(() => this.store.review()?.period?.employerName?.trim() || 'לא צוין');

  readonly periodLabel = computed(() => {
    const p = this.store.review()?.period;
    if (!p?.startDate || !p?.endDate) return '—';
    return `${this.fmtDate(p.startDate)} – ${this.fmtDate(p.endDate)}`;
  });

  readonly reasonLabel = computed(() => {
    const raw = this.store.review()?.period?.exitReason;
    if (!raw) return '—';
    if (raw === 'Ongoing') return 'עדיין עובד/ת';
    return REASON_LABELS[raw as ExitReason] ?? raw;
  });

  /** Still working there: the report is a regular check, not a settlement. */
  readonly ongoing = computed(() => this.store.review()?.period?.exitReason === 'Ongoing');

  /** Files whose lines were read only in part: the summary below leans on them. */
  readonly readingProblems = computed(() => findReadingProblems(this.store.review()?.documents ?? []));

  readonly sims = computed(() => this.a()?.simulations ?? []);
  readonly exitTotal = computed(() => this.wizard.active()?.estimatedTotal ?? null);
  readonly exitBusy = signal(false);
  readonly lastSalary = computed(() =>
    [...(this.store.review()?.months ?? [])].reverse().find(m => m.grossSalary != null)?.grossSalary ?? null
  );

  readonly missingDocs = computed(() => {
    const r = this.store.review();
    if (!r?.period) return [] as string[];
    const has = (type: string, year: number, month?: number) =>
      r.documents.some(d => d.documentType === type && d.year === year && (month == null || d.month === month));
    const years = [...new Set(r.months.map(m => m.year))].sort((a, b) => a - b);
    const out: string[] = [];
    for (const y of years) {
      const months = r.months.filter(m => m.year === y && !has('payslip', y, m.month) && !this.store.isWaived('payslip', y, m.month));
      if (months.length) out.push(`תלושי שכר ${y}: ${months.map(m => MONTH_LABELS[m.month]).join(', ')}`);
      // Form 106 for year Y is issued by end of March Y+1.
      const form106Due = new Date() > new Date(y + 1, 2, 31);
      if (form106Due && !has('form106', y) && !this.store.isWaived('form106', y)) out.push(`טופס 106 לשנת ${y}`);
      const hasPension = (kind: PensionKind) =>
        r.documents.some(d => d.documentType === 'pension_report' && d.year === y && pensionKindOf(d) === kind);
      const pensionWaived = (kind: PensionKind) =>
        this.store.isWaived(PENSION_COVERAGE_KEYS[kind], y) || this.store.isWaived('pension_report', y);
      if (form106Due && !hasPension('annual') && !pensionWaived('annual')) out.push(`דוח שנתי מפורט לעמיתים לשנת ${y}`);
      if (!hasPension('deposits') && !pensionWaived('deposits')) out.push(`דוח הפקדות לשנת ${y}`);
      // A report for each other product the payslips of the year show.
      const products = productsInYear(r.documents, y);
      if (products.managers && !hasPension('managers') && !pensionWaived('managers')) out.push(`דוח ביטוח מנהלים לשנת ${y}`);
      if (products.study && !hasPension('study') && !pensionWaived('study')) out.push(`דוח קרן השתלמות לשנת ${y}`);
    }
    return out;
  });

  async ngOnInit(): Promise<void> {
    // Same order as the check step: fresh expected deposits (current rules), then a fresh analysis.
    try {
      await this.store.fillExpectedFromServer();
    } catch {
      // Rules endpoint down — analyse what is stored.
    }
    await this.store.analyze();
  }

  async dl(format: 'html' | 'csv' | 'json'): Promise<void> {
    await this.store.downloadReport(format);
  }

  print(): void {
    window.print();
  }

  simLabel(s: string): string {
    return s === 'Conservative' ? 'שמרני' : s === 'Optimistic' ? 'אופטימי' : 'בסיס';
  }

  async runExitEstimate(): Promise<void> {
    const p = this.store.review()?.period;
    const salary = this.lastSalary();
    if (!p || !salary) return;
    this.exitBusy.set(true);
    try {
      const reason = (['Fired', 'Resigned', 'ResignedJustified', 'ContractEnded'] as const)
        .find(x => x === p.exitReason) ?? 'Fired';
      this.wizard.choice.set(reason);
      // For someone still working the estimate is for finishing today.
      const end = this.ongoing() ? new Date().toISOString().slice(0, 10) : p.endDate;
      this.wizard.profile.set({ ...this.wizard.profile(), startDate: p.startDate, endDate: end, monthlySalary: salary });
      await this.calc.calculate();
    } finally {
      this.exitBusy.set(false);
    }
  }

  private fmtDate(iso: string): string {
    const [y, m, d] = iso.split('-');
    if (!y || !m || !d) return iso;
    return `${d}/${m}/${y}`;
  }
}
