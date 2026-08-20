import type { ClinicalState } from '../patients/patient-workspace.models';

export const CLINICAL_SUMMARY_PLAN_TEXT_LIMIT = 50_000;
/** Stable UI-facing alias retained by the clinical workspace. */
export const MAX_CLINICAL_NARRATIVE_CHARS = CLINICAL_SUMMARY_PLAN_TEXT_LIMIT;

export type ClinicalSummaryPlanEditErrorCode =
  | 'STRUCTURED_SUMMARY_PLAN_UNSUPPORTED'
  | 'EMPTY_SUMMARY_PLAN'
  | 'SUMMARY_TOO_LONG'
  | 'PLAN_TOO_LONG'
  | 'REASON_REQUIRED'
  | 'REASON_TOO_LONG'
  | 'NO_CHANGES';

export interface ClinicalSummaryPlanActor {
  readonly userId: string | number;
  readonly username: string;
  readonly displayName: string;
  readonly licenseNumber: string;
}

export interface ClinicalSummaryPlanBaseline {
  readonly summary: string;
  readonly plan: string;
  readonly initial: boolean;
}

export interface StructuredSummaryPlanEdit {
  readonly summary: string;
  readonly plan: string;
  readonly reason?: string;
  readonly at?: string;
  readonly id?: string;
  readonly actor: ClinicalSummaryPlanActor;
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

export class ClinicalSummaryPlanEditError extends Error {
  constructor(
    readonly code: ClinicalSummaryPlanEditErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ClinicalSummaryPlanEditError';
  }
}

/** Matches the structured/form compatibility decision used by the legacy client. */
export function supportsStructuredSummaryPlan(state: ClinicalState): boolean {
  const narrative = record(state.narrative);
  if (!isStructuredTextValue(narrative['summary']) || !isStructuredTextValue(narrative['plan'])) {
    return false;
  }

  const meta = record(state.meta);
  const formModes = record(meta['sectionFormModes']);
  if (formModes['summaryPlan'] === 'structured') return true;

  const liraImport = record(meta['liraImport']);
  if (text(liraImport['origin']) !== 'local') return false;

  const versions = record(meta['sectionVersions'])['summaryPlan'];
  return !Array.isArray(versions) || versions.length === 0;
}

export function summaryPlanBaseline(state: ClinicalState): ClinicalSummaryPlanBaseline {
  const narrative = record(state.narrative);
  const summary = text(narrative['summary']);
  const plan = text(narrative['plan']);
  const versions = summaryPlanVersions(state);
  return {
    summary,
    plan,
    initial: !summaryPlanSnapshot(summary, plan) && versions.length === 0
  };
}

/** Stable, explicit alias used by structured section editors. */
export const structuredSummaryPlanBaseline = summaryPlanBaseline;

/**
 * Applies one structured summary/plan edit without mutating the supplied state.
 * Validation failures and no-op attempts are reported as typed errors.
 */
export function applyStructuredSummaryPlanEdit(
  state: ClinicalState,
  edit: StructuredSummaryPlanEdit
): ClinicalState {
  if (!supportsStructuredSummaryPlan(state)) {
    fail('STRUCTURED_SUMMARY_PLAN_UNSUPPORTED', 'Esta historia conserva el editor de texto compatible con su formato anterior.');
  }

  const summary = text(edit.summary);
  const plan = text(edit.plan);
  const reasonInput = text(edit.reason);
  const baseline = summaryPlanBaseline(state);
  if (summary !== baseline.summary) {
    assertLength(summary, 'SUMMARY_TOO_LONG', 'La conclusión o resumen');
  }
  if (plan !== baseline.plan) {
    assertLength(plan, 'PLAN_TOO_LONG', 'La conducta o plan');
  }
  assertLength(reasonInput, 'REASON_TOO_LONG', 'El motivo');
  if (baseline.initial && !summary && !plan) {
    fail('EMPTY_SUMMARY_PLAN', 'Complete al menos un campo.');
  }
  if (!baseline.initial && !reasonInput) {
    fail('REASON_REQUIRED', 'Indique el motivo de la modificación.');
  }

  const content = summaryPlanSnapshot(summary, plan);
  if (summary === baseline.summary && plan === baseline.plan) {
    fail('NO_CHANGES', 'No hay cambios para guardar.');
  }

  const previousContent = summaryPlanSnapshot(baseline.summary, baseline.plan);

  const at = text(edit.at) || new Date().toISOString();
  const mainId = text(edit.id) || createVersionId('sec-summaryPlan');
  const sourceMeta = record(state.meta);
  const sourceNarrative = record(state.narrative);
  const sourceProfessional = record(sourceMeta['currentProfessional']);
  const actor = normalizedActor(edit.actor, sourceMeta, sourceProfessional);
  const action = baseline.initial ? 'cargado' : 'modificado';
  const audit = auditStamp(action, actor.displayName, actor.license, at);
  const existingVersions = summaryPlanVersions(state);
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
    summaryPlan: versions
  };
  const sectionAudit = {
    ...record(sourceMeta['sectionAudit']),
    summaryPlan: audit
  };
  const sectionFormModes = {
    ...record(sourceMeta['sectionFormModes']),
    summaryPlan: 'structured'
  };
  const sourceSectionChangeRequests = record(sourceMeta['sectionChangeRequests']);
  const sectionChangeRequests = {
    ...sourceSectionChangeRequests,
    summaryPlan: {
      ...record(sourceSectionChangeRequests['summaryPlan']),
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
      summary,
      plan
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

function summaryPlanSnapshot(summary: unknown, plan: unknown): string {
  return [
    labeledText('Conclusion / resumen', summary),
    labeledText('Conducta / plan', plan)
  ].filter(Boolean).join('\n').trim();
}

function summaryPlanVersions(state: ClinicalState): unknown[] {
  const value = record(record(state.meta)['sectionVersions'])['summaryPlan'];
  return Array.isArray(value) ? value : [];
}

function isInitialVersion(value: unknown): boolean {
  const version = record(value);
  const audit = record(version['audit']);
  return text(audit['action']) === 'cargado';
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
  actor: ClinicalSummaryPlanActor,
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
  code: Extract<ClinicalSummaryPlanEditErrorCode, 'SUMMARY_TOO_LONG' | 'PLAN_TOO_LONG' | 'REASON_TOO_LONG'>,
  label: string
): void {
  if (value.length > CLINICAL_SUMMARY_PLAN_TEXT_LIMIT) {
    fail(code, `${label} no puede superar los ${CLINICAL_SUMMARY_PLAN_TEXT_LIMIT.toLocaleString('es-AR')} caracteres.`);
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

function fail(code: ClinicalSummaryPlanEditErrorCode, message: string): never {
  throw new ClinicalSummaryPlanEditError(code, message);
}

function createVersionId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${randomId}`;
}
