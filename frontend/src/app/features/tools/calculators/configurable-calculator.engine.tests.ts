import {
  ConfigurableCalculatorDefinition,
  ConfigurableCalculatorEvaluation,
  ConfigurableCalculatorRange,
  ConfigurableScoreRule,
  configurableRuleMatches,
  evaluateConfigurableCalculator,
  matchingConfigurableRange
} from './configurable-calculator.engine';
import {
  evaluateSafeExpression,
  SafeExpressionVariables
} from './safe-expression.engine';

declare function require(id: string): unknown;
declare const process: { readonly argv: readonly string[]; exitCode?: number };

interface FileSystemModule {
  readFileSync(path: string, encoding: 'utf8'): string;
}

interface VirtualMachineModule {
  createContext(context: object): object;
  runInContext(source: string, context: object, options?: { readonly filename?: string }): unknown;
}

interface LegacySafeExpression {
  evaluate(expression: string | null | undefined, variables?: SafeExpressionVariables): number;
}

interface LegacyCalculatorEngine {
  evaluate(
    definition: ConfigurableCalculatorDefinition | null | undefined,
    values?: SafeExpressionVariables
  ): ConfigurableCalculatorEvaluation;
  matchingRange(ranges: readonly ConfigurableCalculatorRange[] | null | undefined, value: number): ConfigurableCalculatorRange | null;
  ruleMatches(rule: ConfigurableScoreRule | null | undefined, value: string | number | boolean | null | undefined): boolean;
}

interface CapturedValue {
  readonly status: 'value';
  readonly value: unknown;
}

interface CapturedError {
  readonly status: 'error';
  readonly name: string;
  readonly message: string;
}

type Captured = CapturedValue | CapturedError;

const fs = require('fs') as FileSystemModule;
const vm = require('vm') as VirtualMachineModule;
const [, , legacyExpressionPath, legacyCalculatorPath, portedExpressionPath, portedCalculatorPath] = process.argv;

if (!legacyExpressionPath || !legacyCalculatorPath || !portedExpressionPath || !portedCalculatorPath) {
  throw new Error('Faltan las rutas de los motores legacy y portados.');
}

const legacyContext: Record<string, unknown> = {};
legacyContext['window'] = legacyContext;
legacyContext['globalThis'] = legacyContext;
vm.createContext(legacyContext);
vm.runInContext(fs.readFileSync(legacyExpressionPath, 'utf8'), legacyContext, { filename: legacyExpressionPath });
vm.runInContext(fs.readFileSync(legacyCalculatorPath, 'utf8'), legacyContext, { filename: legacyCalculatorPath });

const legacyExpression = legacyContext['SafeExpression'] as LegacySafeExpression;
const legacyCalculator = legacyContext['CalculatorEngine'] as LegacyCalculatorEngine;
let assertions = 0;

function capture(operation: () => unknown): Captured {
  try {
    return { status: 'value', value: operation() };
  } catch (error) {
    const candidate = error as { name?: unknown; message?: unknown };
    return {
      status: 'error',
      name: String(candidate?.name || 'Error'),
      message: String(candidate?.message || error)
    };
  }
}

function fail(message: string): never {
  throw new Error(message);
}

function assert(condition: unknown, message: string): void {
  assertions += 1;
  if (!condition) fail(message);
}

function assertEquivalent(actual: unknown, expected: unknown, path = 'value'): void {
  if (typeof actual === 'number' || typeof expected === 'number') {
    assert(typeof actual === 'number' && typeof expected === 'number' && Object.is(actual, expected), `${path}: numero diferente (${String(actual)} != ${String(expected)}).`);
    return;
  }
  if (actual === null || expected === null || typeof actual !== 'object' || typeof expected !== 'object') {
    assert(actual === expected, `${path}: valor diferente (${String(actual)} != ${String(expected)}).`);
    return;
  }
  if (Array.isArray(actual) || Array.isArray(expected)) {
    assert(Array.isArray(actual) && Array.isArray(expected), `${path}: estructura de lista diferente.`);
    const left = actual as readonly unknown[];
    const right = expected as readonly unknown[];
    assert(left.length === right.length, `${path}: longitud diferente (${left.length} != ${right.length}).`);
    for (let index = 0; index < left.length; index += 1) {
      assertEquivalent(left[index], right[index], `${path}[${index}]`);
    }
    return;
  }
  const left = actual as Readonly<Record<string, unknown>>;
  const right = expected as Readonly<Record<string, unknown>>;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  assertEquivalent(leftKeys, rightKeys, `${path}.keys`);
  for (const key of leftKeys) assertEquivalent(left[key], right[key], `${path}.${key}`);
}

