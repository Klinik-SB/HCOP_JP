import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearClinicalFocusHighlights,
  clinicalFocusCandidateScore,
  clinicalFocusTextRanges,
  clinicalFocusTokens,
  normalizeClinicalFocusText,
  renderClinicalFocusHighlights
} from './clinical-focus.dom';
import { ClinicalFocusService } from './clinical-focus.service';

test('focus preserva los resaltados vigentes y clear los elimina explícitamente', () => {
  const service = new ClinicalFocusService();
  const highlights = [{ terms: ['PSA total', '4,2 ng/mL'], color: 'study' }];
  service.highlight(highlights);
  service.focus({ date: '2026-08-01' });

  assert.equal(service.request().date, '2026-08-01');
  assert.deepEqual(service.request().highlights, highlights);

  service.focus({ text: 'PSA total' });
  assert.equal(service.request().text, 'PSA total');
  assert.deepEqual(service.request().highlights, highlights);

  service.clear();
  assert.deepEqual(service.request().highlights, []);
});

test('tokeniza textos clínicos con puntuación sin usar fragmentos numéricos ambiguos', () => {
  assert.deepEqual(
    clinicalFocusTokens('PSA total: 4,2 ng/mL; control 01/08/2026.'),
    ['control', 'total', 'psa']
  );
  assert.equal(normalizeClinicalFocusText('Evolución: Ácido'), 'evolucion: acido');
});

test('calcula marcas exactas, conserva el texto original y prioriza el término más largo', () => {
  const value = 'PSA total: 4,2 ng/mL';
  const ranges = clinicalFocusTextRanges(value, [
    { terms: ['PSA', 'PSA total', '4,2'], color: 'study' }
  ]);

  assert.deepEqual(ranges.map((range) => value.slice(range.start, range.end)), ['PSA total', '4,2']);
  assert.ok(ranges.every((range) => range.color === 'study'));
});

test('puntúa más alto el registro que contiene más términos específicos', () => {
  const terms = clinicalFocusTokens('PSA total control prostático');
  const partial = clinicalFocusCandidateScore('Control clínico general. PSA pendiente.', terms);
  const complete = clinicalFocusCandidateScore('Control prostático con PSA total.', terms);
  assert.ok(complete > partial);
});

test('usa rangos CSS exactos y los limpia sin reemplazar Text nodes de Angular', () => {
  class FakeRange {
    startContainer!: { parentElement: HTMLElement };
    startOffset = -1;
    endOffset = -1;
    setStart(node: { parentElement: HTMLElement }, offset: number): void {
      this.startContainer = node;
      this.startOffset = offset;
    }
    setEnd(_node: unknown, offset: number): void { this.endOffset = offset; }
  }
  class FakeHighlight {
    readonly ranges: readonly FakeRange[];
    constructor(...ranges: FakeRange[]) { this.ranges = ranges; }
  }
  type FakeRoot = HTMLElement & { readonly textNode: Text };
  const registry = new Map<string, FakeHighlight>();
  const fakeDocument = {
    defaultView: {
      NodeFilter: { SHOW_TEXT: 4 },
      CSS: { highlights: registry },
      Highlight: FakeHighlight
    },
    createTreeWalker(root: FakeRoot) {
      let pending = true;
      return {
        currentNode: root.textNode,
        nextNode() {
          if (!pending) return false;
          pending = false;
          return true;
        }
      };
    },
    createRange: () => new FakeRange()
  } as unknown as Document;
  const makeRoot = (value: string): FakeRoot => {
    const parent = { closest: () => null } as unknown as HTMLElement;
    const textNode = { nodeValue: value, parentElement: parent } as unknown as Text;
    return { ownerDocument: fakeDocument, textNode } as unknown as FakeRoot;
  };
  const historyRoot = makeRoot('CEA total: 6,8 ng/mL');
  const timelineRoot = makeRoot('Control CEA total: 2,1 ng/mL');

  const history = renderClinicalFocusHighlights(historyRoot, [{ terms: ['CEA total'], color: 'study' }]);
  renderClinicalFocusHighlights(timelineRoot, [{ terms: ['CEA total'], color: 'study' }]);

  assert.equal(history.firstMark, historyRoot.textNode.parentElement);
  assert.deepEqual(
    registry.get('hcop-agent-study')?.ranges.map((range) => [range.startOffset, range.endOffset]),
    [[0, 9], [8, 17]]
  );
  assert.equal('replaceWith' in historyRoot.textNode, false);

  clearClinicalFocusHighlights(historyRoot);
  assert.deepEqual(
    registry.get('hcop-agent-study')?.ranges.map((range) => [range.startOffset, range.endOffset]),
    [[8, 17]]
  );
  clearClinicalFocusHighlights(timelineRoot);
  assert.equal(registry.has('hcop-agent-study'), false);
});
