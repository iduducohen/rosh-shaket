import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ReadingProblem } from './reading-problems';

/**
 * "Some lines were not read": tells the person which file, what was missing and what to do about it.
 * On the documents step the button re-checks in place. On the other steps it is a link that opens that file there.
 */
@Component({
  selector: 'app-reading-problems',
  standalone: true,
  imports: [RouterLink],
  styles: [`
    :host { display: block; }
    section {
      margin: 0 0 16px; padding: 12px 14px; border-radius: 12px; font-size: 13.5px; line-height: 1.55;
      border: 1.5px solid color-mix(in srgb, var(--ion-color-warning, #d8a400) 70%, var(--rs-line));
      background: color-mix(in srgb, var(--ion-color-warning, #d8a400) 10%, var(--ion-item-background));
    }
    h3 { margin: 0 0 4px; font-size: 15px; font-weight: 800; }
    p { margin: 0 0 8px; color: var(--ion-color-medium-shade, #5E6F73); }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; padding-top: 8px; border-top: 1px solid var(--rs-line); }
    li:first-child { border-top: 0; padding-top: 0; }
    .what { flex: 1 1 260px; min-width: 0; }
    .what b { display: block; }
    button, a {
      flex: none; font: inherit; font-weight: 700; cursor: pointer; border-radius: 8px; padding: 5px 12px;
      border: 1.5px solid var(--ion-color-primary); background: var(--ion-item-background); color: var(--ion-color-primary);
      text-decoration: none;
    }
    button:hover, a:hover { background: var(--ion-color-primary); color: var(--ion-color-primary-contrast); }
  `],
  template: `
    @if (problems().length) {
      <section role="status" aria-label="שורות שלא נקראו">
        <h3>{{ problems().length === 1 ? 'קובץ אחד לא נקרא עד הסוף' : problems().length + ' קבצים לא נקראו עד הסוף' }}</h3>
        <p>
          חלק מהשורות בקבצים האלה לא נקראו. עד שזה יסתדר, ייתכן שתראו חוסר הפרשה שהוא למעשה בעיית קריאה.
          בדיקה מחדש לוקחת כמה שניות ומשתמשת במסמך נוסף מהחבילה. אם אחרי בדיקה מחדש השורה עדיין חסרה, כדאי לבדוק את הקובץ עצמו.
        </p>
        <ul>
          @for (p of problems(); track p.docId) {
            <li>
              <span class="what"><b>{{ p.where }}</b>{{ p.text }}</span>
              @if (inline()) {
                <button type="button" (click)="recheck.emit(p.docId)">בדיקה מחדש</button>
              } @else {
                <a routerLink="/review/documents" [queryParams]="{ fix: p.docId }">לבדיקה מחדש</a>
              }
            </li>
          }
        </ul>
      </section>
    }
  `
})
export class ReadingProblemsComponent {
  readonly problems = input.required<ReadingProblem[]>();
  /** True on the documents step: the button re-checks right there. */
  readonly inline = input(false);
  readonly recheck = output<string>();
}
