import {
  CLINICAL_HIGHLIGHT_TEXT_LIMIT,
  createClinicalHighlightId,
  mergeClinicalHighlightRanges,
  resolveClinicalHighlightRange,
  sameClinicalHighlightTarget
} from './clinical-highlight.engine';
import { CapturedClinicalHighlight, ClinicalTextHighlight } from './clinical-highlight.models';

const TEXT_NODE = 4;
const SKIPPED_CONTENT = [
  'button', 'svg', 'style', 'script', '.entry-audit', '.section-audit', '.section-actions',
  '.evolution-line-actions', '.clinical-record-milestone'
].join(', ');

export interface ClinicalHighlightCaptureOptions {
  readonly idFactory?: () => string;
  readonly now?: () => string;
}

export interface ClinicalHighlightRenderResult {
  readonly marks: number;
  readonly resolvedHighlights: number;
}

interface CanonicalScopeText {
  readonly nodes: readonly Text[];
  readonly offsets: ReadonlyMap<Text, number>;
  readonly text: string;
}

interface CaptureGroup {
  readonly scope: HTMLElement;
  readonly canonical: CanonicalScopeText;
  start: number;
  end: number;
  readonly removeIds: Set<string>;
}

export function clinicalHighlightTextNodes(scope: HTMLElement): Text[] {
  const document = scope.ownerDocument;
  const walker = document.createTreeWalker(scope, document.defaultView?.NodeFilter.SHOW_TEXT ?? TEXT_NODE);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType !== TEXT_NODE || !node.nodeValue?.trim()) continue;
    const textNode = node as Text;
    const parent = textNode.parentElement;
    if (!parent || parent.closest(SKIPPED_CONTENT)) continue;
    if (parent.closest<HTMLElement>('[data-highlight-scope]') !== scope) continue;
    nodes.push(textNode);
  }
  return nodes;
}

export function clinicalHighlightScopeText(scope: HTMLElement): CanonicalScopeText {
  const nodes = clinicalHighlightTextNodes(scope);
  const offsets = new Map<Text, number>();
  let text = '';
  nodes.forEach((node) => {
    offsets.set(node, text.length);
    text += node.nodeValue || '';
  });
  return { nodes, offsets, text };
}

export function captureClinicalHighlightSelection(
  root: HTMLElement,
  selection: Selection | null,
  highlights: readonly ClinicalTextHighlight[],
  options: ClinicalHighlightCaptureOptions = {}
): CapturedClinicalHighlight[] {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return [];
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return [];
  const groups = new Map<HTMLElement, CaptureGroup>();
  const walker = root.ownerDocument.createTreeWalker(root, root.ownerDocument.defaultView?.NodeFilter.SHOW_TEXT ?? TEXT_NODE);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType !== TEXT_NODE || !node.nodeValue?.trim()) continue;
    try {
      if (!range.intersectsNode(node)) continue;
    } catch {
      continue;
    }
    const textNode = node as Text;
    const scope = textNode.parentElement?.closest<HTMLElement>('[data-highlight-scope]');
    if (!scope || !root.contains(scope)) continue;
    const current = groups.get(scope);
    const canonical = current?.canonical || clinicalHighlightScopeText(scope);
    const base = canonical.offsets.get(textNode);
    if (base === undefined) continue;
    const bounds = selectedTextNodeBounds(range, textNode);
    if (bounds.end <= bounds.start) continue;
    const group = current || { scope, canonical, start: Number.POSITIVE_INFINITY, end: -1, removeIds: new Set<string>() };
    const persistentMark = textNode.parentElement?.closest<HTMLElement>('mark.clinical-text-highlight');
    persistentMark?.dataset['clinicalHighlightId']?.split(/\s+/u).filter(Boolean)
      .forEach((id) => group.removeIds.add(id));
    group.start = Math.min(group.start, base + bounds.start);
    group.end = Math.max(group.end, base + bounds.end);
    groups.set(scope, group);
  }

  const idFactory = options.idFactory || createClinicalHighlightId;
  const createdAt = (options.now || (() => new Date().toISOString()))();
  return [...groups.values()].map((group) => capturedFromGroup(group, highlights, idFactory, createdAt))
    .filter((item): item is CapturedClinicalHighlight => item !== null);
}

function capturedFromGroup(
  group: CaptureGroup,
  highlights: readonly ClinicalTextHighlight[],
  idFactory: () => string,
  createdAt: string
): CapturedClinicalHighlight | null {
  let start = group.start;
  let end = group.end;
  while (start < end && /\s/u.test(group.canonical.text[start] || '')) start += 1;
  while (end > start && /\s/u.test(group.canonical.text[end - 1] || '')) end -= 1;
  const exact = group.canonical.text.slice(start, end).slice(0, CLINICAL_HIGHLIGHT_TEXT_LIMIT);
  end = start + exact.length;
  if (!exact.trim()) return null;
  const identity = scopeIdentity(group.scope);
  if (!identity) return null;

  highlights.filter((highlight) => !highlight.removedAt && sameClinicalHighlightTarget(highlight, identity))
    .forEach((highlight) => {
      const resolved = resolveClinicalHighlightRange(group.canonical.text, highlight);
      if (resolved && start < resolved.end && end > resolved.start) group.removeIds.add(highlight.id);
    });
  return {
    id: idFactory(),
    ...identity,
    start,
    end,
    exact,
    prefix: group.canonical.text.slice(Math.max(0, start - 48), start),
    suffix: group.canonical.text.slice(end, end + 48),
    color: 'yellow',
    createdAt,
    removedAt: '',
    removeIds: [...group.removeIds]
  };
}

