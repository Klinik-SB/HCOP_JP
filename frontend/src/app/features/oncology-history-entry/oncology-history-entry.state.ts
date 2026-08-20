import type { ClinicalRecord, ClinicalState } from '../../core/patients/patient-workspace.models';
import {
  AppliedOncologyHistoryEntry,
  ApplyOncologyHistoryEntryRequest,
  OncologyHistoryActor,
  OncologyHistoryEntryDraft,
  OncologyHistoryEntryKind,
  OncologyHistoryMetrics
} from './oncology-history-entry.models';

export const ONCOLOGY_HISTORY_NOTES_LIMIT = 50_000;
export const ONCOLOGY_HISTORY_REASON_LIMIT = 2_000;
export const ONCOLOGY_HISTORY_SHORT_TEXT_LIMIT = 2_000;
export const ONCOLOGY_HISTORY_WEIGHT_MIN_KG = 0.01;
export const ONCOLOGY_HISTORY_WEIGHT_MAX_KG = 500;
export const ONCOLOGY_HISTORY_HEIGHT_MIN_CM = 30;
export const ONCOLOGY_HISTORY_HEIGHT_MAX_CM = 250;

export type OncologyHistoryEntryErrorCode =
  | 'DATE_REQUIRED'
  | 'DATE_INVALID'
  | 'END_DATE_INVALID'
  | 'END_DATE_BEFORE_START'
  | 'DIAGNOSIS_REQUIRED'
  | 'SCHEME_REQUIRED'
  | 'TARGET_REQUIRED'
  | 'TECHNIQUE_REQUIRED'
  | 'PROCEDURE_REQUIRED'
  | 'WEIGHT_INVALID'
  | 'WEIGHT_OUT_OF_RANGE'
  | 'HEIGHT_INVALID'
  | 'HEIGHT_OUT_OF_RANGE'
  | 'CYCLES_INVALID'
  | 'FRACTIONS_INVALID'
  | 'DOSE_INVALID'
  | 'TEXT_TOO_LONG'
  | 'REASON_REQUIRED'
  | 'REASON_TOO_LONG'
  | 'NO_CHANGES'
  | 'ORIGINAL_REQUIRED';

export class OncologyHistoryEntryError extends Error {
  constructor(
    readonly code: OncologyHistoryEntryErrorCode,
    message: string,
    readonly field = ''
  ) {
    super(message);
    this.name = 'OncologyHistoryEntryError';
  }
}

export function oncologyHistorySectionKey(kind: OncologyHistoryEntryKind): string {
  return kind === 'systemic'
    ? 'systemicTreatments'
    : kind === 'radiotherapy' ? 'radiotherapyTreatments' : 'oncologicSurgeries';
}

export function oncologyHistorySectionTitle(kind: OncologyHistoryEntryKind): string {
  return kind === 'systemic'
    ? 'Tratamientos sistémicos'
    : kind === 'radiotherapy' ? 'Tratamientos radioterápicos' : 'Cirugías oncológicas';
}

export function oncologyHistoryEntryLabel(kind: OncologyHistoryEntryKind): string {
  return kind === 'systemic'
    ? 'tratamiento sistémico'
    : kind === 'radiotherapy' ? 'tratamiento radioterápico' : 'cirugía oncológica';
}

export function emptyOncologyHistoryDraft(
  kind: OncologyHistoryEntryKind,
  defaults: Partial<OncologyHistoryEntryDraft> = {}
): OncologyHistoryEntryDraft {
  const base: OncologyHistoryEntryDraft = {
    date: '', endDate: '', diagnosis: '', intent: '', status: '', institution: '', professional: '',
    weightKg: '', heightCm: '', notes: '', treatmentType: '', scheme: '', drugs: '', cycles: '',
    response: '', toxicity: '', targetSite: '', technique: '', totalDoseGy: '', fractions: '',
    concurrentSystemic: '', procedure: '', surgeon: '', pathology: '', margins: '', complications: '', reason: ''
  };
  return { ...base, ...defaults, treatmentType: defaults.treatmentType || (kind === 'systemic' ? 'Quimioterapia' : '') };
}

