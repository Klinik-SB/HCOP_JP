import {
  deriveTreatmentDocumentActions,
  normalizeDocumentContext,
  treatmentDocumentUrl
} from './treatment-documents.models';

let assertions = 0;
function equal(actual: unknown, expected: unknown, label: string): void {
  assertions += 1;
  if (actual !== expected) throw new Error(`${label}: esperado ${String(expected)}, recibido ${String(actual)}`);
}

const context = normalizeDocumentContext('21976', 'tx 17/165', '4', 8, '73299');
equal(context.patientId, '21976', 'normaliza paciente');
equal(context.treatmentId, 'tx 17/165', 'conserva id de tratamiento');
equal(context.cycle, 4, 'normaliza ciclo');
equal(context.applicationDay, 8, 'normaliza día de aplicación');
equal(context.sourceCycleId, '73299', 'conserva referencia del ciclo fuente');
equal(
  treatmentDocumentUrl('qr', context),
  '/api/clinical/patients/21976/treatments/tx%2017%2F165/documents/qr?cycle=4&applicationDay=8',
  'construye QR con segmentos escapados'
);
equal(
  treatmentDocumentUrl('preparation-label', context),
  '/api/clinical/application-workflows/21976/tx%2017%2F165/4/8/preparation-label',
  'construye etiqueta desde el workflow real'
);

const actions = deriveTreatmentDocumentActions(
  context,
  { prescriptionsView: true, dayHospitalView: true, preparationManage: true },
  {
    treatment: { consentAvailable: true, consentStatus: 'Firmado' },
    detail: {
      detail: {
        actions: { prescription: true, treatmentSheet: true, treatmentSheetCycles: [3, 4, 5] },
        documentAvailability: { prescription: true, treatmentSheetCycles: [4] }
      }
    },
    workflow: { ok: true, workflow: { preparationStatus: 'prepared' } }
  }
);

equal(actions.length, 5, 'expone las cinco acciones documentales');
equal(actions.find((item) => item.kind === 'consent')?.availability, 'available', 'consentimiento disponible');
equal(actions.find((item) => item.kind === 'treatment-sheet')?.enabled, true, 'hoja habilitada para el ciclo');
equal(actions.find((item) => item.kind === 'prescription')?.availability, 'available', 'prescripción disponible');
equal(actions.find((item) => item.kind === 'qr')?.status, 'Ciclo 4 · día 8', 'QR describe aplicación');
equal(actions.find((item) => item.kind === 'preparation-label')?.status, 'preparada', 'etiqueta refleja preparación');

const pending = deriveTreatmentDocumentActions(
  context,
  { prescriptionsView: true, dayHospitalView: true, preparationManage: true },
  {
    treatment: { consentAvailable: false, consentStatus: 'Firmado' },
    detail: { actions: { prescription: false, treatmentSheetCycles: [3] }, documentAvailability: { prescription: false, treatmentSheetCycles: [3] } },
    workflow: { workflow: { preparationStatus: 'in_preparation' } }
  }
);
equal(pending.find((item) => item.kind === 'consent')?.enabled, false, 'no abre consentimiento faltante');
equal(pending.find((item) => item.kind === 'treatment-sheet')?.availability, 'pending', 'bloquea hoja de otro ciclo');
equal(pending.find((item) => item.kind === 'prescription')?.status, 'Documento pendiente', 'explica prescripción faltante');
equal(pending.find((item) => item.kind === 'preparation-label')?.enabled, false, 'no imprime etiqueta antes de preparar');

const restricted = deriveTreatmentDocumentActions(
  context,
  { prescriptionsView: false, dayHospitalView: true, preparationManage: false },
  {}
);
equal(restricted.find((item) => item.kind === 'consent')?.availability, 'blocked', 'respeta permiso de prescripción');
equal(restricted.find((item) => item.kind === 'qr')?.enabled, true, 'permite QR con permiso de hospital');
equal(restricted.find((item) => item.kind === 'preparation-label')?.status, 'Sin permiso para abrir este documento', 'explica permiso de etiqueta');

const unknown = deriveTreatmentDocumentActions(
  context,
  { prescriptionsView: true, dayHospitalView: true, preparationManage: true },
  {}
);
equal(unknown.find((item) => item.kind === 'consent')?.enabled, false, 'no abre consentimiento sin disponibilidad confirmada');
equal(unknown.find((item) => item.kind === 'prescription')?.enabled, false, 'no abre prescripción sin disponibilidad confirmada');
equal(unknown.find((item) => item.kind === 'preparation-label')?.enabled, false, 'no imprime etiqueta sin preparación confirmada');

const invalid = normalizeDocumentContext('1', '2', 0, 'x', null);
equal(invalid.cycle, null, 'rechaza ciclo inválido');
equal(invalid.applicationDay, null, 'rechaza día inválido');

console.log(`treatment-documents-models: ${assertions} aserciones OK`);
