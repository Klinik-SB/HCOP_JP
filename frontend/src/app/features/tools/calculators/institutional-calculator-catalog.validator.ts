import { CalculatorDefinition } from './calculator.models';
import type {
  ValidatedInstitutionalCalculatorField,
  ValidatedInstitutionalCalculatorItem
} from './institutional-calculator.factory';
import { PORTED_CALCULATORS } from './ported-calculator.registry';
import { SAFE_EXPRESSION_FUNCTIONS } from './safe-expression.engine';

export const INSTITUTIONAL_CALCULATOR_LIMITS = Object.freeze({
  expressionLength: 4_096,
  fields: 100,
  options: 200,
  rules: 200,
  ranges: 200
} as const);

export type InstitutionalCalculatorMode = 'builtin' | 'formula' | 'score';
export type InstitutionalCalculatorFieldType =
  | 'number'
  | 'select'
  | 'checkbox'
  | 'text'
  | 'textarea'
  | 'section';
export type InstitutionalScoreOperator = 'lt' | 'lte' | 'eq' | 'gte' | 'gt' | 'between';
export type InstitutionalSeverity = 'info' | 'good' | 'warn' | 'bad';
export type InstitutionalScalar = string | number | boolean | null;

export interface InstitutionalCalculatorOption {
  readonly value: string;
  readonly label: string;
  readonly points: number;
}

export interface InstitutionalScoreRule {
  readonly operator: InstitutionalScoreOperator;
  readonly value: number;
  readonly max: number | null;
  readonly points: number;
  readonly label: string;
}

export interface InstitutionalCalculatorField {
  readonly key: string;
  readonly label: string;
  readonly type: InstitutionalCalculatorFieldType;
  readonly required: boolean;
  readonly unit: string;
  readonly help: string;
  readonly placeholder: string;
  readonly min: number | null;
  readonly max: number | null;
  readonly step: number | null;
  readonly value: InstitutionalScalar;
  readonly options: readonly InstitutionalCalculatorOption[];
  readonly checkedPoints: number;
  readonly scoreRules: readonly InstitutionalScoreRule[];
}

export interface InstitutionalCalculatorRange {
  readonly min: number | null;
  readonly max: number | null;
  readonly label: string;
  readonly severity: InstitutionalSeverity;
}

export interface InstitutionalCalculatorDefinition {
  readonly mode: InstitutionalCalculatorMode;
  readonly replacesBuiltInKey: string;
  readonly category: string;
  readonly source: string;
  readonly clinicalUse: string;
  readonly fields: readonly InstitutionalCalculatorField[];
  readonly expression: string;
  readonly basePoints: number;
  readonly resultLabel: string;
  readonly resultUnit: string;
  readonly decimals: number;
  readonly ranges: readonly InstitutionalCalculatorRange[];
  readonly notes: readonly string[];
}

export interface InstitutionalCalculatorItem {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly revision: number;
  readonly definition: InstitutionalCalculatorDefinition;
}

export interface InstitutionalToolSettingsItem {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly revision: number;
  readonly definition: {
    readonly enabled: boolean;
    readonly disabledBuiltInKeys: readonly string[];
  };
}

export interface InstitutionalCalculatorCatalog {
  readonly ok: true;
  readonly calculators: readonly InstitutionalCalculatorItem[];
  readonly settings: InstitutionalToolSettingsItem;
  readonly total: number;
}

export type InstitutionalCatalogIssueCode =
  | 'invalid-payload'
  | 'invalid-type'
  | 'required'
  | 'limit-exceeded'
  | 'invalid-key'
  | 'duplicate-key'
  | 'invalid-number'
  | 'invalid-range'
  | 'invalid-mode'
  | 'invalid-field-type'
  | 'invalid-operator'
  | 'invalid-severity'
  | 'invalid-expression'
  | 'unknown-variable'
  | 'unknown-override'
  | 'duplicate-override'
  | 'invalid-total';

export interface InstitutionalCatalogIssue {
  readonly code: InstitutionalCatalogIssueCode;
  readonly path: string;
  readonly message: string;
}

export class InstitutionalCatalogValidationError extends Error {
  readonly code = 'INVALID_INSTITUTIONAL_CALCULATOR_CATALOG';
  readonly issues: readonly InstitutionalCatalogIssue[];

