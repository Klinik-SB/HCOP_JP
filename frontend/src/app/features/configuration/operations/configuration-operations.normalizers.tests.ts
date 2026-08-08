import assert from 'node:assert/strict';
import test from 'node:test';
import { toolConfigurationKey } from '../../tools/calculators/institutional-calculator-catalog.validator';
import { PORTED_CALCULATORS } from '../../tools/calculators/ported-calculator.registry';
import {
  adminRolePayload,
  adminUserPayload,
  blankAdminRole,
  blankAdminUser,
  blankBuilderOption,
  blankCalculator,
  blankCalculatorField,
  blankResearch,
  calculatorDraftFromBuiltIn,
  calculatorSavePayload,
  dayHospitalPreview,
  defaultDayHospitalDraft,
  droppedItemDestination,
  evaluateCalculatorDraft,
  llmDraftFromConfiguration,
  normalizeCalculatorCatalog,
  normalizeToolSettingsCatalog,
  normalizeToolSettingsMutation,
  normalizeLlmConfiguration,
  normalizeRoles,
  reorderMutableItems,
  researchSavePayload,
  toolSettingsSavePayload,
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

test('calculator builder blocks unsupported dates, duplicate options and consumer limits', () => {
  const draft = blankCalculator('formula');
  draft.fields[0]!.type = 'date';
  assert.ok(validateCalculatorDraft(draft).some((issue) => issue.path === 'fields.0.type'));

  draft.fields = [blankCalculatorField({
    key: 'grupo',
    label: 'Grupo',
    type: 'select',
    options: [
      { ...blankBuilderOption(), value: 'a', label: 'A' },
      { ...blankBuilderOption(), value: 'a', label: 'A repetida' }
    ]
  })];
  draft.expression = '1';
  assert.ok(validateCalculatorDraft(draft).some((issue) => issue.path === 'fields.0.options.1.value'));

  draft.fields = Array.from({ length: 101 }, (_, index) => blankCalculatorField({
    clientId: `field-${index}`,
    key: `v_${index}`,
    label: `Variable ${index}`
  }));
  assert.ok(validateCalculatorDraft(draft).some((issue) => issue.path === 'fields'));

  const longFormula = blankCalculator('formula');
  longFormula.expression = `peso + ${'1'.repeat(4_096)}`;
  assert.ok(validateCalculatorDraft(longFormula).some((issue) => issue.path === 'expression'));
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

test('configuration exposes all integrated calculators and builds one stable override per canonical key', () => {
  assert.equal(PORTED_CALCULATORS.length, 57);
  for (const candidate of PORTED_CALCULATORS) {
    const candidateDraft = calculatorDraftFromBuiltIn(candidate, toolConfigurationKey(candidate.title));
    assert.deepEqual(validateCalculatorDraft(candidateDraft), [], `personalización inválida para ${candidate.title}`);
  }
  const definition = PORTED_CALCULATORS.find((candidate) => candidate.fields.some((field) => Boolean(field.help)))
    ?? PORTED_CALCULATORS[0]!;
  const key = toolConfigurationKey(definition.title);
  const draft = calculatorDraftFromBuiltIn(definition, key);
  assert.equal(draft.mode, 'builtin');
  assert.equal(draft.replacesBuiltInKey, key);
  assert.deepEqual(
    draft.fields.map((field) => field.help),
    definition.fields.map((field) => field.help || '')
  );
  assert.equal(validateCalculatorDraft(draft).length, 0);

  const payload = calculatorSavePayload(draft);
  assert.equal(payload['key'], `calculator-override:${key}`);
  const savedDefinition = payload['definition'] as Record<string, unknown>;
  assert.equal(savedDefinition['mode'], 'builtin');
  assert.equal(savedDefinition['replacesBuiltInKey'], key);
});

test('integrated calculator availability round-trips through versioned tool settings', () => {
  const firstKey = toolConfigurationKey(PORTED_CALCULATORS[0]!.title);
  const secondKey = toolConfigurationKey(PORTED_CALCULATORS[1]!.title);
  const normalized = normalizeToolSettingsCatalog({ items: [{
    id: 91,
    kind: 'tool-settings',
    key: 'tools-main',
    name: 'Herramientas incluidas',
    active: true,
    revision: 4,
    definition: { enabled: true, disabledBuiltInKeys: [firstKey, firstKey] }
  }] });
  assert.equal(normalized?.id, '91');
  assert.deepEqual(normalized?.definition.disabledBuiltInKeys, [firstKey]);

  const payload = toolSettingsSavePayload(normalized, [firstKey, secondKey, firstKey]);
  assert.equal(payload['expectedRevision'], 4);
  assert.deepEqual(
    (payload['definition'] as Record<string, unknown>)['disabledBuiltInKeys'],
    [firstKey, secondKey]
  );

  const mutation = normalizeToolSettingsMutation({ item: { ...normalized, definition: payload['definition'], revision: 5 } });
  assert.equal(mutation.revision, 5);
  assert.deepEqual(mutation.definition.disabledBuiltInKeys, [firstKey, secondKey]);
});

test('field reorder supports arrows and drop positions without losing entries', () => {
  const fields = ['uno', 'dos', 'tres', 'cuatro'];
  assert.equal(reorderMutableItems(fields, 1, 0), true);
  assert.deepEqual(fields, ['dos', 'uno', 'tres', 'cuatro']);

  const destination = droppedItemDestination(0, 2, true, fields.length);
  assert.equal(destination, 2);
  assert.equal(reorderMutableItems(fields, 0, destination), true);
  assert.deepEqual(fields, ['uno', 'tres', 'dos', 'cuatro']);
  assert.equal(reorderMutableItems(fields, -1, 2), false);
  assert.deepEqual([...fields].sort(), ['cuatro', 'dos', 'tres', 'uno']);
});

test('research builder requires unique valid keys and emits the legacy payload', () => {
  const draft = blankResearch();
  assert.equal(validateResearchDraft(draft).length, 0);
  draft.fields[2]!.key = draft.fields[1]!.key;
  assert.ok(validateResearchDraft(draft).some((issue) => issue.message.includes('repetida')));
  draft.fields[2]!.key = 'codigo_participante';
  draft.fields[2]!.type = 'select';
  draft.fields[2]!.options = [
    { ...blankBuilderOption(), value: 'caso', label: 'Caso' },
    { ...blankBuilderOption(), value: 'caso', label: 'Caso repetido' }
  ];
  assert.ok(validateResearchDraft(draft).some((issue) => issue.path === 'fields.2.options.1.value'));
  draft.fields[2]!.options.pop();
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
