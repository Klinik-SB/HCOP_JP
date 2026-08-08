import {
  ConfigurableCalculatorEvaluation,
  evaluateConfigurableCalculator
} from '../../tools/calculators/configurable-calculator.engine';
import { SafeExpressionVariables } from '../../tools/calculators/safe-expression.engine';
import {
  AccessIdentity,
  AdminPermission,
  AdminRole,
  AdminRoleDraft,
  AdminUser,
  AdminUserDraft,
  BuilderFieldType,
  BuilderOptionDraft,
  CalculatorDefinition,
  CalculatorDraft,
  CalculatorFieldDraft,
  CalculatorItem,
  CalculatorMode,
  CalculatorRangeDraft,
  ConfigurationItem,
  DayHospitalDefinition,
  DayHospitalDraft,
  DayHospitalItem,
  DayHospitalPreview,
  JsonRecord,
  LlmConfiguration,
  LlmDraft,
  LlmProvider,
  ResearchDefinition,
  ResearchDraft,
  ResearchFieldDraft,
  ResearchItem,
  ScoreOperator,
  ScoreRuleDraft,
  SecuritySettings,
  ValidationIssue
} from './configuration-operations.models';

const FIELD_KEY = /^[a-z][a-z0-9_]{1,63}$/;
const USERNAME = /^[a-z0-9._-]{3,96}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLOT_MINUTES = new Set([5, 10, 15, 20, 30]);
const SCORE_OPERATORS = new Set<ScoreOperator>(['lt', 'lte', 'eq', 'gte', 'gt', 'between']);
const LLM_PROVIDERS = new Set<LlmProvider>(['openai-compatible', 'ollama', 'lm-studio', 'gemini']);

export const LLM_PRESETS: Readonly<Record<'gemini' | 'lm-studio' | 'ollama', Pick<LlmDraft, 'provider' | 'baseUrl' | 'model'>>> = Object.freeze({
  gemini: {
    provider: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-3.5-flash'
  },
  'lm-studio': {
    provider: 'lm-studio',
    baseUrl: 'http://127.0.0.1:1234/v1',
    model: 'local-model'
  },
  ollama: {
    provider: 'ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'llama3.2'
  }
});

export function normalizeCalculatorCatalog(payload: unknown): readonly CalculatorItem[] {
  return collection(payload, 'items').map((value) => normalizeConfigurationItem<CalculatorDefinition>(value, 'calculator', normalizeCalculatorDefinition));
}
export function normalizeResearchCatalog(payload: unknown): readonly ResearchItem[] {
  return collection(payload, 'items').map((value) => normalizeConfigurationItem<ResearchDefinition>(value, 'research-form', normalizeResearchDefinition));
}

export function normalizeCalculatorMutation(payload: unknown): CalculatorItem {
  return normalizeConfigurationItem<CalculatorDefinition>(unwrapItem(payload), 'calculator', normalizeCalculatorDefinition);
}

export function normalizeResearchMutation(payload: unknown): ResearchItem {
  return normalizeConfigurationItem<ResearchDefinition>(unwrapItem(payload), 'research-form', normalizeResearchDefinition);
}

export function normalizeDayHospitalCatalog(payload: unknown): DayHospitalItem | null {
  const item = collection(payload, 'items')[0];
  return item ? normalizeConfigurationItem<DayHospitalDefinition>(item, 'day-hospital-settings', normalizeDayHospitalDefinition) : null;
}

export function normalizeDayHospitalMutation(payload: unknown): DayHospitalItem {
  return normalizeConfigurationItem<DayHospitalDefinition>(unwrapItem(payload), 'day-hospital-settings', normalizeDayHospitalDefinition);
}

export function blankCalculator(mode: CalculatorMode = 'formula'): CalculatorDraft {
  const draft: CalculatorDraft = {
    id: '', revision: null, name: mode === 'score' ? 'Nuevo score' : 'Nueva calculadora',
    description: '', active: true, mode, category: 'general', source: '',
    expression: mode === 'formula' ? 'sqrt(peso * altura / 3600)' : '', basePoints: 0,
    resultLabel: mode === 'score' ? 'Puntaje total' : 'Resultado',
    resultUnit: mode === 'score' ? 'puntos' : '', decimals: mode === 'score' ? 0 : 2,
    replacesBuiltInKey: '', fields: [], ranges: []
  };
  if (mode === 'formula') {
    draft.fields.push(blankCalculatorField({ key: 'peso', label: 'Peso', unit: 'kg' }));
    draft.fields.push(blankCalculatorField({ key: 'altura', label: 'Altura', unit: 'cm' }));
  } else {
    draft.fields.push(blankCalculatorField({ key: 'criterio_1', label: 'Criterio 1', type: 'checkbox', checkedPoints: 1 }));
  }
  return draft;
}

