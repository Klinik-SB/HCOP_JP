import { result } from './calculator.engine';
import {
  CalculatorCheckboxField,
  CalculatorDefinition,
  CalculatorField,
  CalculatorNumberField,
  CalculatorSelectField,
  CalculatorSeverity,
  CalculatorTextField,
  CalculatorTextareaField,
  CalculatorValues
} from './calculator.models';
import {
  ConfigurableCalculatorDefinition,
  ConfigurableCalculatorField,
  ConfigurableCalculatorRange,
  ConfigurableScoreRule,
  evaluateConfigurableCalculator
} from './configurable-calculator.engine';
import { SafeExpressionVariable } from './safe-expression.engine';

export interface ValidatedInstitutionalCalculatorOption {
  readonly value: string;
  readonly label: string;
  readonly points?: string | number | boolean | null;
}

export interface ValidatedInstitutionalCalculatorField extends ConfigurableCalculatorField {
  readonly type: 'number' | 'select' | 'checkbox' | 'section' | 'text' | 'textarea';
  readonly label: string;
  readonly required: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly unit?: string;
  readonly help?: string;
  readonly value?: SafeExpressionVariable;
  readonly options?: readonly ValidatedInstitutionalCalculatorOption[];
  readonly scoreRules?: readonly ConfigurableScoreRule[];
}

export interface ValidatedInstitutionalCalculatorRange extends ConfigurableCalculatorRange {
  readonly label: string;
  readonly severity?: string;
}

export interface ValidatedInstitutionalCalculatorDefinition extends ConfigurableCalculatorDefinition {
  readonly mode: 'formula' | 'score';
  readonly replacesBuiltInKey?: string;
  readonly category?: string;
  readonly source?: string;
  readonly clinicalUse?: string;
  readonly fields: readonly ValidatedInstitutionalCalculatorField[];
  readonly expression?: string;
  readonly decimals?: number;
  readonly resultLabel?: string;
  readonly resultUnit?: string;
  readonly notes?: readonly string[];
  readonly ranges?: readonly ValidatedInstitutionalCalculatorRange[];
}

export interface ValidatedInstitutionalCalculatorItem {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly revision: number;
  readonly definition: ValidatedInstitutionalCalculatorDefinition;
}

/**
 * Converts one already validated institutional formula/score into the common
 * Angular calculator contract. It does not mutate the item or the built-in it
 * may replace, and it performs no catalog ordering or workspace integration.
 */
export function createInstitutionalCalculatorDefinition(
  item: ValidatedInstitutionalCalculatorItem,
  originalTool?: CalculatorDefinition
): CalculatorDefinition {
  const definition = item.definition;
  const fields = definition.fields.map(toCalculatorField);

  return {
    id: originalTool?.id || `config-${item.id}`,
    title: item.name,
    shortTitle: item.name,
    subtitle: item.description || definition.clinicalUse || 'Calculadora configurada localmente.',
    category: definition.category || 'general',
    source: `${definition.source || 'Definicion local'} · version ${item.revision}`,
    clinicalUse: definition.clinicalUse || item.description
      || 'Herramienta configurada localmente. Verifique la definicion y la fuente antes de usar el resultado.',
    fields,
    calculate(values) {
      return configuredResult(definition, values);
    }
  };
}

function toCalculatorField(field: ValidatedInstitutionalCalculatorField): CalculatorField {
  const common = {
    id: field.key,
    label: field.label,
    help: field.help || undefined
  } as const;

  if (field.type === 'section') {
    return { ...common, kind: 'section', required: false, initialValue: '' };
  }
  if (field.type === 'checkbox') {
    const checkbox: CalculatorCheckboxField = {
      ...common,
      kind: 'checkbox',
      // Legacy never marks configurable checkboxes as required in the form.
      required: false,
      initialValue: false
    };
    return checkbox;
  }
  if (field.type === 'select') {
    const options = (field.options || []).map((option) => ({ value: option.value, label: option.label }));
    const configuredDefault = String(field.value ?? '');
    const scenarioDefault = field.key === 'scenario'
      ? options.find((option) => option.value === configuredDefault)?.value || options[0]?.value || ''
      : '';
    const select: CalculatorSelectField = {
      ...common,
      kind: 'select',
      required: field.required,
      initialValue: scenarioDefault,
      options
    };
    return select;
  }
  if (field.type === 'textarea') {
    const textarea: CalculatorTextareaField = {
      ...common,
      kind: 'textarea',
      required: field.required,
      initialValue: '',
      placeholder: field.value == null ? '' : String(field.value),
      rows: 4
    };
    return textarea;
  }
  if (field.type === 'text') {
    const text: CalculatorTextField = {
      ...common,
      kind: 'text',
      required: field.required,
      initialValue: '',
      placeholder: singleLinePlaceholder(field.value)
    };
    return text;
  }

  const number: CalculatorNumberField = {
    ...common,
    kind: 'number',
    required: field.required,
    initialValue: '',
    unit: field.unit || undefined,
    min: field.min,
    max: field.max,
    step: field.step && field.step > 0 ? field.step : undefined,
    ...(numericExample(field.value) === undefined ? {} : { exampleValue: numericExample(field.value) })
  };
  return number;
}

function configuredResult(
  definition: ValidatedInstitutionalCalculatorDefinition,
  values: CalculatorValues
) {
  const evaluated = evaluateConfigurableCalculator(definition, values);
  const decimals = Math.max(0, Math.min(6, Number(definition.decimals) || 0));
  const formatted = Number(evaluated.value).toFixed(decimals);
  const unit = definition.resultUnit ? ` ${definition.resultUnit}` : '';
  const resultLabel = definition.resultLabel || 'Resultado';
  const contributions = definition.mode === 'score'
    ? evaluated.contributions.filter((entry) => entry.points !== 0).slice(0, 8)
    : [];

  return result({
    title: `${resultLabel}: ${formatted}${unit}`,
    detail: evaluated.range?.label || 'Resultado calculado con la definicion local activa.',
    badge: definition.mode === 'score' ? 'score configurable' : 'calculadora configurable',
    score: 0,
    showScore: false,
    severity: safeSeverity(evaluated.range?.severity),
    metrics: [
      { label: resultLabel, value: `${formatted}${unit}` },
      ...contributions.map((entry) => ({
        label: entry.label || entry.key,
        value: `${entry.points > 0 ? '+' : ''}${entry.points}`
      }))
    ],
    notes: [
      ...(definition.notes || []),
      definition.mode === 'score'
        ? 'Puntajes y reglas guardados en la version activa.'
        : `Formula versionada: ${definition.expression || ''}`
    ]
  });
}

function singleLinePlaceholder(value: SafeExpressionVariable): string {
  return value === undefined || value === '' || value === null ? '' : `Ej.: ${String(value)}`;
}

function numericExample(value: SafeExpressionVariable): number | undefined {
  if (value === undefined || value === '' || value === null || typeof value === 'boolean') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function safeSeverity(value: unknown): CalculatorSeverity {
  return value === 'good' || value === 'warn' || value === 'bad' || value === 'info' ? value : 'info';
}
