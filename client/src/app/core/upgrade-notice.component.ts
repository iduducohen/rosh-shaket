import { Component, inject, OnInit } from '@angular/core';
import { DocumentUpgradeService } from './document-upgrade.service';

/**
 * "Updating the reading of your documents": shown while saved documents are read again with the improved reading.
 * Placing it on a page also starts the update, so any step that shows results brings the data up to date.
 */
@Component({
  selector: 'app-upgrade-notice',
  standalone: true,
  styles: [`
    :host { display: block; }
    p {
      margin: 0 0 14px; padding: 10px 14px; border-radius: 12px; font-size: 13.5px; line-height: 1.5;
      border: 1px solid var(--rs-line); background: var(--ion-item-background); color: var(--ion-color-medium-shade, #5E6F73);
    }
    b { color: var(--ion-text-color); }
  `],
  template: `
    @if (upgrade.progress(); as p) {
      <p role="status">
        <b>מעדכנים את הנתונים מהמסמכים שלכם ({{ p.done }} מתוך {{ p.total }})</b>
        המערכת נעשתה מדויקת יותר, ולכן קוראת שוב את הקבצים ששמרתם. זה לא דורש כלום מכם, ולא נספר כמסמך מהחבילה.
      </p>
    }
  `
})
export class UpgradeNoticeComponent implements OnInit {
  protected readonly upgrade = inject(DocumentUpgradeService);

  ngOnInit(): void {
    void this.upgrade.run();
  }
}
