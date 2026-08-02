import type { ClinicalState } from './patient-workspace.models';

export type ClinicalSaveErrorCode =
  | 'ACTIVE_PATIENT_REQUIRED'
  | 'CLINICAL_REVISION_REQUIRED'
  | 'CLINICAL_PATIENT_MISMATCH'
  | 'VERSION_CONFLICT'
  | 'PENDING_CLINICAL_CONFLICT'
  | 'CLINICAL_SAVE_IN_PROGRESS'
  | 'CLINICAL_CONTEXT_TRANSITION_IN_PROGRESS'
  | string;

export interface ClinicalSaveConflictDraft {
  readonly patientId: string;
  readonly baseRevision: number;
  readonly baseState: ClinicalState;
  readonly attemptedState: ClinicalState;
  readonly code: ClinicalSaveErrorCode;
  readonly message: string;
  readonly detectedAt: string;
}

export class ClinicalSaveFailure extends Error {
  constructor(
    message: string,
    readonly code: ClinicalSaveErrorCode = '',
    readonly status = 0
  ) {
    super(message);
    this.name = 'ClinicalSaveFailure';
  }
}

export function clinicalSaveFailure(error: unknown, fallback: string): ClinicalSaveFailure {
  if (error instanceof ClinicalSaveFailure) return error;
  const candidate = error as {
    status?: unknown;
    message?: unknown;
    error?: { error?: unknown; code?: unknown; status?: unknown };
  };
  const code = text(candidate?.error?.code);
  const status = positiveInteger(candidate?.status) || positiveInteger(candidate?.error?.status);
  const serverMessage = text(candidate?.error?.error);
  const message = friendlyMessage(code) || serverMessage || text(candidate?.message) || fallback;
  return new ClinicalSaveFailure(message, code, status);
}

export function clinicalConflictCode(failure: ClinicalSaveFailure): ClinicalSaveErrorCode {
  if (failure.status !== 409) return '';
  return failure.code || 'UNKNOWN_CLINICAL_CONFLICT';
}

export function clinicalTransitionBlockCode(
  conflict: ClinicalSaveConflictDraft | null,
  targetPatientId: string | null,
  saving: boolean,
  transitioning = false
): ClinicalSaveErrorCode {
  if (saving) return 'CLINICAL_SAVE_IN_PROGRESS';
  if (transitioning) return 'CLINICAL_CONTEXT_TRANSITION_IN_PROGRESS';
  if (conflict && targetPatientId !== conflict.patientId) return 'PENDING_CLINICAL_CONFLICT';
  return '';
}

export function captureClinicalSaveConflict(
  patientId: string,
  baseRevision: number,
  baseState: ClinicalState,
  attemptedState: ClinicalState,
  detectedAt = new Date().toISOString(),
  code: ClinicalSaveErrorCode = 'VERSION_CONFLICT',
  message = friendlyMessage(code) || 'El guardado entró en conflicto y el borrador quedó conservado.'
): ClinicalSaveConflictDraft {
  return {
    patientId,
    baseRevision,
    baseState: structuredClone(baseState),
    attemptedState: structuredClone(attemptedState),
    code,
    message,
    detectedAt
  };
}

function friendlyMessage(code: string): string {
  if (code === 'VERSION_CONFLICT') {
    return 'Otra persona modificó esta historia. El borrador quedó conservado y no se sobrescribió ningún dato.';
  }
  if (code === 'ACTIVE_PATIENT_REQUIRED') return 'Abra nuevamente el paciente antes de guardar.';
  if (code === 'CLINICAL_REVISION_REQUIRED') return 'La historia no tiene una revisión válida. Recargue el paciente.';
  if (code === 'CLINICAL_PATIENT_MISMATCH') return 'El borrador pertenece a otro paciente y no fue guardado.';
  if (code === 'PENDING_CLINICAL_CONFLICT') {
    return 'Hay un borrador en conflicto pendiente. Recargue la historia antes de intentar otro guardado.';
  }
  if (code === 'CLINICAL_SAVE_IN_PROGRESS') return 'Hay un guardado clínico en curso. Espere a que termine.';
  if (code === 'CLINICAL_CONTEXT_TRANSITION_IN_PROGRESS') return 'El contexto del paciente se está actualizando. Espere a que termine.';
  if (code === 'UNKNOWN_CLINICAL_CONFLICT') {
    return 'El servidor informó un conflicto no clasificado. El borrador quedó conservado.';
  }
  return '';
}

function positiveInteger(value: unknown): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
