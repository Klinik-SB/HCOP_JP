import { CalculatorDefinition, CalculatorResult } from './calculator.models';
import {
  ValidatedInstitutionalCalculatorDefinition,
  ValidatedInstitutionalCalculatorItem,
  createInstitutionalCalculatorDefinition
} from './institutional-calculator.factory';

interface TestCase {
  readonly name: string;
  readonly run: () => void;
}

const tests: TestCase[] = [];
let assertions = 0;

function test(name: string, run: () => void): void {
  tests.push({ name, run });
}

function equal(actual: unknown, expected: unknown, message = ''): void {
  assertions += 1;
  if (!Object.is(actual, expected)) {
    throw new Error(`${message ? `${message}: ` : ''}esperado ${String(expected)}, recibido ${String(actual)}.`);
  }
}

function deepEqual(actual: unknown, expected: unknown, message = ''): void {
  assertions += 1;
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`${message ? `${message}: ` : ''}esperado ${right}, recibido ${left}.`);
}

test('custom formula preserves legacy metadata, empty controls, examples and placeholders', () => {
  const tool = createInstitutionalCalculatorDefinition(formulaItem());
  equal(tool.id, 'config-42');
  equal(tool.title, 'Dosis institucional');
  equal(tool.shortTitle, 'Dosis institucional');
  equal(tool.subtitle, 'Uso institucional');
  equal(tool.category, 'farmacia');
  equal(tool.source, 'Comite local · version 3');
  equal(tool.clinicalUse, 'Uso institucional');
  deepEqual(tool.fields, [
    { id: 'heading', label: 'Datos', help: undefined, kind: 'section', required: false, initialValue: '' },
    { id: 'weight', label: 'Peso', help: 'Peso actual', kind: 'number', required: true, initialValue: '',
      unit: 'kg', min: 1, max: 300, step: 0.1, exampleValue: 70 },
    { id: 'method', label: 'Metodo', help: undefined, kind: 'select', required: true, initialValue: '', options: [
      { value: 'a', label: 'A' }, { value: 'b', label: 'B' }
    ] },
    { id: 'scenario', label: 'Escenario', help: undefined, kind: 'select', required: true, initialValue: 'b', options: [
      { value: 'a', label: 'A' }, { value: 'b', label: 'B' }
    ] },
    { id: 'confirm', label: 'Confirmar', help: undefined, kind: 'checkbox', required: false, initialValue: false },
    { id: 'comment', label: 'Comentario', help: undefined, kind: 'text', required: false, initialValue: '', placeholder: 'Ej.: ejemplo' },
    { id: 'detail', label: 'Detalle', help: undefined, kind: 'textarea', required: false, initialValue: '', placeholder: 'texto largo', rows: 4 }
  ]);
});

test('formula result matches the legacy presentation contract', () => {
  const output = createInstitutionalCalculatorDefinition(formulaItem()).calculate({
    heading: '', weight: 12.345, method: 'a', scenario: 'b', confirm: false, comment: '', detail: ''
  });
  deepEqual(output, {
    title: 'Dosis: 24.69 mg',
    detail: 'Habitual',
    badge: 'calculadora configurable',
    score: 0,
    showScore: false,
    severity: 'good',
    metrics: [{ label: 'Dosis', value: '24.69 mg' }],
    notes: ['Validar indicacion.', 'Formula versionada: weight * 2']
  });
});

test('a formula range with an unknown severity is forced to info', () => {
  const item = formulaItem({
    ranges: [{ min: 0, label: 'Clasificacion local', severity: 'critical' }]
  });
  const output = createInstitutionalCalculatorDefinition(item).calculate({ weight: 1 });
  equal(output.detail, 'Clasificacion local');
  equal(output.severity, 'info');
});

test('score exposes only the first eight non-zero contributions', () => {
  const fields = Array.from({ length: 11 }, (_, index) => ({
    key: `criterion_${index + 1}`,
    label: `Criterio ${index + 1}`,
    type: 'checkbox' as const,
    required: true,
    checkedPoints: index === 1 ? 0 : index === 2 ? -2 : index + 1
  }));
  const definition: ValidatedInstitutionalCalculatorDefinition = {
    mode: 'score', fields, basePoints: 1, decimals: 9,
    resultLabel: 'Puntaje', resultUnit: 'pts', notes: ['Nota institucional'],
    ranges: [{ min: 1, label: 'Rango activo', severity: 'bad' }]
  };
  const item = itemWith(definition, { id: 'score-1', name: 'Score institucional' });
  const values = Object.fromEntries(fields.map((field) => [field.key, true]));
  const output = createInstitutionalCalculatorDefinition(item).calculate(values);

  equal(output.title, 'Puntaje: 60.000000 pts');
  equal(output.badge, 'score configurable');
  equal(output.detail, 'Rango activo');
  equal(output.severity, 'bad');
  equal(output.metrics.length, 9);
  deepEqual(output.metrics, [
    { label: 'Puntaje', value: '60.000000 pts' },
    { label: 'Criterio 1', value: '+1' },
    { label: 'Criterio 3', value: '-2' },
    { label: 'Criterio 4', value: '+4' },
    { label: 'Criterio 5', value: '+5' },
    { label: 'Criterio 6', value: '+6' },
    { label: 'Criterio 7', value: '+7' },
    { label: 'Criterio 8', value: '+8' },
    { label: 'Criterio 9', value: '+9' }
  ]);
  deepEqual(output.notes, ['Nota institucional', 'Puntajes y reglas guardados en la version activa.']);
});