export function calculatorDraftFromItem(item: CalculatorItem): CalculatorDraft {
  const definition = item.definition;
  return {
    id: item.id,
    revision: item.revision,
    name: item.name,
    description: item.description || definition.clinicalUse,
    active: item.active,
    mode: definition.mode,
    category: definition.category,
    source: definition.source,
    expression: definition.expression,
    basePoints: definition.basePoints,
    resultLabel: definition.resultLabel,
    resultUnit: definition.resultUnit,
    decimals: definition.decimals,
    replacesBuiltInKey: definition.replacesBuiltInKey || '',
    fields: definition.fields.map((field) => calculatorFieldFromRecord(field)),
    ranges: definition.ranges.map((range) => calculatorRangeFromRecord(range))
  };
}

export function blankCalculatorField(overrides: Partial<CalculatorFieldDraft> = {}): CalculatorFieldDraft {
  return {
    clientId: clientId('calc-field'), key: 'variable', label: 'Nueva variable', type: 'number',
    unit: '', min: null, max: null, required: true, checkedPoints: 1,
    options: [], scoreRules: [], ...overrides
  };
}

export function blankBuilderOption(withPoints = false): BuilderOptionDraft {
  return { clientId: clientId('option'), value: '', label: 'Nueva opción', points: withPoints ? 0 : 0 };
}

export function blankScoreRule(): ScoreRuleDraft {
  return { clientId: clientId('rule'), operator: 'gte', value: 0, max: null, points: 0, label: '' };
}

export function blankCalculatorRange(): CalculatorRangeDraft {
  return { clientId: clientId('range'), min: null, max: null, label: '', severity: 'info' };
}

export function validateCalculatorDraft(draft: CalculatorDraft): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!draft.name.trim()) issue(issues, 'name', 'Escriba el nombre de la calculadora o score.');
  if (!draft.fields.length) issue(issues, 'fields', 'Agregue al menos una variable.');
  const keys = new Set<string>();
  draft.fields.forEach((field, index) => {
    const base = `fields.${index}`;
    if (!field.label.trim()) issue(issues, `${base}.label`, 'Cada variable necesita una etiqueta.');
    if (!FIELD_KEY.test(field.key.trim())) issue(issues, `${base}.key`, 'Use una clave en minúsculas, sin espacios, de al menos 2 caracteres.');
    if (keys.has(field.key.trim())) issue(issues, `${base}.key`, `La clave ${field.key} está repetida.`);
    keys.add(field.key.trim());
    if (field.min != null && field.max != null && field.max < field.min) issue(issues, `${base}.max`, 'El máximo no puede ser menor que el mínimo.');
    if (field.type === 'select') {
      const values = new Set<string>();
      if (!field.options.length) issue(issues, `${base}.options`, 'Agregue al menos una opción.');
      field.options.forEach((option, optionIndex) => {
        if (!option.label.trim() || !option.value.trim()) issue(issues, `${base}.options.${optionIndex}`, 'Complete valor y etiqueta.');
        if (values.has(option.value.trim())) issue(issues, `${base}.options.${optionIndex}.value`, 'El valor de la opción está repetido.');
        values.add(option.value.trim());
      });
    }
    if (draft.mode === 'score' && field.type === 'number') {
      if (!field.scoreRules.length) issue(issues, `${base}.scoreRules`, 'Defina al menos una regla de puntaje para la variable numérica.');
      field.scoreRules.forEach((rule, ruleIndex) => {
        if (rule.value == null) issue(issues, `${base}.scoreRules.${ruleIndex}.value`, 'Complete el valor de la regla.');
        if (rule.operator === 'between' && (rule.max == null || (rule.value != null && rule.max < rule.value))) {
          issue(issues, `${base}.scoreRules.${ruleIndex}.max`, 'Complete un límite final igual o mayor al inicial.');
        }
      });
    }
  });
  draft.ranges.forEach((range, index) => {
    if (!range.label.trim()) issue(issues, `ranges.${index}.label`, 'Cada rango necesita una interpretación.');
    if (range.min != null && range.max != null && range.max < range.min) issue(issues, `ranges.${index}.max`, 'El máximo del rango no puede ser menor que el mínimo.');
  });
  if (draft.mode === 'formula') {
    if (!draft.expression.trim()) issue(issues, 'expression', 'Arme la fórmula antes de guardar.');
    if (!issues.some((entry) => entry.path.startsWith('fields.') || entry.path === 'expression')) {
      try {
        evaluateCalculatorDraft(draft, calculatorExampleValues(draft));
      } catch (failure) {
        issue(issues, 'expression', failureMessage(failure, 'La fórmula no es válida.'));
      }
    }
  }
  return issues;
}

