import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adminRolePayload,
  adminUserPayload,
  blankAdminRole,
  blankAdminUser,
  blankCalculator,
  blankResearch,
  calculatorSavePayload,
  dayHospitalPreview,
  defaultDayHospitalDraft,
  evaluateCalculatorDraft,
  llmDraftFromConfiguration,
  normalizeCalculatorCatalog,
  normalizeLlmConfiguration,
  normalizeRoles,
  researchSavePayload,
  validateAdminRoleDraft,
  validateAdminUserDraft,
  validateCalculatorDraft,
  validateLlmDraft,
  validateResearchDraft
} from './configuration-operations.normalizers';

test('day hospital preserves every supported fraction and rejects inverted hours', () => {
  for (const slotMinutes of [5, 10, 15, 20, 30] as const) {
    const draft = { ...defaultDayHospitalDraft(), slotMinutes };
    const preview = dayHospitalPreview(draft);
    assert.equal(preview.valid, true);
    assert.equal(preview.slotsPerChair, 480 / slotMinutes);
    assert.equal(preview.totalSlots, preview.slotsPerChair * 6);
  }
  assert.equal(dayHospitalPreview({ ...defaultDayHospitalDraft(), startTime: '16:00', endTime: '08:00' }).valid, false);
});

test('formula builder evaluates the persisted contract and rejects unknown variables', () => {
  const draft = blankCalculator('formula');
  const result = evaluateCalculatorDraft(draft, { peso: 81, altura: 180 });
  assert.equal(result.value, 2.0124611797498106);
  assert.equal(validateCalculatorDraft(draft).length, 0);
  draft.expression = 'peso + variable_inexistente';
  assert.ok(validateCalculatorDraft(draft).some((issue) => issue.path === 'expression'));
});

test('score builder evaluates checkbox points and persists non-programmatic rules', () => {
  const draft = blankCalculator('score');
  draft.fields[0]!.checkedPoints = 3;
  const result = evaluateCalculatorDraft(draft, { criterio_1: true });
  assert.equal(result.value, 3);
  const payload = calculatorSavePayload(draft);
  const definition = payload['definition'] as Record<string, unknown>;
  assert.equal(definition['mode'], 'score');
  assert.equal((definition['fields'] as unknown[]).length, 1);
});

test('calculator catalog accepts the historical configuration envelope', () => {
  const [item] = normalizeCalculatorCatalog({ items: [{
    id: 8, kind: 'calculator', key: 'calculator:test', name: 'Test', active: false, revision: 3,
    definition: { mode: 'score', category: 'toxicidad', fields: [], ranges: [], decimals: 0 }
  }] });
  assert.equal(item?.id, '8');
  assert.equal(item?.active, false);
  assert.equal(item?.definition.mode, 'score');
  assert.equal(item?.definition.category, 'toxicidad');
});

test('research builder requires unique valid keys and emits the legacy payload', () => {
  const draft = blankResearch();
  assert.equal(validateResearchDraft(draft).length, 0);
  draft.fields[2]!.key = draft.fields[1]!.key;
  assert.ok(validateResearchDraft(draft).some((issue) => issue.message.includes('repetida')));
  draft.fields[2]!.key = 'codigo_participante';
  const definition = researchSavePayload(draft)['definition'] as Record<string, unknown>;
  assert.equal((definition['fields'] as unknown[]).length, 3);
});

test('LLM normalization never exposes a key and validation covers endpoint and replacement', () => {
  const config = normalizeLlmConfiguration({ llm: {
    enabled: true, provider: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen',
    hasApiKey: true, lockedFields: ['apiKey']
  } });
  assert.equal(config.provider, 'ollama');
  assert.equal(config.hasApiKey, true);
  const draft = llmDraftFromConfiguration(config);
  assert.equal(validateLlmDraft(draft).length, 0);
  draft.baseUrl = 'file:///tmp/model';
  draft.apiKeyAction = 'replace';
  assert.deepEqual(validateLlmDraft(draft).map((issue) => issue.path).sort(), ['apiKey', 'baseUrl']);
});

test('RBAC normalizes permission groups and validates user and role payloads', () => {
  const catalog = normalizeRoles({
    roles: [{ id: 2, roleKey: 'oncologo', displayName: 'Oncólogo', permissions: ['section.patient.view'] }],
    permissionCatalog: [{ key: 'section.patient.view', displayName: 'Ver pacientes' }]
  });
  assert.equal(catalog.roles[0]?.key, 'oncologo');
  assert.equal(catalog.permissions[0]?.groupLabel, 'Sección · Patient');

  const user = blankAdminUser();
  assert.ok(validateAdminUserDraft(user).length >= 4);
  Object.assign(user, {
    username: 'test.user', email: 'test@example.com', displayName: 'Test User',
    password: 'clave-segura', roleIds: ['2']
  });
  assert.equal(validateAdminUserDraft(user).length, 0);
  assert.deepEqual(adminUserPayload(user)['roleIds'], [2]);

  const role = blankAdminRole();
  role.name = 'Gestor de turnos';
  role.permissions = ['section.day-hospital.view'];
  assert.equal(validateAdminRoleDraft(role).length, 0);
  assert.equal(adminRolePayload(role)['key'], 'gestor-de-turnos');
});
