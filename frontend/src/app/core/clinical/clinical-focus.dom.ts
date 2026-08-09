import type { ClinicalFocusRequest, ClinicalHighlight } from './clinical-focus.service';

export const CLINICAL_FOCUS_COLORS = [
  'study',
  'pathology',
  'chemotherapy',
  'evolution',
  'hormone',
  'systemic',
  'radiotherapy',
  'surgery',
  'immunotherapy',
  'targeted'
] as const;

const TEXT_NODE = 4;
const SKIPPED_AGENT_CONTENT = [
  'input',
  'textarea',
  'select',
  'button',
  'svg',
  'style',
  'script',
  'mark.agent-highlight',
  'mark.clinical-text-highlight'
].join(', ');

const CSS_HIGHLIGHT_PREFIX = 'hcop-agent';
const FALLBACK_HIGHLIGHT_CLASS = 'agent-highlight-fallback';

interface CssHighlightRegistry {
  set(name: string, highlight: unknown): void;
  delete(name: string): boolean;
}

interface CssHighlightConstructor {
  new (...ranges: Range[]): unknown;
}

interface ClinicalFocusRootState {
  readonly document: Document;
  readonly ranges: ReadonlyMap<string, readonly Range[]>;
  readonly fallbackAnchors: readonly HTMLElement[];
}

const rootHighlightStates = new WeakMap<HTMLElement, ClinicalFocusRootState>();
const documentHighlightRoots = new WeakMap<Document, Set<HTMLElement>>();

export interface ClinicalFocusTextRange {
  readonly start: number;
  readonly end: number;
  readonly color: string;
}

export interface ClinicalFocusRenderResult {
  readonly marks: readonly HTMLElement[];
  readonly firstMark: HTMLElement | null;
}

/** Normaliza búsquedas sin transformar la longitud de los textos que se van a marcar. */
export function normalizeClinicalFocusText(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-AR')
    .replace(/\s/gu, ' ');
}

/**
 * Extrae términos útiles incluso cuando la fila usa fechas, unidades o puntuación.
 * Los números cortos aislados se omiten para no enfocar cualquier fecha o dosis por accidente.
 */
export function clinicalFocusTokens(value: string): string[] {
  const tokens = normalizeClinicalFocusText(value)
    .split(/[^\p{L}\p{N}]+/u)
    .map((term) => term.trim())
    .filter((term) => /\p{L}/u.test(term) ? term.length >= 3 : term.length >= 5);
  return [...new Set(tokens)].sort((left, right) => right.length - left.length).slice(0, 12);
}

export function clinicalFocusTextRanges(
  value: string,
  highlights: readonly ClinicalHighlight[]
): ClinicalFocusTextRange[] {
  const normalized = normalizeClinicalFocusText(value);
  const requests = highlights.flatMap((highlight) => {
    const color = CLINICAL_FOCUS_COLORS.includes(highlight.color as typeof CLINICAL_FOCUS_COLORS[number])
      ? String(highlight.color)
      : 'study';
    return (highlight.terms || [])
      .map((term) => normalizeClinicalFocusText(term).trim().replace(/\s+/gu, ' '))
      .filter((term) => term.length >= 2)
      .map((term) => ({ term, color }));
  });
  const ranges: ClinicalFocusTextRange[] = [];
  for (const request of requests) {
    let start = 0;
    while ((start = normalized.indexOf(request.term, start)) !== -1) {
      ranges.push({ start, end: start + request.term.length, color: request.color });
      start += Math.max(request.term.length, 1);
    }
  }
  ranges.sort((left, right) => left.start - right.start || right.end - left.end);
  const accepted: ClinicalFocusTextRange[] = [];
  for (const range of ranges) {
    if (accepted.some((current) => range.start < current.end && range.end > current.start)) continue;
    accepted.push(range);
  }
  return accepted;
}

export function renderClinicalFocusHighlights(
  root: HTMLElement,
  highlights: readonly ClinicalHighlight[]
): ClinicalFocusRenderResult {
  clearClinicalFocusHighlights(root);
  if (!highlights.length) return { marks: [], firstMark: null };
  const document = root.ownerDocument;
  const walker = document.createTreeWalker(
    root,
    document.defaultView?.NodeFilter.SHOW_TEXT ?? TEXT_NODE
  );
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.nodeValue?.trim()) continue;
    const parent = node.parentElement;
    if (!parent || parent.closest(SKIPPED_AGENT_CONTENT)) continue;
    if (clinicalFocusTextRanges(node.nodeValue, highlights).length) nodes.push(node);
  }

  const rangesByColor = new Map<string, Range[]>();
  const anchors: HTMLElement[] = [];
  const seenAnchors = new Set<HTMLElement>();
  for (const node of nodes) {
    const value = node.nodeValue || '';
    const ranges = clinicalFocusTextRanges(value, highlights);
    if (!ranges.length) continue;
    for (const range of ranges) {
      const exactRange = document.createRange();
      exactRange.setStart(node, range.start);
      exactRange.setEnd(node, range.end);
      const colorRanges = rangesByColor.get(range.color) || [];
      colorRanges.push(exactRange);
      rangesByColor.set(range.color, colorRanges);
    }
    const anchor = node.parentElement;
    if (anchor && !seenAnchors.has(anchor)) {
      seenAnchors.add(anchor);
      anchors.push(anchor);
    }
  }

  if (!rangesByColor.size) return { marks: [], firstMark: null };
  const fallbackAnchors = installClinicalFocusHighlights(root, rangesByColor, anchors);
  const state: ClinicalFocusRootState = { document, ranges: rangesByColor, fallbackAnchors };
  rootHighlightStates.set(root, state);
  const roots = documentHighlightRoots.get(document) || new Set<HTMLElement>();
  roots.add(root);
  documentHighlightRoots.set(document, roots);
  refreshDocumentCssHighlights(document);
  return { marks: anchors, firstMark: anchors[0] || null };
}

