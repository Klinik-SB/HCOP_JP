import {
  INSTITUTIONAL_CALCULATOR_LIMITS,
  InstitutionalCatalogIssueCode,
  InstitutionalCatalogValidationError,
  toInstitutionalCalculatorFactoryItem,
  toolConfigurationKey,
  validateInstitutionalCalculatorCatalog
} from './institutional-calculator-catalog.validator';
import { createInstitutionalCalculatorDefinition } from './institutional-calculator.factory';
import type { ValidatedInstitutionalCalculatorItem } from './institutional-calculator.factory';
import { PORTED_CALCULATORS } from './ported-calculator.registry';

type Test = { readonly name: string; readonly run: () => void };
const tests: Test[] = [];

function test(name: string, run: () => void): void { tests.push({ name, run }); }
function equal(actual: unknown, expected: unknown, message = ''): void {
  if (!Object.is(actual, expected)) throw new Error(message || `Esperado ${String(expected)}; recibido ${String(actual)}.`);
}
function deepEqual(actual: unknown, expected: unknown): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`Esperado ${right}; recibido ${left}.`);
}
function expectIssues(payload: unknown, ...codes: readonly InstitutionalCatalogIssueCode[]): InstitutionalCatalogValidationError {
  try {
    validateInstitutionalCalculatorCatalog(payload);
  } catch (error) {
    if (!(error instanceof InstitutionalCatalogValidationError)) throw error;
    for (const code of codes) {
      if (!error.issues.some((issue) => issue.code === code)) {
        throw new Error(`No se encontró ${code}: ${JSON.stringify(error.issues)}.`);
      }
    }
    return error;
  }
  throw new Error('El payload inválido fue aceptado.');
}

function formulaItem(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: '17',
    key: 'calculator:superficie-local',
    name: 'Superficie local',
    description: 'Definición institucional',
    revision: 3,
    definition: {
      mode: 'formula',
      category: 'general',
      fields: [
        { key: 'peso', label: 'Peso', type: 'number', min: '1', max: '300', step: '0.1', value: 70 },
        { key: 'altura', label: 'Altura', type: 'number', min: 20, max: 250, value: 170 }
      ],
      expression: 'sqrt(peso * altura / 3600)',
      decimals: 2,
      ranges: [{ min: null, max: 1.5, label: 'Baja', severity: 'warn' }]
    },
    ...overrides
  };
}

function catalog(calculators: readonly unknown[], settings: unknown = {}): Record<string, unknown> {
  return { ok: true, calculators, settings, total: calculators.length };
}

test('acepta instalación vacía y sintetiza settings seguros', () => {
  const result = validateInstitutionalCalculatorCatalog(catalog([]));
  equal(result.total, 0);
  deepEqual(result.settings.definition, { enabled: true, disabledBuiltInKeys: [] });
  equal(result.settings.revision, 0);
});

test('normaliza una fórmula válida sin ejecutar datos clínicos', () => {
  const result = validateInstitutionalCalculatorCatalog(catalog([formulaItem()]));
  const definition = result.calculators[0].definition;
  equal(definition.mode, 'formula');
  equal(definition.fields[0].min, 1);
  equal(definition.fields[0].step, 0.1);
  equal(definition.fields[0].required, true);
  equal(definition.ranges[0].severity, 'warn');
});

test('acepta score y override builtin existente', () => {
  const score = formulaItem({
    id: '18', key: 'calculator:score-local', name: 'Score local',
    definition: {
      mode: 'score', basePoints: -1, fields: [
        { key: 'criterio', label: 'Criterio', type: 'checkbox', checkedPoints: 2 },
        { key: 'grupo', label: 'Grupo', type: 'select', options: [
          { value: 'no', label: 'No', points: 0 }, { value: 'si', label: 'Sí', points: 1 }
        ] },
        { key: 'valor', label: 'Valor', type: 'number', scoreRules: [
          { operator: 'between', value: 1, max: 2, points: 3, label: 'Intermedio' }
        ] }
      ], ranges: [{ min: 0, max: 2, label: 'Bajo', severity: 'good' }]
    }
  });
  const builtin = formulaItem({
    id: '19', key: 'calculator-override:indice_de_masa_corporal', name: 'IMC institucional',
    definition: { mode: 'builtin', replacesBuiltInKey: 'indice_de_masa_corporal', fields: [] }
  });
  const result = validateInstitutionalCalculatorCatalog(catalog([score, builtin]));
  equal(result.calculators[0].definition.basePoints, -1);
  equal(result.calculators[0].definition.fields[0].required, true);
  equal(result.calculators[0].definition.fields[2].scoreRules[0].operator, 'between');
  equal(result.calculators[1].definition.mode, 'builtin');
});