function assertCapturedEquivalent(actual: Captured, expected: Captured, label: string): void {
  assert(actual.status === expected.status, `${label}: uno devolvio valor y el otro error.`);
  if (actual.status === 'error' && expected.status === 'error') {
    assert(actual.name === expected.name, `${label}: tipo de error diferente.`);
    assert(actual.message === expected.message, `${label}: mensaje diferente (${actual.message} != ${expected.message}).`);
    return;
  }
  if (actual.status === 'value' && expected.status === 'value') {
    assertEquivalent(actual.value, expected.value, label);
  }
}

function compareExpression(expression: string, variables: SafeExpressionVariables = {}): void {
  assertCapturedEquivalent(
    capture(() => evaluateSafeExpression(expression, variables)),
    capture(() => legacyExpression.evaluate(expression, variables)),
    `formula ${JSON.stringify(expression)}`
  );
}

function compareCalculator(definition: ConfigurableCalculatorDefinition, values: SafeExpressionVariables): void {
  assertCapturedEquivalent(
    capture(() => evaluateConfigurableCalculator(definition, values)),
    capture(() => legacyCalculator.evaluate(definition, values)),
    `calculadora ${definition.mode || 'formula'}`
  );
}

const directExpressions: readonly [string, SafeExpressionVariables][] = [
  ['2 + 3 * 4', {}],
  ['(2 + 3) * 4', {}],
  ['2 ^ 3 ^ 2', {}],
  ['-2 ^ 2', {}],
  ['--2 + +3', {}],
  ['.5 + 1. + 2e-3', {}],
  ['x + y + z', { x: true, y: false, z: '2.5' }],
  ['x + y', { x: null, y: '' }],
  ['ABS(-4) + sqrt(9)', {}],
  ['round(2.5) + floor(2.9) + ceil(2.1)', {}],
  ['min(7, 2, 5) + max(1, 9, 3)', {}],
  ['pow(2, 5) + log(exp(3))', {}],
  ['17 % 5', {}],
  ['1 / 0', {}],
  ['', {}],
  ['missing + 1', {}],
  ['sqrt(-1)', {}],
  ['min()', {}],
  ['unknown(1)', {}],
  ['1 2', {}],
  ['pow(2,)', {}],
  ['(1 + 2', {}]
];

for (const [expression, variables] of directExpressions) compareExpression(expression, variables);

const numericValues = [-3, -1, 0, 0.5, 2, 7] as const;
const generatedExpressions = [
  'x+y*z',
  '(x+y)*z',
  'x-y-z',
  'x/(y+z)',
  'x%y',
  'pow(abs(x),2)+sqrt(abs(y))',
  'min(x,y,z)',
  'max(x,y,z)',
  'round(x/y)+ceil(z/2)-floor(y/2)',
  'x^2+y^2-z^2',
  'exp(x/10)-log(abs(y)+1)'
] as const;

for (const x of numericValues) {
  for (const y of numericValues) {
    for (const z of numericValues) {
      const values = { x, y, z };
      for (const expression of generatedExpressions) compareExpression(expression, values);
    }
  }
}

const formulaDefinition: ConfigurableCalculatorDefinition = {
  mode: 'formula',
  expression: 'sqrt(peso * altura / 3600)',
  ranges: [
    { max: 1.49, label: 'Baja', severity: 'warn' },
    { min: 1.5, max: 2, label: 'Habitual', severity: 'good' },
    { min: 2.01, label: 'Alta', severity: 'info' }
  ]
};
for (const peso of [0, 45, 70, 120]) {
  for (const altura of [100, 160, 180, 220]) compareCalculator(formulaDefinition, { peso, altura });
}