/**
 * Projects both the structured local format and historical/legacy records into
 * one form model. Height is always returned in centimetres.
 */
export function oncologyHistoryDraftFromRecord(
  recordValue: ClinicalRecord | null | undefined,
  kind: OncologyHistoryEntryKind,
  fallbackDiagnosis = ''
): OncologyHistoryEntryDraft {
  const source = recordValue || {};
  const structured = asRecord(source['oncologyHistory']);
  const heightCm = decimalText(
    firstValue(structured['heightCm'], source['heightCm'], storedHeightCm(source['heightM']))
  );
  return emptyOncologyHistoryDraft(kind, {
    date: clean(source.date),
    endDate: clean(firstValue(structured['endDate'], source['endDate'])),
    diagnosis: clean(firstValue(structured['diagnosis'], source.diagnosis, fallbackDiagnosis)),
    intent: clean(firstValue(structured['intent'], source.intent)),
    status: clean(firstValue(structured['status'], source.status)),
    institution: clean(firstValue(structured['institution'], source['institution'])),
    professional: clean(firstValue(structured['professional'], source['professional'], source.author)),
    weightKg: decimalText(firstValue(structured['weightKg'], source['weightKg'])),
    heightCm,
    notes: clean(firstValue(structured['notes'], source.notes, source.summary)),
    treatmentType: clean(firstValue(structured['treatmentType'], source['treatmentType'], kind === 'systemic' ? source.type : '')),
    scheme: clean(firstValue(structured['scheme'], source.scheme, kind === 'systemic' ? source.title : '')),
    drugs: clean(firstValue(structured['drugs'], source['drugs'])),
    cycles: integerText(firstValue(structured['cycles'], source['cycles'], source['cycleCount'])),
    response: clean(firstValue(structured['response'], source['response'])),
    toxicity: clean(firstValue(structured['toxicity'], source['toxicity'])),
    targetSite: clean(firstValue(structured['targetSite'], source['targetSite'], source['site'])),
    technique: clean(firstValue(structured['technique'], source['technique'], kind === 'radiotherapy' ? source.scheme : '')),
    totalDoseGy: decimalText(firstValue(structured['totalDoseGy'], source['totalDoseGy'], source['doseGy'])),
    fractions: integerText(firstValue(structured['fractions'], source['fractions'])),
    concurrentSystemic: clean(firstValue(structured['concurrentSystemic'], source['concurrentSystemic'])),
    procedure: clean(firstValue(structured['procedure'], source['procedure'], kind === 'surgery' ? source.scheme : '')),
    surgeon: clean(firstValue(structured['surgeon'], source['surgeon'])),
    pathology: clean(firstValue(structured['pathology'], source['pathology'])),
    margins: clean(firstValue(structured['margins'], source['margins'])),
    complications: clean(firstValue(structured['complications'], source['complications'])),
    reason: ''
  });
}

export function calculateOncologyHistoryMetrics(
  weightValue: unknown,
  heightCmValue: unknown,
  totalDoseGyValue: unknown = '',
  fractionsValue: unknown = ''
): OncologyHistoryMetrics {
  const weightKg = decimal(weightValue);
  const heightCm = decimal(heightCmValue);
  const totalDoseGy = decimal(totalDoseGyValue);
  const fractions = integer(fractionsValue);
  const hasAnthropometrics = weightKg !== null && heightCm !== null && weightKg > 0 && heightCm > 0;
  return {
    bmi: hasAnthropometrics ? weightKg! / Math.pow(heightCm! / 100, 2) : null,
    bodySurfaceM2: hasAnthropometrics
      ? 0.007184 * Math.pow(weightKg!, 0.425) * Math.pow(heightCm!, 0.725)
      : null,
    dosePerFractionGy: totalDoseGy !== null && totalDoseGy > 0 && fractions !== null && fractions > 0
      ? totalDoseGy / fractions
      : null
  };
}