export function calculatorSavePayload(draft: CalculatorDraft, active = draft.active): JsonRecord {
  return {
    key: draft.id ? undefined : `calculator:${slug(draft.name)}`,
    name: draft.name.trim(), description: draft.description.trim(), active,
    expectedRevision: draft.revision ?? undefined,
    definition: calculatorDefinitionFromDraft(draft)
  };
}

export function calculatorDefinitionFromDraft(draft: CalculatorDraft): JsonRecord {
  return {
    mode: draft.mode,
    replacesBuiltInKey: draft.replacesBuiltInKey || undefined,
    category: draft.category.trim() || 'general', source: draft.source.trim(), clinicalUse: draft.description.trim(),
    fields: draft.fields.map((field) => ({
      key: field.key.trim(), label: field.label.trim(), type: field.type, unit: field.unit.trim(),
      min: field.min, max: field.max, required: field.required, checkedPoints: field.checkedPoints,
      options: field.options.map((option) => ({ value: option.value.trim(), label: option.label.trim(), points: option.points })),
      scoreRules: field.scoreRules.map((rule) => ({ operator: rule.operator, value: rule.value, max: rule.max, points: rule.points, label: rule.label.trim() }))
    })),
    expression: draft.expression.trim(), basePoints: draft.basePoints,
    resultLabel: draft.resultLabel.trim() || 'Resultado', resultUnit: draft.resultUnit.trim(),
    decimals: Math.max(0, Math.min(6, Math.round(draft.decimals))),
    ranges: draft.ranges.map((range) => ({ min: range.min, max: range.max, label: range.label.trim(), severity: range.severity }))
  };
}

export function calculatorExampleValues(draft: CalculatorDraft): SafeExpressionVariables {
  return Object.fromEntries(draft.fields.filter((field) => field.type !== 'section').map((field) => {
    if (field.type === 'checkbox') return [field.key, false];
    if (field.type === 'select') return [field.key, field.options[0]?.value ?? ''];
    if (field.type === 'number') return [field.key, field.min ?? 1];
    return [field.key, ''];
  }));
}

export function evaluateCalculatorDraft(draft: CalculatorDraft, values: SafeExpressionVariables): ConfigurableCalculatorEvaluation {
  return evaluateConfigurableCalculator(calculatorDefinitionFromDraft(draft), values);
}

export function blankResearch(): ResearchDraft {
  return {
    id: '', revision: null, name: 'Nuevo formulario', category: 'Investigación', instructions: '', active: true,
    fields: [
      blankResearchField({ type: 'section', key: 'datos_evento', label: 'Datos del evento', required: false }),
      blankResearchField({ type: 'date', key: 'fecha_evento', label: 'Fecha del evento', required: true }),
      blankResearchField({ type: 'text', key: 'codigo_participante', label: 'Código del participante', required: true })
    ]
  };
}

export function blankResearchField(overrides: Partial<ResearchFieldDraft> = {}): ResearchFieldDraft {
  return {
    clientId: clientId('research-field'), key: 'campo', label: 'Nuevo campo', type: 'text',
    placeholder: '', required: false, options: [], ...overrides
  };
}

export function researchDraftFromItem(item: ResearchItem): ResearchDraft {
  return {
    id: item.id, revision: item.revision, name: item.name,
    category: item.definition.category, instructions: item.definition.instructions || item.description,
    active: item.active, fields: item.definition.fields.map(researchFieldFromRecord)
  };
}

export function validateResearchDraft(draft: ResearchDraft): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!draft.name.trim()) issue(issues, 'name', 'Escriba el nombre del formulario.');
  if (!draft.category.trim()) issue(issues, 'category', 'Indique la categoría del formulario.');
  if (!draft.fields.length) issue(issues, 'fields', 'Agregue al menos un campo.');
  const keys = new Set<string>();
  draft.fields.forEach((field, index) => {
    const base = `fields.${index}`;
    if (!field.label.trim()) issue(issues, `${base}.label`, 'Cada campo necesita una etiqueta.');
    if (!FIELD_KEY.test(field.key.trim())) issue(issues, `${base}.key`, 'Use una clave en minúsculas, sin espacios, de al menos 2 caracteres.');
    if (keys.has(field.key.trim())) issue(issues, `${base}.key`, `La clave ${field.key} está repetida.`);
    keys.add(field.key.trim());
    if (field.type === 'select' && !field.options.length) issue(issues, `${base}.options`, 'Agregue opciones al selector.');
    field.options.forEach((option, optionIndex) => {
      if (!option.value.trim() || !option.label.trim()) issue(issues, `${base}.options.${optionIndex}`, 'Complete valor y etiqueta.');
    });
  });
  return issues;
}

