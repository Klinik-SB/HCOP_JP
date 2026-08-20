import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

/** Conserva el CSS vigente sin ejecutar el JavaScript legacy ni usar iframes. */
@Injectable({ providedIn: 'root' })
export class LegacyVisualContractService {
  private readonly document = inject(DOCUMENT);
  private readonly styleUrls = ['/styles.css', '/care-scheduler.css', '/care-scheduler-modal.css', '/help/help.css'];

  load(): void {
    for (const href of this.styleUrls) {
      const id = `hcop-visual-contract-${href.replaceAll(/[^a-z0-9]+/gi, '-')}`;
      if (this.document.getElementById(id)) continue;
      const link = this.document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = href;
      this.document.head.append(link);
    }
  }
}
