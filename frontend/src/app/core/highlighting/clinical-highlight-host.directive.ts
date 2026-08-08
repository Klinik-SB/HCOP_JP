import { DOCUMENT } from '@angular/common';
import {
  AfterViewInit,
  Directive,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  inject
} from '@angular/core';
import type { ClinicalState } from '../patients/patient-workspace.models';
import { ClinicalHighlightCoordinatorService, ClinicalHighlightParticipant } from './clinical-highlight-coordinator.service';
import { captureClinicalHighlightSelection, clearRenderedClinicalHighlights, renderClinicalHighlights } from './clinical-highlight.dom';
import { applyClinicalHighlightAction, clinicalHighlightsFromState } from './clinical-highlight.engine';
import {
  CapturedClinicalHighlight,
  ClinicalHighlightAction,
  ClinicalHighlightFeedback,
  ClinicalHighlightMutation,
  ClinicalTextHighlight
} from './clinical-highlight.models';

@Directive({ selector: '[hcopClinicalHighlightHost]', exportAs: 'hcopClinicalHighlightHost' })
export class ClinicalHighlightHostDirective implements OnInit, OnChanges, AfterViewInit, OnDestroy, ClinicalHighlightParticipant {
  @Input({ alias: 'hcopClinicalHighlightHost', required: true }) state: ClinicalState | null = null;
  @Input() hcopClinicalHighlightDisabled = false;
  @Output() readonly hcopClinicalHighlightMutation = new EventEmitter<ClinicalHighlightMutation>();
  @Output() readonly hcopClinicalHighlightFeedback = new EventEmitter<ClinicalHighlightFeedback>();

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private readonly coordinator = inject(ClinicalHighlightCoordinatorService);
  private unregister: (() => void) | null = null;
  private renderQueued = false;
  private destroyed = false;
  private mutationSequence = 0;
  private optimisticHighlights: readonly ClinicalTextHighlight[] | null = null;
  private patientId = '';

  ngOnInit(): void {
    this.unregister = this.coordinator.register(this);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['state']) {
      const nextPatientId = String(this.state?.patient?.id || '');
      if (this.patientId && nextPatientId !== this.patientId) this.optimisticHighlights = null;
      this.patientId = nextPatientId;
    }
    this.scheduleRender();
  }

  ngAfterViewInit(): void {
    this.scheduleRender();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.unregister?.();
    this.unregister = null;
    clearRenderedClinicalHighlights(this.element.nativeElement);
  }

  disabled(): boolean {
    return this.hcopClinicalHighlightDisabled || !this.state;
  }

  captureSelection(): readonly CapturedClinicalHighlight[] {
    if (this.disabled()) return [];
    const selection = this.document.defaultView?.getSelection() || null;
    return captureClinicalHighlightSelection(
      this.element.nativeElement,
      selection,
      this.optimisticHighlights || clinicalHighlightsFromState(this.state)
    );
  }

  perform(action: ClinicalHighlightAction, selections: readonly CapturedClinicalHighlight[]): void {
    if (this.disabled() || !this.state) return;
    if (this.optimisticHighlights) {
      this.publishFeedback('SAVE_PENDING', 'Espere a que termine el guardado de la historia');
      return;
    }
    const result = applyClinicalHighlightAction(this.state, action, selections);
    this.publishFeedback(result.code, result.message);
    if (!result.changed) return;

    const token = ++this.mutationSequence;
    this.optimisticHighlights = result.highlights;
    this.scheduleRender();
    let settled = false;
    const settle = (commit: boolean): void => {
      if (settled) return;
      settled = true;
      if (this.mutationSequence !== token) return;
      this.optimisticHighlights = null;
      if (!commit) this.publishFeedback('SAVE_FAILED', 'No se pudo guardar el resaltado');
      this.scheduleRender();
    };
    this.hcopClinicalHighlightMutation.emit({
      ...result,
      changed: true,
      commit: () => settle(true),
      rollback: () => settle(false)
    });
  }

  private publishFeedback(code: ClinicalHighlightFeedback['code'], message: string): void {
    this.coordinator.announce(code, message);
    const feedback = this.coordinator.feedback();
    if (feedback) this.hcopClinicalHighlightFeedback.emit(feedback);
  }

  private scheduleRender(): void {
    if (this.renderQueued || this.destroyed) return;
    this.renderQueued = true;
    queueMicrotask(() => {
      this.renderQueued = false;
      if (this.destroyed) return;
      renderClinicalHighlights(
        this.element.nativeElement,
        this.optimisticHighlights || clinicalHighlightsFromState(this.state)
      );
    });
  }
}