  constructor(issues: readonly InstitutionalCatalogIssue[]) {
    super(issues[0]?.message || 'El catálogo institucional de calculadoras es inválido.');
    this.name = 'InstitutionalCatalogValidationError';
    this.issues = Object.freeze([...issues]);
  }
}

type JsonObject = Record<string, unknown>;
type ExpressionTokenType =
  | 'number'
  | 'identifier'
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '^'
  | '('
  | ')'
  | ','
  | 'end';

interface ExpressionToken {
  readonly type: ExpressionTokenType;
  readonly value?: string;
}

const MODES = new Set<InstitutionalCalculatorMode>(['builtin', 'formula', 'score']);
const FIELD_TYPES = new Set<InstitutionalCalculatorFieldType>([
  'number', 'select', 'checkbox', 'text', 'textarea', 'section'
]);
const SCORE_OPERATORS = new Set<InstitutionalScoreOperator>(['lt', 'lte', 'eq', 'gte', 'gt', 'between']);
const SEVERITIES = new Set<InstitutionalSeverity>(['info', 'good', 'warn', 'bad']);
const SAFE_FUNCTIONS = new Set<string>(SAFE_EXPRESSION_FUNCTIONS);
const UNARY_EXPRESSION_FUNCTIONS = new Set<string>([
  'abs', 'sqrt', 'round', 'floor', 'ceil', 'log', 'exp'
]);
const FIELD_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ITEM_KEY = /^[\x21-\x7e]{1,128}$/;
const BUILTIN_KEY = /^[a-z0-9_]{1,80}$/;
const BUILTIN_CALCULATORS_BY_KEY = new Map<string, CalculatorDefinition>(
  PORTED_CALCULATORS.map((definition) => [toolConfigurationKey(definition.title), definition])
);