export function researchSavePayload(draft: ResearchDraft, active = draft.active): JsonRecord {
  return {
    key: draft.id ? undefined : `research-form:${slug(draft.name)}`,
    name: draft.name.trim(), description: draft.instructions.trim(), active,
    expectedRevision: draft.revision ?? undefined,
    definition: {
      category: draft.category.trim(), instructions: draft.instructions.trim(),
      fields: draft.fields.map((field) => ({
        key: field.key.trim(), label: field.label.trim(), type: field.type,
        placeholder: field.placeholder.trim(), required: field.type === 'section' ? false : field.required,
        options: field.options.map((option) => ({ value: option.value.trim(), label: option.label.trim() }))
      }))
    }
  };
}

export function defaultDayHospitalDraft(item: DayHospitalItem | null = null): DayHospitalDraft {
  return {
    id: item?.id || '', revision: item?.revision ?? null,
    chairCount: boundedInteger(item?.definition.chairCount, 1, 60, 6),
    slotMinutes: normalizeSlotMinutes(item?.definition.slotMinutes),
    startTime: validTime(item?.definition.startTime) ? item!.definition.startTime : '08:00',
    endTime: validTime(item?.definition.endTime) ? item!.definition.endTime : '16:00'
  };
}

export function dayHospitalPreview(draft: DayHospitalDraft): DayHospitalPreview {
  const start = timeMinutes(draft.startTime);
  const end = timeMinutes(draft.endTime);
  if (draft.chairCount < 1 || draft.chairCount > 60) {
    return { valid: false, message: 'La cantidad de sillones debe estar entre 1 y 60.', slotsPerChair: 0, totalSlots: 0, columnsPerHour: 0, rowsPerHour: 0 };
  }
  if (!SLOT_MINUTES.has(draft.slotMinutes)) {
    return { valid: false, message: 'La fracción debe ser de 5, 10, 15, 20 o 30 minutos.', slotsPerChair: 0, totalSlots: 0, columnsPerHour: 0, rowsPerHour: 0 };
  }
  if (start == null || end == null || end <= start) {
    return { valid: false, message: 'El fin de atención debe ser posterior al inicio.', slotsPerChair: 0, totalSlots: 0, columnsPerHour: 0, rowsPerHour: 0 };
  }
  const slotsPerChair = Math.floor((end - start) / draft.slotMinutes);
  const columnsPerHour = ({ 5: 4, 10: 3, 15: 2, 20: 3, 30: 2 } as const)[draft.slotMinutes];
  const rowsPerHour = (60 / draft.slotMinutes) / columnsPerHour;
  return {
    valid: true,
    message: `${slotsPerChair} casilleros de ${draft.slotMinutes} minutos por sillón, de ${draft.startTime} a ${draft.endTime}. Cada hora: ${rowsPerHour} ${rowsPerHour === 1 ? 'fila' : 'filas'} × ${columnsPerHour} columnas.`,
    slotsPerChair, totalSlots: slotsPerChair * draft.chairCount, columnsPerHour, rowsPerHour
  };
}

export function dayHospitalSavePayload(draft: DayHospitalDraft): JsonRecord {
  return {
    key: 'day-hospital-main', name: 'Agenda principal de Hospital de día',
    description: 'Capacidad, intervalo mínimo y jornada del turnero por sillón.', active: true,
    expectedRevision: draft.revision ?? undefined,
    definition: { chairCount: draft.chairCount, slotMinutes: draft.slotMinutes, startTime: draft.startTime, endTime: draft.endTime }
  };
}

export function normalizeLlmConfiguration(payload: unknown): LlmConfiguration {
  const root = record(payload);
  const value = record(root['llm'] ?? root['item'] ?? root);
  const baseUrl = text(value['baseUrl'] ?? value['endpoint']);
  return {
    enabled: boolean(value['enabled'], false),
    provider: normalizeLlmProvider(value['provider'], baseUrl),
    baseUrl,
    model: text(value['model']),
    temperature: boundedNumber(value['temperature'], 0, 2, 0.2),
    maxTokens: boundedInteger(value['maxTokens'], 128, 16000, 1200),
    timeoutMs: boundedInteger(value['timeoutMs'], 5000, 180000, 60000),
    hasApiKey: boolean(value['hasApiKey'] ?? value['apiKeyConfigured'], false),
    lockedFields: collection(value['lockedFields']).map(text).filter(Boolean)
  };
}

