import {
  clinicalInboxPermission,
  clinicalInboxResolutionNeedsReason,
  clinicalInboxResolutionOptions,
  normalizeClinicalInboxPage
} from './clinical-inbox.models';

let assertions = 0;
function equal(actual: unknown, expected: unknown, label: string): void {
  assertions += 1;
  if (actual !== expected) throw new Error(`${label}: esperado ${String(expected)}, recibido ${String(actual)}`);
}

const page = normalizeClinicalInboxPage({
  ok: true,
  items: [{
    id: 42,
    type: 'continuity_request',
    status: 'pending',
    patientId: 7,
    treatmentId: 'tx-1',
    cycleNumber: 3,
    context: {
      patientName: 'Paciente de prueba',
      patientDni: '30111222',
      scheme: 'Esquema A',
      diagnosis: 'Diagnóstico de prueba'
    },
    requestedByDisplayName: 'Médico solicitante'
  }]
});

equal(page.total, 1, 'total normalizado');
equal(page.items[0]?.id, '42', 'id normalizado como texto');
equal(page.items[0]?.type, 'continuity_request', 'tipo continuidad');
equal(page.items[0]?.patientName, 'Paciente de prueba', 'paciente desde contexto');
equal(page.items[0]?.scheme, 'Esquema A', 'esquema desde contexto');
equal(page.items[0]?.cycleNumber, 3, 'ciclo conservado');
equal(clinicalInboxPermission('prescription_request'), 'workflow.resolve-prescription', 'permiso prescripción');
equal(clinicalInboxPermission('continuity_request'), 'workflow.resolve-continuity', 'permiso continuidad');
equal(clinicalInboxResolutionOptions('continuity_request').length, 3, 'opciones de continuidad');
equal(clinicalInboxResolutionNeedsReason('temporary_hold'), true, 'suspensión temporal requiere causa');
equal(clinicalInboxResolutionNeedsReason('continue'), false, 'continuidad no obliga causa');
equal(normalizeClinicalInboxPage({ items: [{ id: 99, type: 'unexpected_request' }] }).items.length, 0,
  'un tipo desconocido se descarta en lugar de asumir prescripción');

console.log(`clinical-inbox-models: ${assertions} aserciones OK`);