test('el mapper omite límites nulos y entrega un contrato ejecutable a la factory', () => {
  const normalized = validateInstitutionalCalculatorCatalog(catalog([formulaItem()])).calculators[0];
  const factoryItem: ValidatedInstitutionalCalculatorItem | null = toInstitutionalCalculatorFactoryItem(normalized);
  if (!factoryItem) throw new Error('La fórmula validada no fue adaptada para la factory.');
  const first = factoryItem.definition.fields[0];
  const second = factoryItem.definition.fields[1];
  equal(first.min, 1);
  equal(first.max, 300);
  equal(first.step, 0.1);
  equal(second.min, 20);
  equal(second.max, 250);
  equal(Object.prototype.hasOwnProperty.call(second, 'step'), false);

  const noLimits = validateInstitutionalCalculatorCatalog(catalog([formulaItem({
    id: '24', key: 'calculator:no-limits',
    definition: { mode: 'formula', fields: [{ key: 'x', label: 'X', type: 'number' }], expression: 'x' }
  })])).calculators[0];
  const noLimitsItem = toInstitutionalCalculatorFactoryItem(noLimits);
  if (!noLimitsItem) throw new Error('La fórmula sin límites no fue adaptada para la factory.');
  const noLimitsField = noLimitsItem.definition.fields[0];
  equal(Object.prototype.hasOwnProperty.call(noLimitsField, 'min'), false);
  equal(Object.prototype.hasOwnProperty.call(noLimitsField, 'max'), false);
  equal(Object.prototype.hasOwnProperty.call(noLimitsField, 'step'), false);

  const score = formulaItem({
    id: '22', key: 'calculator:checkbox-factory', name: 'Checkbox factory',
    definition: {
      mode: 'score', fields: [{ key: 'criterio', label: 'Criterio', type: 'checkbox', checkedPoints: 2 }]
    }
  });
  const normalizedScore = validateInstitutionalCalculatorCatalog(catalog([score])).calculators[0];
  const scoreItem = toInstitutionalCalculatorFactoryItem(normalizedScore);
  if (!scoreItem) throw new Error('El score validado no fue adaptado para la factory.');
  equal(scoreItem.definition.fields[0].required, true);
  equal(createInstitutionalCalculatorDefinition(scoreItem).fields[0].required, false);

  const builtin = validateInstitutionalCalculatorCatalog(catalog([formulaItem({
    id: '23', key: 'calculator-override:imc-factory',
    definition: { mode: 'builtin', replacesBuiltInKey: 'indice_de_masa_corporal', fields: [] }
  })])).calculators[0];
  equal(toInstitutionalCalculatorFactoryItem(builtin), null);
});

test('settings valida booleano, formato y claves duplicadas', () => {
  const valid = validateInstitutionalCalculatorCatalog(catalog([], {
    id: '', key: 'default', name: 'Herramientas', description: '', revision: 0,
    definition: { enabled: false, disabledBuiltInKeys: ['indice_de_masa_corporal'] }
  }));
  equal(valid.settings.definition.enabled, false);
  expectIssues(catalog([], {
    id: '', key: 'default', name: 'Herramientas', revision: 0,
    definition: { enabled: 'si', disabledBuiltInKeys: ['bmi!', 'bmi!', 'bmi!'] }
  }), 'invalid-type', 'invalid-key', 'duplicate-key');
});

test('settings rechaza claves disabled bien formadas que no pertenecen a las 57 built-in', () => {
  expectIssues(catalog([], {
    id: '', key: 'default', name: 'Herramientas', description: '', revision: 0,
    definition: { enabled: true, disabledBuiltInKeys: ['clave_inexistente'] }
  }), 'unknown-override');
});

test('rechaza payload, total y metadatos operativos inválidos de forma atómica', () => {
  expectIssues([], 'invalid-payload');
  const payload = catalog([formulaItem({ id: 'x', key: 'índice', revision: 0 })]);
  payload['ok'] = false;
  payload['total'] = 9;
  expectIssues(payload, 'invalid-payload', 'invalid-total', 'invalid-key', 'invalid-number');
});

