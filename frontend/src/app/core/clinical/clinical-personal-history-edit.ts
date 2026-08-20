import type { ClinicalState } from '../patients/patient-workspace.models';

export const CLINICAL_PERSONAL_HISTORY_TEXT_LIMIT = 50_000;

export type ClinicalPersonalHistoryEditErrorCode =
  | 'STRUCTURED_PERSONAL_HISTORY_UNSUPPORTED'
  | 'EMPTY_PERSONAL_HISTORY'
  | 'BACKGROUND_CLINICAL_TOO_LONG'
  | 'CURRENT_MEDICATION_TOO_LONG'
  | 'FAMILY_ONCOLOGY_TOO_LONG'
  | 'GYNECOLOGY_TOO_LONG'
  | 'REASON_REQUIRED'
  | 'REASON_TOO_LONG'
  | 'NO_CHANGES';

export interface ClinicalPersonalHistoryActor {
  readonly userId: string | number;
  readonly username: string;
  readonly displayName: string;
  readonly licenseNumber: string;
}

export interface ClinicalPersonalHistoryBaseline {
  readonly backgroundClinical: string;
  readonly currentMedication: string;
  readonly familyOncology: string;
  readonly gynecology: string;
  readonly initial: boolean;
}

export interface StructuredPersonalHistoryEdit {
  readonly backgroundClinical: string;
  readonly currentMedication: string;
  readonly familyOncology: string;
  readonly gynecology: string;
  readonly reason?: string;
  readonly at?: string;
  readonly id?: string;
  readonly actor: ClinicalPersonalHistoryActor;
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

export class ClinicalPersonalHistoryEditError extends Error {
  constructor(
    readonly code: ClinicalPersonalHistoryEditErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ClinicalPersonalHistoryEditError';
  }
}

const PERSONAL_HISTORY_FIELDS = [
  {
    key: 'backgroundClinical',
    label: 'Clínicos / quirúrgicos',
    tooLong: 'BACKGROUND_CLINICAL_TOO_LONG'
  },
  {
    key: 'currentMedication',
    label: 'Medicación habitual',
    tooLong: 'CURRENT_MEDICATION_TOO_LONG'
  },
  {
    key: 'familyOncology',
    label: 'Oncofamiliares',
    tooLong: 'FAMILY_ONCOLOGY_TOO_LONG'
  },
  {
    key: 'gynecology',
    label: 'Gineco-obstétricos',
    tooLong: 'GYNECOLOGY_TOO_LONG'
  }
] as const;

/** Matches the structured/form compatibility decision used by the legacy client. */
export function supportsStructuredPersonalHistory(state: ClinicalState): boolean {
  const narrative = record(state.narrative);
  if (PERSONAL_HISTORY_FIELDS.some(({ key }) => !isStructuredTextValue(narrative[key]))) {
    return false;
  }

  const meta = record(state.meta);
  const formModes = record(meta['sectionFormModes']);
  if (formModes['personalHistory'] === 'structured') return true;

  const liraImport = record(meta['liraImport']);
  if (text(liraImport['origin']) !== 'local') return false;

  const versions = record(meta['sectionVersions'])['personalHistory'];
  return !Array.isArray(versions) || versions.length === 0;
}

/** Returns the last versioned text only when the record must keep its legacy presentation. */
export function personalHistoryLegacySnapshot(state: ClinicalState): string {
  const formModes = record(record(state.meta)['sectionFormModes']);
  if (formModes['personalHistory'] === 'structured') return '';
  if (supportsStructuredPersonalHistory(state)) return '';
  const versions = personalHistoryVersions(state);
  return text(record(versions.at(-1))['content']);
}

export function personalHistoryBaseline(state: ClinicalState): ClinicalPersonalHistoryBaseline {
  const narrative = record(state.narrative);
  const baseline = {
    backgroundClinical: text(narrative['backgroundClinical']),
    currentMedication: text(narrative['currentMedication']),
    familyOncology: text(narrative['familyOncology']),
    gynecology: text(narrative['gynecology'])
  };
  return {
    ...baseline,
    initial: !personalHistorySnapshot(baseline) && personalHistoryVersions(state).length === 0
  };
}

/** Stable, explicit alias used by structured section editors. */
export const structuredPersonalHistoryBaseline = personalHistoryBaseline;

/** Applies one structured personal-history edit without mutating the supplied state. */
export function applyStructuredPersonalHistoryEdit(
  state: ClinicalState,
  edit: StructuredPersonalHistoryEdit
): ClinicalState {
  if (!supportsStructuredPersonalHistory(state)) {
    fail(
      'STRUCTURED_PERSONAL_HISTORY_UNSUPPORTED',
      'Esta historia conserva el editor de texto compatible con su formato anterior.'
    );
  }

  const draft = {
    backgroundClinical: text(edit.backgroundClinical),
    currentMedication: text(edit.currentMedication),
    familyOncology: text(edit.familyOncology),
    gynecology: text(edit.gynecology)
  };
  const reasonInput = text(edit.reason);
  const baseline = personalHistoryBaseline(state);

  for (const field of PERSONAL_HISTORY_FIELDS) {
    if (draft[field.key] !== baseline[field.key]) {
      assertLength(draft[field.key], field.tooLong, field.label);
    }
  }
  assertLength(reasonInput, 'REASON_TOO_LONG', 'El motivo de la modificación');

  const content = personalHistorySnapshot(draft);
  if (baseline.initial && !content) {
    fail('EMPTY_PERSONAL_HISTORY', 'Complete al menos un antecedente personal.');
  }
  if (!baseline.initial && !reasonInput) {
    fail('REASON_REQUIRED', 'Indique el motivo de la modificación.');
  }
  if (PERSONAL_HISTORY_FIELDS.every(({ key }) => draft[key] === baseline[key])) {
    fail('NO_CHANGES', 'No hay cambios para guardar.');
  }

  const previousContent = personalHistorySnapshot(baseline);
  const at = text(edit.at) || new Date().toISOString();
  const mainId = text(edit.id) || createVersionId('sec-personalHistory');
  const sourceMeta = record(state.meta);
  const sourceNarrative = record(state.narrative);
  const sourceProfessional = record(sourceMeta['currentProfessional']);
  const actor = normalizedActor(edit.actor, sourceMeta, sourceProfessional);
  const action = baseline.initial ? 'cargado' : 'modificado';
  const audit = auditStamp(action, actor.displayName, actor.license, at);
  const existingVersions = personalHistoryVersions(state);
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

  const sectionVersions = {
    ...record(sourceMeta['sectionVersions']),
    personalHistory: versions
  };
  const sectionAudit = {
    ...record(sourceMeta['sectionAudit']),
    personalHistory: audit
  };
  const sectionFormModes = {
    ...record(sourceMeta['sectionFormModes']),
    personalHistory: 'structured'
  };
  const sourceSectionChangeRequests = record(sourceMeta['sectionChangeRequests']);
  const sectionChangeRequests = {
    ...sourceSectionChangeRequests,
    personalHistory: {
      ...record(sourceSectionChangeRequests['personalHistory']),
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

  return {
    ...state,
    narrative: {
      ...sourceNarrative,
      ...draft
    },
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

function personalHistorySnapshot(values: Pick<ClinicalPersonalHistoryBaseline,
  'backgroundClinical' | 'currentMedication' | 'familyOncology' | 'gynecology'>): string {
  return PERSONAL_HISTORY_FIELDS
    .map(({ key, label }) => labeledText(label, values[key]))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function personalHistoryVersions(state: ClinicalState): unknown[] {
  const value = record(record(state.meta)['sectionVersions'])['personalHistory'];
  return Array.isArray(value) ? value : [];
}

function isInitialVersion(value: unknown): boolean {
  return text(record(record(value)['audit'])['action']) === 'cargado';
}

function sectionVersion(
  id: string,
  reason: string,
  content: string,
  audit: SectionAudit
): SectionVersion {
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
  actor: ClinicalPersonalHistoryActor,
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
  code: Extract<ClinicalPersonalHistoryEditErrorCode,
    | 'BACKGROUND_CLINICAL_TOO_LONG'
    | 'CURRENT_MEDICATION_TOO_LONG'
    | 'FAMILY_ONCOLOGY_TOO_LONG'
    | 'GYNECOLOGY_TOO_LONG'
    | 'REASON_TOO_LONG'>,
  label: string
): void {
  if (value.length > CLINICAL_PERSONAL_HISTORY_TEXT_LIMIT) {
    fail(code, `${label} no puede superar los ${CLINICAL_PERSONAL_HISTORY_TEXT_LIMIT.toLocaleString('es-AR')} caracteres.`);
  }
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

function text(value: unknown): string {
  return scalarText(value).trim();
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function fail(code: ClinicalPersonalHistoryEditErrorCode, message: string): never {
  throw new ClinicalPersonalHistoryEditError(code, message);
}

function createVersionId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${randomId}`;
}
