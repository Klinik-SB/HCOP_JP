import type { ClinicalState } from '../patients/patient-workspace.models';

export interface SingleNarrativeEditActor {
  readonly userId: string | number;
  readonly username: string;
  readonly displayName: string;
  readonly licenseNumber: string;
}

export interface SingleNarrativeEditInput {
  readonly value: string;
  readonly reason?: string;
  readonly at?: string;
  readonly id?: string;
  readonly actor: SingleNarrativeEditActor;
}

export interface SingleNarrativeBaseline {
  readonly value: string;
  readonly initial: boolean;
}

export interface SingleNarrativeEditErrorCodes<TCode extends string> {
  readonly unsupported: TCode;
  readonly empty: TCode;
  readonly tooLong: TCode;
  readonly reasonRequired: TCode;
  readonly reasonTooLong: TCode;
  readonly noChanges: TCode;
}

export interface SingleNarrativeEditMessages {
  readonly unsupported: string;
  readonly empty: string;
  readonly reasonRequired: string;
  readonly noChanges: string;
  readonly valueLabel: string;
  readonly reasonLabel: string;
}

export interface SingleNarrativeEditConfig<TCode extends string> {
  readonly sectionKey: string;
  readonly narrativeKey: string;
  readonly versionIdPrefix: string;
  readonly textLimit: number;
  readonly errors: SingleNarrativeEditErrorCodes<TCode>;
  readonly messages: SingleNarrativeEditMessages;
  readonly createError: (code: TCode, message: string) => Error;
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

export function supportsStructuredSingleNarrativeEdit<TCode extends string>(
  state: ClinicalState,
  config: SingleNarrativeEditConfig<TCode>
): boolean {
  const narrative = record(state.narrative);
  if (!isStructuredTextValue(narrative[config.narrativeKey])) return false;

  const meta = record(state.meta);
  const formModes = record(meta['sectionFormModes']);
  if (formModes[config.sectionKey] === 'structured') return true;

  const liraImport = record(meta['liraImport']);
  if (text(liraImport['origin']) !== 'local') return false;

  const versions = record(meta['sectionVersions'])[config.sectionKey];
  return !Array.isArray(versions) || versions.length === 0;
}

export function singleNarrativeBaseline<TCode extends string>(
  state: ClinicalState,
  config: SingleNarrativeEditConfig<TCode>
): SingleNarrativeBaseline {
  const value = text(record(state.narrative)[config.narrativeKey]);
  return {
    value,
    initial: !value.trim() && sectionVersions(state, config.sectionKey).length === 0
  };
}

export function applyStructuredSingleNarrativeEdit<TCode extends string>(
  state: ClinicalState,
  edit: SingleNarrativeEditInput,
  config: SingleNarrativeEditConfig<TCode>
): ClinicalState {
  if (!supportsStructuredSingleNarrativeEdit(state, config)) {
    fail(config, config.errors.unsupported, config.messages.unsupported);
  }

  const value = text(edit.value);
  const reasonInput = text(edit.reason);
  const baseline = singleNarrativeBaseline(state, config);
  if (value !== baseline.value) {
    assertLength(value, config.errors.tooLong, config.messages.valueLabel, config);
  }
  assertLength(reasonInput, config.errors.reasonTooLong, config.messages.reasonLabel, config);
  if (baseline.initial && !value) {
    fail(config, config.errors.empty, config.messages.empty);
  }
  if (!baseline.initial && !reasonInput) {
    fail(config, config.errors.reasonRequired, config.messages.reasonRequired);
  }
  if (value === baseline.value) {
    fail(config, config.errors.noChanges, config.messages.noChanges);
  }

  const at = text(edit.at) || new Date().toISOString();
  const mainId = text(edit.id) || createVersionId(config.versionIdPrefix);
  const sourceMeta = record(state.meta);
  const sourceNarrative = record(state.narrative);
  const sourceProfessional = record(sourceMeta['currentProfessional']);
  const actor = normalizedActor(edit.actor, sourceMeta, sourceProfessional);
  const action = baseline.initial ? 'cargado' : 'modificado';
  const audit = auditStamp(action, actor.displayName, actor.license, at);
  const existingVersions = sectionVersions(state, config.sectionKey);
  const versions = [...existingVersions];

  if (!baseline.initial && !versions.some(isInitialVersion)) {
    const initialAt = text(sourceMeta['createdAt']) || text(sourceMeta['updatedAt']) || at;
    const initialAudit = auditStamp('cargado', actor.displayName, actor.license, initialAt);
    const firstContent = versions.length > 0
      ? text(record(versions[0])['content']) || baseline.value
      : baseline.value;
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
    value || 'Sin datos cargados.',
    audit
  ));

  const sectionVersionsMeta = {
    ...record(sourceMeta['sectionVersions']),
    [config.sectionKey]: versions
  };
  const sectionAudit = {
    ...record(sourceMeta['sectionAudit']),
    [config.sectionKey]: audit
  };
  const sectionFormModes = {
    ...record(sourceMeta['sectionFormModes']),
    [config.sectionKey]: 'structured'
  };
  const sourceSectionChangeRequests = record(sourceMeta['sectionChangeRequests']);
  const sectionChangeRequests = {
    ...sourceSectionChangeRequests,
    [config.sectionKey]: {
      ...record(sourceSectionChangeRequests[config.sectionKey]),
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
      [config.narrativeKey]: value
    },
    meta: {
      ...sourceMeta,
      currentUser: actor.displayName,
      currentProfessional,
      sectionVersions: sectionVersionsMeta,
      sectionAudit,
      sectionFormModes,
      sectionChangeRequests,
      updatedAt: at
    }
  };
}

function sectionVersions(state: ClinicalState, sectionKey: string): unknown[] {
  const value = record(record(state.meta)['sectionVersions'])[sectionKey];
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
  actor: SingleNarrativeEditActor,
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

function assertLength<TCode extends string>(
  value: string,
  code: TCode,
  label: string,
  config: SingleNarrativeEditConfig<TCode>
): void {
  if (value.length > config.textLimit) {
    fail(config, code, `${label} no puede superar los ${config.textLimit.toLocaleString('es-AR')} caracteres.`);
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

function fail<TCode extends string>(
  config: SingleNarrativeEditConfig<TCode>,
  code: TCode,
  message: string
): never {
  throw config.createError(code, message);
}

function createVersionId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${randomId}`;
}