export function toolConfigurationKey(value: unknown): string {
  return repairLegacyText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

export function validateInstitutionalCalculatorCatalog(payload: unknown): InstitutionalCalculatorCatalog {
  const issues: InstitutionalCatalogIssue[] = [];
  const root = objectValue(payload);
  if (!root) throw validationError('invalid-payload', '$', 'La respuesta debe ser un objeto JSON.');
  if (root['ok'] !== true) issue(issues, 'invalid-payload', '$.ok', 'La respuesta no confirmó ok=true.');

  const rawCalculators = root['calculators'];
  if (!Array.isArray(rawCalculators)) {
    issue(issues, 'invalid-type', '$.calculators', 'calculators debe ser una lista.');
  }
  const calculators = (Array.isArray(rawCalculators) ? rawCalculators : [])
    .map((entry, index) => normalizeCalculator(entry, `$.calculators[${index}]`, issues));

  const expectedTotal = calculators.length;
  const total = integerValue(root['total']);
  if (total === null || total !== expectedTotal) {
    issue(issues, 'invalid-total', '$.total', `total debe ser ${expectedTotal}.`);
  }

  const settings = normalizeSettings(root['settings'], '$.settings', issues);
  validateCatalogIdentity(calculators, issues);
  validateOverrides(calculators, issues);

  if (issues.length) throw new InstitutionalCatalogValidationError(issues);
  return {
    ok: true,
    calculators,
    settings,
    total: expectedTotal
  };
}

/**
 * Adapta una definición ya validada al contrato estricto de la factory Angular.
 * Los overrides `builtin` conservan el motor original y no se materializan con
 * la factory configurable.
 */
export function toInstitutionalCalculatorFactoryItem(
  item: InstitutionalCalculatorItem
): ValidatedInstitutionalCalculatorItem | null {
  const source = item.definition;
  if (source.mode === 'builtin') return null;

  const fields: readonly ValidatedInstitutionalCalculatorField[] = source.fields.map((field) => ({
    key: field.key,
    label: field.label,
    type: field.type,
    required: field.required,
    ...(field.unit ? { unit: field.unit } : {}),
    ...(field.help ? { help: field.help } : {}),
    ...(field.value === null ? {} : { value: field.value }),
    ...(field.min === null ? {} : { min: field.min }),
    ...(field.max === null ? {} : { max: field.max }),
    ...(field.step === null ? {} : { step: field.step }),
    ...(field.checkedPoints === 0 ? {} : { checkedPoints: field.checkedPoints }),
    ...(field.options.length ? { options: field.options } : {}),
    ...(field.scoreRules.length ? { scoreRules: field.scoreRules } : {})
  }));

  return {
    id: item.id,
    name: item.name,
    description: item.description,
    revision: item.revision,
    definition: {
      mode: source.mode,
      ...(source.replacesBuiltInKey ? { replacesBuiltInKey: source.replacesBuiltInKey } : {}),
      ...(source.category ? { category: source.category } : {}),
      ...(source.source ? { source: source.source } : {}),
      ...(source.clinicalUse ? { clinicalUse: source.clinicalUse } : {}),
      fields,
      ...(source.expression ? { expression: source.expression } : {}),
      basePoints: source.basePoints,
      ...(source.resultLabel ? { resultLabel: source.resultLabel } : {}),
      ...(source.resultUnit ? { resultUnit: source.resultUnit } : {}),
      decimals: source.decimals,
      ...(source.ranges.length ? { ranges: source.ranges } : {}),
      ...(source.notes.length ? { notes: source.notes } : {})
    }
  };
}

function normalizeCalculator(
  value: unknown,
  path: string,
  issues: InstitutionalCatalogIssue[]
): InstitutionalCalculatorItem {
  const item = objectValue(value);
  if (!item) {
    issue(issues, 'invalid-type', path, 'La calculadora debe ser un objeto.');
    return invalidCalculator();
  }
  const id = requiredText(item['id'], `${path}.id`, issues);
  if (id && !/^[1-9][0-9]{0,18}$/.test(id)) issue(issues, 'invalid-key', `${path}.id`, 'id debe ser un entero positivo en texto.');
  const key = requiredText(item['key'], `${path}.key`, issues);
  if (key && !ITEM_KEY.test(key)) issue(issues, 'invalid-key', `${path}.key`, 'key debe contener ASCII visible y hasta 128 caracteres.');
  const name = requiredText(item['name'], `${path}.name`, issues);
  const description = optionalText(item['description'], `${path}.description`, issues);
  const revision = positiveInteger(item['revision'], `${path}.revision`, issues);
  const definition = normalizeDefinition(item['definition'], `${path}.definition`, issues);
  return { id, key, name, description, revision, definition };
}

function normalizeDefinition(
  value: unknown,
  path: string,
  issues: InstitutionalCatalogIssue[]
): InstitutionalCalculatorDefinition {
  const definition = objectValue(value);
  if (!definition) {
    issue(issues, 'invalid-type', path, 'definition debe ser un objeto.');
    return invalidDefinition();
  }
  const modeText = definition['mode'] === undefined ? 'formula' : optionalText(definition['mode'], `${path}.mode`, issues);
  const mode = MODES.has(modeText as InstitutionalCalculatorMode)
    ? modeText as InstitutionalCalculatorMode
    : 'formula';
  if (!MODES.has(modeText as InstitutionalCalculatorMode)) issue(issues, 'invalid-mode', `${path}.mode`, 'mode debe ser builtin, formula o score.');

  const replacesBuiltInKey = optionalText(definition['replacesBuiltInKey'], `${path}.replacesBuiltInKey`, issues);
  if (replacesBuiltInKey && !BUILTIN_KEY.test(replacesBuiltInKey)) {
    issue(issues, 'invalid-key', `${path}.replacesBuiltInKey`, 'replacesBuiltInKey no tiene el formato canónico.');
  }
  const rawFields = definition['fields'];
  if (!Array.isArray(rawFields)) issue(issues, 'invalid-type', `${path}.fields`, 'fields debe ser una lista.');
  const sourceFields = Array.isArray(rawFields) ? rawFields : [];
  if (sourceFields.length > INSTITUTIONAL_CALCULATOR_LIMITS.fields) {
    issue(issues, 'limit-exceeded', `${path}.fields`, 'fields supera el máximo de 100 elementos.');
  }
  const fields = sourceFields.slice(0, INSTITUTIONAL_CALCULATOR_LIMITS.fields)
    .map((field, index) => normalizeField(field, `${path}.fields[${index}]`, issues));
  const seenFields = new Set<string>();
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (field.key && seenFields.has(field.key)) issue(issues, 'duplicate-key', `${path}.fields[${index}].key`, `La key ${field.key} está duplicada.`);
    seenFields.add(field.key);
  }
  if (mode !== 'builtin' && !fields.some((field) => field.type !== 'section')) {
    issue(issues, 'required', `${path}.fields`, 'La definición necesita al menos una variable.');
  }

  const expression = optionalText(definition['expression'], `${path}.expression`, issues);
  if (mode === 'formula') validateExpression(expression, fields, `${path}.expression`, issues);
  const basePoints = finiteOrDefault(definition['basePoints'], 0, `${path}.basePoints`, issues);
  const decimals = normalizeDecimals(definition['decimals'], `${path}.decimals`, issues);
  const ranges = normalizeRanges(definition['ranges'], `${path}.ranges`, issues);
  const notes = normalizeNotes(definition['notes'], `${path}.notes`, issues);
  if (mode === 'builtin' && !replacesBuiltInKey) {
    issue(issues, 'required', `${path}.replacesBuiltInKey`, 'Una definición builtin debe indicar qué herramienta reemplaza.');
  }
  return {
    mode,
    replacesBuiltInKey,
    category: optionalText(definition['category'], `${path}.category`, issues) || 'general',
    source: optionalText(definition['source'], `${path}.source`, issues),
    clinicalUse: optionalText(definition['clinicalUse'], `${path}.clinicalUse`, issues),
    fields,
    expression,
    basePoints,
    resultLabel: optionalText(definition['resultLabel'], `${path}.resultLabel`, issues) || 'Resultado',
    resultUnit: optionalText(definition['resultUnit'], `${path}.resultUnit`, issues),
    decimals,
    ranges,
    notes
  };
}