function scopeIdentity(scope: HTMLElement): Pick<ClinicalTextHighlight, 'kind' | 'recordType' | 'recordId' | 'sectionKey'> | null {
  const kind = scope.dataset['highlightKind'] === 'record' ? 'record' : 'section';
  const recordType = scope.dataset['highlightRecordType'] || '';
  const recordId = scope.dataset['highlightRecordId'] || '';
  const sectionKey = scope.dataset['highlightSectionKey'] || '';
  if (kind === 'record' ? !(recordType && recordId) : !sectionKey) return null;
  return { kind, recordType, recordId, sectionKey };
}

function selectedTextNodeBounds(range: Range, node: Text): { start: number; end: number } {
  let start = node === range.startContainer ? range.startOffset : 0;
  let end = node === range.endContainer ? range.endOffset : node.nodeValue?.length || 0;
  try {
    if (node !== range.startContainer) while (start < end && range.comparePoint(node, start) < 0) start += 1;
    if (node !== range.endContainer) while (end > start && range.comparePoint(node, end) > 0) end -= 1;
  } catch {
    // Los límites directos cubren las selecciones habituales sobre texto.
  }
  return { start, end };
}

export function renderClinicalHighlights(
  root: HTMLElement,
  highlights: readonly ClinicalTextHighlight[]
): ClinicalHighlightRenderResult {
  clearRenderedClinicalHighlights(root);
  const byScope = new Map<HTMLElement, { canonical: CanonicalScopeText; ranges: Array<{ start: number; end: number; id: string }> }>();
  let resolvedHighlights = 0;
  highlights.filter((highlight) => !highlight.removedAt).forEach((highlight) => {
    const scope = findClinicalHighlightScope(root, highlight);
    if (!scope) return;
    const group = byScope.get(scope);
    const canonical = group?.canonical || clinicalHighlightScopeText(scope);
    const resolved = resolveClinicalHighlightRange(canonical.text, highlight);
    if (!resolved) return;
    const target = group || { canonical, ranges: [] };
    target.ranges.push({ ...resolved, id: highlight.id });
    byScope.set(scope, target);
    resolvedHighlights += 1;
  });

  let marks = 0;
  byScope.forEach(({ canonical, ranges }) => {
    const merged = mergeClinicalHighlightRanges(ranges);
    canonical.nodes.forEach((node) => {
      const nodeStart = canonical.offsets.get(node);
      if (nodeStart === undefined) return;
      const value = node.nodeValue || '';
      const nodeEnd = nodeStart + value.length;
      const overlaps = merged.filter((range) => range.start < nodeEnd && range.end > nodeStart);
      if (!overlaps.length) return;
      const fragment = root.ownerDocument.createDocumentFragment();
      let cursor = 0;
      overlaps.forEach((range) => {
        const start = Math.max(0, range.start - nodeStart);
        const end = Math.min(value.length, range.end - nodeStart);
        if (start > cursor) fragment.appendChild(root.ownerDocument.createTextNode(value.slice(cursor, start)));
        const mark = root.ownerDocument.createElement('mark');
        mark.className = 'clinical-text-highlight';
        mark.dataset['clinicalHighlightId'] = range.ids.join(' ');
        mark.dataset['hcopClinicalHighlight'] = 'true';
        mark.textContent = value.slice(start, end);
        fragment.appendChild(mark);
        marks += 1;
        cursor = end;
      });
      if (cursor < value.length) fragment.appendChild(root.ownerDocument.createTextNode(value.slice(cursor)));
      node.replaceWith(fragment);
    });
  });
  return { marks, resolvedHighlights };
}

export function clearRenderedClinicalHighlights(root: HTMLElement): void {
  const parents = new Set<Node>();
  root.querySelectorAll<HTMLElement>('mark.clinical-text-highlight').forEach((mark) => {
    const parent = mark.parentNode;
    if (parent) parents.add(parent);
    mark.replaceWith(root.ownerDocument.createTextNode(mark.textContent || ''));
  });
  parents.forEach((parent) => parent.normalize());
}

function findClinicalHighlightScope(root: HTMLElement, highlight: ClinicalTextHighlight): HTMLElement | null {
  const scopes = [
    ...(root.matches('[data-highlight-scope]') ? [root] : []),
    ...root.querySelectorAll<HTMLElement>('[data-highlight-scope]')
  ];
  return scopes.find((scope) => {
    const identity = scopeIdentity(scope);
    return identity ? sameClinicalHighlightTarget(highlight, identity) : false;
  }) || null;
}
