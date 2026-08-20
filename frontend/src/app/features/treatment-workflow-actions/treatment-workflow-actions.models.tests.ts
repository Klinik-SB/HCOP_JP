import {
  TreatmentWorkflowTreatment, normalizePrescriptionState, normalizeWorkflowStatus, treatmentResumeFlow,
  treatmentWorkflowActions, workflowOpenRequestId
} from './treatment-workflow-actions.models';

let assertions = 0;
function equal(actual: unknown, expected: unknown, label: string): void {
  assertions += 1;
  if (actual !== expected) throw new Error(`${label}: esperado ${String(expected)}, recibido ${String(actual)}`);
}

const permissions = new Set(['workflow.suspend', 'workflow.resume', 'workflow.request-prescription', 'workflow.request-continuity']);
const hasPermission = (permission: string): boolean => permissions.has(permission);
const base: TreatmentWorkflowTreatment = { patientId: '9', treatmentId: 'tx-1', cycleNumber: 3, totalCycles: 6, workflowStatus: 'active' };

equal(normalizeWorkflowStatus(base), 'active', 'estado activo');
equal(normalizeWorkflowStatus({ ...base, workflowStatus: 'paused' }), 'temporary_hold', 'pausa normalizada');
equal(normalizeWorkflowStatus({ ...base, workflowStatus: 'cancelled' }), 'discontinued', 'cancelado definitivo');
equal(normalizePrescriptionState({ ...base, prescriptionState: 'issued' }), 'confirmed', 'prescripción emitida');
equal(normalizePrescriptionState({ ...base, prescriptionState: 'pending' }), 'requested', 'prescripción solicitada');
equal(treatmentWorkflowActions(base, hasPermission).filter((item) => item.available).length, 4, 'acciones activas');

const held = { ...base, workflowStatus: 'temporary_hold', effectiveFromCycle: 3 };
equal(treatmentResumeFlow(held), 'needs-prescription', 'reanudar requiere prescripción');
equal(treatmentResumeFlow({ ...held, prescriptionState: 'requested' }), 'waiting', 'espera médica');
equal(treatmentResumeFlow({ ...held, prescriptionState: 'confirmed' }), 'ready', 'listo para reanudar');
equal(treatmentWorkflowActions({ ...held, prescriptionState: 'confirmed' }, hasPermission).filter((item) => item.available)[0]?.action, 'resume', 'sólo reanudar al confirmar');
equal(treatmentWorkflowActions({ ...held, prescriptionState: 'requested' }, hasPermission).filter((item) => item.available).length, 0, 'sin duplicar solicitud pendiente');
equal(treatmentWorkflowActions({ ...base, workflowStatus: 'discontinued' }, hasPermission).filter((item) => item.available).length, 0, 'definitivo no reanuda');
equal(treatmentResumeFlow({ ...held, cycleNumber: 4, effectiveFromCycle: 3, prescriptionState: 'confirmed' }), '', 'otro ciclo no reanuda el suspendido');
equal(workflowOpenRequestId({ ...base, pendingRequestIds: { prescription_request: 72 } }, 'prescription'), '72', 'solicitud abierta');
equal(treatmentWorkflowActions(base, () => false).filter((item) => item.available).length, 0, 'permisos obligatorios');
equal(treatmentWorkflowActions({ ...base, pendingContinuityRequestId: '81' }, hasPermission).some((item) => item.action === 'request-continuity' && item.available), false, 'sin continuidad duplicada');
equal(treatmentWorkflowActions({ ...base, pendingPrescriptionRequestId: '82' }, hasPermission).some((item) => item.action === 'request-prescription' && item.available), false, 'sin prescripción duplicada');

console.log(`treatment-workflow-actions-models: ${assertions} aserciones OK`);