export function llmDraftFromConfiguration(config: LlmConfiguration): LlmDraft {
  return { ...config, apiKeyAction: 'keep', apiKey: '' };
}

export function validateLlmDraft(draft: LlmDraft): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  try {
    const endpoint = new URL(draft.baseUrl);
    if (!['http:', 'https:'].includes(endpoint.protocol) || !endpoint.hostname || endpoint.username || endpoint.password) throw new Error();
  } catch {
    issue(issues, 'baseUrl', 'El endpoint debe ser una dirección HTTP o HTTPS válida.');
  }
  if (!draft.model.trim() || draft.model.length > 200) issue(issues, 'model', 'Complete un modelo válido.');
  if (draft.apiKeyAction === 'replace' && !draft.apiKey.trim()) issue(issues, 'apiKey', 'Pegue la nueva API key o elija Conservar.');
  if (draft.temperature < 0 || draft.temperature > 2) issue(issues, 'temperature', 'La temperatura debe estar entre 0 y 2.');
  if (draft.maxTokens < 128 || draft.maxTokens > 16000) issue(issues, 'maxTokens', 'La respuesta debe admitir entre 128 y 16000 tokens.');
  if (draft.timeoutMs < 5000 || draft.timeoutMs > 180000) issue(issues, 'timeoutMs', 'El tiempo de espera debe estar entre 5 y 180 segundos.');
  return issues;
}

export function llmPayload(draft: LlmDraft): JsonRecord {
  const llm: JsonRecord = {
    enabled: draft.enabled, provider: draft.provider, baseUrl: draft.baseUrl.trim().replace(/\/+$/, ''),
    model: draft.model.trim(), temperature: draft.temperature, maxTokens: draft.maxTokens,
    timeoutMs: draft.timeoutMs, apiKeyAction: draft.apiKeyAction
  };
  if (draft.apiKeyAction === 'replace') llm['apiKey'] = draft.apiKey.trim();
  return { llm };
}

export function normalizeRoles(payload: unknown): { roles: readonly AdminRole[]; permissions: readonly AdminPermission[] } {
  const roles = collection(payload, 'items', 'roles').map(normalizeRole);
  const permissions = collection(payload, 'permissionCatalog', 'availablePermissions', 'permissions').map(normalizePermission);
  return { roles, permissions };
}

export function normalizeUsers(payload: unknown): readonly AdminUser[] {
  return collection(payload, 'items', 'users').map(normalizeUser);
}

export function normalizeUserMutation(payload: unknown): AdminUser {
  return normalizeUser(unwrapItem(payload));
}

export function normalizeRoleMutation(payload: unknown): AdminRole {
  return normalizeRole(unwrapItem(payload));
}

export function normalizeAccessIdentity(payload: unknown): AccessIdentity {
  const root = record(payload);
  const rawUser = root['user'] ?? root['me'] ?? root['actor'];
  const userRecord = record(rawUser);
  const permissions = [
    ...collection(userRecord['permissions'], 'permissions', 'permissionKeys'),
    ...collection(root['permissions'], 'permissions', 'permissionKeys')
  ].map((value) => text(record(value)['key'] ?? record(value)['permission'] ?? value)).filter(Boolean);
  return {
    authenticated: boolean(root['authenticated'] ?? userRecord['authenticated'], Boolean(text(userRecord['id'] ?? userRecord['username']))),
    permissions: [...new Set(permissions)],
    user: Object.keys(userRecord).length ? normalizeUser(userRecord) : null
  };
}

export function normalizeSecuritySettings(payload: unknown): SecuritySettings {
  const value = record(record(payload)['item'] ?? record(payload)['settings'] ?? payload);
  return {
    loginRequired: true,
    sessionDurationMinutes: boundedInteger(value['sessionDurationMinutes'] ?? value['sessionMinutes'], 15, 525600, 43200),
    revision: nullableNumber(value['revision'])
  };
}

export function blankAdminUser(): AdminUserDraft {
  return { id: '', username: '', email: '', displayName: '', specialty: '', licenseNumber: '', active: true, password: '', roleIds: [] };
}

export function adminUserDraft(user: AdminUser): AdminUserDraft {
  return {
    id: user.id, username: user.username, email: user.email, displayName: user.displayName,
    specialty: user.specialty, licenseNumber: user.licenseNumber, active: user.active,
    password: '', roleIds: user.roles.map((role) => role.id)
  };
}