export function applyOncologyHistoryEntry(
  state: ClinicalState,
  request: ApplyOncologyHistoryEntryRequest
): AppliedOncologyHistoryEntry {
  const kind = request.kind;
  const original = request.original || null;
  const mode = original ? 'updated' : 'created';
  const draft = normalizeDraft(request.draft, kind);
  validateDraft(draft, kind, mode);
  const baseline = original ? oncologyHistoryDraftFromRecord(original, kind) : null;
  if (baseline && sameClinicalDraft(baseline, draft)) {
    fail('NO_CHANGES', 'No hay cambios clínicos para guardar. El motivo por sí solo no modifica el registro.');
  }

  const actor = normalizeActor(request.actor);
  const at = validTimestamp(request.at) || new Date().toISOString();
  const originalId = clean(original?.id);
  if (mode === 'updated' && !clean(request.id) && !originalId) {
    fail('ORIGINAL_REQUIRED', 'No se pudo identificar el registro a modificar.');
  }
  const id = clean(request.id) || originalId || createId(`onc-${kind}`);
  const reason = mode === 'created' ? 'Carga inicial' : draft.reason;
  const action = mode === 'created' ? 'cargado' : 'modificado';
  const audit = auditStamp(action, actor, at, reason);
  const metrics = calculateOncologyHistoryMetrics(
    draft.weightKg,
    draft.heightCm,
    draft.totalDoseGy,
    draft.fractions
  );
  const storedEntry = storedStructuredEntry(draft, kind, metrics);
  const previousHistory = Array.isArray(original?.['history'])
    ? (original!['history'] as unknown[]).filter(isObject).map((item) => ({ ...item }))
    : [];
  const history = original
    ? [...previousHistory, {
        at,
        author: actor.displayName,
        userId: actor.userId,
        reason,
        snapshot: storedStructuredEntry(baseline!, kind, calculateOncologyHistoryMetrics(
          baseline!.weightKg,
          baseline!.heightCm,
          baseline!.totalDoseGy,
          baseline!.fractions
        ))
      }]
    : previousHistory;
  const sourceRef = {
    ...asRecord(original?.sourceRef),
    kind: 'oncology-history-entry',
    origin: 'clinical-sheet',
    entryKind: kind,
    clinicalEntryId: id,
    schemaVersion: 1
  };
  const main = mainDescription(draft, kind);
  const plainText = oncologyHistoryDraftPlainText(draft, kind, metrics);
  const record: ClinicalRecord = {
    ...(original || {}),
    id,
    date: draft.date,
    endDate: draft.endDate,
    createdAt: clean(original?.createdAt) || at,
    updatedAt: at,
    author: actor.displayName,
    diagnosis: draft.diagnosis,
    intent: draft.intent,
    status: draft.status,
    title: main,
    scheme: kind === 'systemic'
      ? draft.scheme
      : kind === 'radiotherapy'
        ? [draft.technique, draft.targetSite].filter(Boolean).join(' - ')
        : draft.procedure,
    category: treatmentCategory(draft, kind),
    kind,
    notes: draft.notes,
    summary: plainText,
    text: plainText,
    source: 'Historia clínica local',
    sourceRef,
    oncologyHistory: storedEntry,
    weightKg: draft.weightKg,
    heightCm: draft.heightCm,
    professional: draft.professional,
    institution: draft.institution,
    audit,
    history,
    version: Math.max(1, Number(original?.['version']) || 0) + (original ? 1 : 0)
  };

  const evolutionId = clean(request.evolutionId) || createId(`evo-${kind}`);
  const evolution: ClinicalRecord = {
    id: evolutionId,
    date: at.slice(0, 10),
    createdAt: at,
    updatedAt: at,
    author: actor.displayName,
    specialty: actor.specialty,
    reason,
    type: 'evolution',
    title: `${mode === 'created' ? 'Carga' : 'Modificación'} de ${oncologyHistoryEntryLabel(kind)}`,
    text: `${mode === 'created' ? 'Se cargó' : 'Se modificó'} ${oncologyHistoryEntryLabel(kind)} en la historia clínica.\n${plainText}`,
    immutable: true,
    source: 'Historia clínica local',
    sourceRef: {
      kind: 'oncology-history-entry-evolution',
      clinicalEntryId: id,
      entryKind: kind,
      recordVersion: record['version'],
      schemaVersion: 1
    },
    audit
  };

  const sourceMeta = asRecord(state.meta);
  const sectionKey = oncologyHistorySectionKey(kind);
  const sectionVersions = { ...asRecord(sourceMeta['sectionVersions']) };
  const existingVersions = Array.isArray(sectionVersions[sectionKey])
    ? (sectionVersions[sectionKey] as unknown[]).filter(isObject).map((item) => ({ ...item }))
    : [];
  const recordVersions = [...existingVersions];
  if (original && !recordVersions.some((version) => clean(version['recordId']) === id)) {
    const baselineAt = clean(original.createdAt) || clean(original.date) || at;
    const baselineActor = clean(original.author) || actor.displayName;
    const baselineAudit = {
      action: 'cargado',
      lastName: lastName(baselineActor),
      license: clean(asRecord(original['audit'])['license']) || 's/d',
      at: baselineAt,
      reason: 'Carga inicial'
    };
    recordVersions.push(sectionVersion(
      `${id}-initial`,
      id,
      baselineAt,
      baselineActor,
      'Carga inicial',
      oncologyHistoryDraftPlainText(
        baseline!,
        kind,
        calculateOncologyHistoryMetrics(
          baseline!.weightKg,
          baseline!.heightCm,
          baseline!.totalDoseGy,
          baseline!.fractions
        )
      ),
      baselineAudit
    ));
  }
  recordVersions.push(sectionVersion(
    evolutionId,
    id,
    at,
    actor.displayName,
    reason,
    plainText,
    audit
  ));
  sectionVersions[sectionKey] = recordVersions;
  const sectionAudit = { ...asRecord(sourceMeta['sectionAudit']), [sectionKey]: audit };
  const sectionFormModes = { ...asRecord(sourceMeta['sectionFormModes']), [sectionKey]: 'structured' };
  const sectionChangeRequests = {
    ...asRecord(sourceMeta['sectionChangeRequests']),
    [sectionKey]: {
      ...asRecord(asRecord(sourceMeta['sectionChangeRequests'])[sectionKey]),
      recordId: id,
      reason
    }
  };
  const currentProfessional = {
    ...asRecord(sourceMeta['currentProfessional']),
    userId: actor.userId,
    firstName: actor.displayName,
    lastName: actor.displayName,
    specialty: actor.specialty,
    license: actor.licenseNumber
  };
  const treatments = [...(state.treatments || [])];
  const existingIndex = treatments.findIndex((item) => clean(item.id) === id);
  if (existingIndex >= 0) treatments[existingIndex] = record;
  else treatments.push(record);

  return {
    mode,
    record,
    evolution,
    state: {
      ...state,
      treatments,
      evolutions: [...(state.evolutions || []), evolution],
      meta: {
        ...sourceMeta,
        currentUser: actor.displayName,
        currentProfessional,
        sectionVersions,
        sectionAudit,
        sectionFormModes,
        sectionChangeRequests,
        updatedAt: at
      }
    }
  };
}

