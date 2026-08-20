import type { ClinicalState } from '../patients/patient-workspace.models';

export const CLINICAL_PHYSICAL_EXAM_TEXT_LIMIT = 50_000;
export const CLINICAL_PHYSICAL_EXAM_WEIGHT_MIN_KG = 0.01;
export const CLINICAL_PHYSICAL_EXAM_WEIGHT_MAX_KG = 500;
export const CLINICAL_PHYSICAL_EXAM_HEIGHT_MIN_CM = 30;
export const CLINICAL_PHYSICAL_EXAM_HEIGHT_MAX_CM = 250;
export const DEFAULT_PHYSICAL_EXAM_TEXT = 'Estado general: paciente en buen estado general. Karnofsky 100. Normohidratada. Afebril. Corazón: R1 y R2 normofonéticos, silencios libres. Tórax: murmullo vesicular conservado sin ruidos agregados. Abdomen: blando, depresible, indoloro. SNC: sin signos neurológicos focales.';

export type ClinicalPhysicalExamEditErrorCode =
  | 'STRUCTURED_PHYSICAL_EXAM_UNSUPPORTED'
  | 'EMPTY_PHYSICAL_EXAM'
  | 'WEIGHT_INVALID'
  | 'WEIGHT_OUT_OF_RANGE'
  | 'HEIGHT_INVALID'
  | 'HEIGHT_OUT_OF_RANGE'
  | 'TEXT_TOO_LONG'
  | 'REASON_REQUIRED'
  | 'REASON_TOO_LONG'
  | 'NO_CHANGES';

export interface ClinicalPhysicalExamActor {
  readonly userId: string | number;
  readonly username: string;
  readonly displayName: string;
  readonly licenseNumber: string;
}

export interface ClinicalPhysicalExamBaseline {
  /** UI value. Always centimetres, even though the persisted legacy key is exam.heightM. */
  readonly heightCm: string;
  readonly weightKg: string;
  readonly physicalExam: string;
  readonly initial: boolean;
}

export interface ClinicalPhysicalExamMetrics {
  readonly bmi: number | null;
  readonly bodySurfaceM2: number | null;
}

export interface ClinicalPhysicalExamRow {
  readonly label: string;
  readonly text: string;
}

export interface StructuredPhysicalExamEdit {
  readonly weightKg: string | number;
  readonly heightCm: string | number;
  readonly physicalExam: string;
  readonly reason?: string;
  readonly at?: string;
  readonly id?: string;
  readonly actor: ClinicalPhysicalExamActor;
}

interface SectionAudit extends Record<string, unknown> {
  action: 'cargado' | 'modificado';
  lastName: string;
  license: string;
  at: string;
}

interface SectionVersion extends Record<string, unknown> {
  id: string;
  createdAt: string;
  author: string;
  license: string;
  reason: string;
  content: string;
  audit: SectionAudit;
}

export class ClinicalPhysicalExamEditError extends Error {
  constructor(
    readonly code: ClinicalPhysicalExamEditErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ClinicalPhysicalExamEditError';
  }
}

/** Matches the structured/form compatibility decision used by the legacy client. */
export function supportsStructuredPhysicalExam(state: ClinicalState): boolean {
  if (!isOptionalRecord(state.exam) || !isOptionalRecord(state.narrative)) return false;
  const exam = record(state.exam);
  const narrative = record(state.narrative);
  if (!isStructuredDecimalValue(exam['heightM'])
      || !isStructuredDecimalValue(exam['weightKg'])
      || !isStructuredTextValue(narrative['physicalExam'])) {
    return false;
  }

  const meta = record(state.meta);
  const formModes = record(meta['sectionFormModes']);
  if (formModes['physicalExam'] === 'structured') return true;

  const liraImport = record(meta['liraImport']);
  if (text(liraImport['origin']) !== 'local') return false;

  const versions = record(meta['sectionVersions'])['physicalExam'];
  return !Array.isArray(versions) || versions.length === 0;
}

/** Returns the last versioned text only when the record must keep its legacy presentation. */
export function physicalExamLegacySnapshot(state: ClinicalState): string {
  const formModes = record(record(state.meta)['sectionFormModes']);
  if (formModes['physicalExam'] === 'structured') return '';
  if (supportsStructuredPhysicalExam(state)) return '';
  const versions = physicalExamVersions(state);
  return text(record(versions.at(-1))['content']);
}