function normalizeField(value: unknown, path: string, issues: InstitutionalCatalogIssue[]): InstitutionalCalculatorField {
  const field = objectValue(value);
  if (!field) {
    issue(issues, 'invalid-type', path, 'El campo debe ser un objeto.');
    return invalidField();
  }
  const key = requiredText(field['key'], `${path}.key`, issues);
  if (key && !FIELD_KEY.test(key)) issue(issues, 'invalid-key', `${path}.key`, 'La key debe ser un identificador ASCII válido.');
  const typeText = requiredText(field['type'], `${path}.type`, issues);
  const type = FIELD_TYPES.has(typeText as InstitutionalCalculatorFieldType)
    ? typeText as InstitutionalCalculatorFieldType
    : 'text';
  if (!FIELD_TYPES.has(typeText as InstitutionalCalculatorFieldType)) issue(issues, 'invalid-field-type', `${path}.type`, 'Tipo de campo no permitido.');
  const min = optionalFinite(field['min'], `${path}.min`, issues);
  const max = optionalFinite(field['max'], `${path}.max`, issues);
  const step = optionalFinite(field['step'], `${path}.step`, issues);
  if (min !== null && max !== null && min > max) issue(issues, 'invalid-range', path, 'min no puede ser mayor que max.');
  if (step !== null && step <= 0) issue(issues, 'invalid-range', `${path}.step`, 'step debe ser mayor que cero.');
  const options = normalizeOptions(field['options'], `${path}.options`, issues);
  const scoreRules = normalizeRules(field['scoreRules'], `${path}.scoreRules`, issues);
  return {
    key,
    label: requiredText(field['label'], `${path}.label`, issues),
    type,
    required: type === 'section' ? false : field['required'] !== false,
    unit: optionalText(field['unit'], `${path}.unit`, issues),
    help: optionalText(field['help'], `${path}.help`, issues),
    placeholder: optionalText(field['placeholder'], `${path}.placeholder`, issues),
    min,
    max,
    step,
    value: scalarValue(field['value'], `${path}.value`, issues),
    options,
    checkedPoints: finiteOrDefault(field['checkedPoints'], 0, `${path}.checkedPoints`, issues),
    scoreRules
  };
}

function normalizeOptions(value: unknown, path: string, issues: InstitutionalCatalogIssue[]): readonly InstitutionalCalculatorOption[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    issue(issues, 'invalid-type', path, 'options debe ser una lista.');
    return [];
  }
  if (value.length > INSTITUTIONAL_CALCULATOR_LIMITS.options) issue(issues, 'limit-exceeded', path, 'options supera 200 elementos.');
  const seen = new Set<string>();
  return value.slice(0, INSTITUTIONAL_CALCULATOR_LIMITS.options).map((raw, index) => {
    const option = objectValue(raw);
    if (!option) {
      issue(issues, 'invalid-type', `${path}[${index}]`, 'La opción debe ser un objeto.');
      return { value: '', label: '', points: 0 };
    }
    const rawValue = option['value'];
    if (!isOptionScalar(rawValue)) issue(issues, 'invalid-type', `${path}[${index}].value`, 'El valor de opción debe ser texto, número o booleano.');
    const normalizedValue = isOptionScalar(rawValue) ? String(rawValue) : '';
    if (seen.has(normalizedValue)) issue(issues, 'duplicate-key', `${path}[${index}].value`, `El valor ${normalizedValue} está duplicado.`);
    seen.add(normalizedValue);
    return {
      value: normalizedValue,
      label: requiredText(option['label'], `${path}[${index}].label`, issues),
      points: finiteOrDefault(option['points'], 0, `${path}[${index}].points`, issues)
    };
  });
}

