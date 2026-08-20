import type { ClinicalSaveConflictDraft } from './clinical-save-conflict';
import type { ClinicalState, PatientWorkspace } from './patient-workspace.models';

export interface ClinicalConflictSectionComparison {
  readonly key: string;
  readonly label: string;
  readonly draftChanged: boolean;
  readonly serverChanged: boolean;
  readonly overlaps: boolean;
  readonly details: readonly ClinicalConflictFieldComparison[];
}

export interface ClinicalConflictFieldComparison {
  readonly key: string;
  readonly label: string;
  readonly baseValue: string;
  readonly draftValue: string;
  readonly serverValue: string;
  readonly draftChanged: boolean;
  readonly serverChanged: boolean;
  readonly overlaps: boolean;
}

export interface ClinicalConflictComparison {
  readonly conflictId: string;
  readonly baseRevision: number;
  readonly latestRevision?: number;
  readonly latestLoadedAt?: string;
  readonly latestLoaded: boolean;
  readonly sections: readonly ClinicalConflictSectionComparison[];
  readonly draftChanges: number;
  readonly serverChanges: number;
  readonly overlaps: number;
}

export interface ConflictLatestRequestIdentity {
  readonly conflictId: string;
  readonly patientId: string;
  readonly baseRevision: number;
  readonly requestId: number;
  readonly minimumRevision: number;
}

const sections: ReadonlyArray<{
  key: string;
  label: string;
  select: (state: ClinicalState) => unknown;
}> = [
  { key: 'patient', label: 'Identificación y cobertura', select: (state) => state.patient || {} },
  { key: 'diagnosis', label: 'Diagnóstico oncológico', select: (state) => ({ oncology: state.oncology || {}, diagnoses: state.diagnoses || [] }) },
  { key: 'narrative', label: 'Relato clínico y resumen', select: (state) => state.narrative || {} },
  { key: 'exam', label: 'Examen físico', select: (state) => state.exam || {} },
  { key: 'studies', label: 'Estudios complementarios', select: (state) => ({ studies: state.studies || [], externalStudies: state.externalStudies || [] }) },
  { key: 'treatments', label: 'Tratamientos y cirugías', select: (state) => state.treatments || [] },
  { key: 'evolutions', label: 'Evoluciones', select: (state) => state.evolutions || [] },
  { key: 'prescriptions', label: 'Prescripciones', select: (state) => state.prescriptions || [] },
  { key: 'research', label: 'Investigación', select: (state) => state.researchRecords || [] },
  { key: 'meta', label: 'Metadatos clínicos', select: clinicalMeta },
  { key: 'other', label: 'Otros datos clínicos', select: unknownStateFields }
];

export function compareClinicalConflict(conflict: ClinicalSaveConflictDraft): ClinicalConflictComparison {
  const latest = conflict.latestState;
  const comparisons = sections.map((section) => {
    const base = flatten(section.select(conflict.baseState));
    const draft = flatten(section.select(conflict.attemptedState));
    const server = latest ? flatten(section.select(latest)) : new Map<string, ComparableLeaf>();
    const keys = new Set([...base.keys(), ...draft.keys(), ...server.keys()]);
    const details = [...keys].map((key): ClinicalConflictFieldComparison => {
      const baseLeaf = base.get(key);
      const draftLeaf = draft.get(key);
      const serverLeaf = server.get(key);
      const draftChanged = !sameLeaf(baseLeaf, draftLeaf);
      const serverChanged = Boolean(latest) && !sameLeaf(baseLeaf, serverLeaf);
      return {
        key,
        label: draftLeaf?.label || serverLeaf?.label || baseLeaf?.label || 'Dato clínico',
        baseValue: displayLeaf(baseLeaf),
        draftValue: displayLeaf(draftLeaf),
        serverValue: latest ? displayLeaf(serverLeaf) : 'Pendiente',
        draftChanged,
        serverChanged,
        overlaps: draftChanged && serverChanged
      };
    }).filter((detail) => detail.draftChanged || detail.serverChanged)
      .sort((left, right) => left.label.localeCompare(right.label));
    return {
      key: section.key,
      label: section.label,
      draftChanged: details.some((detail) => detail.draftChanged),
      serverChanged: details.some((detail) => detail.serverChanged),
      overlaps: details.some((detail) => detail.overlaps),
      details
    };
  });
  return {
    conflictId: conflict.conflictId,
    baseRevision: conflict.baseRevision,
    latestRevision: conflict.latestRevision,
    latestLoadedAt: conflict.latestLoadedAt,
    latestLoaded: Boolean(latest),
    sections: comparisons,
    draftChanges: comparisons.flatMap((item) => item.details).filter((item) => item.draftChanged).length,
    serverChanges: comparisons.flatMap((item) => item.details).filter((item) => item.serverChanged).length,
    overlaps: comparisons.flatMap((item) => item.details).filter((item) => item.overlaps).length
  };
}