const scoreDefinition: ConfigurableCalculatorDefinition = {
  mode: 'score',
  basePoints: '1',
  fields: [
    { key: 'heading', label: 'Seccion', type: 'section' },
    { key: 'fragility', label: 'Fragilidad', type: 'checkbox', checkedPoints: '2' },
    {
      key: 'response',
      label: 'Respuesta',
      type: 'select',
      options: [
        { value: 'no', label: 'No', points: 0 },
        { value: 'partial', label: 'Parcial', points: '2' },
        { value: 'yes', label: 'Completa', points: 4 }
      ]
    },
    {
      key: 'age',
      label: 'Edad',
      type: 'number',
      scoreRules: [
        { operator: 'lt', value: 40, points: -1, label: 'Menor de 40' },
        { operator: 'between', value: 40, max: 64, points: 1, label: '40 a 64' },
        { operator: 'gte', value: 65, points: 3, label: '65 o mas' }
      ]
    },
    { key: 'comment', label: 'Comentario', type: 'text' }
  ],
  ranges: [
    { max: 2, label: 'Bajo', severity: 'good' },
    { min: 3, max: 6, label: 'Intermedio', severity: 'warn' },
    { min: 7, label: 'Alto', severity: 'bad' }
  ]
};

const checkedValues = [true, false, 1, 0, '1', '0', 'true', 'false', 'on', '', null, undefined] as const;
const responses = ['no', 'partial', 'yes', 'missing', '', null, undefined] as const;
const ages = [-1, 39.9, 40, 64, 64.1, 65, 99, '', 'abc', null, undefined] as const;
for (const fragility of checkedValues) {
  for (const response of responses) {
    for (const age of ages) compareCalculator(scoreDefinition, { fragility, response, age });
  }
}

const rules: readonly ConfigurableScoreRule[] = [
  { operator: 'lt', value: 2 },
  { operator: 'lte', value: 2 },
  { operator: 'eq', value: 2 },
  { operator: 'gte', value: 2 },
  { operator: 'gt', value: 2 },
  { operator: 'between', value: -1, max: 2 },
  { operator: 'between', value: -1, max: undefined },
  { operator: 'not-supported', value: 2 },
  { value: null }
];
for (const rule of rules) {
  for (const value of [-2, -1, 0, 2, 3, '2', '', 'abc', true, false, null, undefined] as const) {
    assertEquivalent(
      configurableRuleMatches(rule, value),
      legacyCalculator.ruleMatches(rule, value),
      `regla ${String(rule.operator)} ${String(value)}`
    );
  }
}

const ranges: readonly ConfigurableCalculatorRange[] = [
  { min: null, max: -1, label: 'negativo' },
  { min: 0, max: 10, label: 'central' },
  { min: 10, max: null, label: 'superior' }
];
for (const value of [-100, -1, 0, 9.99, 10, 11, 100]) {
  assertEquivalent(
    matchingConfigurableRange(ranges, value),
    legacyCalculator.matchingRange(ranges, value),
    `rango ${value}`
  );
}

for (const source of [
  'globalThis.__hcopInjected = 1',
  'window.__hcopInjected = 1',
  'constructor.constructor("return 1")()',
  'x.__proto__',
  'x["constructor"]',
  '1;2',
  '<img src=x onerror=alert(1)>',
  'Math.max(1,2)',
  'alert(1)'
]) {
  compareExpression(source, { x: 1 });
  assert(capture(() => evaluateSafeExpression(source, { x: 1 })).status === 'error', `La inyeccion ${source} no fue rechazada.`);
}
assert(legacyContext['__hcopInjected'] === undefined, 'El corpus de inyeccion altero el contexto legacy.');

const inherited = Object.create({ inherited: 7 }) as Record<string, string | number>;
inherited['own'] = 3;
compareExpression('own + 1', inherited);
compareExpression('inherited + 1', inherited);

for (const path of [portedExpressionPath, portedCalculatorPath]) {
  const source = fs.readFileSync(path, 'utf8');
  assert(!/\beval\s*\(/.test(source), `${path} usa eval.`);
  assert(!/\bnew\s+Function\b|\bFunction\s*\(/.test(source), `${path} usa Function dinamica.`);
  assert(!/\.innerHTML\b/.test(source), `${path} usa innerHTML.`);
}

console.log(`OK · ${assertions} aserciones · parser y motor configurable equivalentes al legacy`);
