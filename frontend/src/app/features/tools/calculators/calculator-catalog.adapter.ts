import {
  CalculatorDefinition,
  CalculatorField,
  CalculatorNumberField,
  CalculatorSelectField
} from './calculator.models';
import {
  InstitutionalCalculatorCatalog,
  InstitutionalCalculatorDefinition,
  InstitutionalCalculatorField,
  InstitutionalCalculatorItem,
  InstitutionalCalculatorOption,
  InstitutionalToolSettings
} from './calculator-catalog.models';

type JsonObject = Record<string, unknown>;

const EMPTY_SETTINGS: InstitutionalToolSettings = {
  id: '',
  key: '',
  name: '',
  description: '',
  revision: 0,
  definition: { disabledBuiltInKeys: [] }
};

/** Normaliza el contrato JSON operativo sin confiar en `total` ni en sus tipos. */
export function normalizeInstitutionalCalculatorCatalog(payload: unknown): InstitutionalCalculatorCatalog {
  const root = record(payload);
  const calculators = array(root['calculators'])
    .map(normalizeCalculator)
    .filter((item): item is InstitutionalCalculatorItem => item !== null);
  return {
    ok: root['ok'] === true,
    calculators,
    settings: normalizeSettings(root['settings']),
    total: calculators.length
  };
}

/** Replica la clave estable que usa Configuracion para identificar motores originales. */
export function calculatorConfigurationKey(value: string): string {
  return value.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

/**
 * Aplica exclusivamente el subconjunto seguro de configuracion institucional:
 * motores desactivados y personalizaciones `builtin`. Las formulas y scores
 * configurables permanecen en el catalogo, pero deliberadamente no se ejecutan
 * hasta que su motor de expresiones tenga un puerto Angular validado.
 */
export function mergeInstitutionalBuiltIns(
  builtIns: readonly CalculatorDefinition[],
  catalog: InstitutionalCalculatorCatalog
): readonly CalculatorDefinition[] {
  const disabled = new Set(catalog.settings.definition.disabledBuiltInKeys);
  const overrides = new Map<string, InstitutionalCalculatorItem>();
  for (const item of catalog.calculators) {
    const replacementKey = item.definition.replacesBuiltInKey;
    if (item.definition.mode === 'builtin' && replacementKey) overrides.set(replacementKey, item);
  }

  return builtIns.flatMap((definition) => {
    const key = calculatorConfigurationKey(definition.title);
    if (disabled.has(key)) return [];
    const override = overrides.get(key);
    return [override ? applyBuiltinOverride(definition, override) : definition];
  });
}

function applyBuiltinOverride(
  definition: CalculatorDefinition,
  item: InstitutionalCalculatorItem
): CalculatorDefinition {
  const configuredFields = new Map(item.definition.fields.map((field) => [field.key, field]));
  const configuredSource = item.definition.source || definition.source || 'Motor clinico original';
  return {
    ...definition,
    title: item.name || definition.title,
    shortTitle: item.name || definition.shortTitle || definition.title,
    subtitle: item.description || item.definition.clinicalUse || definition.subtitle,
    category: item.definition.category || definition.category,
    source: `${configuredSource} · personalizacion local v${item.revision}`,
    clinicalUse: item.definition.clinicalUse || item.description || definition.clinicalUse,
    fields: definition.fields.map((field) => applyFieldCopy(field, configuredFields.get(field.id)))
  };
}

function applyFieldCopy(field: CalculatorField, configured: InstitutionalCalculatorField | undefined): CalculatorField {
  if (!configured) return field;
  const label = configured.label || field.label;
  const help = configured.help || field.help;
  if (field.kind === 'number') {
    const copy: CalculatorNumberField = {
      ...field,
      label,
      help,
      unit: configured.unit || field.unit
    };
    return copy;
  }
  if (field.kind === 'select') {
    const optionLabels = new Map(configured.options.map((option) => [String(option.value), option.label]));
    const copy: CalculatorSelectField = {
      ...field,
      label,
      help,
      options: field.options.map((option) => ({
        ...option,
        label: optionLabels.get(String(option.value)) || option.label
      }))
    };
    return copy;
  }
  return { ...field, label, help };
}

function normalizeCalculator(value: unknown): InstitutionalCalculatorItem | null {
  const item = record(value);
  const id = strictText(item['id']);
  const key = strictText(item['key']);
  const name = strictText(item['name']);
  if (!id || !key || !name) return null;
  return {
    id,
    key,
    name,
    description: strictText(item['description']),
    revision: nonNegativeInteger(item['revision']),
    definition: normalizeDefinition(item['definition'])
  };
}

function normalizeDefinition(value: unknown): InstitutionalCalculatorDefinition {
  const definition = record(value);
  return {
    ...definition,
    mode: strictText(definition['mode']) || 'formula',
    replacesBuiltInKey: strictText(definition['replacesBuiltInKey']),
    category: strictText(definition['category']),
    source: strictText(definition['source']),
    clinicalUse: strictText(definition['clinicalUse']),
    fields: array(definition['fields'])
      .map(normalizeField)
      .filter((field): field is InstitutionalCalculatorField => field !== null)
  };
}

function normalizeField(value: unknown): InstitutionalCalculatorField | null {
  const field = record(value);
  const key = strictText(field['key']);
  if (!key) return null;
  return {
    ...field,
    key,
    label: strictText(field['label']) || key,
    help: strictText(field['help']),
    unit: strictText(field['unit']),
    options: array(field['options'])
      .map(normalizeOption)
      .filter((option): option is InstitutionalCalculatorOption => option !== null)
  };
}

function normalizeOption(value: unknown): InstitutionalCalculatorOption | null {
  const option = record(value);
  if (option['value'] === null || option['value'] === undefined) return null;
  const normalizedValue = String(option['value']).trim();
  if (!normalizedValue && option['value'] !== '') return null;
  return {
    ...option,
    value: normalizedValue,
    label: strictText(option['label']) || normalizedValue
  };
}

function normalizeSettings(value: unknown): InstitutionalToolSettings {
  const item = record(value);
  if (!Object.keys(item).length) return EMPTY_SETTINGS;
  const definition = record(item['definition']);
  const disabledBuiltInKeys = [...new Set(array(definition['disabledBuiltInKeys'])
    .map(strictText)
    .filter(Boolean))];
  return {
    id: strictText(item['id']),
    key: strictText(item['key']),
    name: strictText(item['name']),
    description: strictText(item['description']),
    revision: nonNegativeInteger(item['revision']),
    definition: { ...definition, disabledBuiltInKeys }
  };
}

function record(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function strictText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function nonNegativeInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}
