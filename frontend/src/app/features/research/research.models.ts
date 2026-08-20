import type { ClinicalPatient, ClinicalRecord, ClinicalState } from '../../core/patients/patient-workspace.models';

export type ResearchFieldType = 'section' | 'text' | 'textarea' | 'select' | 'checkbox' | 'number' | 'date';

export interface ResearchTemplateOption { readonly value: string; readonly label: string; }
export interface ResearchTemplateField {
  readonly key: string;
  readonly label: string;
  readonly type: ResearchFieldType;
  readonly placeholder: string;
  readonly help: string;
  readonly required: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly options: readonly ResearchTemplateOption[];
}
export interface ResearchTemplate {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly active: boolean;
  readonly revision: number;
  readonly definition: {
    readonly category: string;
    readonly instructions: string;
    readonly fields: readonly ResearchTemplateField[];
  };
}
export interface ResearchTemplateCatalog { readonly items: readonly ResearchTemplate[]; readonly total: number; }
export interface ResearchAuditStamp { readonly action: 'cargado'; readonly lastName: string; readonly license: string; readonly at: string; }
export interface ResearchProtocol { readonly name: string; readonly code: string; readonly phase: string; readonly sponsor: string; readonly center: string; }
export interface ResearchParticipant {
  readonly code: string; readonly status: string; readonly arm: string; readonly randomizationCode: string;
  readonly consentStatus: string; readonly consentDate: string; readonly consentVersion: string;
  readonly eligibility: string; readonly ineligibilityReason: string;
}
export interface ResearchClinicalSnapshot {
  readonly diagnosis: string; readonly histology: string; readonly stage: string; readonly biomarkers: string;
  readonly ecog: string; readonly intervention: string; readonly treatmentLine: string; readonly cycle: string; readonly day: string;
}
export interface ResearchAssessment { readonly criteria: string; readonly response: string; readonly date: string; readonly results: string; }
export interface ResearchSafety { readonly event: string; readonly grade: string; readonly relation: string; readonly action: string; }
export interface ResearchFollowUp { readonly samples: string; readonly deviations: string; readonly nextVisit: string; readonly pending: string; readonly notes: string; }
export interface ResearchCustomForm {
  readonly templateId: string;
  readonly templateKey: string;
  readonly templateRevision: number;
  readonly templateName: string;
  readonly schemaSnapshot: readonly ResearchTemplateField[];
  readonly values: Readonly<Record<string, string | boolean>>;
}
export interface ResearchRecord extends ClinicalRecord {
  id: string;
  date: string;
  type: string;
  title: string;
  summary: string;
  protocol: ResearchProtocol;
  participant: ResearchParticipant;
  clinical?: ResearchClinicalSnapshot;
  assessment?: ResearchAssessment;
  safety?: ResearchSafety;
  followUp?: ResearchFollowUp;
  customForm?: ResearchCustomForm;
  audit: ResearchAuditStamp;
  createdAt: string;
  updatedAt: string;
}
export interface ResearchGeneralForm {
  protocolName: string; protocolCode: string; phase: string; recordType: string; eventDate: string; sponsor: string; center: string;
  participantCode: string; participantStatus: string; arm: string; randomizationCode: string; consentStatus: string;
  consentDate: string; consentVersion: string; eligibility: string; ineligibilityReason: string;
  diagnosis: string; histology: string; stage: string; biomarkers: string; ecog: string; intervention: string;
  treatmentLine: string; cycle: string; day: string; responseCriteria: string; response: string; assessmentDate: string;
  results: string; adverseEvent: string; adverseGrade: string; adverseRelation: string; adverseAction: string;
  samples: string; deviations: string; nextVisit: string; pending: string; notes: string;
}
export interface ResearchValidationFailure { readonly message: string; readonly target: string; }
export interface ResearchRecordLine { readonly label: string; readonly value: string; }

const FIELD_TYPES = new Set<ResearchFieldType>(['section', 'text', 'textarea', 'select', 'checkbox', 'number', 'date']);

export function normalizeResearchTemplateCatalog(payload: unknown): ResearchTemplateCatalog {
  const root = object(payload);
  const items = array(root['items']).map(normalizeResearchTemplate).filter((item): item is ResearchTemplate => Boolean(item?.active));
  return { items, total: items.length };
}