export function physicalExamBaseline(state: ClinicalState): ClinicalPhysicalExamBaseline {
  const exam = record(state.exam);
  const narrative = record(state.narrative);
  const baseline = {
    weightKg: normalizedDecimalText(exam['weightKg']),
    heightCm: normalizedStoredHeightCm(exam['heightM']),
    physicalExam: text(narrative['physicalExam'])
  };
  return {
    ...baseline,
    initial: !physicalExamSnapshot(baseline) && physicalExamVersions(state).length === 0
  };
}

/** Calculates BMI and Du Bois body-surface area from the centimetre UI values. */
export function calculatePhysicalExamMetrics(
  weightValue: string | number,
  heightCmValue: string | number
): ClinicalPhysicalExamMetrics {
  const weightKg = decimal(weightValue);
  const heightCm = decimal(heightCmValue);
  if (weightKg === null || heightCm === null
      || weightKg <= 0 || heightCm <= 0) {
    return { bmi: null, bodySurfaceM2: null };
  }
  const heightM = heightCm / 100;
  return {
    bmi: weightKg / (heightM * heightM),
    bodySurfaceM2: 0.007184 * Math.pow(weightKg, 0.425) * Math.pow(heightCm, 0.725)
  };
}

/** Legacy-compatible projection used by the paper sheet and version snapshots. */
export function physicalExamRows(value: unknown): ClinicalPhysicalExamRow[] {
  const source = cleanPhysicalExamText(value);
  if (!source) return [];
  const patterns = [
    { label: 'Tórax', regex: /\b(?:aparato respiratorio|respiratorio|t[oó]rax)\b\s*:?\s*/gi },
    { label: 'Corazón', regex: /\b(?:aparato cardiovascular|cardiovascular|coraz[oó]n)\b\s*:?\s*/gi },
    { label: 'Abdomen', regex: /\babdomen\b\s*:?\s*/gi },
    { label: 'SNC', regex: /\b(?:sistema nervioso central|snc)\b\s*:?\s*/gi },
    { label: 'Tacto rectal', regex: /\btacto rectal\b\s*:?\s*/gi }
  ];
  const markers = patterns.flatMap(({ label, regex }) => {
    const matches: Array<{ label: string; start: number; end: number }> = [];
    let match = regex.exec(source);
    while (match) {
      matches.push({ label, start: match.index, end: regex.lastIndex });
      match = regex.exec(source);
    }
    regex.lastIndex = 0;
    return matches;
  }).sort((left, right) => left.start - right.start || right.end - left.end)
    .filter((marker, index, sorted) => !sorted.slice(0, index)
      .some((previous) => marker.start < previous.end));
  if (!markers.length) return [{ label: 'Estado general', text: source }];

  const rows: ClinicalPhysicalExamRow[] = [];
  const general = cleanPhysicalExamSegment(source.slice(0, markers[0].start));
  if (general) rows.push({ label: 'Estado general', text: general });
  markers.forEach((marker, index) => {
    const nextStart = markers[index + 1]?.start ?? source.length;
    const segment = cleanPhysicalExamSegment(source.slice(marker.end, nextStart));
    if (segment) rows.push({ label: marker.label, text: segment });
  });
  return rows.length ? rows : [{ label: 'Estado general', text: source }];
}

export function formatPhysicalExamPlainText(value: unknown): string {
  return physicalExamRows(value).map((row) => `${row.label}: ${row.text}`).join('\n');
}

