import type { ClinicalRecord, ClinicalState } from '../patients/patient-workspace.models';

export type ClinicalTreatmentKind = 'systemic' | 'radiotherapy' | 'surgery';
export type ClinicalTreatmentCategory =
  | 'radiotherapy'
  | 'surgery'
  | 'chemotherapy'
  | 'hormone'
  | 'immunotherapy'
  | 'targeted'
  | 'systemic';

export interface ClinicalTreatmentProjection {
  readonly record: ClinicalRecord;
  readonly category: ClinicalTreatmentCategory;
  readonly kind: ClinicalTreatmentKind;
}

interface Candidate {
  readonly record: ClinicalRecord;
  readonly category: ClinicalTreatmentCategory;
  readonly categoryConfidence: number;
  readonly priority: number;
  readonly order: number;
  readonly identityDomain: 'treatment' | 'clinical-entry' | 'evolution';
}

export function clinicalTreatmentProjections(
  state: ClinicalState,
  relationalTreatments: readonly ClinicalRecord[] = []
): ClinicalTreatmentProjection[] {
  const oncology = state.oncology || {};
  const candidates: Candidate[] = [];
  const add = (
    records: readonly ClinicalRecord[],
    priority: number,
    identityDomain: Candidate['identityDomain'],
    forcedCategory?: ClinicalTreatmentCategory
  ): void => {
    for (const record of records) {
      const classification = candidateClassification(record, forcedCategory);
      candidates.push({
        record,
        category: classification.category,
        categoryConfidence: classification.confidence,
        priority,
        order: candidates.length,
        identityDomain
      });
    }
  };

  add(relationalTreatments, 0, 'treatment');
  add(state.treatments || [], 1, 'treatment');
  add(recordsFrom(oncology['systemicTreatments']), 2, 'clinical-entry', 'systemic');
  add(recordsFrom(oncology['radiotherapy'], oncology['radiotherapyTreatments']), 2, 'clinical-entry', 'radiotherapy');
  add(recordsFrom(oncology['surgeries'], oncology['oncologicSurgeries']), 2, 'clinical-entry', 'surgery');
  add((state.evolutions || []).filter(clinicalIsTreatmentRecord), 3, 'evolution');

  return mergeCandidates(candidates)
    .map(({ record, category }) => ({ record, category, kind: clinicalTreatmentKindFromCategory(category) }))
    .sort((left, right) => chronologyKey(left.record).localeCompare(chronologyKey(right.record)));
}

export function clinicalSectionTreatments(
  state: ClinicalState,
  kind: ClinicalTreatmentKind,
  relationalTreatments: readonly ClinicalRecord[] = []
): ClinicalRecord[] {
  return clinicalTreatmentProjections(state, relationalTreatments)
    .filter((projection) => projection.kind === kind)
    .map((projection) => projection.record);
}

export function clinicalTreatmentsByKind(
  records: readonly ClinicalRecord[],
  kind: ClinicalTreatmentKind
): ClinicalRecord[] {
  return clinicalSectionTreatments({ treatments: [...records] }, kind);
}

export function clinicalTreatmentCategory(record: ClinicalRecord): ClinicalTreatmentCategory {
  const explicit = clinicalExplicitTreatmentCategory(record);
  if (explicit) return explicit;
  const searchable = normalize([
    record.scheme, record.intent, record.status, record.notes, record.title, record.reason,
    record.text, record.summary, record.type, record['treatmentType']
  ]
    .filter(hasRawValue).join(' '));

  if (/\b(?:radio\w*|imrt|3d|boost\w*|ptv)\b/.test(searchable)) return 'radiotherapy';
  if (/\b(?:cirug\w*|quirurg\w*|reseccion\w*|exeresis\w*|amputacion\w*|[a-z]*ectomia\w*)\b/.test(searchable)) return 'surgery';
  if (/\b(?:quimio\w*|citotox\w*|docetaxel\w*|paclitaxel\w*|carboplatino\w*|cisplatino\w*)\b/.test(searchable)) return 'chemotherapy';
  if (/\b(?:hormon\w*|antiandrogen\w*|tamoxif\w*|anastrozol\w*|letrozol\w*|fulvestrant\w*)\b/.test(searchable)) return 'hormone';
  if (/\b(?:inmun\w*|pembrol\w*|nivol\w*|atezol\w*|durval\w*|ipilimumab\w*)\b/.test(searchable)) return 'immunotherapy';
  if (/\b(?:dirigid\w*|trastuz\w*|ritux\w*|inhibidor\w*|olaparib\w*|osimertinib\w*)\b/.test(searchable)) return 'targeted';
  return 'systemic';
}

export function clinicalExplicitTreatmentCategory(record: ClinicalRecord): ClinicalTreatmentCategory | null {
  const sourceRef = record.sourceRef || {};
  const category = normalize([record.category, record.kind, record.type, sourceRef['kind']]
    .filter(hasRawValue).join(' '));
  if (/\b(radiotherapy|radioterapia)\b/.test(category)) return 'radiotherapy';
  if (/\b(surgery|cirugia|quirurgico|quirurgica)\b/.test(category)) return 'surgery';
  if (/\b(chemotherapy|quimioterapia)\b/.test(category)) return 'chemotherapy';
  if (/\b(hormone|hormonal|hormonoterapia)\b/.test(category)) return 'hormone';
  if (/\b(immunotherapy|inmunoterapia)\b/.test(category)) return 'immunotherapy';
  if (/\b(targeted|terapia dirigida)\b/.test(category)) return 'targeted';
  if (/\b(systemic|sistemico|sistemica)\b/.test(category)) return 'systemic';
  return null;
}

