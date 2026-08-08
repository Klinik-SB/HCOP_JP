import type { ClinicalRecord, ClinicalState } from '../patients/patient-workspace.models';
import {
  CapturedClinicalHighlight,
  ClinicalHighlightAction,
  ClinicalHighlightActionResult,
  ClinicalHighlightRange,
  ClinicalTextHighlight,
  MergedClinicalHighlightRange
} from './clinical-highlight.models';

export const CLINICAL_HIGHLIGHT_LIMIT = 1_000;
export const CLINICAL_HIGHLIGHT_TEXT_LIMIT = 10_000;
export const CLINICAL_HIGHLIGHT_CONTEXT_LIMIT = 64;

type UnknownRecord = Record<string, unknown>;
type ClinicalCollectionKey = 'evolutions' | 'studies' | 'treatments' | 'prescriptions' | 'researchRecords';

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function integer(value: unknown, fallback = 0): number {
  const parsed = Number.parseInt(text(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function active(highlight: ClinicalTextHighlight): boolean {
  return !highlight.removedAt;
}

export function normalizeClinicalHighlights(value: unknown): ClinicalTextHighlight[] {
  if (!Array.isArray(value)) return [];
  const normalized: ClinicalTextHighlight[] = [];
  for (const candidate of value.slice(0, CLINICAL_HIGHLIGHT_LIMIT)) {
    const item = asRecord(candidate);
    const kind = item['kind'] === 'record' ? 'record' : item['kind'] === 'section' ? 'section' : null;
    const exact = text(item['exact']).slice(0, CLINICAL_HIGHLIGHT_TEXT_LIMIT);
    const start = Math.max(0, integer(item['start']));
    const parsedEnd = integer(item['end']);
    const end = Math.max(start, parsedEnd || start + exact.length);
    const recordType = text(item['recordType']);
    const recordId = text(item['recordId']);
    const sectionKey = text(item['sectionKey']);
    if (!kind || !exact || (kind === 'record' ? !(recordType && recordId) : !sectionKey)) continue;
    normalized.push({
      id: text(item['id']) || createClinicalHighlightId(),
      kind,
      recordType,
      recordId,
      sectionKey,
      start,
      end,
      exact,
      prefix: text(item['prefix']).slice(-CLINICAL_HIGHLIGHT_CONTEXT_LIMIT),
      suffix: text(item['suffix']).slice(0, CLINICAL_HIGHLIGHT_CONTEXT_LIMIT),
      color: 'yellow',
      createdAt: text(item['createdAt']),
      removedAt: text(item['removedAt'])
    });
  }
  return normalized;
}

export function clinicalHighlightsFromState(state: ClinicalState | null | undefined): ClinicalTextHighlight[] {
  return normalizeClinicalHighlights(asRecord(state?.meta)['clinicalHighlights']);
}

export function createClinicalHighlightId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `clinical-highlight-${uuid}`;
  return `clinical-highlight-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function sameClinicalHighlightTarget(
  left: Pick<ClinicalTextHighlight, 'kind' | 'recordType' | 'recordId' | 'sectionKey'>,
  right: Pick<ClinicalTextHighlight, 'kind' | 'recordType' | 'recordId' | 'sectionKey'>
): boolean {
  return left.kind === right.kind
    && left.recordType === right.recordType
    && left.recordId === right.recordId
    && left.sectionKey === right.sectionKey;
}

export function resolveClinicalHighlightRange(
  canonicalText: string,
  highlight: Pick<ClinicalTextHighlight, 'start' | 'end' | 'exact' | 'prefix' | 'suffix'>
): { start: number; end: number } | null {
  if (!highlight.exact) return null;
  if (canonicalText.slice(highlight.start, highlight.end) === highlight.exact) {
    return { start: highlight.start, end: highlight.end };
  }
  const occurrences: Array<{ start: number; end: number; score: number }> = [];
  let index = canonicalText.indexOf(highlight.exact);
  while (index !== -1) {
    const prefix = canonicalText.slice(Math.max(0, index - highlight.prefix.length), index);
    const suffix = canonicalText.slice(index + highlight.exact.length, index + highlight.exact.length + highlight.suffix.length);
    let score = -Math.abs(index - highlight.start) / Math.max(canonicalText.length, 1);
    if (highlight.prefix && prefix.endsWith(highlight.prefix)) score += 3;
    if (highlight.suffix && suffix.startsWith(highlight.suffix)) score += 3;
    occurrences.push({ start: index, end: index + highlight.exact.length, score });
    index = canonicalText.indexOf(highlight.exact, index + 1);
  }
  const winner = occurrences.sort((left, right) => right.score - left.score)[0];
  return winner ? { start: winner.start, end: winner.end } : null;
}

export function mergeClinicalHighlightRanges(ranges: readonly ClinicalHighlightRange[]): MergedClinicalHighlightRange[] {
  const merged: Array<{ start: number; end: number; ids: string[] }> = [];
  [...ranges]
    .filter((range) => range.end > range.start && Boolean(range.id))
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .forEach((range) => {
      const previous = merged[merged.length - 1];
      if (previous && range.start <= previous.end) {
        previous.end = Math.max(previous.end, range.end);
        if (!previous.ids.includes(range.id)) previous.ids.push(range.id);
      } else {
        merged.push({ start: range.start, end: range.end, ids: [range.id] });
      }
    });
  return merged;
}

export function applyClinicalHighlightAction(
  state: ClinicalState,
  action: ClinicalHighlightAction,
  selections: readonly CapturedClinicalHighlight[],
  at = new Date().toISOString()
): ClinicalHighlightActionResult {
  const current = clinicalHighlightsFromState(state);
  if (!selections.length) {
    return outcome(state, current, action, action === 'highlight' ? 'SELECTION_REQUIRED' : 'HIGHLIGHT_REQUIRED',
      action === 'highlight' ? 'Seleccione texto dentro de la historia clinica' : 'Seleccione texto resaltado en amarillo');
  }
  if (action === 'remove') return removeSelectedHighlights(state, current, selections, at);

  const added = selections.filter((selection) => !current.some((item) => active(item)
    && sameClinicalHighlightTarget(item, selection)
    && item.exact === selection.exact
    && item.start === selection.start));
  if (!added.length) return outcome(state, current, action, 'DUPLICATE', 'Ese texto ya esta resaltado');

  const nextHighlights = [...current, ...added.map(withoutRemovalIds)].slice(0, CLINICAL_HIGHLIGHT_LIMIT);
  const accepted = Math.max(0, nextHighlights.length - current.length);
  if (!accepted) return outcome(state, current, action, 'DUPLICATE', 'Ese texto ya esta resaltado');

  let nextState: ClinicalState = {
    ...state,
    meta: { ...asRecord(state.meta), clinicalHighlights: nextHighlights, updatedAt: at }
  };
  added.slice(0, accepted).forEach((highlight) => {
    nextState = markClinicalHighlightTargetImportant(nextState, highlight, at);
  });
  return {
    action,
    code: 'ADDED',
    message: accepted > 1 ? 'Textos resaltados y eventos destacados' : 'Texto resaltado y evento destacado',
    changed: true,
    added: accepted,
    removed: 0,
    highlights: nextHighlights,
    state: nextState
  };
}

function removeSelectedHighlights(
  state: ClinicalState,
  current: readonly ClinicalTextHighlight[],
  selections: readonly CapturedClinicalHighlight[],
  at: string
): ClinicalHighlightActionResult {
  const removalIds = new Set(selections.flatMap((selection) => selection.removeIds));
  if (!removalIds.size) {
    return outcome(state, current, 'remove', 'HIGHLIGHT_REQUIRED', 'La seleccion no contiene un resaltado amarillo');
  }
  const nextHighlights = current.filter((item) => !removalIds.has(item.id));
  const removed = current.length - nextHighlights.length;
  if (!removed) return outcome(state, current, 'remove', 'NOT_FOUND', 'No se encontro el resaltado seleccionado');
  return {
    action: 'remove', code: 'REMOVED',
    message: removed > 1 ? 'Resaltados eliminados' : 'Resaltado eliminado',
    changed: true, added: 0, removed, highlights: nextHighlights,
    state: { ...state, meta: { ...asRecord(state.meta), clinicalHighlights: nextHighlights, updatedAt: at } }
  };
}

function outcome(
  state: ClinicalState,
  highlights: readonly ClinicalTextHighlight[],
  action: ClinicalHighlightAction,
  code: ClinicalHighlightActionResult['code'],
  message: string
): ClinicalHighlightActionResult {
  return { action, code, message, changed: false, added: 0, removed: 0, highlights, state };
}

function withoutRemovalIds(selection: CapturedClinicalHighlight): ClinicalTextHighlight {
  const { removeIds: _removeIds, ...highlight } = selection;
  return highlight;
}

function markClinicalHighlightTargetImportant(state: ClinicalState, highlight: ClinicalTextHighlight, at: string): ClinicalState {
  if (highlight.kind === 'section') {
    const meta = asRecord(state.meta);
    const sectionMilestones = asRecord(meta['sectionMilestones']);
    const next = { ...state, meta: { ...meta, sectionMilestones: { ...sectionMilestones, [highlight.sectionKey]: true } } };
    return syncTimelineMilestone(next, highlight, null);
  }
  const collectionKey = collectionForRecordType(highlight.recordType);
  if (!collectionKey) return syncTimelineMilestone(state, highlight, null);
  const records = state[collectionKey] || [];
  let selected: ClinicalRecord | null = null;
  let changed = false;
  const updated = records.map((record) => {
    if (String(record.id) !== highlight.recordId) return record;
    changed = true;
    selected = { ...record, highlighted: true, updatedAt: at };
    return selected;
  });
  const next: ClinicalState = changed ? { ...state, [collectionKey]: updated } : state;
  return syncTimelineMilestone(next, highlight, selected);
}

function collectionForRecordType(recordType: string): ClinicalCollectionKey | null {
  if (recordType === 'evolution') return 'evolutions';
  if (recordType === 'study') return 'studies';
  if (recordType === 'treatment') return 'treatments';
  if (recordType === 'prescription') return 'prescriptions';
  if (recordType === 'research') return 'researchRecords';
  return null;
}

function syncTimelineMilestone(state: ClinicalState, highlight: ClinicalTextHighlight, record: ClinicalRecord | null): ClinicalState {
  const meta = asRecord(state.meta);
  const sourceEvents = Array.isArray(meta['aiTimelineEvents']) ? meta['aiTimelineEvents'] : [];
  if (!sourceEvents.length) return state;
  const date = text(record?.date) || text(record?.createdAt).slice(0, 10);
  const categories = timelineCategories(highlight.recordType, record);
  const tokens = new Set(normalizeSearchText(highlight.exact).split(/\W+/u).filter((token) => token.length > 3));
  const candidateIndexes: number[] = [];
  sourceEvents.forEach((candidate, index) => {
    const event = asRecord(candidate);
    if (date && text(event['date']) !== date) return;
    if (categories.length && !categories.includes(text(event['category']))) return;
    candidateIndexes.push(index);
  });
  if (!candidateIndexes.length) return state;
  let changed = false;
  const events = sourceEvents.map((candidate, index) => {
    if (!candidateIndexes.includes(index)) return candidate;
    const event = asRecord(candidate);
    const eventText = normalizeSearchText([event['title'], event['body'], event['sourceQuote']].map(text).filter(Boolean).join(' '));
    const overlap = [...tokens].filter((token) => eventText.includes(token)).length;
    if (candidateIndexes.length !== 1 && overlap < Math.min(2, Math.max(1, tokens.size))) return candidate;
    changed = true;
    return { ...event, highlighted: true, ...(record?.id && !event['sourceRecordId'] ? { sourceRecordId: record.id } : {}) };
  });
  return changed ? { ...state, meta: { ...meta, aiTimelineEvents: events } } : state;
}

function timelineCategories(recordType: string, record: ClinicalRecord | null): string[] {
  if (recordType === 'evolution') return ['evolution'];
  if (recordType === 'study') return ['study', 'pathology'];
  if (recordType === 'treatment') return record ? [treatmentKind(record)] : ['radiotherapy', 'surgery', 'systemic'];
  if (recordType === 'research') return ['research'];
  if (recordType !== 'prescription') return [];
  if (record?.type === 'certificate') return ['certificate'];
  if (record?.type === 'study') return ['study_order'];
  if (record?.type === 'free') return ['indication'];
  return ['prescription'];
}

function treatmentKind(record: ClinicalRecord): string {
  const value = normalizeSearchText([record.scheme, record.intent, record.status, record.notes].map(text).filter(Boolean).join(' '));
  if (/\b(radio|radioterapia|imrt|3d|boost|ptv)\b/u.test(value)) return 'radiotherapy';
  if (/\b(cirugia|quirurg|prostatectomia|reseccion|mastectomia|colectomia|orquiectomia)\b/u.test(value)) return 'surgery';
  return 'systemic';
}

function normalizeSearchText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR');
}