export function conflictLatestRequestIdentity(
  conflict: ClinicalSaveConflictDraft,
  requestId: number,
  minimumRevision = conflict.baseRevision + 1
): ConflictLatestRequestIdentity {
  return {
    conflictId: conflict.conflictId,
    patientId: conflict.patientId,
    baseRevision: conflict.baseRevision,
    requestId,
    minimumRevision: Math.max(conflict.baseRevision + 1, minimumRevision)
  };
}

export function acceptsLatestClinicalWorkspace(
  conflict: ClinicalSaveConflictDraft | null,
  identity: ConflictLatestRequestIdentity,
  workspace: PatientWorkspace,
  activeRequestId: number
): boolean {
  return Boolean(
    conflict
    && conflict.code === 'VERSION_CONFLICT'
    && conflict.conflictId === identity.conflictId
    && conflict.patientId === identity.patientId
    && conflict.baseRevision === identity.baseRevision
    && identity.requestId === activeRequestId
    && workspace.patientId === identity.patientId
    && Number.isSafeInteger(workspace.revision)
    && workspace.revision >= identity.minimumRevision
  );
}

export function attachLatestClinicalState(
  conflict: ClinicalSaveConflictDraft,
  state: ClinicalState,
  revision: number,
  loadedAt = new Date().toISOString()
): ClinicalSaveConflictDraft {
  return {
    ...conflict,
    latestState: structuredClone(state),
    latestRevision: revision,
    latestLoadedAt: loadedAt
  };
}

export function detachLatestClinicalState(conflict: ClinicalSaveConflictDraft): ClinicalSaveConflictDraft {
  const { latestState: _state, latestRevision: _revision, latestLoadedAt: _loadedAt, ...draft } = conflict;
  return draft;
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

interface ComparableLeaf {
  readonly label: string;
  readonly value: unknown;
}

const recordIdentityKeys = ['id', 'treatmentId', 'studyId', 'prescriptionId', 'sourceId'];
const recordLabelKeys = ['title', 'name', 'fullName', 'studyName', 'diagnosis', 'scheme', 'generic', 'date'];

function flatten(value: unknown): Map<string, ComparableLeaf> {
  const leaves = new Map<string, ComparableLeaf>();
  flattenInto(value, '$', '', leaves, 0);
  return leaves;
}

function flattenInto(
  value: unknown,
  key: string,
  label: string,
  leaves: Map<string, ComparableLeaf>,
  depth: number
): void {
  if (depth >= 7 || value === null || typeof value !== 'object') {
    leaves.set(key, { label: label || 'Valor', value });
    return;
  }
  if (Array.isArray(value)) {
    const identities = value.map(stableRecordIdentity);
    const stable = value.length > 0
      && identities.every((identity): identity is string => Boolean(identity))
      && new Set(identities).size === identities.length;
    if (!stable) {
      if (value.length > 0) leaves.set(key, { label: label || 'Lista', value });
      return;
    }
    value.forEach((record, index) => {
      const identity = identities[index]!;
      const recordKey = `${key}[${encodeURIComponent(identity)}]`;
      const recordLabel = joinLabel(label, stableRecordLabel(record, identity));
      flattenInto(record, recordKey, recordLabel, leaves, depth + 1);
    });
    return;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  for (const [childKey, childValue] of entries) {
    flattenInto(
      childValue,
      `${key}.${childKey}`,
      joinLabel(label, humanize(childKey)),
      leaves,
      depth + 1
    );
  }
}

function stableRecordIdentity(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of recordIdentityKeys) {
    const identity = record[key];
    if ((typeof identity === 'string' || typeof identity === 'number') && String(identity).trim()) {
      return `${key}:${String(identity).trim()}`;
    }
  }
  return null;
}

function stableRecordLabel(value: unknown, identity: string): string {
  const record = value as Record<string, unknown>;
  for (const key of recordLabelKeys) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) return truncate(candidate.trim(), 60);
  }
  return `Registro ${identity.split(':').slice(1).join(':')}`;
}