function normalizeRules(value: unknown, path: string, issues: InstitutionalCatalogIssue[]): readonly InstitutionalScoreRule[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    issue(issues, 'invalid-type', path, 'scoreRules debe ser una lista.');
    return [];
  }
  if (value.length > INSTITUTIONAL_CALCULATOR_LIMITS.rules) issue(issues, 'limit-exceeded', path, 'scoreRules supera 200 elementos.');
  return value.slice(0, INSTITUTIONAL_CALCULATOR_LIMITS.rules).map((raw, index) => {
    const rule = objectValue(raw);
    if (!rule) {
      issue(issues, 'invalid-type', `${path}[${index}]`, 'La regla debe ser un objeto.');
      return { operator: 'eq', value: 0, max: null, points: 0, label: '' };
    }
    const operatorText = requiredText(rule['operator'], `${path}[${index}].operator`, issues);
    const operator = SCORE_OPERATORS.has(operatorText as InstitutionalScoreOperator)
      ? operatorText as InstitutionalScoreOperator
      : 'eq';
    if (!SCORE_OPERATORS.has(operatorText as InstitutionalScoreOperator)) issue(issues, 'invalid-operator', `${path}[${index}].operator`, 'Operador de score no permitido.');
    const first = requiredFinite(rule['value'], `${path}[${index}].value`, issues);
    const max = optionalFinite(rule['max'], `${path}[${index}].max`, issues);
    if (operator === 'between' && max === null) issue(issues, 'required', `${path}[${index}].max`, 'between requiere max.');
    if (operator === 'between' && max !== null && first > max) issue(issues, 'invalid-range', `${path}[${index}]`, 'El inicio de between no puede superar max.');
    return {
      operator,
      value: first,
      max,
      points: finiteOrDefault(rule['points'], 0, `${path}[${index}].points`, issues),
      label: optionalText(rule['label'], `${path}[${index}].label`, issues)
    };
  });
}

function normalizeRanges(value: unknown, path: string, issues: InstitutionalCatalogIssue[]): readonly InstitutionalCalculatorRange[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    issue(issues, 'invalid-type', path, 'ranges debe ser una lista.');
    return [];
  }
  if (value.length > INSTITUTIONAL_CALCULATOR_LIMITS.ranges) issue(issues, 'limit-exceeded', path, 'ranges supera 200 elementos.');
  return value.slice(0, INSTITUTIONAL_CALCULATOR_LIMITS.ranges).map((raw, index) => {
    const range = objectValue(raw);
    if (!range) {
      issue(issues, 'invalid-type', `${path}[${index}]`, 'El rango debe ser un objeto.');
      return { min: null, max: null, label: '', severity: 'info' };
    }
    const min = optionalFinite(range['min'], `${path}[${index}].min`, issues);
    const max = optionalFinite(range['max'], `${path}[${index}].max`, issues);
    if (min !== null && max !== null && min > max) issue(issues, 'invalid-range', `${path}[${index}]`, 'min no puede ser mayor que max.');
    const severityText = range['severity'] === undefined ? 'info' : optionalText(range['severity'], `${path}[${index}].severity`, issues);
    const severity = SEVERITIES.has(severityText as InstitutionalSeverity)
      ? severityText as InstitutionalSeverity
      : 'info';
    if (!SEVERITIES.has(severityText as InstitutionalSeverity)) issue(issues, 'invalid-severity', `${path}[${index}].severity`, 'Severidad no permitida.');
    return { min, max, label: requiredText(range['label'], `${path}[${index}].label`, issues), severity };
  });
}

function normalizeNotes(value: unknown, path: string, issues: InstitutionalCatalogIssue[]): readonly string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    issue(issues, 'invalid-type', path, 'notes debe ser una lista de textos.');
    return [];
  }
  return value.map((note, index) => optionalText(note, `${path}[${index}]`, issues)).filter(Boolean);
}

