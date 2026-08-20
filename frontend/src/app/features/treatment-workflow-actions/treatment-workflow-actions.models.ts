export const TREATMENT_WORKFLOW_PERMISSIONS = {
  suspend: 'workflow.suspend',
  resume: 'workflow.resume',
  requestPrescription: 'workflow.request-prescription',
  requestContinuity: 'workflow.request-continuity'
} as const;

export type TreatmentWorkflowAction =
  | 'suspend'
  | 'postpone'
  | 'request-prescription'
  | 'request-continuity'
  | 'resume';

export type TreatmentWorkflowStatus = 'active' | 'temporary_hold' | 'discontinued';
export type TreatmentPrescriptionState = 'required' | 'requested' | 'confirmed' | 'rejected';
export type TreatmentResumeFlow = 'needs-prescription' | 'waiting' | 'ready' | '';

export interface TreatmentWorkflowTreatment {
  patientId: string | number;
  treatmentId: string | number;
  patientName?: string;
  patientDni?: string;
  dni?: string;
  scheme?: string;
  drugScheme?: string;
  diagnosis?: string;
  cycleNumber?: number;
  totalCycles?: number;
  initialCycle?: number;
  suggestedDate?: string;
  durationMinutes?: number;
  workflowStatus?: string;
  courseState?: string;
  continuityState?: string;
  effectiveFromCycle?: number;
  reactivationCycle?: number;
  prescriptionWorkflowState?: string;
  prescriptionState?: string;
  prescriptionConfirmed?: boolean;
  prescriptionRequired?: boolean;
  suspensionReason?: string;
  resumeDate?: string | null;
  pendingRequestIds?: Record<string, string | number | null | undefined>;
  openRequests?: Record<string, string | number | null | undefined>;
  pendingPrescriptionRequestId?: string | number | null;
  pendingContinuityRequestId?: string | number | null;
  suspension?: { reason?: string; resumeDate?: string | null } | null;
}

export interface TreatmentWorkflowUser {
  id: string;
  username: string;
  displayName: string;
  specialty: string;
  email: string;
  roles: Array<{ key?: string; name?: string } | string>;
}

export interface TreatmentWorkflowMutationResponse {
  ok: boolean;
  item?: Record<string, unknown>;
  evolution?: Record<string, unknown>;
  documentRevision?: number;
  [key: string]: unknown;
}

export interface TreatmentWorkflowChangedEvent {
  action: TreatmentWorkflowAction;
  patientId: string;
  treatmentId: string;
  cycleNumber: number;
  response: TreatmentWorkflowMutationResponse;
}

export interface TreatmentWorkflowAvailability {
  action: TreatmentWorkflowAction;
  label: string;
  description: string;
  permission: string;
  available: boolean;
}

export function normalizeWorkflowStatus(item: TreatmentWorkflowTreatment): TreatmentWorkflowStatus {
  const value = String(item.workflowStatus || item.courseState || item.continuityState || 'active').toLowerCase();
  if (['temporary', 'temporary_hold', 'suspended_temporary', 'paused'].includes(value)) return 'temporary_hold';
  if (['definitive', 'discontinued', 'suspended_definitive', 'cancelled'].includes(value)) return 'discontinued';
  return 'active';
}

export function normalizePrescriptionState(item: TreatmentWorkflowTreatment): TreatmentPrescriptionState {
  const value = String(item.prescriptionWorkflowState || item.prescriptionState || '').toLowerCase();
  if (['confirmed', 'available', 'issued'].includes(value) || item.prescriptionConfirmed === true) return 'confirmed';
  if (['requested', 'pending', 'sent'].includes(value)) return 'requested';
  if (['rejected', 'declined'].includes(value)) return 'rejected';
  return 'required';
}

export function workflowCycle(item: TreatmentWorkflowTreatment): number {
  const value = Number(item.cycleNumber);
  return Number.isInteger(value) && value > 0 ? value : Math.max(1, Number(item.initialCycle) || 1);
}

export function workflowEffectiveCycle(item: TreatmentWorkflowTreatment): number {
  const current = workflowCycle(item);
  const reactivation = Number(item.reactivationCycle);
  if (Number.isInteger(reactivation) && reactivation > 0) return reactivation;
  const effective = Number(item.effectiveFromCycle);
  return Number.isInteger(effective) && effective > 0 ? effective : current;
}

