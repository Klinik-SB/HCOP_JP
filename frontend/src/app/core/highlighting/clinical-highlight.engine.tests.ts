import type { ClinicalState } from '../patients/patient-workspace.models';
import {
  applyClinicalHighlightAction,
  mergeClinicalHighlightRanges,
  normalizeClinicalHighlights,
  resolveClinicalHighlightRange
} from './clinical-highlight.engine';
import type { CapturedClinicalHighlight } from './clinical-highlight.models';

interface TestCase { readonly name: string; readonly run: () => void; }
const tests: TestCase[] = [];
let assertions = 0;

function test(name: string, run: () => void): void { tests.push({ name, run }); }
function equal(actual: unknown, expected: unknown, message = ''): void {
  assertions += 1;
  if (!Object.is(actual, expected)) {
    throw new Error(`${message ? `${message}: ` : ''}esperado ${String(expected)}, recibido ${String(actual)}.`);
  }
}
function deepEqual(actual: unknown, expected: unknown, message = ''): void {
  assertions += 1;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message ? `${message}: ` : ''}esperado ${JSON.stringify(expected)}, recibido ${JSON.stringify(actual)}.`);
  }
}

function selection(overrides: Partial<CapturedClinicalHighlight> = {}): CapturedClinicalHighlight {
  return {
    id: 'clinical-highlight-test-1', kind: 'record', recordType: 'evolution', recordId: 'evo-1', sectionKey: '',
    start: 0, end: 16, exact: 'Dolor progresivo', prefix: '', suffix: ' durante el control', color: 'yellow',
    createdAt: '2026-08-03T15:00:00.000Z', removedAt: '', removeIds: [], ...overrides
  };
}

test('normaliza el contrato legacy, filtra destinos inválidos y limita contextos', () => {
  const normalized = normalizeClinicalHighlights([
    {
      id: 'section-1', kind: 'section', sectionKey: 'chiefComplaint', exact: 'Consulta', start: '4', end: '12',
      prefix: 'x'.repeat(80), suffix: 'y'.repeat(80), color: 'red', createdAt: 'fecha'
    },
    { id: 'invalid-record', kind: 'record', exact: 'Sin identidad' },
    { id: 'invalid-kind', kind: 'otro', sectionKey: 'summary', exact: 'Texto' }
  ]);
  equal(normalized.length, 1);
  equal(normalized[0]?.kind, 'section');
  equal(normalized[0]?.color, 'yellow');
  equal(normalized[0]?.start, 4);
  equal(normalized[0]?.end, 12);
  equal(normalized[0]?.prefix.length, 64);
  equal(normalized[0]?.suffix.length, 64);
});

test('reubica un resaltado cuando el texto cambió usando prefijo y sufijo', () => {
  const canonical = 'valor inicial; cierre valor final';
  const resolved = resolveClinicalHighlightRange(canonical, {
    start: 1, end: 6, exact: 'valor', prefix: 'cierre ', suffix: ' final'
  });
  equal(resolved?.start, canonical.lastIndexOf('valor'));
  equal(resolved?.end, canonical.lastIndexOf('valor') + 5);
  equal(resolveClinicalHighlightRange('sin coincidencia', {
    start: 0, end: 5, exact: 'valor', prefix: '', suffix: ''
  }), null);
});

test('fusiona rangos solapados o adyacentes sin duplicar identificadores', () => {
  const merged = mergeClinicalHighlightRanges([
    { start: 10, end: 15, id: 'b' }, { start: 0, end: 5, id: 'a' },
    { start: 5, end: 12, id: 'b' }, { start: 20, end: 24, id: 'c' }
  ]);
  deepEqual(merged, [
    { start: 0, end: 15, ids: ['a', 'b'] },
    { start: 20, end: 24, ids: ['c'] }
  ]);
});

test('agrega el resaltado de forma inmutable y conserva los hitos legacy', () => {
  const source: ClinicalState = {
    evolutions: [{ id: 'evo-1', date: '2026-08-03', text: 'Dolor progresivo durante el control' }],
    meta: {
      persistenceRevision: 7,
      clinicalHighlights: [],
      aiTimelineEvents: [{ id: 'event-1', date: '2026-08-03', category: 'evolution', title: 'Dolor progresivo' }]
    }
  };
  const serialized = JSON.stringify(source);
  const result = applyClinicalHighlightAction(source, 'highlight', [selection()], '2026-08-03T15:01:00.000Z');
  equal(result.changed, true);
  equal(result.code, 'ADDED');
  equal(result.message, 'Texto resaltado y evento destacado');
  equal(result.added, 1);
  equal(result.highlights.length, 1);
  equal(result.state.evolutions?.[0]?.highlighted, true);
  equal(result.state.evolutions?.[0]?.updatedAt, '2026-08-03T15:01:00.000Z');
  equal((result.state.meta?.['aiTimelineEvents'] as Array<Record<string, unknown>>)[0]?.['highlighted'], true);
  equal(result.state.meta?.['persistenceRevision'], 7);
  equal(result.state.meta?.['updatedAt'], '2026-08-03T15:01:00.000Z');
  equal(JSON.stringify(source), serialized, 'no debe mutar el estado recibido');

  const duplicate = applyClinicalHighlightAction(result.state, 'highlight', [selection()], '2026-08-03T15:02:00.000Z');
  equal(duplicate.changed, false);
  equal(duplicate.code, 'DUPLICATE');
  equal(duplicate.state, result.state);
});

test('una selección de sección registra sectionMilestones sin exigir un registro', () => {
  const result = applyClinicalHighlightAction({ meta: { custom: 'preservar' } }, 'highlight', [selection({
    id: 'section-highlight', kind: 'section', recordType: '', recordId: '', sectionKey: 'summaryPlan',
    start: 2, end: 9, exact: 'Resumen'
  })], '2026-08-03T16:00:00.000Z');
  equal(result.changed, true);
  equal((result.state.meta?.['sectionMilestones'] as Record<string, unknown>)['summaryPlan'], true);
  equal(result.state.meta?.['custom'], 'preservar');
});

test('quitar resaltado elimina sólo las anclas y conserva el hito ya documentado', () => {
  const highlighted = applyClinicalHighlightAction({ evolutions: [{ id: 'evo-1' }], meta: {} }, 'highlight', [selection()]);
  const removal = selection({ id: 'capture-remove', removeIds: ['clinical-highlight-test-1'] });
  const result = applyClinicalHighlightAction(highlighted.state, 'remove', [removal], '2026-08-03T17:00:00.000Z');
  equal(result.changed, true);
  equal(result.code, 'REMOVED');
  equal(result.removed, 1);
  equal(result.highlights.length, 0);
  equal(result.state.evolutions?.[0]?.highlighted, true, 'legacy no desmarca el hito al quitar amarillo');
  equal(result.state.meta?.['updatedAt'], '2026-08-03T17:00:00.000Z');
});

test('distingue selección ausente, texto sin amarillo e identificador inexistente', () => {
  const emptyAdd = applyClinicalHighlightAction({}, 'highlight', []);
  equal(emptyAdd.code, 'SELECTION_REQUIRED');
  equal(emptyAdd.message, 'Seleccione texto dentro de la historia clinica');

  const emptyRemove = applyClinicalHighlightAction({}, 'remove', [selection({ removeIds: [] })]);
  equal(emptyRemove.code, 'HIGHLIGHT_REQUIRED');
  equal(emptyRemove.message, 'La seleccion no contiene un resaltado amarillo');

  const missing = applyClinicalHighlightAction({}, 'remove', [selection({ removeIds: ['missing'] })]);
  equal(missing.code, 'NOT_FOUND');
  equal(missing.changed, false);
});

test('informa plural al agregar o quitar varios resaltados', () => {
  const first = selection();
  const second = selection({
    id: 'clinical-highlight-test-2', kind: 'section', recordType: '', recordId: '', sectionKey: 'summary',
    exact: 'Resumen', start: 0, end: 7
  });
  const added = applyClinicalHighlightAction({}, 'highlight', [first, second]);
  equal(added.added, 2);
  equal(added.message, 'Textos resaltados y eventos destacados');
  const removed = applyClinicalHighlightAction(added.state, 'remove', [selection({ removeIds: [first.id, second.id] })]);
  equal(removed.removed, 2);
  equal(removed.message, 'Resaltados eliminados');
});

for (const item of tests) item.run();
console.log(`clinical-highlight-engine: ${tests.length} casos, ${assertions} aserciones OK`);
