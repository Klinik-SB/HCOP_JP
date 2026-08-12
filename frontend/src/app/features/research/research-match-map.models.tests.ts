import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RESEARCH_MATCH_AUDIT_RANKS,
  RESEARCH_MATCH_EXECUTION_STATES,
  RESEARCH_MATCH_PROFILES,
  ResearchMatchCriterionEvaluation,
  normalizeResearchMatchProfile,
  researchMatchCapability,
  resolveResearchMatch,
  visibleResearchMatchCriteria
} from './research-match-map.models';

const criterion = (
  id: string,
  state: ResearchMatchCriterionEvaluation['state'],
  hard = true
): ResearchMatchCriterionEvaluation => ({
  id,
  label: id,
  state,
  hard,
  requirement: 'Regla pública',
  patientEvidence: state === 'unknown' ? '' : 'Dato estructurado',
  sourceName: 'Fuente oficial',
  sourceVersion: '2026-08-11',
  sourceUrl: 'https://example.org/protocol'
});

test('la capacidad local nunca equivale a una ejecución ni fabrica una lista vacía', () => {
  const unavailable = researchMatchCapability(false);
  const informed = researchMatchCapability(true);

  assert.deepEqual(Object.keys(unavailable).sort(), ['engineReady', 'executionState', 'message']);
  assert.equal('matches' in unavailable, false);
  assert.equal('candidates' in unavailable, false);
  assert.equal(unavailable.executionState, 'not-run');
  assert.equal(informed.executionState, 'not-run');
});

test('expone los tres perfiles externos y ninguno modifica reglas duras', () => {
  assert.deepEqual(
    RESEARCH_MATCH_PROFILES.map((option) => option.id),
    ['sensitivity-oriented', 'balanced', 'specificity-oriented']
  );
  assert.equal(RESEARCH_MATCH_PROFILES.every((option) => option.changesHardRules === false), true);
  assert.equal(RESEARCH_MATCH_PROFILES.every((option) =>
    option.effects.every((effect) => ['breadth', 'ranking', 'questions'].includes(effect))), true);
  assert.equal(normalizeResearchMatchProfile('specificity-oriented'), 'specificity-oriented');
  assert.equal(normalizeResearchMatchProfile('probability-score'), 'balanced');
});

test('usa estados operativos prudentes y rankings ordinales sólo dentro de auditoría', () => {
  assert.deepEqual(
    RESEARCH_MATCH_EXECUTION_STATES.map((option) => option.label),
    [
      'No ejecutado',
      'No evaluable / faltan datos',
      'Contradicción con regla obligatoria',
      'Requiere auditoría humana'
    ]
  );
  assert.deepEqual(
    RESEARCH_MATCH_AUDIT_RANKS.map((option) => option.label),
    ['Posible para auditar', 'Alta concordancia para auditar']
  );
  const labels = [
    ...RESEARCH_MATCH_EXECUTION_STATES,
    ...RESEARCH_MATCH_AUDIT_RANKS
  ].map((option) => option.label.toLocaleLowerCase('es-AR'));
  assert.equal(labels.some((label) => label.includes('elegible') || label.includes('seguro')), false);
});

test('no ejecutado y datos duros faltantes no reciben ranking', () => {
  assert.deepEqual(resolveResearchMatch(false, [criterion('ecog', 'meets')]), {
    state: 'not-run', rank: null
  });
  assert.deepEqual(resolveResearchMatch(true, [criterion('biomarcador', 'unknown')]), {
    state: 'not-evaluable', rank: null
  });
});

test('una incompatibilidad dura domina cualquier perfil o ranking solicitado', () => {
  const criteria = [
    criterion('ecog', 'meets'),
    criterion('edad', 'does-not-meet'),
    criterion('biomarcador', 'unknown', false)
  ];

  assert.deepEqual(resolveResearchMatch(true, criteria, 'high-concordance-review'), {
    state: 'hard-incompatible', rank: null
  });
  assert.deepEqual(
    visibleResearchMatchCriteria(criteria).map((item) => item.id),
    ['edad', 'ecog', 'biomarcador']
  );
});

test('el ranking es ordinal y sólo aparece cuando corresponde auditoría humana', () => {
  const result = resolveResearchMatch(
    true,
    [criterion('ecog', 'meets'), criterion('biomarcador', 'meets', false)],
    'high-concordance-review'
  );

  assert.deepEqual(result, { state: 'human-review', rank: 'high-concordance-review' });
  assert.equal('score' in result, false);
  assert.equal('probability' in result, false);
});
