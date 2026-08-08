import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ClinicalHighlightCoordinatorService } from '../../core/highlighting/clinical-highlight-coordinator.service';

@Component({
  selector: 'app-clinical-highlight-feedback',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast" [class.show]="coordinator.feedback()" role="status" aria-live="polite" aria-atomic="true">
      {{ coordinator.feedback()?.message || '' }}
    </div>
  `
})
export class ClinicalHighlightFeedbackComponent {
  readonly coordinator = inject(ClinicalHighlightCoordinatorService);
}
