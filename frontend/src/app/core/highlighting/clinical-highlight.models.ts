import type { ClinicalState } from '../patients/patient-workspace.models';

export type ClinicalHighlightAction = 'highlight' | 'remove';
export type ClinicalHighlightKind = 'record' | 'section';
export type ClinicalHighlightFeedbackCode =
  | 'SELECTION_REQUIRED'
  | 'HIGHLIGHT_REQUIRED'
  | 'DUPLICATE'
  | 'NOT_FOUND'
  | 'ADDED'
  | 'REMOVED'
  | 'SAVE_PENDING'
  | 'SAVE_FAILED';

export interface ClinicalTextHighlight {
  readonly id: string;
  readonly kind: ClinicalHighlightKind;
  readonly recordType: string;
  readonly recordId: string;
  readonly sectionKey: string;
  readonly start: number;
  readonly end: number;
  readonly exact: string;
  readonly prefix: string;
  readonly suffix: string;
  readonly color: 'yellow';
  readonly createdAt: string;
  readonly removedAt: string;
}

export interface CapturedClinicalHighlight extends ClinicalTextHighlight {
  readonly removeIds: readonly string[];
}

export interface ClinicalHighlightFeedback {
  readonly id: number;
  readonly code: ClinicalHighlightFeedbackCode;
  readonly message: string;
}

export interface ClinicalHighlightActionResult {
  readonly action: ClinicalHighlightAction;
  readonly code: ClinicalHighlightFeedbackCode;
  readonly message: string;
  readonly changed: boolean;
  readonly added: number;
  readonly removed: number;
  readonly highlights: readonly ClinicalTextHighlight[];
  readonly state: ClinicalState;
}

/** Evento transaccional que permite confirmar o revertir la proyección DOM. */
export interface ClinicalHighlightMutation extends ClinicalHighlightActionResult {
  readonly changed: true;
  commit(): void;
  rollback(): void;
}

export interface ClinicalHighlightRange {
  readonly start: number;
  readonly end: number;
  readonly id: string;
}

export interface MergedClinicalHighlightRange {
  readonly start: number;
  readonly end: number;
  readonly ids: readonly string[];
}