function sameLeaf(left?: ComparableLeaf, right?: ComparableLeaf): boolean {
  if (!left || !right) return !left && !right;
  return same(left.value, right.value);
}

function displayLeaf(leaf?: ComparableLeaf): string {
  if (!leaf) return 'No informado';
  const value = leaf.value;
  if (value === null || value === undefined || value === '') return 'Vacío';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'string') return truncate(value.replace(/\s+/g, ' ').trim() || 'Vacío', 180);
  if (Array.isArray(value)) {
    const primitives = value.every((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item));
    return primitives
      ? truncate(value.map((item) => item ?? 'Vacío').join(', '), 180)
      : `${value.length} elemento${value.length === 1 ? '' : 's'}`;
  }
  return `${Object.keys(value as Record<string, unknown>).length} campos`;
}

function humanize(value: string): string {
  const translated = fieldLabels[value];
  if (translated) return translated;
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Dato';
}

const fieldLabels: Readonly<Record<string, string>> = {
  id: 'Identificador', fullName: 'Paciente', dni: 'DNI', medicalRecord: 'Historia clínica',
  birthDate: 'Fecha de nacimiento', sex: 'Sexo', insurance: 'Obra social',
  affiliateNumber: 'Número de afiliado', phone: 'Teléfono', email: 'Correo', address: 'Domicilio',
  summary: 'Resumen', plan: 'Plan', reason: 'Motivo', diagnosis: 'Diagnóstico', diagnoses: 'Diagnósticos',
  status: 'Estado', scheme: 'Esquema', intent: 'Intención', notes: 'Notas', text: 'Texto',
  title: 'Título', date: 'Fecha', createdAt: 'Fecha de carga', updatedAt: 'Fecha de actualización',
  author: 'Profesional', type: 'Tipo', category: 'Categoría', treatments: 'Tratamientos',
  studies: 'Estudios', externalStudies: 'Estudios externos', prescriptions: 'Prescripciones',
  researchRecords: 'Investigación'
};

function joinLabel(parent: string, child: string): string {
  return parent ? `${parent} · ${child}` : child;
}

function truncate(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value ?? null;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)])
  );
}

const knownStateKeys = new Set([
  'patient', 'oncology', 'narrative', 'exam', 'diagnoses', 'externalStudies', 'studies',
  'treatments', 'evolutions', 'prescriptions', 'researchRecords', 'meta'
]);

function unknownStateFields(state: ClinicalState): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(state as Record<string, unknown>)
      .filter(([key]) => !knownStateKeys.has(key))
  );
}

function clinicalMeta(state: ClinicalState): Record<string, unknown> {
  const { persistenceRevision: _revision, ...meta } = state.meta || {};
  return meta;
}
