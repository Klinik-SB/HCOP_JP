import {
  CalculatorDefinition,
  CalculatorEvaluation,
  CalculatorField,
  CalculatorInput,
  CalculatorResult,
  CalculatorValidationIssue,
  CalculatorValue,
  CalculatorValues
} from './calculator.models';

export function defineCalculator<const TId extends string>(
  definition: CalculatorDefinition<TId>
): CalculatorDefinition<TId> {
  if (!definition.id.trim()) throw new Error('La calculadora necesita un ID estable.');
  const fieldIds = new Set<string>();
  for (const field of definition.fields) {
    if (!field.id.trim()) throw new Error(`La calculadora ${definition.id} contiene un campo sin ID.`);
    if (fieldIds.has(field.id)) throw new Error(`Campo duplicado en ${definition.id}: ${field.id}.`);
    fieldIds.add(field.id);
    if (field.kind === 'select' && new Set(field.options.map((option) => option.value)).size !== field.options.length) {
      throw new Error(`El campo ${field.id} de ${definition.id} contiene opciones duplicadas.`);
    }
  }
  return definition;
}

export function evaluateCalculator(
  definition: CalculatorDefinition,
  input: CalculatorInput = {}
): CalculatorEvaluation {
  const values: Record<string, CalculatorValue> = {};
  const normalizedIssues = new Map<string, CalculatorValidationIssue>();
  const missing: CalculatorValidationIssue[] = [];
  const invalid: CalculatorValidationIssue[] = [];

  for (const field of definition.fields) {
    const supplied = Object.prototype.hasOwnProperty.call(input, field.id);
    const normalized = normalizeField(field, input[field.id], supplied);
    values[field.id] = normalized.value;
    if (normalized.issue) normalizedIssues.set(field.id, normalized.issue);
  }

  for (const field of definition.fields) {
    if (field.kind === 'section' || definition.isFieldValidationActive?.(field.id, values) === false) continue;
    if (isMissing(field, values[field.id] ?? '')) {
      missing.push(issue(field, 'required', `Complete ${field.label}.`));
    }
    const normalizedIssue = normalizedIssues.get(field.id);
    if (normalizedIssue) invalid.push(normalizedIssue);
  }

  if (missing.length) {
    return {
      status: 'invalid',
      values,
      issues: missing,
      result: {
        title: 'Faltan datos para calcular',
        detail: `Completá: ${missing.map((entry) => entry.label).join(', ')}.`,
        badge: 'datos incompletos',
        score: 0,
        showScore: false,
        severity: 'warn',
        metrics: [],
        notes: []
      }
    };
  }

  if (invalid.length) {
    return {
      status: 'invalid',
      values,
      issues: invalid,
      result: {
        title: 'Revisá los valores ingresados',
        detail: uniqueLabels(invalid).join(', '),
        badge: 'valor inválido',
        score: 0,
        showScore: false,
        severity: 'warn',
        metrics: [],
        notes: []
      }
    };
  }

  return {
    status: 'calculated',
    values,
    issues: [],
    result: definition.calculate(values)
  };
}

export function numberValue(values: CalculatorValues, fieldId: string, fallback = 0): number {
  const value = values[fieldId];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function stringValue(values: CalculatorValues, fieldId: string): string {
  const value = values[fieldId];
  return typeof value === 'string' ? value : '';
}

export function booleanValue(values: CalculatorValues, fieldId: string): boolean {
  return values[fieldId] === true;
}

interface NormalizedField {
  readonly value: CalculatorValue;
  readonly issue?: CalculatorValidationIssue;
}

function normalizeField(field: CalculatorField, rawValue: unknown, supplied: boolean): NormalizedField {
  if (!supplied) return { value: field.initialValue };
  if (field.kind === 'section') return { value: '' };
  if (field.kind === 'checkbox') return { value: normalizeBoolean(rawValue, false) };
  if (field.kind === 'select') {
    const value = rawValue === null || rawValue === undefined ? '' : String(rawValue).trim();
    if (value && !field.options.some((option) => option.value === value)) {
      return { value, issue: issue(field, 'unknown-option', `${field.label} no contiene una opción válida.`) };
    }
    return { value };
  }

  if (rawValue === null || rawValue === undefined || rawValue === '') return { value: '' };
  if (typeof rawValue === 'string' && !rawValue.trim()) return { value: '' };
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return { value: '', issue: issue(field, 'not-a-number', `${field.label} debe ser numérico.`) };
  }
  if (field.min !== undefined && value < field.min) {
    return { value, issue: issue(field, 'below-minimum', `${field.label} debe ser mayor o igual que ${field.min}.`) };
  }
  if (field.max !== undefined && value > field.max) {
    return { value, issue: issue(field, 'above-maximum', `${field.label} debe ser menor o igual que ${field.max}.`) };
  }
  if (field.step !== undefined && field.step > 0 && hasStepMismatch(value, field.min ?? 0, field.step)) {
    return { value, issue: issue(field, 'step-mismatch', `${field.label} no respeta el incremento ${field.step}.`) };
  }
  return { value };
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return fallback;
}

function isMissing(field: CalculatorField, value: CalculatorValue): boolean {
  if (!field.required) return false;
  if (field.kind === 'checkbox') return value !== true;
  return value === '';
}

function hasStepMismatch(value: number, base: number, step: number): boolean {
  const quotient = (value - base) / step;
  const tolerance = 1e-9 * Math.max(1, Math.abs(quotient));
  return Math.abs(quotient - Math.round(quotient)) > tolerance;
}

function issue(
  field: CalculatorField,
  code: CalculatorValidationIssue['code'],
  message: string
): CalculatorValidationIssue {
  return { fieldId: field.id, label: field.label, code, message };
}

function uniqueLabels(issues: readonly CalculatorValidationIssue[]): string[] {
  return [...new Set(issues.map((entry) => entry.label))];
}

export function result(value: CalculatorResult): CalculatorResult {
  return value;
}