export function blankResearchForm(state: ClinicalState = {}, patient?: ClinicalPatient, preserved?: Partial<ResearchGeneralForm>): ResearchGeneralForm {
  const oncology = object(state.oncology);
  const performanceStatus = text(oncology['performanceStatus']).match(/\b[0-5]\b/)?.[0] || '';
  return {
    protocolName: preserved?.protocolName || '', protocolCode: preserved?.protocolCode || '', phase: preserved?.phase || '',
    recordType: 'Preseleccion', eventDate: today(), sponsor: preserved?.sponsor || '', center: preserved?.center || '',
    participantCode: preserved?.participantCode || patient?.dni || patient?.medicalRecord || '', participantStatus: 'Preseleccion',
    arm: '', randomizationCode: '', consentStatus: 'No evaluado', consentDate: '', consentVersion: '', eligibility: 'No evaluada',
    ineligibilityReason: '', diagnosis: [text(oncology['diagnosis']), text(oncology['topography'])].filter(Boolean).join(' - '),
    histology: text(oncology['histology']), stage: text(oncology['stage']), biomarkers: text(oncology['biomarkers']), ecog: performanceStatus,
    intervention: '', treatmentLine: '', cycle: '', day: '', responseCriteria: '', response: '', assessmentDate: '', results: '',
    adverseEvent: '', adverseGrade: '', adverseRelation: '', adverseAction: '', samples: '', deviations: '', nextVisit: '', pending: '', notes: ''
  };
}

export function initialCustomValues(template: ResearchTemplate): Record<string, string | boolean> {
  return Object.fromEntries(template.definition.fields.filter((field) => field.type !== 'section')
    .map((field) => [field.key, field.type === 'checkbox' ? false : field.type === 'date' ? today() : '']));
}

export function buildGeneralResearchRecord(source: ResearchGeneralForm, audit: ResearchAuditStamp, id = researchId()): ResearchRecord {
  const record: ResearchRecord = {
    id, date: source.eventDate, type: source.recordType, title: source.protocolName.trim(), summary: '',
    protocol: { name: source.protocolName.trim(), code: source.protocolCode.trim(), phase: source.phase, sponsor: source.sponsor.trim(), center: source.center.trim() },
    participant: {
      code: source.participantCode.trim(), status: source.participantStatus, arm: source.arm.trim(), randomizationCode: source.randomizationCode.trim(),
      consentStatus: source.consentStatus, consentDate: source.consentDate, consentVersion: source.consentVersion.trim(), eligibility: source.eligibility,
      ineligibilityReason: source.ineligibilityReason.trim()
    },
    clinical: {
      diagnosis: source.diagnosis.trim(), histology: source.histology.trim(), stage: source.stage.trim(), biomarkers: source.biomarkers.trim(),
      ecog: source.ecog, intervention: source.intervention.trim(), treatmentLine: source.treatmentLine.trim(), cycle: source.cycle.trim(), day: source.day.trim()
    },
    assessment: { criteria: source.responseCriteria, response: source.response, date: source.assessmentDate, results: source.results.trim() },
    safety: { event: source.adverseEvent.trim(), grade: source.adverseGrade, relation: source.adverseRelation, action: source.adverseAction.trim() },
    followUp: { samples: source.samples.trim(), deviations: source.deviations.trim(), nextVisit: source.nextVisit, pending: source.pending.trim(), notes: source.notes.trim() },
    audit, createdAt: audit.at, updatedAt: audit.at
  };
  record.summary = researchRecordLines(record).map((line) => `${line.label}: ${line.value}`).join('\n');
  return record;
}

export function buildCustomResearchRecord(
  template: ResearchTemplate,
  rawValues: Readonly<Record<string, string | boolean>>,
  patient: ClinicalPatient | undefined,
  audit: ResearchAuditStamp,
  id = researchId()
): ResearchRecord {
  const schemaSnapshot = template.definition.fields.map((field) => ({ ...field, options: field.options.map((option) => ({ ...option })) }));
  const values = Object.fromEntries(schemaSnapshot.filter((field) => field.type !== 'section').map((field) => [
    field.key, field.type === 'checkbox' ? rawValues[field.key] === true : text(rawValues[field.key])
  ]));
  const firstDate = schemaSnapshot.find((field) => field.type === 'date' && text(values[field.key]));
  const record: ResearchRecord = {
    id, date: firstDate ? text(values[firstDate.key]) : today(), type: template.name, title: template.name, summary: '',
    protocol: { name: template.name, code: `FORM-${template.id}`, phase: '', sponsor: '', center: '' },
    participant: {
      code: patient?.dni || patient?.medicalRecord || '', status: 'Registrado', arm: '', randomizationCode: '', consentStatus: '',
      consentDate: '', consentVersion: '', eligibility: '', ineligibilityReason: ''
    },
    customForm: { templateId: template.id, templateKey: template.key, templateRevision: template.revision, templateName: template.name, schemaSnapshot, values },
    audit, createdAt: audit.at, updatedAt: audit.at
  };
  record.summary = researchRecordLines(record).map((line) => `${line.label}: ${line.value}`).join('\n');
  return record;
}