test('rechaza modos, tipos, operadores y severidades fuera de allowlist', () => {
  const item = formulaItem();
  item['definition'] = {
    mode: 'javascript', fields: [{ key: 'x', label: 'X', type: 'date', scoreRules: [
      { operator: 'javascript', value: 1, points: 1 }
    ] }], expression: 'x', ranges: [{ label: 'X', severity: 'critical' }]
  };
  expectIssues(catalog([item]), 'invalid-mode', 'invalid-field-type', 'invalid-operator', 'invalid-severity');
});

test('modo omitido conserva compatibilidad legacy y se normaliza como formula', () => {
  const item = formulaItem();
  item['definition'] = { fields: [{ key: 'x', label: 'X', type: 'number' }], expression: 'x + 1' };
  equal(validateInstitutionalCalculatorCatalog(catalog([item])).calculators[0].definition.mode, 'formula');
});

test('analiza sintaxis segura y rechaza variables o funciones desconocidas', () => {
  const unknown = formulaItem();
  unknown['definition'] = { fields: [{ key: 'x', label: 'X', type: 'number' }], expression: 'sqrt(x) + y' };
  expectIssues(catalog([unknown]), 'unknown-variable');

  const unsafe = formulaItem();
  unsafe['definition'] = { fields: [{ key: 'x', label: 'X', type: 'number' }], expression: 'constructor(x)' };
  expectIssues(catalog([unsafe]), 'invalid-expression');

  const character = formulaItem();
  character['definition'] = { fields: [{ key: 'x', label: 'X', type: 'number' }], expression: 'x;alert(1)' };
  expectIssues(catalog([character]), 'invalid-expression');
});

test('valida la aridad de todas las funciones permitidas', () => {
  const valid = formulaItem();
  valid['definition'] = {
    fields: [{ key: 'x', label: 'X', type: 'number' }],
    expression: 'min(x,1,2)+max(x)+pow(x,2)+abs(x)+sqrt(x)+round(x)+floor(x)+ceil(x)+log(x)+exp(x)'
  };
  equal(validateInstitutionalCalculatorCatalog(catalog([valid])).total, 1);

  for (const expression of [
    'min()', 'max()', 'pow(x)', 'pow(x,2,3)',
    'abs()', 'abs(x,2)', 'sqrt()', 'round(x,2)', 'floor()',
    'ceil(x,2)', 'log()', 'exp(x,2)'
  ]) {
    const invalid = formulaItem();
    invalid['definition'] = {
      fields: [{ key: 'x', label: 'X', type: 'number' }],
      expression
    };
    expectIssues(catalog([invalid]), 'invalid-expression');
  }
});

test('rechaza literales numericos que desbordan a infinito', () => {
  for (const expression of ['1e999 + x', '.1e999 + x']) {
    const item = formulaItem();
    item['definition'] = {
      fields: [{ key: 'x', label: 'X', type: 'number' }],
      expression
    };
    expectIssues(catalog([item]), 'invalid-expression');
  }
});

test('rechaza fórmula vacía, demasiado larga y anidamiento abusivo', () => {
  const empty = formulaItem();
  empty['definition'] = { fields: [{ key: 'x', label: 'X', type: 'number' }], expression: '' };
  expectIssues(catalog([empty]), 'required');

  const long = formulaItem();
  long['definition'] = { fields: [{ key: 'x', label: 'X', type: 'number' }], expression: `x+${'1'.repeat(INSTITUTIONAL_CALCULATOR_LIMITS.expressionLength)}` };
  expectIssues(catalog([long]), 'limit-exceeded');

  const deep = formulaItem();
  deep['definition'] = { fields: [{ key: 'x', label: 'X', type: 'number' }], expression: `${'('.repeat(129)}x${')'.repeat(129)}` };
  expectIssues(catalog([deep]), 'invalid-expression');
});

test('rechaza keys de campo inválidas y duplicadas', () => {
  const item = formulaItem();
  item['definition'] = {
    fields: [
      { key: '1peso', label: 'Peso', type: 'number' },
      { key: 'altura', label: 'Altura', type: 'number' },
      { key: 'altura', label: 'Altura repetida', type: 'number' }
    ], expression: 'altura'
  };
  expectIssues(catalog([item]), 'invalid-key', 'duplicate-key');
});

test('rechaza no finitos, min mayor a max, step no positivo y decimales fuera de 0..6', () => {
  const item = formulaItem();
  item['definition'] = {
    fields: [{ key: 'x', label: 'X', type: 'number', min: 5, max: 2, step: 0 }],
    expression: 'x', basePoints: Number.POSITIVE_INFINITY, decimals: 7,
    ranges: [{ min: 2, max: 1, label: 'Rango' }]
  };
  expectIssues(catalog([item]), 'invalid-number', 'invalid-range');
});