function normalizeSettings(value: unknown, path: string, issues: InstitutionalCatalogIssue[]): InstitutionalToolSettingsItem {
  const settings = objectValue(value);
  if (!settings || Object.keys(settings).length === 0) return defaultSettings();
  const definition = objectValue(settings['definition']);
  if (!definition) issue(issues, 'invalid-type', `${path}.definition`, 'La definición de settings debe ser un objeto.');
  const rawDisabled = definition?.['disabledBuiltInKeys'];
  if (rawDisabled !== undefined && !Array.isArray(rawDisabled)) issue(issues, 'invalid-type', `${path}.definition.disabledBuiltInKeys`, 'disabledBuiltInKeys debe ser una lista.');
  const disabled: string[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of (Array.isArray(rawDisabled) ? rawDisabled : []).entries()) {
    const keyPath = `${path}.definition.disabledBuiltInKeys[${index}]`;
    const key = optionalText(raw, keyPath, issues);
    const validFormat = BUILTIN_KEY.test(key);
    if (!validFormat) issue(issues, 'invalid-key', keyPath, 'La clave builtin no es válida.');
    if (validFormat && !BUILTIN_CALCULATORS_BY_KEY.has(key)) {
      issue(issues, 'unknown-override', keyPath, `No existe una calculadora builtin con clave ${key}.`);
    }
    if (seen.has(key)) issue(issues, 'duplicate-key', keyPath, `La clave ${key} está duplicada.`);
    seen.add(key);
    disabled.push(key);
  }
  const id = optionalText(settings['id'], `${path}.id`, issues);
  const revision = nonNegativeInteger(settings['revision'], `${path}.revision`, issues);
  return {
    id,
    key: requiredText(settings['key'], `${path}.key`, issues),
    name: requiredText(settings['name'], `${path}.name`, issues),
    description: optionalText(settings['description'], `${path}.description`, issues),
    revision,
    definition: {
      enabled: definition?.['enabled'] === undefined ? true : booleanValue(definition['enabled'], `${path}.definition.enabled`, issues),
      disabledBuiltInKeys: disabled
    }
  };
}

function validateCatalogIdentity(calculators: readonly InstitutionalCalculatorItem[], issues: InstitutionalCatalogIssue[]): void {
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (let index = 0; index < calculators.length; index += 1) {
    const item = calculators[index];
    if (ids.has(item.id)) issue(issues, 'duplicate-key', `$.calculators[${index}].id`, `El id ${item.id} está duplicado.`);
    if (keys.has(item.key)) issue(issues, 'duplicate-key', `$.calculators[${index}].key`, `La key ${item.key} está duplicada.`);
    ids.add(item.id);
    keys.add(item.key);
  }
}

function validateOverrides(calculators: readonly InstitutionalCalculatorItem[], issues: InstitutionalCatalogIssue[]): void {
  const replacements = new Set<string>();
  for (let index = 0; index < calculators.length; index += 1) {
    const definition = calculators[index].definition;
    const key = definition.replacesBuiltInKey;
    if (!key) continue;
    const path = `$.calculators[${index}].definition.replacesBuiltInKey`;
    const original = BUILTIN_CALCULATORS_BY_KEY.get(key);
    if (!original) {
      issue(issues, 'unknown-override', path, `No existe una calculadora builtin con clave ${key}.`);
      continue;
    }
    if (replacements.has(key)) issue(issues, 'duplicate-override', path, `Hay más de un override activo para ${key}.`);
    replacements.add(key);
    if (definition.mode === 'builtin') {
      const originalFields = new Set(original.fields.map((field) => field.id));
      definition.fields.forEach((field, fieldIndex) => {
        if (!originalFields.has(field.key)) {
          issue(issues, 'unknown-variable', `$.calculators[${index}].definition.fields[${fieldIndex}].key`, `El campo ${field.key} no pertenece a la herramienta original.`);
        }
      });
    }
  }
}

function validateExpression(
  expression: string,
  fields: readonly InstitutionalCalculatorField[],
  path: string,
  issues: InstitutionalCatalogIssue[]
): void {
  if (!expression.trim()) {
    issue(issues, 'required', path, 'La fórmula no puede estar vacía.');
    return;
  }
  if (expression.length > INSTITUTIONAL_CALCULATOR_LIMITS.expressionLength) {
    issue(issues, 'limit-exceeded', path, 'La fórmula supera 4096 caracteres.');
    return;
  }
  try {
    const referenced = expressionVariables(expression);
    const fieldKeys = new Set(fields.filter((field) => field.type !== 'section').map((field) => field.key));
    for (const variable of referenced) {
      if (!fieldKeys.has(variable)) issue(issues, 'unknown-variable', path, `La fórmula referencia la variable inexistente ${variable}.`);
    }
  } catch (error) {
    issue(issues, 'invalid-expression', path, error instanceof Error ? error.message : 'La fórmula es inválida.');
  }
}