/** Applies one structured physical-exam edit without mutating the supplied state. */
export function applyStructuredPhysicalExamEdit(
  state: ClinicalState,
  edit: StructuredPhysicalExamEdit
): ClinicalState {
  if (!supportsStructuredPhysicalExam(state)) {
    fail(
      'STRUCTURED_PHYSICAL_EXAM_UNSUPPORTED',
      'Esta historia conserva el editor de texto compatible con su formato anterior.'
    );
  }

  const baseline = physicalExamBaseline(state);
  const draft = {
    weightKg: normalizedDecimalText(edit.weightKg),
    heightCm: normalizedHeightCmText(edit.heightCm),
    physicalExam: text(edit.physicalExam)
  };
  const reasonInput = text(edit.reason);
  if (draft.weightKg !== baseline.weightKg) validateWeight(draft.weightKg);
  if (draft.heightCm !== baseline.heightCm) validateHeight(draft.heightCm);
  if (draft.physicalExam !== baseline.physicalExam) {
    assertLength(draft.physicalExam, 'TEXT_TOO_LONG', 'El examen físico');
  }
  assertLength(reasonInput, 'REASON_TOO_LONG', 'El motivo de la modificación');

  const content = physicalExamSnapshot(draft);
  if (baseline.initial && !content) {
    fail('EMPTY_PHYSICAL_EXAM', 'Complete al menos un campo del examen físico.');
  }
  if (!baseline.initial && !reasonInput) {
    fail('REASON_REQUIRED', 'Indique el motivo de la modificación.');
  }
  if (draft.weightKg === baseline.weightKg
      && draft.heightCm === baseline.heightCm
      && draft.physicalExam === baseline.physicalExam) {
    fail('NO_CHANGES', 'No hay cambios para guardar.');
  }

  const previousContent = physicalExamSnapshot(baseline);
  const at = text(edit.at) || new Date().toISOString();
  const mainId = text(edit.id) || createVersionId('sec-physicalExam');
  const sourceMeta = record(state.meta);
  const sourceExam = record(state.exam);
  const sourceNarrative = record(state.narrative);
  const sourceProfessional = record(sourceMeta['currentProfessional']);
  const actor = normalizedActor(edit.actor, sourceMeta, sourceProfessional);
  const action = baseline.initial ? 'cargado' : 'modificado';
  const audit = auditStamp(action, actor.displayName, actor.license, at);
  const existingVersions = physicalExamVersions(state);
  const versions = [...existingVersions];

  if (!baseline.initial && !versions.some(isInitialVersion)) {
    const initialAt = text(sourceMeta['createdAt']) || text(sourceMeta['updatedAt']) || at;
    const initialAudit = auditStamp('cargado', actor.displayName, actor.license, initialAt);
    const firstContent = versions.length > 0
      ? text(record(versions[0])['content']) || previousContent
      : previousContent;
    versions.unshift(sectionVersion(
      `${mainId}-initial`,
      'Carga inicial',
      firstContent || 'Sin datos cargados.',
      initialAudit
    ));
  }

  versions.push(sectionVersion(
    mainId,
    baseline.initial ? 'Carga inicial' : reasonInput,
    content || 'Sin datos cargados.',
    audit
  ));

  const sectionVersions = { ...record(sourceMeta['sectionVersions']), physicalExam: versions };
  const sectionAudit = { ...record(sourceMeta['sectionAudit']), physicalExam: audit };
  const sectionFormModes = { ...record(sourceMeta['sectionFormModes']), physicalExam: 'structured' };
  const sourceSectionChangeRequests = record(sourceMeta['sectionChangeRequests']);
  const sectionChangeRequests = {
    ...sourceSectionChangeRequests,
    physicalExam: {
      ...record(sourceSectionChangeRequests['physicalExam']),
      reason: baseline.initial ? 'Carga inicial' : reasonInput
    }
  };
  const currentProfessional = {
    ...sourceProfessional,
    firstName: actor.displayName,
    lastName: actor.displayName,
    license: actor.license,
    userId: edit.actor.userId
  };
  const weightStored = draft.weightKg === baseline.weightKg
    ? sourceExam['weightKg'] ?? ''
    : draft.weightKg;
  const heightStored = draft.heightCm === baseline.heightCm
    ? sourceExam['heightM'] ?? ''
    : heightMetersText(draft.heightCm);

  return {
    ...state,
    exam: { ...sourceExam, weightKg: weightStored, heightM: heightStored },
    narrative: { ...sourceNarrative, physicalExam: draft.physicalExam },
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
  };
}

function validateWeight(value: string): void {
  if (!value) return;
  const numeric = decimal(value);
  if (numeric === null) fail('WEIGHT_INVALID', 'Peso (kg) debe ser un número válido.');
  if (numeric < CLINICAL_PHYSICAL_EXAM_WEIGHT_MIN_KG
      || numeric > CLINICAL_PHYSICAL_EXAM_WEIGHT_MAX_KG) {
    fail('WEIGHT_OUT_OF_RANGE', `Peso (kg) debe estar entre ${CLINICAL_PHYSICAL_EXAM_WEIGHT_MIN_KG} y ${CLINICAL_PHYSICAL_EXAM_WEIGHT_MAX_KG}.`);
  }
}

function validateHeight(value: string): void {
  if (!value) return;
  const numeric = decimal(value);
  if (numeric === null) fail('HEIGHT_INVALID', 'Talla (cm) debe ser un número válido.');
  if (numeric < CLINICAL_PHYSICAL_EXAM_HEIGHT_MIN_CM
      || numeric > CLINICAL_PHYSICAL_EXAM_HEIGHT_MAX_CM) {
    fail('HEIGHT_OUT_OF_RANGE', 'Talla debe ingresarse en centímetros, entre 30 y 250 cm.');
  }
}