test('opciones comparadas como String no pueden colisionar', () => {
  const item = formulaItem();
  item['definition'] = {
    mode: 'score', fields: [{ key: 'x', label: 'X', type: 'select', options: [
      { value: 1, label: 'Uno' }, { value: '1', label: 'Uno texto' }
    ] }]
  };
  expectIssues(catalog([item]), 'duplicate-key');
});

test('between exige max y orden correcto', () => {
  const item = formulaItem();
  item['definition'] = {
    mode: 'score', fields: [{ key: 'x', label: 'X', type: 'number', scoreRules: [
      { operator: 'between', value: 5, points: 1 },
      { operator: 'between', value: 5, max: 2, points: 1 }
    ] }]
  };
  expectIssues(catalog([item]), 'required', 'invalid-range');
});

test('aplica límites de fields, options, rules y ranges sin recorrer el exceso', () => {
  const tooManyFields = formulaItem();
  tooManyFields['definition'] = {
    fields: Array.from({ length: 101 }, (_, index) => ({ key: `f_${index}`, label: `F ${index}`, type: 'number' })),
    expression: 'f_0'
  };
  expectIssues(catalog([tooManyFields]), 'limit-exceeded');

  const tooManyChildren = formulaItem();
  tooManyChildren['definition'] = {
    mode: 'score', fields: [
      { key: 's', label: 'S', type: 'select', options: Array.from({ length: 201 }, (_, index) => ({ value: `v${index}`, label: `V ${index}` })) },
      { key: 'n', label: 'N', type: 'number', scoreRules: Array.from({ length: 201 }, (_, index) => ({ operator: 'eq', value: index, points: index })) }
    ], ranges: Array.from({ length: 201 }, (_, index) => ({ min: index, max: index, label: `R ${index}` }))
  };
  const error = expectIssues(catalog([tooManyChildren]), 'limit-exceeded');
  equal(error.issues.filter((issue) => issue.code === 'limit-exceeded').length, 3);
});

test('rechaza override inexistente, builtin sin override y overrides duplicados', () => {
  const noTarget = formulaItem({ definition: {
    mode: 'builtin', replacesBuiltInKey: 'no_existe', fields: []
  } });
  expectIssues(catalog([noTarget]), 'unknown-override');

  const noKey = formulaItem({ definition: { mode: 'builtin', fields: [] } });
  expectIssues(catalog([noKey]), 'required');

  const first = formulaItem({ id: '20', key: 'calculator-override:bmi-a', definition: {
    mode: 'builtin', replacesBuiltInKey: 'indice_de_masa_corporal', fields: []
  } });
  const second = formulaItem({ id: '21', key: 'calculator-override:bmi-b', definition: {
    mode: 'formula', replacesBuiltInKey: 'indice_de_masa_corporal', fields: [{ key: 'x', label: 'X', type: 'number' }], expression: 'x'
  } });
  expectIssues(catalog([first, second]), 'duplicate-override');
});

test('override builtin sólo acepta campos de la regla original', () => {
  const item = formulaItem({ definition: {
    mode: 'builtin', replacesBuiltInKey: 'indice_de_masa_corporal',
    fields: [{ key: 'campo_inventado', label: 'Inventado', type: 'number' }]
  } });
  expectIssues(catalog([item]), 'unknown-variable');
});

test('rechaza ids y keys repetidas de items aun si PostgreSQL normalmente los impide', () => {
  const first = formulaItem();
  const second = formulaItem({ name: 'Otra' });
  expectIssues(catalog([first, second]), 'duplicate-key');
});

test('toolConfigurationKey conserva el algoritmo institucional y las 57 claves son únicas', () => {
  equal(toolConfigurationKey('Índice de masa corporal'), 'indice_de_masa_corporal');
  equal(toolConfigurationKey('Superficie corporal — Mosteller'), 'superficie_corporal_mosteller');
  equal(PORTED_CALCULATORS.length, 57);
  const keys = PORTED_CALCULATORS.map((definition) => toolConfigurationKey(definition.title));
  equal(new Set(keys).size, 57);
});

let failures = 0;
for (const entry of tests) {
  try {
    entry.run();
  } catch (error) {
    failures += 1;
    const message = error instanceof Error ? error.stack || error.message : String(error);
    console.error(`FAIL · ${entry.name}\n${message}`);
  }
}
if (failures) throw new Error(`${failures} de ${tests.length} pruebas fallaron.`);
console.log(`OK · ${tests.length} pruebas del catálogo institucional de calculadoras`);
