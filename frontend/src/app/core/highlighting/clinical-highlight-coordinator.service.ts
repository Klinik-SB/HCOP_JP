import { Injectable, signal } from '@angular/core';
import {
  CapturedClinicalHighlight,
  ClinicalHighlightAction,
  ClinicalHighlightFeedback,
  ClinicalHighlightFeedbackCode
} from './clinical-highlight.models';

export interface ClinicalHighlightParticipant {
  disabled(): boolean;
  captureSelection(): readonly CapturedClinicalHighlight[];
  perform(action: ClinicalHighlightAction, selections: readonly CapturedClinicalHighlight[]): void;
}

@Injectable({ providedIn: 'root' })
export class ClinicalHighlightCoordinatorService {
  readonly feedback = signal<ClinicalHighlightFeedback | null>(null);
  private readonly participants = new Set<ClinicalHighlightParticipant>();
  private pending: { participant: ClinicalHighlightParticipant; selections: readonly CapturedClinicalHighlight[] } | null = null;
  private feedbackSequence = 0;
  private feedbackTimer: ReturnType<typeof setTimeout> | null = null;

  register(participant: ClinicalHighlightParticipant): () => void {
    this.participants.add(participant);
    return () => {
      this.participants.delete(participant);
      if (this.pending?.participant === participant) this.pending = null;
    };
  }

  captureBeforeAction(): boolean {
    this.pending = this.capture();
    return Boolean(this.pending?.selections.length);
  }

  execute(action: ClinicalHighlightAction): void {
    const captured = this.pending || this.capture();
    this.pending = null;
    if (!captured) {
      this.announce(
        action === 'highlight' ? 'SELECTION_REQUIRED' : 'HIGHLIGHT_REQUIRED',
        action === 'highlight' ? 'Seleccione texto dentro de la historia clinica' : 'Seleccione texto resaltado en amarillo'
      );
      return;
    }
    captured.participant.perform(action, captured.selections);
  }

  announce(code: ClinicalHighlightFeedbackCode, message: string): void {
    const feedback = { id: ++this.feedbackSequence, code, message };
    this.feedback.set(feedback);
    if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
    this.feedbackTimer = setTimeout(() => {
      if (this.feedback()?.id === feedback.id) this.feedback.set(null);
    }, 2_800);
  }

  private capture(): { participant: ClinicalHighlightParticipant; selections: readonly CapturedClinicalHighlight[] } | null {
    const participants = [...this.participants].reverse();
    for (const participant of participants) {
      if (participant.disabled()) continue;
      const selections = participant.captureSelection();
      if (selections.length) return { participant, selections };
    }
    return null;
  }
}