export function validateAdminUserDraft(draft: AdminUserDraft): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!draft.displayName.trim()) issue(issues, 'displayName', 'El nombre es obligatorio.');
  if (!USERNAME.test(draft.username.trim().toLowerCase())) issue(issues, 'username', 'Use entre 3 y 96 caracteres: letras minúsculas, números, punto, guion o guion bajo.');
  if (!EMAIL.test(draft.email.trim())) issue(issues, 'email', 'El correo no es válido.');
  if (!draft.id && (draft.password.length < 8 || draft.password.length > 256)) issue(issues, 'password', 'La clave temporal debe tener entre 8 y 256 caracteres.');
  if (draft.password && (draft.password.length < 8 || draft.password.length > 256)) issue(issues, 'password', 'La nueva clave debe tener entre 8 y 256 caracteres.');
  if (!draft.roleIds.length) issue(issues, 'roleIds', 'Seleccione al menos un rol.');
  return issues;
}

export function adminUserPayload(draft: AdminUserDraft): JsonRecord {
  return {
    username: draft.username.trim().toLowerCase(), email: draft.email.trim().toLowerCase(),
    displayName: draft.displayName.trim(), specialty: draft.specialty.trim(),
    licenseNumber: draft.licenseNumber.trim(), active: draft.active,
    roleIds: draft.roleIds.map(Number), ...(draft.password ? { password: draft.password } : {})
  };
}

export function blankAdminRole(): AdminRoleDraft {
  return { id: '', key: '', name: '', description: '', active: true, system: false, permissions: [] };
}

export function adminRoleDraft(role: AdminRole): AdminRoleDraft {
  return { id: role.id, key: role.key, name: role.name, description: role.description, active: role.active, system: role.system, permissions: [...role.permissions] };
}

export function validateAdminRoleDraft(draft: AdminRoleDraft): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!draft.name.trim()) issue(issues, 'name', 'El nombre del rol es obligatorio.');
  if (!draft.id && !USERNAME.test((draft.key || slug(draft.name)).toLowerCase())) issue(issues, 'key', 'La clave del rol debe tener al menos 3 caracteres válidos.');
  return issues;
}

export function adminRolePayload(draft: AdminRoleDraft): JsonRecord {
  return {
    ...(!draft.id ? { key: (draft.key || slug(draft.name)).toLowerCase() } : {}),
    name: draft.name.trim(), description: draft.description.trim(), active: draft.active,
    permissions: [...new Set(draft.permissions)]
  };
}

export function hasPermission(identity: AccessIdentity | null, permission: string): boolean {
  const permissions = new Set(identity?.permissions ?? []);
  if (permissions.has('*') || permissions.has(permission)) return true;
  const parts = permission.split('.');
  while (parts.length > 1) {
    parts.pop();
    if (permissions.has(`${parts.join('.')}.*`)) return true;
  }
  return false;
}

export function failureMessage(failure: unknown, fallback = 'No se pudo completar la operación.'): string {
  const root = record(failure);
  const error = record(root['error']);
  return text(error['message'] ?? error['error'] ?? root['message']) || fallback;
}

export function fieldIssue(issues: readonly ValidationIssue[], path: string): boolean {
  return issues.some((entry) => entry.path === path || entry.path.startsWith(`${path}.`));
}

export function formatAccessDate(value: string): string {
  if (!value) return 'Nunca';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(date);
}

export function normalizedSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es');
}

function normalizeCalculatorDefinition(value: unknown): CalculatorDefinition {
  const definition = record(value);
  return {
    mode: definition['mode'] === 'score' ? 'score' : 'formula',
    category: text(definition['category']) || 'general', source: text(definition['source']),
    clinicalUse: text(definition['clinicalUse']), fields: collection(definition['fields']).map(record),
    expression: text(definition['expression']), basePoints: number(definition['basePoints'], 0),
    resultLabel: text(definition['resultLabel']) || 'Resultado', resultUnit: text(definition['resultUnit']),
    decimals: boundedInteger(definition['decimals'], 0, 6, 2), ranges: collection(definition['ranges']).map(record),
    replacesBuiltInKey: text(definition['replacesBuiltInKey']) || undefined
  };
}

function normalizeResearchDefinition(value: unknown): ResearchDefinition {
  const definition = record(value);
  return {
    category: text(definition['category']) || 'Investigación',
    instructions: text(definition['instructions']), fields: collection(definition['fields']).map(record)
  };
}

