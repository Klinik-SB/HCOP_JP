import type { ClinicalRecord, ClinicalState } from '../patients/patient-workspace.models';

export interface ClinicalStudyEntry {
  readonly key: string;
  readonly record: ClinicalRecord;
}

/**
 * Fuente única para la hoja y el panel Estudios.
 *
 * Los registros locales prevalecen cuando un repositorio externo entrega el
 * mismo identificador. Los elementos borrados no vuelven a aparecer y el
 * orden es determinista y el consumidor elige el sentido: la hoja clínica
 * conserva la cronología ascendente y el panel prioriza lo más reciente.
 */
export function clinicalStudyRecords(
  state: ClinicalState | null | undefined,
  order: 'asc' | 'desc' = 'desc'
): ClinicalRecord[] {
  return clinicalStudyEntries(state, order).map((entry) => entry.record);
}

export function clinicalStudyEntries(
  state: ClinicalState | null | undefined,
  order: 'asc' | 'desc' = 'desc'
): ClinicalStudyEntry[] {
  if (!state) return [];
  const unique = new Map<string, ClinicalStudyEntry>();
  const localTombstones = new Set((Array.isArray(state.studies) ? state.studies : [])
    .filter((record) => Boolean(record?.deleted) && String(record?.id ?? '').trim())
    .map((record) => String(record.id).trim()));
  append(unique, state.externalStudies, 'external', localTombstones);
  append(unique, state.studies, 'local', localTombstones);
  const direction = order === 'asc' ? 1 : -1;
  return [...unique.values()].sort((left, right) => direction * (
    studyDate(left.record).localeCompare(studyDate(right.record))
      || studyTitle(left.record).localeCompare(studyTitle(right.record), 'es-AR')
  ));
}

function append(
  target: Map<string, ClinicalStudyEntry>,
  source: ClinicalRecord[] | undefined,
  namespace: string,
  localTombstones: ReadonlySet<string>
): void {
  if (!Array.isArray(source)) return;
  source.forEach((record, index) => {
    if (!record || typeof record !== 'object' || record.deleted) return;
    const id = String(record.id ?? '').trim();
    if (id && localTombstones.has(id)) return;
    const key = id ? `id:${id}` : `${namespace}:${index}`;
    target.set(key, { key, record });
  });
}

function studyDate(record: ClinicalRecord): string {
  return String(record.date || record.createdAt || record.updatedAt || '');
}

function studyTitle(record: ClinicalRecord): string {
  return String(record.title || record.fileName || '');
}