export function validateResearchRecord(record: ResearchRecord): ResearchValidationFailure | null {
  if (record.customForm) {
    for (const field of record.customForm.schemaSnapshot) {
      if (field.type === 'section' || !field.required) continue;
      const value = record.customForm.values[field.key];
      if (field.type === 'checkbox' ? value !== true : !text(value)) return { message: `Complete ${field.label}.`, target: `custom:${field.key}` };
    }
    return null;
  }
  if (!record.protocol.name || !record.protocol.code || !record.participant.code || !record.type || !record.date || !record.participant.status) {
    const target = !record.protocol.name ? 'protocolName' : !record.protocol.code ? 'protocolCode' : !record.participant.code ? 'participantCode'
      : !record.type ? 'recordType' : !record.date ? 'eventDate' : 'participantStatus';
    return { message: 'Complete protocolo, código, participante, tipo de registro, fecha y estado.', target };
  }
  if (record.participant.consentStatus === 'Firmado' && (!record.participant.consentDate || !record.participant.consentVersion)) {
    return { message: 'El consentimiento firmado requiere fecha y versión.', target: !record.participant.consentDate ? 'consentDate' : 'consentVersion' };
  }
  if (['Incluido', 'Aleatorizado', 'En tratamiento'].includes(record.participant.status) && record.participant.eligibility !== 'Cumple criterios') {
    return { message: 'Para incluir al participante debe constar que cumple los criterios de elegibilidad.', target: 'eligibility' };
  }
  if (record.participant.status === 'Aleatorizado' && !record.participant.randomizationCode) {
    return { message: 'La aleatorización requiere un código de asignación.', target: 'randomizationCode' };
  }
  if (record.participant.eligibility === 'No cumple criterios' && !record.participant.ineligibilityReason) {
    return { message: 'Indique el motivo de no elegibilidad.', target: 'ineligibilityReason' };
  }
  const safety = record.safety;
  if (safety && ((safety.event && !safety.grade) || (!safety.event && safety.grade))) {
    return { message: 'Consigne el evento adverso y su grado CTCAE.', target: safety.event ? 'adverseGrade' : 'adverseEvent' };
  }
  if (record.assessment?.response === 'Progresion' && !record.assessment.date) {
    return { message: 'La progresión requiere fecha de evaluación.', target: 'assessmentDate' };
  }
  return null;
}

export function researchRecordLines(record: ResearchRecord): ResearchRecordLine[] {
  if (record.customForm) {
    return record.customForm.schemaSnapshot.filter((field) => field.type !== 'section').map((field) => {
      const raw = record.customForm?.values[field.key];
      const option = field.type === 'select' ? field.options.find((item) => item.value === text(raw)) : undefined;
      return { label: field.label, value: field.type === 'checkbox' ? (raw ? 'Sí' : 'No') : option?.label || text(raw) };
    }).filter((line) => Boolean(line.value));
  }
  const lines: ResearchRecordLine[] = [];
  const add = (label: string, values: readonly unknown[]): void => {
    const value = values.map(text).filter(Boolean).join('; ');
    if (value) lines.push({ label, value });
  };
  const participant = record.participant || emptyParticipant();
  const protocol = record.protocol || emptyProtocol();
  const clinical = record.clinical;
  const assessment = record.assessment;
  const safety = record.safety;
  const followUp = record.followUp;
  add('Evento', [record.type, participant.code ? `Participante: ${participant.code}` : '', participant.status ? `Estado: ${participant.status}` : '']);
  add('Protocolo', [protocol.phase, protocol.sponsor, protocol.center]);
  add('Consentimiento', [participant.consentStatus, participant.consentDate ? dateLabel(participant.consentDate) : '', participant.consentVersion ? `Versión ${participant.consentVersion}` : '']);
  add('Elegibilidad', [participant.eligibility, participant.ineligibilityReason]);
  add('Situación oncológica', [clinical?.diagnosis, clinical?.histology, clinical?.stage ? `Estadio ${clinical.stage}` : '', clinical?.ecog ? `ECOG ${clinical.ecog}` : '', clinical?.biomarkers]);
  add('Asignación y tratamiento', [participant.arm ? `Brazo/cohorte ${participant.arm}` : '', participant.randomizationCode ? `Aleatorización ${participant.randomizationCode}` : '', clinical?.intervention, clinical?.treatmentLine ? `Línea ${clinical.treatmentLine}` : '', clinical?.cycle ? `Ciclo ${clinical.cycle}` : '', clinical?.day ? `Día ${clinical.day}` : '']);
  add('Evaluación', [assessment?.criteria, assessment?.response, assessment?.date ? dateLabel(assessment.date) : '', assessment?.results]);
  add('Seguridad', [safety?.event, safety?.grade ? `CTCAE grado ${safety.grade}` : '', safety?.relation, safety?.action]);
  add('Muestras / estudios', [followUp?.samples]);
  add('Desvíos del protocolo', [followUp?.deviations]);
  add('Seguimiento', [followUp?.nextVisit ? `Próxima visita ${dateLabel(followUp.nextVisit)}` : '', followUp?.pending ? `Pendientes: ${followUp.pending}` : '']);
  add('Observaciones', [followUp?.notes]);
  return lines;
}

