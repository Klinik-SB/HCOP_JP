import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isTrialScreeningVersionConflict,
  normalizeTrialScreeningPreference,
  trialScreeningPreferenceUpdate,
  withResearchActive
} from './trial-screening-preference.models';

test('reconoce sólo conflictos de versión para recuperar el estado vigente', () => {
  assert.equal(isTrialScreeningVersionConflict({ status: 409 }), true);
  assert.equal(isTrialScreeningVersionConflict({ status: 400 }), false);
  assert.equal(isTrialScreeningVersionConflict(new Error('conflicto')), false);
});

test('normaliza respuestas inválidas en modo seguro e inactivo', () => {
  const state = normalizeTrialScreeningPreference({
    ok: true,
    researchActive: 'true',
    institutionalEnabled: true,
    mode: 'desconocido',
    proactiveActive: true,
    effective: true,
    revision: -1,
    engineReady: true
  });

  assert.equal(state.researchActive, false);
  assert.equal(state.mode, 'manual');
  assert.equal(state.proactiveActive, false);
  assert.equal(state.effective, false);
  assert.equal(state.revision, 0);
});

test('distingue una preferencia preparada de un motor efectivo', () => {
  const state = normalizeTrialScreeningPreference({
    ok: true,
    researchActive: true,
    institutionalEnabled: true,
    mode: 'scheduled',
    proactiveActive: true,
    effective: true,
    revision: 3,
    engineReady: false
  });

  assert.equal(state.proactiveActive, true);
  assert.equal(state.engineReady, false);
  assert.equal(state.effective, false);
});

test('la institución y el modo manual limitan la actividad proactiva', () => {
  const disabled = normalizeTrialScreeningPreference({
    researchActive: true,
    institutionalEnabled: false,
    mode: 'realtime',
    proactiveActive: true,
    engineReady: true,
    effective: true
  });
  const manual = normalizeTrialScreeningPreference({
    researchActive: true,
    institutionalEnabled: true,
    mode: 'manual',
    proactiveActive: true,
    engineReady: true,
    effective: true
  });

  assert.equal(disabled.proactiveActive, false);
  assert.equal(manual.proactiveActive, false);
});

test('construye un PUT mínimo sin identidad de usuario', () => {
  const request = trialScreeningPreferenceUpdate(true, 4);

  assert.deepEqual(Object.keys(request).sort(), ['expectedRevision', 'researchActive']);
  assert.deepEqual(request, { researchActive: true, expectedRevision: 4 });
  assert.equal('userId' in request, false);
});

test('el cambio optimista conserva revisión y puede revertirse al estado anterior', () => {
  const previous = normalizeTrialScreeningPreference({
    ok: true,
    researchActive: false,
    institutionalEnabled: true,
    mode: 'realtime',
    proactiveActive: false,
    effective: false,
    revision: 7,
    engineReady: false
  });
  const optimistic = withResearchActive(previous, true);

  assert.equal(optimistic.researchActive, true);
  assert.equal(optimistic.proactiveActive, true);
  assert.equal(optimistic.effective, false);
  assert.equal(optimistic.revision, 7);
  assert.equal(previous.researchActive, false);
});
