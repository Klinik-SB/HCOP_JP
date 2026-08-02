import type { ClinicalState } from '../patients/patient-workspace.models';

export const CLINICAL_CHIEF_COMPLAINT_TEXT_LIMIT = 50_000;

export type ClinicalChiefComplaintEditErrorCode =
  | 'STRUCTURED_CHIEF_COMPLAINT_UNSUPPORTED'
  | 'EMPTY_CHIEF_COMPLAINT'
  | 'CHIEF_COMPLAINT_TOO_LONG'
  | 'REASON_REQUIRED'
  | 'REASON_TOO_LONG'
  | 'NO_CHANGES';

export interface ClinicalChiefComplaintActor {
  readonly userId: string | number;
  readonly username: string;
  readonly displayName: string;
  readonly licenseNumber: string;
}

export interface ClinicalChiefComplaintBaseline {
  readonly chiefComplaint: string;
  readonly initial: boolean;
}

export interface StructuredChiefComplaintEdit {
  readonly chiefComplaint: string;
  readonly reason?: string;
  readonly at?: string;
  readonly id?: string;
  readonly actor: ClinicalChiefComplaintActor;
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

export class ClinicalChiefComplaintEditError extends Error {
  constructor(
    readonly code: ClinicalChiefComplaintEditErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ClinicalChiefComplaintEditError';
  }
}

/** Reproduce la decisión de compatibilidad del editor estructurado legacy. */
export function supportsStructuredChiefComplaint(state: ClinicalState): boolean {
  const narrative = record(state.narrative);
  if (!isStructuredTextValue(narrative['chiefComplaint'])) return false;

  const meta = record(state.meta);
  const formModes = record(meta['sectionFormModes']);
  if (formModes['chiefComplaint'] === 'structured') return true;

  const liraImport = record(meta['liraImport']);
  if (text(liraImport['origin']) !== 'local') return false;

  const versions = record(meta['sectionVersions'])['chiefComplaint'];
  return !Array.isArray(versions) || versions.length === 0;
}

export function chiefComplaintBaseline(state: ClinicalState): ClinicalChiefComplaintBaseline {
  const chiefComplaint = text(record(state.narrative)['chiefComplaint']);
  return {
    chiefComplaint,
    initial: !chiefComplaint.trim() && chiefComplaintVersions(state).length === 0
  };
}

/** Alias explícito para consumidores de editores clínicos estructurados. */
export const structuredChiefComplaintBaseline = chiefComplaintBaseline;

/**
 * Aplica una edición pura e inmutable de Motivo de consulta.
 * `meta.sectionChangeRequests.chiefComplaint` es el comando transitorio que
 * el backend consume para construir la auditoría canónica.
 */
export function applyStructuredChiefComplaintEdit(
  state: ClinicalState,
  edit: StructuredChiefComplaintEdit
): ClinicalState {
  if (!supportsStructuredChiefComplaint(state)) {
    fail(
      'STRUCTURED_CHIEF_COMPLAINT_UNSUPPORTED',
      'Esta historia conserva el editor de texto compatible con su formato anterior.'
    );
  }

  const chiefComplaint = text(edit.chiefComplaint);
  const reasonInput = text(edit.reason);
  const baseline = chiefComplaintBaseline(state);
  if (chiefComplaint !== baseline.chiefComplaint) {
    assertLength(chiefComplaint, 'CHIEF_COMPLAINT_TOO_LONG', 'El motivo de consulta');
  }
  assertLength(reasonInput, 'REASON_TOO_LONG', 'El motivo de la modificación');
  if (baseline.initial && !chiefComplaint) {
    fail('EMPTY_CHIEF_COMPLAINT', 'Complete el motivo de consulta.');
  }
  if (!baseline.initial && !reasonInput) {
    fail('REASON_REQUIRED', 'Indique el motivo de la modificación.');
  }
  if (chiefComplaint === baseline.chiefComplaint) {
    fail('NO_CHANGES', 'No hay cambios para guardar.');
  }

  const at = text(edit.at) || new Date().toISOString();
  const mainId = text(edit.id) || createVersionId('sec-chiefComplaint');
  const sourceMeta = record(state.meta);
  const sourceNarrative = record(state.narrative);
  const sourceProfessional = record(sourceMeta['currentProfessional']);
  const actor = normalizedActor(edit.actor, sourceMeta, sourceProfessional);
  const action = baseline.initial ? 'cargado' : 'modificado';
  const audit = auditStamp(action, actor.displayName, actor.license, at);
  const existingVersions = chiefComplaintVersions(state);
  const versions = [...existingVersions];

  if (!baseline.initial && !versions.some(isInitialVersion)) {
    const initialAt = text(sourceMeta['createdAt']) || text(sourceMeta['updatedAt']) || at;
    const initialAudit = auditStamp('cargado', actor.displayName, actor.license, initialAt);
    const firstContent = versions.length > 0
      ? text(record(versions[0])['content']) || baseline.chiefComplaint
      : baseline.chiefComplaint;
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
    chiefComplaint || 'Sin datos cargados.',
    audit
  ));

  const sectionVersions = {
    ...record(sourceMeta['sectionVersions']),
    chiefComplaint: versions
  };
  const sectionAudit = {
    ...record(sourceMeta['sectionAudit']),
    chiefComplaint: audit
  };
  const sectionFormModes = {
    ...record(sourceMeta['sectionFormModes']),
    chiefComplaint: 'structured'
  };
  const sourceSectionChangeRequests = record(sourceMeta['sectionChangeRequests']);
  const sectionChangeRequests = {
    ...sourceSectionChangeRequests,
    chiefComplaint: {
      ...record(sourceSectionChangeRequests['chiefComplaint']),
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
      chiefComplaint
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

function chiefComplaintVersions(state: ClinicalState): unknown[] {
  const value = record(record(state.meta)['sectionVersions'])['chiefComplaint'];
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
  actor: ClinicalChiefComplaintActor,
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
  code: Extract<ClinicalChiefComplaintEditErrorCode, 'CHIEF_COMPLAINT_TOO_LONG' | 'REASON_TOO_LONG'>,
  label: string
): void {
  if (value.length > CLINICAL_CHIEF_COMPLAINT_TEXT_LIMIT) {
    fail(code, `${label} no puede superar los ${CLINICAL_CHIEF_COMPLAINT_TEXT_LIMIT.toLocaleString('es-AR')} caracteres.`);
  }
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

function fail(code: ClinicalChiefComplaintEditErrorCode, message: string): never {
  throw new ClinicalChiefComplaintEditError(code, message);
}

function createVersionId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${randomId}`;
}
