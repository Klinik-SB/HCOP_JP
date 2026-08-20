import type { ClinicalState } from '../patients/patient-workspace.models';
import {
  SingleNarrativeEditConfig,
  applyStructuredSingleNarrativeEdit,
  singleNarrativeBaseline,
  supportsStructuredSingleNarrativeEdit
} from './clinical-single-narrative-edit-engine';

export const CLINICAL_CHIEF_COMPLAINT_TEXT_LIMIT = 50_000;

export type ClinicalChiefComplaintEditErrorCode =
  | 'STRUCTURED_CHIEF_COMPLAINT_UNSUPPORTED'
  | 'EMPTY_CHIEF_COMPLAINT'
  | 'CHIEF_COMPLAINT_TOO_LONG'
  | 'REASON_REQUIRED'
  | 'REASON_TOO_LONG'
  | 'NO_CHANGES';

export interface ClinicalChiefComplaintActor {
  readonly userId: string | number;
  readonly username: string;
  readonly displayName: string;
  readonly licenseNumber: string;
}

export interface ClinicalChiefComplaintBaseline {
  readonly chiefComplaint: string;
  readonly initial: boolean;
}

export interface StructuredChiefComplaintEdit {
  readonly chiefComplaint: string;
  readonly reason?: string;
  readonly at?: string;
  readonly id?: string;
  readonly actor: ClinicalChiefComplaintActor;
}

export class ClinicalChiefComplaintEditError extends Error {
  constructor(
    readonly code: ClinicalChiefComplaintEditErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ClinicalChiefComplaintEditError';
  }
}

const CHIEF_COMPLAINT_CONFIG = {
  sectionKey: 'chiefComplaint',
  narrativeKey: 'chiefComplaint',
  versionIdPrefix: 'sec-chiefComplaint',
  textLimit: CLINICAL_CHIEF_COMPLAINT_TEXT_LIMIT,
  errors: {
    unsupported: 'STRUCTURED_CHIEF_COMPLAINT_UNSUPPORTED',
    empty: 'EMPTY_CHIEF_COMPLAINT',
    tooLong: 'CHIEF_COMPLAINT_TOO_LONG',
    reasonRequired: 'REASON_REQUIRED',
    reasonTooLong: 'REASON_TOO_LONG',
    noChanges: 'NO_CHANGES'
  },
  messages: {
    unsupported: 'Esta historia conserva el editor de texto compatible con su formato anterior.',
    empty: 'Complete el motivo de consulta.',
    reasonRequired: 'Indique el motivo de la modificación.',
    noChanges: 'No hay cambios para guardar.',
    valueLabel: 'El motivo de consulta',
    reasonLabel: 'El motivo de la modificación'
  },
  createError: (code, message) => new ClinicalChiefComplaintEditError(code, message)
} satisfies SingleNarrativeEditConfig<ClinicalChiefComplaintEditErrorCode>;

/** Reproduce la decisión de compatibilidad del editor estructurado legacy. */
export function supportsStructuredChiefComplaint(state: ClinicalState): boolean {
  return supportsStructuredSingleNarrativeEdit(state, CHIEF_COMPLAINT_CONFIG);
}

export function chiefComplaintBaseline(state: ClinicalState): ClinicalChiefComplaintBaseline {
  const baseline = singleNarrativeBaseline(state, CHIEF_COMPLAINT_CONFIG);
  return { chiefComplaint: baseline.value, initial: baseline.initial };
}

/** Alias explícito para consumidores de editores clínicos estructurados. */
export const structuredChiefComplaintBaseline = chiefComplaintBaseline;

/**
 * Aplica una edición pura e inmutable de Motivo de consulta.
 * `meta.sectionChangeRequests.chiefComplaint` es el comando transitorio que
 * el backend consume para construir la auditoría canónica.
 */
export function applyStructuredChiefComplaintEdit(
  state: ClinicalState,
  edit: StructuredChiefComplaintEdit
): ClinicalState {
  return applyStructuredSingleNarrativeEdit(state, {
    value: edit.chiefComplaint,
    reason: edit.reason,
    at: edit.at,
    id: edit.id,
    actor: edit.actor
  }, CHIEF_COMPLAINT_CONFIG);
}
