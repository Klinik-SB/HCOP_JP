import type { ClinicalState } from '../patients/patient-workspace.models';
import {
  SingleNarrativeEditConfig,
  applyStructuredSingleNarrativeEdit,
  singleNarrativeBaseline,
  supportsStructuredSingleNarrativeEdit
} from './clinical-single-narrative-edit-engine';

export const CLINICAL_CURRENT_ILLNESS_TEXT_LIMIT = 50_000;

export type ClinicalCurrentIllnessEditErrorCode =
  | 'STRUCTURED_CURRENT_ILLNESS_UNSUPPORTED'
  | 'EMPTY_CURRENT_ILLNESS'
  | 'CURRENT_ILLNESS_TOO_LONG'
  | 'REASON_REQUIRED'
  | 'REASON_TOO_LONG'
  | 'NO_CHANGES';

export interface ClinicalCurrentIllnessActor {
  readonly userId: string | number;
  readonly username: string;
  readonly displayName: string;
  readonly licenseNumber: string;
}

export interface ClinicalCurrentIllnessBaseline {
  readonly currentIllness: string;
  readonly initial: boolean;
}

export interface StructuredCurrentIllnessEdit {
  readonly currentIllness: string;
  readonly reason?: string;
  readonly at?: string;
  readonly id?: string;
  readonly actor: ClinicalCurrentIllnessActor;
}

export class ClinicalCurrentIllnessEditError extends Error {
  constructor(
    readonly code: ClinicalCurrentIllnessEditErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ClinicalCurrentIllnessEditError';
  }
}

const CURRENT_ILLNESS_CONFIG = {
  sectionKey: 'currentIllness',
  narrativeKey: 'currentIllness',
  versionIdPrefix: 'sec-currentIllness',
  textLimit: CLINICAL_CURRENT_ILLNESS_TEXT_LIMIT,
  errors: {
    unsupported: 'STRUCTURED_CURRENT_ILLNESS_UNSUPPORTED',
    empty: 'EMPTY_CURRENT_ILLNESS',
    tooLong: 'CURRENT_ILLNESS_TOO_LONG',
    reasonRequired: 'REASON_REQUIRED',
    reasonTooLong: 'REASON_TOO_LONG',
    noChanges: 'NO_CHANGES'
  },
  messages: {
    unsupported: 'Esta historia conserva el editor de texto compatible con su formato anterior.',
    empty: 'Complete los antecedentes de enfermedad actual.',
    reasonRequired: 'Indique el motivo de la modificación.',
    noChanges: 'No hay cambios para guardar.',
    valueLabel: 'El texto de antecedentes de enfermedad actual',
    reasonLabel: 'El motivo de la modificación'
  },
  createError: (code, message) => new ClinicalCurrentIllnessEditError(code, message)
} satisfies SingleNarrativeEditConfig<ClinicalCurrentIllnessEditErrorCode>;

/** Reproduce la decisión de compatibilidad del editor estructurado legacy. */
export function supportsStructuredCurrentIllness(state: ClinicalState): boolean {
  return supportsStructuredSingleNarrativeEdit(state, CURRENT_ILLNESS_CONFIG);
}

export function currentIllnessBaseline(state: ClinicalState): ClinicalCurrentIllnessBaseline {
  const baseline = singleNarrativeBaseline(state, CURRENT_ILLNESS_CONFIG);
  return { currentIllness: baseline.value, initial: baseline.initial };
}

/** Alias explícito para consumidores de editores clínicos estructurados. */
export const structuredCurrentIllnessBaseline = currentIllnessBaseline;

/**
 * Aplica una edición pura e inmutable de Antecedentes de enfermedad actual.
 * `meta.sectionChangeRequests.currentIllness` es el comando transitorio que
 * el backend consume para construir la auditoría canónica.
 */
export function applyStructuredCurrentIllnessEdit(
  state: ClinicalState,
  edit: StructuredCurrentIllnessEdit
): ClinicalState {
  return applyStructuredSingleNarrativeEdit(state, {
    value: edit.currentIllness,
    reason: edit.reason,
    at: edit.at,
    id: edit.id,
    actor: edit.actor
  }, CURRENT_ILLNESS_CONFIG);
}