function physicalExamSnapshot(values: Pick<ClinicalPhysicalExamBaseline,
  'weightKg' | 'heightCm' | 'physicalExam'>): string {
  return [
    labeledText('Peso', values.weightKg ? `${values.weightKg} kg` : ''),
    labeledText('Talla', values.heightCm ? `${values.heightCm} cm` : ''),
    formatPhysicalExamPlainText(values.physicalExam)
  ].filter(Boolean).join('\n').trim();
}

function physicalExamVersions(state: ClinicalState): unknown[] {
  const value = record(record(state.meta)['sectionVersions'])['physicalExam'];
  return Array.isArray(value) ? value : [];
}

function isInitialVersion(value: unknown): boolean {
  return text(record(record(value)['audit'])['action']) === 'cargado';
}

function sectionVersion(id: string, reason: string, content: string, audit: SectionAudit): SectionVersion {
  return {
    id,
    createdAt: audit.at,
    author: audit.lastName,
    license: audit.license,
    reason,
    content,
    audit: { ...audit }
  };
}

function auditStamp(
  action: SectionAudit['action'],
  lastName: string,
  license: string,
  at: string
): SectionAudit {
  return { action, lastName, license, at };
}

function normalizedActor(
  actor: ClinicalPhysicalExamActor,
  meta: Record<string, unknown>,
  professional: Record<string, unknown>
): { displayName: string; license: string } {
  const displayName = text(actor.displayName)
    || text(actor.username)
    || text(professional['lastName'])
    || text(meta['currentUser'])
    || 'Profesional';
  const license = text(actor.licenseNumber)
    || text(professional['license'])
    || text(meta['currentLicense'])
    || 's/d';
  return { displayName, license };
}

function assertLength(
  value: string,
  code: Extract<ClinicalPhysicalExamEditErrorCode, 'TEXT_TOO_LONG' | 'REASON_TOO_LONG'>,
  label: string
): void {
  if (value.length > CLINICAL_PHYSICAL_EXAM_TEXT_LIMIT) {
    fail(code, `${label} no puede superar los ${CLINICAL_PHYSICAL_EXAM_TEXT_LIMIT.toLocaleString('es-AR')} caracteres.`);
  }
}

function normalizedStoredHeightCm(value: unknown): string {
  const numeric = decimal(value);
  if (numeric === null || numeric <= 0) return scalarText(value).trim();
  return normalizedHeightCmText(numeric <= 3 ? numeric * 100 : numeric);
}

function heightMetersText(heightCm: string): string {
  if (!heightCm) return '';
  const numeric = decimal(heightCm);
  if (numeric === null) return heightCm;
  return normalizedDecimalText(Math.round((numeric / 100) * 10_000) / 10_000);
}

function normalizedDecimalText(value: unknown): string {
  const raw = scalarText(value).trim();
  if (!raw) return '';
  const numeric = decimal(raw);
  return numeric === null ? raw : String(numeric);
}

function normalizedHeightCmText(value: unknown): string {
  const raw = scalarText(value).trim();
  if (!raw) return '';
  const numeric = decimal(raw);
  return numeric === null ? raw : String(Math.round(numeric * 10) / 10);
}

function decimal(value: unknown): number | null {
  const raw = scalarText(value).trim().replace(',', '.');
  if (!raw) return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : null;
}

function labeledText(label: string, value: unknown): string {
  const normalized = scalarText(value);
  return normalized.trim() ? `${label}: ${normalized}` : '';
}

function scalarText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function isStructuredTextValue(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string';
}

function isStructuredScalarValue(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string' || typeof value === 'number';
}

function isOptionalRecord(value: unknown): boolean {
  return value === undefined || value === null
    || (typeof value === 'object' && !Array.isArray(value));
}

function isStructuredDecimalValue(value: unknown): boolean {
  if (!isStructuredScalarValue(value)) return false;
  const raw = scalarText(value).trim();
  return !raw || decimal(raw) !== null;
}

function cleanPhysicalExamText(value: unknown): string {
  return scalarText(value)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^examen f[ií]sico(?: al ingreso)?\s*:?\s*/i, '');
}

function cleanPhysicalExamSegment(value: unknown): string {
  return scalarText(value)
    .trim()
    .replace(/^[.:;\-\s]+/, '')
    .replace(/^(?:estado general|general|aparato respiratorio|respiratorio|t[oó]rax|aparato cardiovascular|cardiovascular|coraz[oó]n|abdomen|sistema nervioso central|snc|tacto rectal)\s*:?\s*/i, '')
    .trim();
}

function text(value: unknown): string { return scalarText(value).trim(); }

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function fail(code: ClinicalPhysicalExamEditErrorCode, message: string): never {
  throw new ClinicalPhysicalExamEditError(code, message);
}

function createVersionId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${randomId}`;
}
