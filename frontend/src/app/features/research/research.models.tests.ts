import {
  ResearchAuditStamp,
  blankResearchForm,
  buildCustomResearchRecord,
  buildGeneralResearchRecord,
  initialCustomValues,
  normalizeResearchTemplateCatalog,
  researchRecordLines,
  researchRecords,
  validateResearchRecord
} from './research.models';

const audit: ResearchAuditStamp = { action: 'cargado', lastName: 'Prueba', license: 'TEST-1', at: '2026-08-03T12:00:00.000Z' };
let assertions = 0;

function equal(actual: unknown, expected: unknown, label: string): void {
  assertions += 1;
  if (actual !== expected) throw new Error(`${label}: se esperaba ${String(expected)} y se obtuvo ${String(actual)}`);
}

function ok(value: unknown, label: string): void {
  assertions += 1;
  if (!value) throw new Error(label);
}

const catalog = normalizeResearchTemplateCatalog({
  items: [
    {
      id: 7, key: 'seguimiento', name: 'Seguimiento', active: true, revision: 3,
      definition: {
        instructions: 'Complete el evento.',
        fields: [
          { type: 'section', key: 'evento', label: 'Evento' },
          { type: 'date', key: 'fecha', label: 'Fecha', required: true },
          { type: 'select', key: 'estado', label: 'Estado', required: true, options: [{ value: 'ok', label: 'Completo' }] },
          { type: 'checkbox', key: 'confirmado', label: 'Confirmado', required: true }
        ]
      }
    },
    { id: 8, name: 'Inactivo', active: false, definition: { fields: [] } }
  ]
});
equal(catalog.items.length, 1, 'filtra formularios inactivos');
equal(catalog.items[0]?.revision, 3, 'conserva revisión de plantilla');
equal(catalog.items[0]?.definition.fields[2]?.options[0]?.label, 'Completo', 'conserva etiqueta de opción');

const general = blankResearchForm(
  { oncology: { diagnosis: 'Tumor de prueba', topography: 'Colon', histology: 'Adenocarcinoma', stage: 'III', performanceStatus: 'ECOG 1' } },
  { id: '1', fullName: 'Paciente', dni: '99000000' }
);
equal(general.participantCode, '99000000', 'precarga código seudonimizado');
equal(general.diagnosis, 'Tumor de prueba - Colon', 'precarga diagnóstico');
equal(general.ecog, '1', 'precarga ECOG');

let record = buildGeneralResearchRecord(general, audit, 'research-general');
equal(validateResearchRecord(record)?.target, 'protocolName', 'exige nombre de protocolo');
general.protocolName = 'PROTO TEST';
general.protocolCode = 'PT-01';
record = buildGeneralResearchRecord(general, audit, 'research-general');
equal(validateResearchRecord(record), null, 'acepta registro general mínimo');
ok(record.summary.includes('Participante: 99000000'), 'genera resumen textual para historia y línea temporal');

general.consentStatus = 'Firmado';
record = buildGeneralResearchRecord(general, audit, 'research-consent');
equal(validateResearchRecord(record)?.target, 'consentDate', 'consentimiento firmado requiere fecha');
general.consentDate = '2026-08-03';
general.consentVersion = '2.0';
general.participantStatus = 'Aleatorizado';
general.eligibility = 'Cumple criterios';
record = buildGeneralResearchRecord(general, audit, 'research-randomization');
equal(validateResearchRecord(record)?.target, 'randomizationCode', 'aleatorización requiere código');

const template = catalog.items[0]!;
const values = initialCustomValues(template);
let custom = buildCustomResearchRecord(template, values, { id: '1', fullName: 'Paciente', dni: '99000000' }, audit, 'research-custom');
equal(validateResearchRecord(custom)?.target, 'custom:estado', 'valida primer campo configurable vacío');
values['estado'] = 'ok';
values['confirmado'] = true;
custom = buildCustomResearchRecord(template, values, { id: '1', fullName: 'Paciente', dni: '99000000' }, audit, 'research-custom');
equal(validateResearchRecord(custom), null, 'acepta formulario configurable completo');
equal(custom.customForm?.templateRevision, 3, 'congela revisión aplicada');
equal(researchRecordLines(custom).find((line) => line.label === 'Estado')?.value, 'Completo', 'presenta etiqueta configurada');

const sorted = researchRecords([
  { ...record, id: 'old', date: '2026-01-01' },
  { ...custom, id: 'new', date: '2026-08-03' }
]);
equal(sorted[0]?.id, 'new', 'ordena registros por fecha descendente');

console.log(`Investigación: ${assertions} aserciones aprobadas.`);
