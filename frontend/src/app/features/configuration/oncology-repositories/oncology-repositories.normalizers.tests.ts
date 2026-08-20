import assert from 'node:assert/strict';
import test from 'node:test';
import {
  blankTrialSourceDraft,
  normalizeTrialScreeningSettings,
  normalizeTrialSourceCatalog,
  trialScreeningSettingsPayload,
  trialSourceAutomationReady,
  trialSourceDraftFromItem,
  trialSourceDraftSnapshot,
  trialSourcePayload,
  trialSourceRealtimeReady,
  validateTrialScreeningSettings,
  validateTrialSourceDraft
} from './oncology-repositories.normalizers';

test('screening defaults are conservative, local and avoid repeated prompts', () => {
  const draft = normalizeTrialScreeningSettings({});
  assert.equal(draft.mode, 'manual');
  assert.equal(draft.intervalHours, 24);
  assert.equal(draft.cooldownHours, 24);
  assert.equal(draft.maxQuestionsPerModal, 3);
  assert.equal(draft.snoozeHours, 24);
  assert.equal(draft.localEvaluationOnly, true);
  assert.deepEqual(validateTrialScreeningSettings(draft), []);
});

test('source catalog exposes capabilities but keeps NCI behind its secure connector', () => {
  const sources = normalizeTrialSourceCatalog({ items: [
    { id: 1, key: 'trial-source:ctg', name: 'ClinicalTrials.gov', active: true, revision: 1,
      definition: { connector: 'clinicaltrials-gov' } },
    { id: 2, key: 'trial-source:nci', name: 'NCI', active: true, revision: 1,
      definition: { connector: 'nci', automationCapable: true, realtimeCapable: true,
        secureConnectorState: 'managed', syncPolicy: 'scheduled' } }
  ] });
  assert.equal(trialSourceAutomationReady(sources[0]!), true);
  assert.equal(trialSourceRealtimeReady(sources[0]!), true);
  assert.equal(sources[1]?.definition.secureConnectorState, 'pending');
  assert.equal(sources[1]?.active, false);
  assert.equal(sources[1]?.definition.syncPolicy, 'manual');
  assert.equal(trialSourceAutomationReady(sources[1]!), false);
  assert.equal(trialSourceRealtimeReady(sources[1]!), false);
});

test('NCI starts inactive and cannot be activated while its secure connector is pending', () => {
  const nci = blankTrialSourceDraft('nci');
  assert.equal(nci.active, false);
  assert.deepEqual(validateTrialSourceDraft(nci), []);

  nci.active = true;
  assert.ok(validateTrialSourceDraft(nci).some((issue) => issue.path === 'connector'));
});

test('configuration payloads never contain credentials or patient identifiers', () => {
  const sourcePayload = trialSourcePayload(blankTrialSourceDraft('nci'));
  const screeningPayload = trialScreeningSettingsPayload(normalizeTrialScreeningSettings({}));
  const sourceJson = JSON.stringify(sourcePayload).toLowerCase();
  const screeningJson = JSON.stringify(screeningPayload).toLowerCase();
  for (const forbidden of ['apikey', 'api_key', 'secret', 'password', 'dni', 'patientname', 'medicalrecord']) {
    assert.equal(sourceJson.includes(forbidden), false, forbidden);
    assert.equal(screeningJson.includes(forbidden), false, forbidden);
  }
  assert.deepEqual(Object.keys(sourcePayload['definition'] as Record<string, unknown>).sort(), [
    'accessType', 'attribution', 'automationCapable', 'connector', 'countries', 'endpointUrl', 'notes',
    'phases', 'realtimeCapable', 'recruitmentStatuses', 'schemaVersion', 'secureConnectorState',
    'syncIntervalHours', 'syncPolicy', 'termsUrl'
  ].sort());
  assert.deepEqual(Object.keys(screeningPayload['definition'] as Record<string, unknown>).sort(), [
    'cooldownHours', 'enabled', 'intervalHours', 'localEvaluationOnly', 'maxQuestionsPerModal',
    'mode', 'schemaVersion', 'snoozeHours', 'triggerFields'
  ].sort());
});

test('validation blocks unsafe URLs and impossible automation policies', () => {
  const source = blankTrialSourceDraft('renis');
  source.endpointUrl = 'http://inseguro.test';
  source.attribution = '';
  source.syncPolicy = 'scheduled';
  assert.deepEqual(validateTrialSourceDraft(source).map((issue) => issue.path), [
    'endpointUrl', 'attribution', 'syncPolicy'
  ]);

  const screening = { ...normalizeTrialScreeningSettings({}), maxQuestionsPerModal: 4 };
  assert.ok(validateTrialScreeningSettings(screening).some((issue) => issue.path === 'maxQuestionsPerModal'));
  assert.ok(validateTrialScreeningSettings({ ...screening, maxQuestionsPerModal: 3, cooldownHours: 0 })
    .some((issue) => issue.path === 'cooldownHours'));
});

test('dirty snapshots detect edits and return to the persisted source deterministically', () => {
  const [item] = normalizeTrialSourceCatalog({ items: [{
    id: 7, key: 'trial-source:ctg', name: 'ClinicalTrials.gov', active: true, revision: 2,
    definition: { connector: 'clinicaltrials-gov', countries: ['AR'] }
  }] });
  const draft = trialSourceDraftFromItem(item!);
  const clean = trialSourceDraftSnapshot(draft);
  draft.countries = 'AR, CL';
  assert.notEqual(trialSourceDraftSnapshot(draft), clean);
  assert.equal(trialSourceDraftSnapshot(trialSourceDraftFromItem(item!)), clean);
});

test('recruitment statuses survive an edit roundtrip when a status contains a comma', () => {
  const statuses = ['Recruiting', 'Not yet recruiting', 'Active, not recruiting'];
  const [item] = normalizeTrialSourceCatalog({ items: [{
    id: 8, key: 'trial-source:statuses', name: 'ClinicalTrials.gov', active: true, revision: 4,
    definition: { connector: 'clinicaltrials-gov', recruitmentStatuses: statuses }
  }] });

  const draft = trialSourceDraftFromItem(item!);
  const definition = trialSourcePayload(draft)['definition'] as Record<string, unknown>;
  assert.deepEqual(definition['recruitmentStatuses'], statuses);
});

console.log('oncology-repositories normalizers: ok');