/** Elimina rangos nativos o clases de compatibilidad sin tocar los Text nodes de Angular. */
export function clearClinicalFocusHighlights(root: HTMLElement): void {
  const state = rootHighlightStates.get(root);
  if (!state) return;
  for (const anchor of state.fallbackAnchors) {
    anchor.classList.remove(FALLBACK_HIGHLIGHT_CLASS);
    for (const color of CLINICAL_FOCUS_COLORS) {
      anchor.classList.remove(`${FALLBACK_HIGHLIGHT_CLASS}--${color}`);
    }
  }
  rootHighlightStates.delete(root);
  const roots = documentHighlightRoots.get(state.document);
  roots?.delete(root);
  if (roots && !roots.size) documentHighlightRoots.delete(state.document);
  refreshDocumentCssHighlights(state.document);
}

function installClinicalFocusHighlights(
  root: HTMLElement,
  rangesByColor: ReadonlyMap<string, readonly Range[]>,
  anchors: readonly HTMLElement[]
): HTMLElement[] {
  const support = cssHighlightSupport(root.ownerDocument);
  if (support) return [];
  const fallbackAnchors: HTMLElement[] = [];
  for (const anchor of anchors) {
    const color = [...rangesByColor.entries()]
      .find(([, ranges]) => ranges.some((range) => range.startContainer.parentElement === anchor))?.[0] || 'study';
    anchor.classList.add(FALLBACK_HIGHLIGHT_CLASS, `${FALLBACK_HIGHLIGHT_CLASS}--${color}`);
    fallbackAnchors.push(anchor);
  }
  return fallbackAnchors;
}

function refreshDocumentCssHighlights(document: Document): void {
  const support = cssHighlightSupport(document);
  if (!support) return;
  for (const color of CLINICAL_FOCUS_COLORS) {
    const ranges: Range[] = [];
    for (const root of documentHighlightRoots.get(document) || []) {
      ranges.push(...(rootHighlightStates.get(root)?.ranges.get(color) || []));
    }
    const name = `${CSS_HIGHLIGHT_PREFIX}-${color}`;
    if (ranges.length) support.registry.set(name, new support.Highlight(...ranges));
    else support.registry.delete(name);
  }
}

function cssHighlightSupport(document: Document): {
  readonly registry: CssHighlightRegistry;
  readonly Highlight: CssHighlightConstructor;
} | null {
  const view = document.defaultView as (Window & {
    CSS?: typeof CSS & { highlights?: CssHighlightRegistry };
    Highlight?: CssHighlightConstructor;
  }) | null;
  const registry = view?.CSS?.highlights;
  const Highlight = view?.Highlight;
  return registry && Highlight ? { registry, Highlight } : null;
}

export function clinicalFocusCandidateScore(content: string, tokens: readonly string[]): number {
  const normalized = normalizeClinicalFocusText(content);
  return tokens.reduce((score, token) => normalized.includes(token) ? score + token.length * token.length : score, 0);
}

export function findClinicalFocusTarget(
  root: HTMLElement,
  request: Pick<ClinicalFocusRequest, 'date' | 'text'>,
  selector = '[data-clinical-date], .doc-entry, [data-highlight-kind="record"], .doc-section'
): HTMLElement | null {
  const candidates = [...root.querySelectorAll<HTMLElement>(selector)];
  if (request.date) {
    const dated = candidates.filter((candidate) => candidate.dataset['clinicalDate'] === request.date);
    if (dated.length === 1 || !request.text) return dated[0] || null;
    const tokens = clinicalFocusTokens(request.text);
    return bestClinicalFocusCandidate(dated, tokens) || dated[0] || null;
  }
  const tokens = clinicalFocusTokens(request.text || '');
  return bestClinicalFocusCandidate(candidates, tokens);
}

export function openClinicalFocusDetails(target: HTMLElement): void {
  let details = target.closest<HTMLDetailsElement>('details');
  while (details) {
    details.open = true;
    details = details.parentElement?.closest<HTMLDetailsElement>('details') || null;
  }
}

function bestClinicalFocusCandidate(candidates: readonly HTMLElement[], tokens: readonly string[]): HTMLElement | null {
  if (!tokens.length) return null;
  let winner: HTMLElement | null = null;
  let winnerScore = 0;
  for (const candidate of candidates) {
    const contentScore = clinicalFocusCandidateScore(candidate.textContent || '', tokens);
    if (!contentScore) continue;
    const recordBonus = candidate.matches('.doc-entry, [data-highlight-kind="record"], .right-timeline-item') ? 2 : 0;
    const score = contentScore * 10 + recordBonus;
    if (score <= winnerScore) continue;
    winner = candidate;
    winnerScore = score;
  }
  return winner;
}
