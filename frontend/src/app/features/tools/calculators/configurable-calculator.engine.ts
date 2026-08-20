import {
  evaluateSafeExpression,
  SafeExpressionVariable,
  SafeExpressionVariables
} from './safe-expression.engine';

export type ConfigurableCalculatorMode = 'formula' | 'score' | 'builtin';
export type ConfigurableScoreOperator = 'lt' | 'lte' | 'eq' | 'gte' | 'gt' | 'between';
export type ConfigurableFieldType = 'number' | 'select' | 'checkbox' | 'section' | 'text' | 'textarea';

type NumericInput = string | number | boolean | null | undefined;

export interface ConfigurableCalculatorRange {
  readonly min?: NumericInput;
  readonly max?: NumericInput;
  readonly label?: string;
  readonly severity?: string;
}

export interface ConfigurableScoreRule {
  readonly operator?: ConfigurableScoreOperator | string;
  readonly value?: NumericInput;
  readonly max?: NumericInput;
  readonly points?: NumericInput;
  readonly label?: string;
}

export interface ConfigurableSelectOption {
  readonly value: SafeExpressionVariable;
  readonly label?: string;
  readonly points?: NumericInput;
}

export interface ConfigurableCalculatorField {
  readonly key: string;
  readonly label?: string;
  readonly type: ConfigurableFieldType | string;
  readonly checkedPoints?: NumericInput;
  readonly options?: readonly ConfigurableSelectOption[];
  readonly scoreRules?: readonly ConfigurableScoreRule[];
}

export interface ConfigurableCalculatorDefinition {
  readonly mode?: ConfigurableCalculatorMode;
  readonly expression?: string;
  readonly basePoints?: NumericInput;
  readonly fields?: readonly (ConfigurableCalculatorField | null | undefined)[];
  readonly ranges?: readonly ConfigurableCalculatorRange[];
}

export type ConfigurableCalculatorValues = SafeExpressionVariables;

export interface ConfigurableScoreContribution {
  readonly key: string;
  readonly label?: string;
  readonly points: number;
  readonly detail: string;
  readonly rawValue: SafeExpressionVariable;
}

export interface ConfigurableCalculatorEvaluation {
  readonly value: number;
  readonly range: ConfigurableCalculatorRange | null;
  readonly contributions: readonly ConfigurableScoreContribution[];
}

const SCORE_OPERATORS: ReadonlySet<string> = new Set(['lt', 'lte', 'eq', 'gte', 'gt', 'between']);

/** Exact, side-effect-free port of the persisted configurable calculator runtime. */
export function evaluateConfigurableCalculator(
  definition: ConfigurableCalculatorDefinition | null | undefined,
  values: ConfigurableCalculatorValues = {}
): ConfigurableCalculatorEvaluation {
  if (definition?.mode === 'builtin') {
    throw new Error('El motor clinico original se ejecuta desde Herramientas.');
  }
  if (definition?.mode === 'score') return evaluateConfigurableScore(definition, values);
  const value = evaluateSafeExpression(definition?.expression || '', values);
  return {
    value,
    range: matchingConfigurableRange(definition?.ranges, value),
    contributions: []
  };
}

export function evaluateConfigurableScore(
  definition: ConfigurableCalculatorDefinition,
  values: ConfigurableCalculatorValues = {}
): ConfigurableCalculatorEvaluation {
  let value = finiteNumber(definition.basePoints, 0);
  const contributions: ConfigurableScoreContribution[] = [];

  for (const field of definition.fields || []) {
    if (!field || field.type === 'section') continue;
    let points = 0;
    let detail = 'Sin puntaje';
    const rawValue = values[field.key];

    if (field.type === 'checkbox') {
      if (isChecked(rawValue)) points = finiteNumber(field.checkedPoints, 0);
      detail = isChecked(rawValue) ? 'Marcado' : 'No marcado';
    } else if (field.type === 'select') {
      const selected = (field.options || []).find(
        (option) => String(option.value) === String(rawValue)
      );
      points = finiteNumber(selected?.points, 0);
      detail = selected?.label || 'Sin seleccion';
    } else if (field.type === 'number') {
      const rule = (field.scoreRules || []).find((candidate) => configurableRuleMatches(candidate, rawValue));
      points = finiteNumber(rule?.points, 0);
      detail = rule?.label || (rule ? 'Regla aplicada' : 'Sin regla coincidente');
    }

    value += points;
    contributions.push({ key: field.key, label: field.label, points, detail, rawValue });
  }

  return {
    value,
    range: matchingConfigurableRange(definition.ranges, value),
    contributions
  };
}

export function configurableRuleMatches(
  rule: ConfigurableScoreRule | null | undefined,
  rawValue: SafeExpressionVariable
): boolean {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return false;
  const candidate = rule?.operator;
  const operator: ConfigurableScoreOperator = SCORE_OPERATORS.has(candidate || '')
    ? (candidate as ConfigurableScoreOperator)
    : 'eq';
  const first = Number(rule?.value);
  const second = Number(rule?.max);
  if (!Number.isFinite(first)) return false;
  if (operator === 'lt') return value < first;
  if (operator === 'lte') return value <= first;
  if (operator === 'gte') return value >= first;
  if (operator === 'gt') return value > first;
  if (operator === 'between') return Number.isFinite(second) && value >= first && value <= second;
  return value === first;
}

export function matchingConfigurableRange(
  ranges: readonly ConfigurableCalculatorRange[] | null | undefined,
  value: number
): ConfigurableCalculatorRange | null {
  return (Array.isArray(ranges) ? ranges : []).find(
    (range) =>
      (range.min == null || value >= Number(range.min)) &&
      (range.max == null || value <= Number(range.max))
  ) || null;
}

function finiteNumber(value: NumericInput, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isChecked(value: SafeExpressionVariable): boolean {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
}