function normalizeDayHospitalDefinition(value: unknown): DayHospitalDefinition {
  const definition = record(value);
  return {
    chairCount: boundedInteger(definition['chairCount'], 1, 60, 6),
    slotMinutes: normalizeSlotMinutes(definition['slotMinutes']),
    startTime: validTime(definition['startTime']) ? text(definition['startTime']) : '08:00',
    endTime: validTime(definition['endTime']) ? text(definition['endTime']) : '16:00'
  };
}

function normalizeConfigurationItem<TDefinition extends object>(
  value: unknown,
  fallbackKind: string,
  normalizeDefinition: (value: unknown) => TDefinition
): ConfigurationItem<TDefinition> {
  const item = record(value);
  return {
    id: text(item['id']), kind: text(item['kind'] ?? item['itemKind']) || fallbackKind,
    key: text(item['key'] ?? item['itemKey']), name: text(item['name'] ?? item['displayName']),
    description: text(item['description']), active: boolean(item['active'], true),
    revision: boundedInteger(item['revision'], 0, Number.MAX_SAFE_INTEGER, 0),
    definition: normalizeDefinition(item['definition']), createdAt: text(item['createdAt']), updatedAt: text(item['updatedAt'])
  };
}

function calculatorFieldFromRecord(value: unknown): CalculatorFieldDraft {
  const field = record(value);
  const type = normalizeFieldType(field['type'], 'number');
  return blankCalculatorField({
    key: text(field['key']), label: text(field['label']), type, unit: text(field['unit']),
    min: nullableNumber(field['min']), max: nullableNumber(field['max']), required: boolean(field['required'], true),
    checkedPoints: number(field['checkedPoints'], 0),
    options: collection(field['options']).map((raw) => {
      const option = record(raw);
      return { clientId: clientId('option'), value: text(option['value']), label: text(option['label']) || text(option['value']), points: number(option['points'], 0) };
    }),
    scoreRules: collection(field['scoreRules']).map((raw) => {
      const rule = record(raw);
      const operator = text(rule['operator']) as ScoreOperator;
      return { clientId: clientId('rule'), operator: SCORE_OPERATORS.has(operator) ? operator : 'eq', value: nullableNumber(rule['value']), max: nullableNumber(rule['max']), points: number(rule['points'], 0), label: text(rule['label']) };
    })
  });
}

function calculatorRangeFromRecord(value: unknown): CalculatorRangeDraft {
  const range = record(value);
  const severity = text(range['severity']);
  return {
    clientId: clientId('range'), min: nullableNumber(range['min']), max: nullableNumber(range['max']),
    label: text(range['label']), severity: severity === 'good' || severity === 'warn' || severity === 'bad' ? severity : 'info'
  };
}

function researchFieldFromRecord(value: unknown): ResearchFieldDraft {
  const field = record(value);
  return blankResearchField({
    key: text(field['key']), label: text(field['label']), type: normalizeFieldType(field['type'], 'text'),
    placeholder: text(field['placeholder'] ?? field['help']), required: boolean(field['required'], false),
    options: collection(field['options']).map((raw) => {
      const option = record(raw);
      return { clientId: clientId('option'), value: text(option['value']), label: text(option['label']) || text(option['value']), points: 0 };
    })
  });
}

function normalizeRole(value: unknown): AdminRole {
  const raw = record(value);
  return {
    id: text(raw['id'] ?? raw['roleId'] ?? raw['key']), key: text(raw['key'] ?? raw['roleKey']),
    name: text(raw['name'] ?? raw['displayName'] ?? raw['label']) || 'Rol',
    description: text(raw['description'] ?? raw['summary']), system: boolean(raw['system'] ?? raw['isSystem'], false),
    active: boolean(raw['active'] ?? raw['enabled'], true), userCount: number(raw['userCount'] ?? raw['usersCount'], 0),
    permissions: collection(raw['permissions'], 'permissions', 'permissionKeys').map((permission) => text(record(permission)['key'] ?? record(permission)['permission'] ?? permission)).filter(Boolean)
  };
}

function normalizeUser(value: unknown): AdminUser {
  const raw = record(value);
  const rolesRaw = collection(raw['roles'], 'roles', 'roleIds', 'assignedRoles');
  return {
    id: text(raw['id'] ?? raw['userId']), username: text(raw['username'] ?? raw['login'] ?? raw['email']),
    email: text(raw['email']), displayName: text(raw['displayName'] ?? raw['fullName'] ?? raw['name']) || text(raw['username']) || 'Usuario',
    specialty: text(raw['specialty'] ?? raw['especialidad']), licenseNumber: text(raw['licenseNumber'] ?? raw['license'] ?? raw['matricula']),
    active: boolean(raw['active'] ?? raw['enabled'], true), lastLoginAt: text(raw['lastLoginAt'] ?? raw['last_login_at']),
    roles: rolesRaw.map((role) => typeof role === 'object' && role != null ? normalizeRole(role) : normalizeRole({ id: role, name: role }))
  };
}

