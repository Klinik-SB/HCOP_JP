import { Directive, ElementRef, HostListener, Input, inject } from '@angular/core';
import { ClinicalHighlightCoordinatorService } from './clinical-highlight-coordinator.service';
import { ClinicalHighlightAction } from './clinical-highlight.models';

@Directive({ selector: '[hcopClinicalHighlightAction]' })
export class ClinicalHighlightActionDirective {
  @Input({ alias: 'hcopClinicalHighlightAction', required: true }) action!: ClinicalHighlightAction;

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly coordinator = inject(ClinicalHighlightCoordinatorService);

  @HostListener('pointerdown', ['$event'])
  captureBeforeClick(event: PointerEvent): void {
    if (this.blocked()) return;
    this.coordinator.captureBeforeAction();
    event.preventDefault();
  }

  @HostListener('click', ['$event'])
  execute(event: MouseEvent): void {
    if (this.blocked()) return;
    event.preventDefault();
    this.coordinator.execute(this.action);
  }

  private blocked(): boolean {
    const element = this.element.nativeElement;
    return element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true';
  }
}