export function oncologyHistoryDraftPlainText(
  draft: OncologyHistoryEntryDraft,
  kind: OncologyHistoryEntryKind,
  metrics = calculateOncologyHistoryMetrics(draft.weightKg, draft.heightCm, draft.totalDoseGy, draft.fractions)
): string {
  const lines = [
    valueLine('Fecha', dateRange(draft.date, draft.endDate)),
    valueLine('Diagnóstico', draft.diagnosis)
  ];
  if (kind === 'systemic') {
    lines.push(
      valueLine('Tipo', draft.treatmentType),
      valueLine('Esquema', draft.scheme),
      valueLine('Drogas', draft.drugs),
      valueLine('Ciclos', draft.cycles),
      valueLine('Respuesta', draft.response),
      valueLine('Toxicidad', draft.toxicity)
    );
  } else if (kind === 'radiotherapy') {
    lines.push(
      valueLine('Sitio / volumen', draft.targetSite),
      valueLine('Técnica', draft.technique),
      valueLine('Dosis total', draft.totalDoseGy ? `${draft.totalDoseGy} Gy` : ''),
      valueLine('Fracciones', draft.fractions),
      valueLine('Dosis por fracción', metrics.dosePerFractionGy === null ? '' : `${rounded(metrics.dosePerFractionGy, 3)} Gy`),
      valueLine('Tratamiento sistémico concomitante', draft.concurrentSystemic)
    );
  } else {
    lines.push(
      valueLine('Procedimiento', draft.procedure),
      valueLine('Sitio', draft.targetSite),
      valueLine('Cirujano/a', draft.surgeon),
      valueLine('Anatomía patológica', draft.pathology),
      valueLine('Márgenes', draft.margins),
      valueLine('Complicaciones', draft.complications)
    );
  }
  lines.push(
    valueLine('Intención', draft.intent),
    valueLine('Estado', draft.status),
    valueLine('Institución', draft.institution),
    valueLine('Profesional', draft.professional),
    valueLine('Peso', draft.weightKg ? `${draft.weightKg} kg` : ''),
    valueLine('Talla', draft.heightCm ? `${draft.heightCm} cm` : ''),
    valueLine('IMC', metrics.bmi === null ? '' : rounded(metrics.bmi, 2)),
    valueLine('Superficie corporal', metrics.bodySurfaceM2 === null ? '' : `${rounded(metrics.bodySurfaceM2, 3)} m²`),
    valueLine('Observaciones', draft.notes)
  );
  return lines.filter(Boolean).join('\n');
}