function normalizePermission(value: unknown): AdminPermission {
  const raw = record(value);
  const key = text(raw['key'] ?? raw['permission'] ?? value);
  const parts = key.split('.').filter(Boolean);
  const action = parts.pop() || key;
  const namespace = parts.shift() || 'general';
  const subject = parts.join('.');
  const groupLabel = text(raw['groupLabel'] ?? raw['group']) || ({
    admin: 'Administración', section: subject ? `Sección · ${humanPermission(subject)}` : 'Secciones',
    patient: 'Pacientes', clinical: 'Historia clínica', treatment: 'Tratamientos',
    dayhospital: 'Hospital de día', research: 'Investigación', configuration: 'Configuración'
  } as Record<string, string>)[namespace] || humanPermission(namespace);
  return {
    key, name: text(raw['name'] ?? raw['displayName']) || humanPermission(action),
    description: text(raw['description']), groupKey: text(raw['groupKey']) || (namespace === 'section' ? `${namespace}.${subject}` : namespace),
    groupLabel, actionLabel: text(raw['actionLabel'] ?? raw['label']) || humanPermission(action)
  };
}

function humanPermission(value: string): string {
  const labels: Record<string, string> = {
    view: 'Ver', read: 'Ver', manage: 'Administrar', write: 'Crear y modificar', create: 'Crear',
    update: 'Modificar', edit: 'Modificar', delete: 'Eliminar', archive: 'Desactivar', export: 'Exportar',
    prescribe: 'Prescribir', schedule: 'Dar turnos', administer: 'Administrar', approve: 'Aprobar',
    'manage-users': 'Gestionar usuarios', 'manage-roles': 'Gestionar roles', 'manage-security': 'Gestionar seguridad'
  };
  return labels[value] || value.replace(/[-_.]+/g, ' ').replace(/^\w/, (letter) => letter.toLocaleUpperCase('es'));
}

function normalizeFieldType(value: unknown, fallback: BuilderFieldType): BuilderFieldType {
  const type = text(value) as BuilderFieldType;
  return ['number', 'select', 'checkbox', 'text', 'textarea', 'date', 'section'].includes(type) ? type : fallback;
}

function normalizeSlotMinutes(value: unknown): 5 | 10 | 15 | 20 | 30 {
  const candidate = Number(value);
  return SLOT_MINUTES.has(candidate) ? candidate as 5 | 10 | 15 | 20 | 30 : 10;
}

function normalizeLlmProvider(value: unknown, baseUrl: string): LlmProvider {
  if (baseUrl.toLowerCase().includes('generativelanguage.googleapis.com')) return 'gemini';
  if (baseUrl.includes(':1234')) return 'lm-studio';
  if (baseUrl.includes(':11434')) return 'ollama';
  const provider = text(value).toLowerCase() as LlmProvider;
  return LLM_PROVIDERS.has(provider) ? provider : 'openai-compatible';
}

function timeMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
}

function validTime(value: unknown): boolean {
  return timeMinutes(text(value)) != null;
}

function issue(issues: ValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

function unwrapItem(payload: unknown): unknown {
  const root = record(payload);
  return root['item'] ?? root['data'] ?? payload;
}

function collection(value: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(value)) return value;
  const root = record(value);
  for (const key of keys) {
    if (Array.isArray(root[key])) return root[key] as unknown[];
    const nested = record(root['data']);
    if (Array.isArray(nested[key])) return nested[key] as unknown[];
  }
  return [];
}

function record(value: unknown): JsonRecord {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function text(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function boolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || String(value).toLowerCase() === 'true') return true;
  if (value === 0 || value === '0' || String(value).toLowerCase() === 'false') return false;
  return fallback;
}

function number(value: unknown, fallback: number): number {
  const candidate = Number(value);
  return Number.isFinite(candidate) ? candidate : fallback;
}

function nullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const candidate = Number(value);
  return Number.isFinite(candidate) ? candidate : null;
}

function boundedNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return Math.max(minimum, Math.min(maximum, number(value, fallback)));
}

function boundedInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return Math.round(boundedNumber(value, minimum, maximum, fallback));
}

function slug(value: string): string {
  return normalizedSearch(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

let nextClientId = 0;
function clientId(prefix: string): string {
  nextClientId += 1;
  return `${prefix}-${Date.now().toString(36)}-${nextClientId.toString(36)}`;
}