function expressionVariables(expression: string): ReadonlySet<string> {
  const tokens = tokenizeExpression(expression);
  const variables = new Set<string>();
  let position = 0;
  let depth = 0;
  const peek = (): ExpressionToken => tokens[position];
  const consume = (type: ExpressionTokenType): ExpressionToken => {
    const token = peek();
    if (token.type !== type) throw new Error(`Se esperaba ${type}.`);
    position += 1;
    return token;
  };
  const enter = (): void => {
    depth += 1;
    if (depth > 128) throw new Error('La fórmula excede la profundidad permitida.');
  };
  const leave = (): void => { depth -= 1; };
  function primary(): void {
    if (peek().type === 'number') { consume('number'); return; }
    if (peek().type === 'identifier') {
      const name = consume('identifier').value || '';
      if (peek().type === '(') {
        if (!SAFE_FUNCTIONS.has(name.toLowerCase())) throw new Error(`Funcion no permitida: ${name}.`);
        consume('('); enter();
        let argumentCount = 0;
        if (peek().type !== ')') {
          additive(); argumentCount += 1;
          while (peek().type === ',') { consume(','); additive(); argumentCount += 1; }
        }
        consume(')'); leave(); validateFunctionArity(name, argumentCount);
      } else {
        variables.add(name);
      }
      return;
    }
    if (peek().type === '(') {
      consume('('); enter(); additive(); consume(')'); leave(); return;
    }
    throw new Error('La formula esta incompleta.');
  }
  function unary(): void {
    if (peek().type === '+' || peek().type === '-') consume(peek().type);
    if (peek().type === '+' || peek().type === '-') unary(); else primary();
  }
  function power(): void { unary(); if (peek().type === '^') { consume('^'); enter(); power(); leave(); } }
  function multiplicative(): void {
    power();
    while (peek().type === '*' || peek().type === '/' || peek().type === '%') { consume(peek().type); power(); }
  }
  function additive(): void {
    multiplicative();
    while (peek().type === '+' || peek().type === '-') { consume(peek().type); multiplicative(); }
  }
  additive();
  if (peek().type !== 'end') throw new Error('La formula contiene elementos no reconocidos.');
  return variables;
}

function tokenizeExpression(source: string): ExpressionToken[] {
  const tokens: ExpressionToken[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) { index += 1; continue; }
    const number = source.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
    if (number) {
      if (!Number.isFinite(Number(number[0]))) throw new Error(`Literal numerico no finito: ${number[0]}.`);
      tokens.push({ type: 'number', value: number[0] }); index += number[0].length; continue;
    }
    const identifier = source.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (identifier) { tokens.push({ type: 'identifier', value: identifier[0] }); index += identifier[0].length; continue; }
    if ('+-*/%^(),'.includes(char)) { tokens.push({ type: char as ExpressionTokenType, value: char }); index += 1; continue; }
    throw new Error(`Caracter no permitido en la formula: ${char}`);
  }
  tokens.push({ type: 'end' });
  return tokens;
}

function validateFunctionArity(name: string, argumentCount: number): void {
  const normalized = name.toLowerCase();
  if (normalized === 'min' || normalized === 'max') {
    if (argumentCount < 1) throw new Error(`La funcion ${name} requiere al menos 1 argumento.`);
    return;
  }
  if (normalized === 'pow') {
    if (argumentCount !== 2) throw new Error(`La funcion ${name} requiere exactamente 2 argumentos.`);
    return;
  }
  if (UNARY_EXPRESSION_FUNCTIONS.has(normalized) && argumentCount !== 1) {
    throw new Error(`La funcion ${name} requiere exactamente 1 argumento.`);
  }
}

function defaultSettings(): InstitutionalToolSettingsItem {
  return { id: '', key: 'default', name: 'Herramientas', description: '', revision: 0,
    definition: { enabled: true, disabledBuiltInKeys: [] } };
}

function invalidCalculator(): InstitutionalCalculatorItem {
  return { id: '', key: '', name: '', description: '', revision: 0, definition: invalidDefinition() };
}