export function clinicalIsTreatmentRecord(record: ClinicalRecord): boolean {
  if (clinicalExplicitTreatmentCategory(record)) return true;
  return normalize(String(record.sourceRef?.['kind'] || '')) === 'oncological-treatment';
}

export function clinicalTreatmentBody(record: ClinicalRecord): string {
  const values = [record.text || record.summary, record.intent, record.status, record.notes]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim().replace(/[.\s]+$/g, ''));
  const unique = [...new Map(values.map((value) => [normalize(value), value])).values()];
  return unique.length ? `${unique.join('. ')}.` : '';
}

function clinicalTreatmentKindFromCategory(category: ClinicalTreatmentCategory): ClinicalTreatmentKind {
  if (category === 'radiotherapy' || category === 'surgery') return category;
  return 'systemic';
}

function mergeCandidates(candidates: readonly Candidate[]): Array<{ record: ClinicalRecord; category: ClinicalTreatmentCategory }> {
  const parents = candidates.map((_, index) => index);
  const firstByKey = new Map<string, number>();
  const find = (index: number): number => {
    let root = index;
    while (parents[root] !== root) root = parents[root] as number;
    let current = index;
    while (parents[current] !== current) {
      const next = parents[current] as number;
      parents[current] = root;
      current = next;
    }
    return root;
  };
  const union = (left: number, right: number): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    const primary = Math.min(leftRoot, rightRoot);
    const secondary = Math.max(leftRoot, rightRoot);
    parents[secondary] = primary;
  };

  candidates.forEach((candidate, index) => {
    for (const key of identityKeys(candidate)) {
      const existing = firstByKey.get(key);
      if (existing === undefined) firstByKey.set(key, index);
      else union(index, existing);
    }
  });

  const groups = new Map<number, Candidate[]>();
  candidates.forEach((candidate, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) || []), candidate]);
  });

  const output: Array<{ record: ClinicalRecord; category: ClinicalTreatmentCategory }> = [];
  for (const group of groups.values()) {
    const ordered = [...group].sort((left, right) => left.priority - right.priority || left.order - right.order);
    const active = ordered.filter((candidate) => !candidate.record.deleted);
    if (!active.length) continue;
    const strongestActivePriority = active[0]?.priority ?? Number.MAX_SAFE_INTEGER;
    const strongestDeletedPriority = ordered
      .filter((candidate) => candidate.record.deleted)
      .reduce((minimum, candidate) => Math.min(minimum, candidate.priority), Number.MAX_SAFE_INTEGER);
    if (strongestDeletedPriority <= strongestActivePriority) continue;

    let record = { ...active[0]!.record };
    for (const candidate of active.slice(1)) record = completeMissing(record, candidate.record);
    const categorySource = [...active].sort((left, right) =>
      right.categoryConfidence - left.categoryConfidence
      || left.priority - right.priority
      || left.order - right.order)[0]!;
    output.push({ record, category: categorySource.category });
  }
  return output;
}

function identityKeys(candidate: Candidate): string[] {
  const record = candidate.record;
  const sourceRef = record.sourceRef || {};
  const aliases: string[] = [];
  if (hasRawValue(record.id)) aliases.push(`${candidate.identityDomain}:${String(record.id).trim()}`);
  appendIdentity(aliases, 'treatment', sourceRef['treatmentId']);
  appendIdentity(aliases, 'clinical-entry', sourceRef['clinicalEntryId']);
  appendIdentity(aliases, 'external', sourceRef['externalId']);
  appendIdentity(aliases, 'source', sourceRef['sourceId']);
  if (aliases.length) return [...new Set(aliases)];
  return [`anonymous:${candidate.identityDomain}:${candidate.category}:${candidate.order}`];
}

function appendIdentity(target: string[], domain: string, value: unknown): void {
  if (hasRawValue(value)) target.push(`${domain}:${String(value).trim()}`);
}

function candidateClassification(
  record: ClinicalRecord,
  forcedCategory?: ClinicalTreatmentCategory
): { category: ClinicalTreatmentCategory; confidence: number } {
  const explicit = clinicalExplicitTreatmentCategory(record);
  if (explicit) return { category: explicit, confidence: 3 };
  if (forcedCategory) return { category: forcedCategory, confidence: 2 };
  const inferred = clinicalTreatmentCategory(record);
  return { category: inferred, confidence: inferred === 'systemic' ? 0 : 1 };
}

function completeMissing(primary: ClinicalRecord, secondary: ClinicalRecord): ClinicalRecord {
  const completed = { ...primary };
  for (const [key, value] of Object.entries(secondary)) {
    if (!hasValue(completed[key]) && hasValue(value)) completed[key] = value;
  }
  if (hasValue(primary.sourceRef) || hasValue(secondary.sourceRef)) {
    completed.sourceRef = { ...(secondary.sourceRef || {}), ...(primary.sourceRef || {}) };
  }
  return completed;
}

function recordsFrom(...values: unknown[]): ClinicalRecord[] {
  return values.flatMap((value) => Array.isArray(value)
    ? value.filter((item): item is ClinicalRecord => typeof item === 'object' && item !== null)
    : []);
}

function hasRawValue(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim().length > 0;
}

function hasValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null;
}

function chronologyKey(record: ClinicalRecord): string {
  return [record.date || '', record.createdAt || '', record.id || ''].join('|');
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-AR')
    .replace(/\s+/g, ' ')
    .trim();
}