export function oncologyHistoryEntryHeading(record: ClinicalRecord, kind: OncologyHistoryEntryKind): string {
  const draft = oncologyHistoryDraftFromRecord(record, kind);
  return [dateRange(draft.date, draft.endDate), mainDescription(draft, kind)].filter(Boolean).join(' - ');
}

export function oncologyHistoryEntryBody(record: ClinicalRecord, kind: OncologyHistoryEntryKind): string {
  const draft = oncologyHistoryDraftFromRecord(record, kind);
  const metrics = calculateOncologyHistoryMetrics(draft.weightKg, draft.heightCm, draft.totalDoseGy, draft.fractions);
  const values = [
    draft.diagnosis ? `Diagnóstico: ${draft.diagnosis}` : '',
    draft.intent ? `Intención: ${draft.intent}` : '',
    draft.status ? `Estado: ${draft.status}` : '',
    kind === 'systemic' && draft.drugs ? `Drogas: ${draft.drugs}` : '',
    kind === 'systemic' && draft.cycles ? `Ciclos: ${draft.cycles}` : '',
    kind === 'radiotherapy' && draft.totalDoseGy ? `Dosis: ${draft.totalDoseGy} Gy` : '',
    kind === 'radiotherapy' && draft.fractions ? `Fracciones: ${draft.fractions}` : '',
    kind === 'radiotherapy' && metrics.dosePerFractionGy !== null ? `${rounded(metrics.dosePerFractionGy, 3)} Gy/fracción` : '',
    kind === 'surgery' && draft.targetSite ? `Sitio: ${draft.targetSite}` : '',
    draft.weightKg ? `Peso: ${draft.weightKg} kg` : '',
    draft.heightCm ? `Talla: ${draft.heightCm} cm` : '',
    metrics.bodySurfaceM2 !== null ? `SC: ${rounded(metrics.bodySurfaceM2, 3)} m²` : '',
    draft.notes
  ].filter(Boolean);
  return values.join(' · ');
}

