import {
  CalculatorDefinition,
  CalculatorField,
  CalculatorNumberField,
  CalculatorSelectField
} from './calculator.models';
import {
  InstitutionalCalculatorCatalog,
  InstitutionalCalculatorField,
  InstitutionalCalculatorItem,
  toInstitutionalCalculatorFactoryItem,
  toolConfigurationKey
} from './institutional-calculator-catalog.validator';
import { createInstitutionalCalculatorDefinition } from './institutional-calculator.factory';

export class InstitutionalCalculatorAssemblyError extends Error {
  readonly code = 'INVALID_INSTITUTIONAL_CALCULATOR_ASSEMBLY';

  constructor(message: string) {
    super(message);
    this.name = 'InstitutionalCalculatorAssemblyError';
  }
}

/**
 * Assembles the final calculator library from trusted, already validated data.
 * Built-ins retain their relative order; replacements occupy the same slot and
 * custom formulas/scores are appended in catalog order.
 */
export function assembleInstitutionalCalculatorCatalog(
  builtIns: readonly CalculatorDefinition[],
  catalog: InstitutionalCalculatorCatalog
): readonly CalculatorDefinition[] {
  assertCatalogContract(catalog);
  const builtInsByKey = indexBuiltIns(builtIns);
  const replacements = new Map<string, InstitutionalCalculatorItem>();
  const custom: InstitutionalCalculatorItem[] = [];

  for (const item of catalog.calculators) {
    const replacementKey = item.definition.replacesBuiltInKey;
    if (replacementKey) {
      if (!builtInsByKey.has(replacementKey)) {
        throw assemblyError(`No existe una calculadora builtin con clave ${replacementKey}.`);
      }
      if (replacements.has(replacementKey)) {
        throw assemblyError(`Hay mas de un override para ${replacementKey}.`);
      }
      replacements.set(replacementKey, item);
      continue;
    }
    if (item.definition.mode === 'builtin') {
      throw assemblyError(`La personalizacion builtin ${item.id} no indica una calculadora reemplazada.`);
    }
    custom.push(item);
  }

  const disabled = new Set(catalog.settings.definition.disabledBuiltInKeys);
  const assembled: CalculatorDefinition[] = [];
  for (const original of builtIns) {
    const key = toolConfigurationKey(original.title);
    if (disabled.has(key)) continue;
    const override = replacements.get(key);
    assembled.push(override ? materializeOverride(original, override) : original);
  }

  for (const item of custom) assembled.push(materializeConfigurable(item));
  assertUniqueResultIds(assembled);
  return assembled;
}

function materializeOverride(
  original: CalculatorDefinition,
  item: InstitutionalCalculatorItem
): CalculatorDefinition {
  if (item.definition.mode === 'builtin') return applyBuiltinOverride(original, item);
  const factoryItem = toInstitutionalCalculatorFactoryItem(item);
  if (!factoryItem) throw assemblyError(`No se pudo materializar el override ${item.id}.`);
  return createInstitutionalCalculatorDefinition(factoryItem, original);
}

function materializeConfigurable(item: InstitutionalCalculatorItem): CalculatorDefinition {
  const factoryItem = toInstitutionalCalculatorFactoryItem(item);
  if (!factoryItem) throw assemblyError(`La calculadora custom ${item.id} no es formula ni score.`);
  return createInstitutionalCalculatorDefinition(factoryItem);
}

function applyBuiltinOverride(
  original: CalculatorDefinition,
  item: InstitutionalCalculatorItem
): CalculatorDefinition {
  const definition = item.definition;
  const configuredFields = new Map(definition.fields.map((field) => [field.key, field]));
  const configuredSource = definition.source || original.source || 'Motor clinico original';
  return {
    ...original,
    title: item.name || original.title,
    shortTitle: item.name || original.shortTitle || original.title,
    subtitle: item.description || definition.clinicalUse || original.subtitle,
    category: definition.category || original.category,
    source: `${configuredSource} · personalizacion local v${item.revision}`,
    clinicalUse: definition.clinicalUse || item.description || original.clinicalUse,
    fields: original.fields.map((field) => applyBuiltinFieldCopy(field, configuredFields.get(field.id)))
  };
}

function applyBuiltinFieldCopy(
  field: CalculatorField,
  configured: InstitutionalCalculatorField | undefined
): CalculatorField {
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

function indexBuiltIns(
  builtIns: readonly CalculatorDefinition[]
): ReadonlyMap<string, CalculatorDefinition> {
  const ids = new Set<string>();
  const byKey = new Map<string, CalculatorDefinition>();
  for (const definition of builtIns) {
    if (ids.has(definition.id)) throw assemblyError(`ID builtin duplicado: ${definition.id}.`);
    ids.add(definition.id);
    const key = toolConfigurationKey(definition.title);
    if (!key) throw assemblyError(`La calculadora builtin ${definition.id} no tiene una clave canonica.`);
    if (byKey.has(key)) throw assemblyError(`Clave builtin duplicada: ${key}.`);
    byKey.set(key, definition);
  }
  return byKey;
}

function assertCatalogContract(catalog: InstitutionalCalculatorCatalog): void {
  if (catalog.ok !== true || catalog.total !== catalog.calculators.length) {
    throw assemblyError('El catalogo no cumple el contrato validado.');
  }
}

function assertUniqueResultIds(definitions: readonly CalculatorDefinition[]): void {
  const ids = new Set<string>();
  for (const definition of definitions) {
    if (ids.has(definition.id)) throw assemblyError(`ID final duplicado: ${definition.id}.`);
    ids.add(definition.id);
  }
}

function assemblyError(message: string): InstitutionalCalculatorAssemblyError {
  return new InstitutionalCalculatorAssemblyError(message);
}