function invalidDefinition(): InstitutionalCalculatorDefinition {
  return { mode: 'formula', replacesBuiltInKey: '', category: 'general', source: '', clinicalUse: '', fields: [], expression: '', basePoints: 0, resultLabel: 'Resultado', resultUnit: '', decimals: 0, ranges: [], notes: [] };
}

function invalidField(): InstitutionalCalculatorField {
  return { key: '', label: '', type: 'text', required: false, unit: '', help: '', placeholder: '', min: null, max: null, step: null, value: null, options: [], checkedPoints: 0, scoreRules: [] };
}

function objectValue(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function requiredText(value: unknown, path: string, issues: InstitutionalCatalogIssue[]): string {
  const normalized = optionalText(value, path, issues);
  if (!normalized) issue(issues, 'required', path, 'El texto es obligatorio.');
  return normalized;
}

function optionalText(value: unknown, path: string, issues: InstitutionalCatalogIssue[]): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' && typeof value !== 'number') {
    issue(issues, 'invalid-type', path, 'El valor debe ser texto.');
    return '';
  }
  return String(value).trim();
}

function scalarValue(value: unknown, path: string, issues: InstitutionalCatalogIssue[]): InstitutionalScalar {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value;
    issue(issues, 'invalid-number', path, 'El valor numérico debe ser finito.');
    return null;
  }
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  issue(issues, 'invalid-type', path, 'El valor inicial debe ser escalar.');
  return null;
}

function isOptionScalar(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value);
}

function optionalFinite(value: unknown, path: string, issues: InstitutionalCatalogIssue[]): number | null {
  if (value === undefined || value === null || value === '') return null;
  return requiredFinite(value, path, issues);
}

function requiredFinite(value: unknown, path: string, issues: InstitutionalCatalogIssue[]): number {
  if (typeof value === 'string' && !value.trim()) {
    issue(issues, 'invalid-number', path, 'El número es obligatorio y debe ser finito.');
    return 0;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    issue(issues, 'invalid-number', path, 'El número debe ser finito.');
    return 0;
  }
  return parsed;
}

function finiteOrDefault(value: unknown, fallback: number, path: string, issues: InstitutionalCatalogIssue[]): number {
  return value === undefined || value === null || value === '' ? fallback : requiredFinite(value, path, issues);
}

function normalizeDecimals(value: unknown, path: string, issues: InstitutionalCatalogIssue[]): number {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = requiredFinite(value, path, issues);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 6) {
    issue(issues, 'invalid-range', path, 'decimals debe ser un entero entre 0 y 6.');
    return 0;
  }
  return parsed;
}

function positiveInteger(value: unknown, path: string, issues: InstitutionalCatalogIssue[]): number {
  const parsed = integerValue(value);
  if (parsed === null || parsed < 1) {
    issue(issues, 'invalid-number', path, 'La revisión debe ser un entero positivo.');
    return 0;
  }
  return parsed;
}

function nonNegativeInteger(value: unknown, path: string, issues: InstitutionalCatalogIssue[]): number {
  const parsed = integerValue(value);
  if (parsed === null || parsed < 0) {
    issue(issues, 'invalid-number', path, 'La revisión debe ser un entero no negativo.');
    return 0;
  }
  return parsed;
}

function integerValue(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function booleanValue(value: unknown, path: string, issues: InstitutionalCatalogIssue[]): boolean {
  if (typeof value === 'boolean') return value;
  issue(issues, 'invalid-type', path, 'El valor debe ser booleano.');
  return true;
}

function issue(issues: InstitutionalCatalogIssue[], code: InstitutionalCatalogIssueCode, path: string, message: string): void {
  issues.push({ code, path, message });
}

function validationError(code: InstitutionalCatalogIssueCode, path: string, message: string): InstitutionalCatalogValidationError {
  return new InstitutionalCatalogValidationError([{ code, path, message }]);
}

function repairLegacyText(value: unknown): string {
  const text = String(value ?? '');
  if (!/[ÃÂâ]/.test(text)) return text;
  try {
    const escaped = [...text].map((character) => {
      const code = character.charCodeAt(0);
      return code <= 0xff ? `%${code.toString(16).padStart(2, '0')}` : `%u${code.toString(16).padStart(4, '0')}`;
    }).join('');
    return decodeURIComponent(escaped);
  } catch {
    return text;
  }
}