export function oncologyHistoryAuditText(record: ClinicalRecord): string {
  const audit = asRecord(record['audit']);
  const actor = clean(record.author) || clean(audit['lastName']);
  const at = clean(record.updatedAt) || clean(audit['at']) || clean(record.createdAt);
  if (!actor && !at) return '';
  const action = clean(audit['action']) === 'modificado' ? 'Modificado' : 'Cargado';
  return [action, actor ? `por ${actor}` : '', at ? `el ${formatDateTime(at)}` : ''].filter(Boolean).join(' ');
}

export function isEditableOncologyHistoryRecord(record: ClinicalRecord, state: ClinicalState): boolean {
  const sourceRef = asRecord(record.sourceRef);
  if (clean(sourceRef['kind']) === 'oncology-history-entry') return true;
  if (!(state.treatments || []).some((item) => clean(item.id) === clean(record.id))) return false;
  const externalKind = clean(sourceRef['kind']).toLocaleLowerCase('es-AR');
  return !externalKind || (!externalKind.includes('oncological-treatment') && !externalKind.includes('lira'));
}

function normalizeDraft(source: OncologyHistoryEntryDraft, kind: OncologyHistoryEntryKind): OncologyHistoryEntryDraft {
  const draft = emptyOncologyHistoryDraft(kind);
  for (const key of Object.keys(draft) as Array<keyof OncologyHistoryEntryDraft>) {
    (draft as unknown as Record<string, string>)[key] = clean(source[key]);
  }
  (draft as unknown as Record<string, string>)['weightKg'] = decimalText(source.weightKg);
  (draft as unknown as Record<string, string>)['heightCm'] = decimalText(source.heightCm);
  (draft as unknown as Record<string, string>)['totalDoseGy'] = decimalText(source.totalDoseGy);
  (draft as unknown as Record<string, string>)['cycles'] = integerText(source.cycles);
  (draft as unknown as Record<string, string>)['fractions'] = integerText(source.fractions);
  return draft;
}