export function workflowOpenRequestId(
  item: TreatmentWorkflowTreatment,
  kind: 'prescription' | 'continuity'
): string {
  const requests = item.pendingRequestIds || item.openRequests || {};
  const value = kind === 'prescription'
    ? requests['prescription'] || requests['prescription_request'] || item.pendingPrescriptionRequestId
    : requests['continuity'] || requests['continuity_request'] || item.pendingContinuityRequestId;
  return value === null || value === undefined ? '' : String(value).trim();
}

export function treatmentResumeFlow(item: TreatmentWorkflowTreatment): TreatmentResumeFlow {
  if (normalizeWorkflowStatus(item) !== 'temporary_hold' || workflowCycle(item) !== workflowEffectiveCycle(item)) return '';
  const state = normalizePrescriptionState(item);
  if (state === 'confirmed') return 'ready';
  if (state === 'requested' || workflowOpenRequestId(item, 'prescription')) return 'waiting';
  return 'needs-prescription';
}

export function treatmentWorkflowActions(
  item: TreatmentWorkflowTreatment,
  hasPermission: (permission: string) => boolean
): TreatmentWorkflowAvailability[] {
  const status = normalizeWorkflowStatus(item);
  const prescription = normalizePrescriptionState(item);
  const resumeFlow = treatmentResumeFlow(item);
  const prescriptionPending = Boolean(workflowOpenRequestId(item, 'prescription'));
  const continuityPending = Boolean(workflowOpenRequestId(item, 'continuity'));
  const active = status === 'active';
  return [
    { action: 'suspend', label: 'Suspender', description: 'Transitoria o definitiva', permission: TREATMENT_WORKFLOW_PERMISSIONS.suspend,
      available: active && hasPermission(TREATMENT_WORKFLOW_PERMISSIONS.suspend) },
    { action: 'postpone', label: 'Postergar ciclo', description: 'Definir una nueva fecha de revisión', permission: TREATMENT_WORKFLOW_PERMISSIONS.suspend,
      available: active && hasPermission(TREATMENT_WORKFLOW_PERMISSIONS.suspend) },
    { action: 'request-prescription', label: 'Solicitar prescripción',
      description: resumeFlow ? 'Necesaria para reanudar este ciclo' : 'Enviar a un médico',
      permission: TREATMENT_WORKFLOW_PERMISSIONS.requestPrescription,
      available: hasPermission(TREATMENT_WORKFLOW_PERMISSIONS.requestPrescription) && !prescriptionPending
        && (resumeFlow === 'needs-prescription' || (active && !['requested', 'confirmed'].includes(prescription))) },
    { action: 'request-continuity', label: 'Solicitar continuidad', description: 'Pedir decisión médica',
      permission: TREATMENT_WORKFLOW_PERMISSIONS.requestContinuity,
      available: active && !continuityPending && hasPermission(TREATMENT_WORKFLOW_PERMISSIONS.requestContinuity) },
    { action: 'resume', label: 'Reanudar', description: 'Continuar el mismo tratamiento y ciclo',
      permission: TREATMENT_WORKFLOW_PERMISSIONS.resume,
      available: resumeFlow === 'ready' && hasPermission(TREATMENT_WORKFLOW_PERMISSIONS.resume) }
  ];
}

export function workflowStateDescription(item: TreatmentWorkflowTreatment): string {
  const status = normalizeWorkflowStatus(item);
  const reason = item.suspension?.reason || item.suspensionReason || '';
  const resumeDate = item.suspension?.resumeDate || item.resumeDate || '';
  if (status === 'discontinued') return `Suspendido definitivamente${reason ? ` · ${reason}` : ''}`;
  if (status === 'temporary_hold') {
    return `Suspendido transitoriamente${resumeDate ? ` hasta ${dateLabel(resumeDate)}` : ''}${reason ? ` · ${reason}` : ''}`;
  }
  if (workflowOpenRequestId(item, 'continuity')) return 'Continuidad pendiente de decisión médica.';
  if (workflowOpenRequestId(item, 'prescription')) return 'Prescripción pendiente de respuesta médica.';
  return 'Tratamiento activo';
}

export function workflowUserLabel(user: TreatmentWorkflowUser): string {
  const roles = user.roles.map((role) => typeof role === 'string' ? role : role.name || role.key || '').filter(Boolean).join(', ');
  return [user.displayName || user.username || user.email || `Usuario ${user.id}`, user.specialty, roles].filter(Boolean).join(' · ');
}

function dateLabel(value: string): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return parts ? `${parts[3]}/${parts[2]}/${parts[1]}` : value;
}