export function researchRecords(source: readonly ClinicalRecord[] | undefined): ResearchRecord[] {
  return (source || []).filter((item) => Boolean(item && typeof item === 'object')).map((item) => item as ResearchRecord).sort((left, right) => {
    const byDate = text(right.date).localeCompare(text(left.date));
    return byDate || text(right.createdAt).localeCompare(text(left.createdAt));
  });
}

export function dateLabel(value: string): string {
  if (!value) return 'Sin fecha';
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat('es-AR').format(parsed);
}

function normalizeResearchTemplate(value: unknown): ResearchTemplate | null {
  const item = object(value);
  const definition = object(item['definition']);
  const id = text(item['id']);
  const name = text(item['name']) || text(item['displayName']);
  if (!id || !name) return null;
  return {
    id, key: text(item['key']) || text(item['itemKey']), name, description: text(item['description']), active: item['active'] !== false,
    revision: integer(item['revision']),
    definition: {
      category: text(definition['category']) || 'Investigación',
      instructions: text(definition['instructions']) || text(item['description']) || 'Formulario estructurado habitual.',
      fields: array(definition['fields']).map(normalizeResearchField).filter((field): field is ResearchTemplateField => Boolean(field))
    }
  };
}

function normalizeResearchField(value: unknown, index: number): ResearchTemplateField | null {
  const field = object(value);
  const rawType = text(field['type']).toLocaleLowerCase('es-AR') as ResearchFieldType;
  const type: ResearchFieldType = FIELD_TYPES.has(rawType) ? rawType : 'text';
  const label = text(field['label']);
  const key = text(field['key']) || (type === 'section' ? `section-${index + 1}` : '');
  if (!label || !key) return null;
  const minimum = finite(field['min']);
  const maximum = finite(field['max']);
  return {
    key, label, type, placeholder: text(field['placeholder']), help: text(field['help']), required: field['required'] === true,
    ...(minimum === undefined ? {} : { min: minimum }), ...(maximum === undefined ? {} : { max: maximum }),
    options: array(field['options']).map((option) => {
      if (typeof option === 'string' || typeof option === 'number') { const raw = text(option); return { value: raw, label: raw }; }
      const normalized = object(option);
      return { value: text(normalized['value']), label: text(normalized['label']) || text(normalized['value']) };
    }).filter((option) => Boolean(option.value))
  };
}

function emptyProtocol(): ResearchProtocol { return { name: '', code: '', phase: '', sponsor: '', center: '' }; }
function emptyParticipant(): ResearchParticipant { return { code: '', status: '', arm: '', randomizationCode: '', consentStatus: '', consentDate: '', consentVersion: '', eligibility: '', ineligibilityReason: '' }; }
function researchId(): string { return globalThis.crypto?.randomUUID?.() ? `research-${globalThis.crypto.randomUUID()}` : `research-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function today(): string { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10); }
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function text(value: unknown): string { return value === null || value === undefined ? '' : String(value).trim(); }
function integer(value: unknown): number { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0; }
function finite(value: unknown): number | undefined { if (value === '' || value === null || value === undefined) return undefined; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : undefined; }