function validateDraft(
  draft: OncologyHistoryEntryDraft,
  kind: OncologyHistoryEntryKind,
  mode: 'created' | 'updated'
): void {
  if (!draft.date) fail('DATE_REQUIRED', 'Indique la fecha de inicio.', 'date');
  if (!validDate(draft.date)) fail('DATE_INVALID', 'La fecha de inicio no es válida.', 'date');
  if (draft.endDate && !validDate(draft.endDate)) fail('END_DATE_INVALID', 'La fecha de finalización no es válida.', 'endDate');
  if (draft.endDate && draft.endDate < draft.date) {
    fail('END_DATE_BEFORE_START', 'La fecha de finalización no puede ser anterior al inicio.', 'endDate');
  }
  if (!draft.diagnosis) fail('DIAGNOSIS_REQUIRED', 'Seleccione o escriba el diagnóstico tratado.', 'diagnosis');
  if (kind === 'systemic' && !draft.scheme) fail('SCHEME_REQUIRED', 'Indique el esquema del tratamiento.', 'scheme');
  if (kind === 'radiotherapy' && !draft.targetSite) fail('TARGET_REQUIRED', 'Indique el sitio o volumen irradiado.', 'targetSite');
  if (kind === 'radiotherapy' && !draft.technique) fail('TECHNIQUE_REQUIRED', 'Indique la técnica de radioterapia.', 'technique');
  if (kind === 'surgery' && !draft.procedure) fail('PROCEDURE_REQUIRED', 'Indique el procedimiento quirúrgico.', 'procedure');
  validateDecimalRange(draft.weightKg, ONCOLOGY_HISTORY_WEIGHT_MIN_KG, ONCOLOGY_HISTORY_WEIGHT_MAX_KG,
    'WEIGHT_INVALID', 'WEIGHT_OUT_OF_RANGE', 'Peso', 'weightKg');
  validateDecimalRange(draft.heightCm, ONCOLOGY_HISTORY_HEIGHT_MIN_CM, ONCOLOGY_HISTORY_HEIGHT_MAX_CM,
    'HEIGHT_INVALID', 'HEIGHT_OUT_OF_RANGE', 'Talla en centímetros', 'heightCm');
  validatePositiveInteger(draft.cycles, 1_000, 'CYCLES_INVALID', 'Cantidad de ciclos', 'cycles');
  validatePositiveInteger(draft.fractions, 1_000, 'FRACTIONS_INVALID', 'Cantidad de fracciones', 'fractions');
  if (draft.totalDoseGy) {
    const dose = decimal(draft.totalDoseGy);
    if (dose === null || dose <= 0 || dose > 1_000) {
      fail('DOSE_INVALID', 'La dosis total debe ser un número mayor que cero expresado en Gy.', 'totalDoseGy');
    }
  }
  for (const [key, value] of Object.entries(draft)) {
    if (key === 'reason') continue;
    const maximum = key === 'notes' || key === 'pathology' ? ONCOLOGY_HISTORY_NOTES_LIMIT : ONCOLOGY_HISTORY_SHORT_TEXT_LIMIT;
    if (value.length > maximum) fail('TEXT_TOO_LONG', `El campo supera el máximo de ${maximum} caracteres.`, key);
  }
  if (mode === 'updated' && !draft.reason) {
    fail('REASON_REQUIRED', 'Indique el motivo de la modificación.', 'reason');
  }
  if (draft.reason.length > ONCOLOGY_HISTORY_REASON_LIMIT) {
    fail('REASON_TOO_LONG', `El motivo no puede superar ${ONCOLOGY_HISTORY_REASON_LIMIT} caracteres.`, 'reason');
  }
}

function sameClinicalDraft(left: OncologyHistoryEntryDraft, right: OncologyHistoryEntryDraft): boolean {
  return (Object.keys(left) as Array<keyof OncologyHistoryEntryDraft>)
    .filter((key) => key !== 'reason')
    .every((key) => left[key] === right[key]);
}

function storedStructuredEntry(
  draft: OncologyHistoryEntryDraft,
  kind: OncologyHistoryEntryKind,
  metrics: OncologyHistoryMetrics
): Record<string, unknown> {
  const { reason: _reason, ...clinical } = draft;
  return {
    schemaVersion: 1,
    entryKind: kind,
    ...clinical,
    bmi: metrics.bmi === null ? null : Number(rounded(metrics.bmi, 4)),
    bodySurfaceM2: metrics.bodySurfaceM2 === null ? null : Number(rounded(metrics.bodySurfaceM2, 4)),
    dosePerFractionGy: metrics.dosePerFractionGy === null ? null : Number(rounded(metrics.dosePerFractionGy, 4))
  };
}

function mainDescription(draft: OncologyHistoryEntryDraft, kind: OncologyHistoryEntryKind): string {
  if (kind === 'systemic') return draft.scheme;
  if (kind === 'radiotherapy') return [draft.technique, draft.targetSite].filter(Boolean).join(' - ');
  return draft.procedure;
}

function treatmentCategory(draft: OncologyHistoryEntryDraft, kind: OncologyHistoryEntryKind): string {
  if (kind !== 'systemic') return kind;
  const value = normalize(draft.treatmentType);
  if (value.includes('quimio')) return 'chemotherapy';
  if (value.includes('inmun')) return 'immunotherapy';
  if (value.includes('hormon')) return 'hormone';
  if (value.includes('dirig')) return 'targeted';
  return 'systemic';
}