test('replacement keeps the original id and array position without reusing its engine', () => {
  const original = fakeOriginal('protected-id');
  const before = JSON.stringify(original);
  const replacement = createInstitutionalCalculatorDefinition(formulaItem(), original);
  equal(replacement.id, 'protected-id');
  equal(replacement.calculate === original.calculate, false);
  equal(JSON.stringify(original), before);

  const first = fakeOriginal('first');
  const third = fakeOriginal('third');
  const ordered = [first, replacement, third];
  deepEqual(ordered.map((entry) => entry.id), ['first', 'protected-id', 'third']);
});

test('fallback copy and decimal lower clamp match the legacy adapter', () => {
  const item = itemWith({
    mode: 'formula', fields: [{ key: 'x', label: 'X', type: 'number', required: true }],
    expression: 'x / 3', decimals: -5
  }, { name: 'Sin metadatos', description: '' });
  const tool = createInstitutionalCalculatorDefinition(item);
  equal(tool.subtitle, 'Calculadora configurada localmente.');
  equal(tool.category, 'general');
  equal(tool.source, 'Definicion local · version 1');
  equal(tool.clinicalUse, 'Herramienta configurada localmente. Verifique la definicion y la fuente antes de usar el resultado.');
  const output = tool.calculate({ x: 2 });
  equal(output.title, 'Resultado: 1');
  equal(output.detail, 'Resultado calculado con la definicion local activa.');
  deepEqual(output.notes, ['Formula versionada: x / 3']);
});

test('scenario uses the first option when its configured value does not exist', () => {
  const item = itemWith({
    mode: 'formula', expression: '1', fields: [{
      key: 'scenario', label: 'Escenario', type: 'select', required: true, value: 'missing',
      options: [{ value: 'first', label: 'Primero' }, { value: 'second', label: 'Segundo' }]
    }]
  });
  const field = createInstitutionalCalculatorDefinition(item).fields[0];
  equal(field?.kind, 'select');
  equal(field?.initialValue, 'first');
});

function formulaItem(
  override: Partial<ValidatedInstitutionalCalculatorDefinition> = {}
): ValidatedInstitutionalCalculatorItem {
  const definition: ValidatedInstitutionalCalculatorDefinition = {
    mode: 'formula',
    category: 'farmacia',
    source: 'Comite local',
    clinicalUse: 'Uso institucional',
    expression: 'weight * 2',
    decimals: 2,
    resultLabel: 'Dosis',
    resultUnit: 'mg',
    notes: ['Validar indicacion.'],
    fields: [
      { key: 'heading', label: 'Datos', type: 'section', required: false },
      { key: 'weight', label: 'Peso', type: 'number', required: true, value: 70,
        min: 1, max: 300, step: 0.1, unit: 'kg', help: 'Peso actual' },
      { key: 'method', label: 'Metodo', type: 'select', required: true, value: 'b', options: [
        { value: 'a', label: 'A' }, { value: 'b', label: 'B' }
      ] },
      { key: 'scenario', label: 'Escenario', type: 'select', required: true, value: 'b', options: [
        { value: 'a', label: 'A' }, { value: 'b', label: 'B' }
      ] },
      { key: 'confirm', label: 'Confirmar', type: 'checkbox', required: true },
      { key: 'comment', label: 'Comentario', type: 'text', required: false, value: 'ejemplo' },
      { key: 'detail', label: 'Detalle', type: 'textarea', required: false, value: 'texto largo' }
    ],
    ranges: [{ min: 20, max: 30, label: 'Habitual', severity: 'good' }],
    ...override
  };
  return itemWith(definition, {
    id: '42', name: 'Dosis institucional', description: 'Uso institucional', revision: 3
  });
}

function itemWith(
  definition: ValidatedInstitutionalCalculatorDefinition,
  copy: Partial<Omit<ValidatedInstitutionalCalculatorItem, 'definition'>> = {}
): ValidatedInstitutionalCalculatorItem {
  return {
    id: copy.id || '1',
    name: copy.name || 'Calculadora local',
    description: copy.description || '',
    revision: copy.revision ?? 1,
    definition
  };
}

function fakeOriginal(id: string): CalculatorDefinition {
  return {
    id, title: `Original ${id}`, category: 'general', subtitle: 'Original', source: 'Original',
    clinicalUse: 'Original', fields: [], calculate: () => fixedResult()
  };
}

function fixedResult(): CalculatorResult {
  return {
    title: 'Original', detail: 'Original', badge: 'original', score: 0, showScore: false,
    severity: 'info', metrics: [], notes: []
  };
}

const failures: string[] = [];
for (const entry of tests) {
  try {
    entry.run();
  } catch (failure) {
    failures.push(`${entry.name}: ${failure instanceof Error ? failure.message : String(failure)}`);
  }
}
if (failures.length) throw new Error(`Fallaron ${failures.length}/${tests.length} pruebas:\n${failures.join('\n')}`);
console.log(`OK · ${tests.length} pruebas · ${assertions} aserciones de la factory institucional`);