function auditStamp(action: string, actor: OncologyHistoryActor, at: string, reason: string): Record<string, unknown> {
  return {
    action,
    userId: actor.userId,
    username: actor.username,
    lastName: lastName(actor.displayName),
    displayName: actor.displayName,
    specialty: actor.specialty,
    license: actor.licenseNumber || 's/d',
    at,
    reason
  };
}

function sectionVersion(
  id: string,
  recordId: string,
  createdAt: string,
  author: string,
  reason: string,
  content: string,
  audit: Record<string, unknown>
): Record<string, unknown> {
  return { id, recordId, createdAt, author, reason, content, audit };
}

function normalizeActor(actor: OncologyHistoryActor): OncologyHistoryActor {
  const username = clean(actor.username) || 'usuario';
  return {
    userId: clean(actor.userId),
    username,
    displayName: clean(actor.displayName) || username,
    specialty: clean(actor.specialty),
    licenseNumber: clean(actor.licenseNumber)
  };
}

function validateDecimalRange(
  value: string,
  minimum: number,
  maximum: number,
  invalidCode: OncologyHistoryEntryErrorCode,
  rangeCode: OncologyHistoryEntryErrorCode,
  label: string,
  field: string
): void {
  if (!value) return;
  const numeric = decimal(value);
  if (numeric === null) fail(invalidCode, `${label} debe ser un número válido.`, field);
  if (numeric! < minimum || numeric! > maximum) {
    fail(rangeCode, `${label} debe estar entre ${minimum} y ${maximum}.`, field);
  }
}

function validatePositiveInteger(
  value: string,
  maximum: number,
  code: OncologyHistoryEntryErrorCode,
  label: string,
  field: string
): void {
  if (!value) return;
  const numeric = integer(value);
  if (numeric === null || numeric <= 0 || numeric > maximum) {
    fail(code, `${label} debe ser un número entero entre 1 y ${maximum}.`, field);
  }
}

function fail(code: OncologyHistoryEntryErrorCode, message: string, field = ''): never {
  throw new OncologyHistoryEntryError(code, message, field);
}

function valueLine(label: string, value: unknown): string {
  const content = clean(value);
  return content ? `${label}: ${content}` : '';
}

function dateRange(start: string, end: string): string {
  if (!start) return '';
  const startLabel = formatDate(start);
  return end && end !== start ? `${startLabel} al ${formatDate(end)}` : startLabel;
}

function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(parsed);
}

function validDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validTimestamp(value: unknown): string {
  const candidate = clean(value);
  return candidate && !Number.isNaN(new Date(candidate).getTime()) ? candidate : '';
}

function storedHeightCm(value: unknown): string {
  const numeric = decimal(value);
  if (numeric === null || numeric <= 0) return '';
  return decimalText(numeric <= 3 ? numeric * 100 : numeric);
}

function decimalText(value: unknown): string {
  const numeric = decimal(value);
  if (numeric === null) return clean(value);
  return String(Number(numeric.toFixed(4)));
}

function integerText(value: unknown): string {
  const numeric = integer(value);
  return numeric === null ? clean(value) : String(numeric);
}

function decimal(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = clean(value).replace(',', '.');
  if (!raw || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : null;
}

function integer(value: unknown): number | null {
  const raw = clean(value);
  if (!raw || !/^\d+$/.test(raw)) return null;
  const numeric = Number(raw);
  return Number.isSafeInteger(numeric) ? numeric : null;
}

function rounded(value: number, digits: number): string {
  return String(Number(value.toFixed(digits)));
}

function clean(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/\r\n?/g, '\n').trim()
    : value === null || value === undefined ? '' : String(value).trim();
}

function firstValue(...values: unknown[]): unknown {
  return values.find((value) => clean(value).length > 0) ?? '';
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR').trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function lastName(value: string): string {
  const words = clean(value).split(/\s+/).filter(Boolean);
  return words.at(-1) || 's/d';
}

function createId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}
