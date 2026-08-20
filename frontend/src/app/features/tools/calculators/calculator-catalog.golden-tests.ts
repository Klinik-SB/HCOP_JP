import {
  calculatorConfigurationKey,
  mergeInstitutionalBuiltIns,
  normalizeInstitutionalCalculatorCatalog
} from './calculator-catalog.adapter';
import { CalculatorDefinition, CalculatorResult } from './calculator.models';

interface GoldenTest {
  readonly name: string;
  readonly run: () => void;
}

const tests: GoldenTest[] = [];

function test(name: string, run: () => void): void {
  tests.push({ name, run });
}

test('normalizer rejects malformed rows and never trusts the declared total', () => {
  const catalog = normalizeInstitutionalCalculatorCatalog({
    ok: true,
    total: 99,
    calculators: [
      { id: '17', key: 'calculator:one', name: 'Institucional', revision: '4', description: 'Local',
        definition: { mode: 'builtin', expression: 'preserved', fields: [{ key: 'weight', label: 'Peso local' }] } },
      { id: '', key: 'broken', name: 'Invalida', definition: {} },
      null
    ],
    settings: {
      id: '8', key: 'tools-main', name: 'Herramientas', revision: 2,
      definition: { disabledBuiltInKeys: ['indice_uno', ' indice_uno ', '', 7] }
    }
  });

  equal(catalog.ok, true);
  equal(catalog.total, 1);
  equal(catalog.calculators[0]?.revision, 4);
  equal(catalog.calculators[0]?.definition['expression'], 'preserved');
  deepEqual(catalog.settings.definition.disabledBuiltInKeys, ['indice_uno']);
});

test('normalizer produces a safe empty catalog from arbitrary input', () => {
  deepEqual(normalizeInstitutionalCalculatorCatalog('invalid'), {
    ok: false,
    calculators: [],
    settings: {
      id: '', key: '', name: '', description: '', revision: 0,
      definition: { disabledBuiltInKeys: [] }
    },
    total: 0
  });
});

test('configuration keys match the legacy accent and punctuation contract', () => {
  equal(calculatorConfigurationKey('Índice — Uno'), 'indice_uno');
  equal(calculatorConfigurationKey('  Dosis / fracción (EQD2)  '), 'dosis_fraccion_eqd2');
  equal(calculatorConfigurationKey('A'.repeat(100)), 'a'.repeat(80));
});

test('disabled built-ins disappear without mutating the source collection', () => {
  const first = fakeCalculator('one', 'Índice — Uno');
  const second = fakeCalculator('two', 'Segundo');
  const source = [first, second] as const;
  const catalog = normalizeInstitutionalCalculatorCatalog({
    ok: true,
    calculators: [],
    settings: { definition: { disabledBuiltInKeys: ['indice_uno'] } }
  });

  const merged = mergeInstitutionalBuiltIns(source, catalog);
  deepEqual(merged.map((entry) => entry.id), ['two']);
  deepEqual(source.map((entry) => entry.id), ['one', 'two']);
});

test('builtin override changes presentation but preserves the protected engine and field contract', () => {
  const original = fakeCalculator('one', 'Índice — Uno');
  const calculate = original.calculate;
  const catalog = normalizeInstitutionalCalculatorCatalog({
    ok: true,
    calculators: [{
      id: '17', key: 'calculator-override:indice_uno', name: 'Índice institucional',
      description: 'Descripción institucional', revision: 6,
      definition: {
        mode: 'builtin', replacesBuiltInKey: 'indice_uno', category: 'local', source: 'Comité',
        clinicalUse: 'Uso aprobado', fields: [
          { key: 'weight', label: 'Peso actual', help: 'Medir hoy', unit: 'lb', type: 'text', min: 999 },
          { key: 'method', label: 'Método local', options: [
            { value: 'b', label: 'Opción B local' },
            { value: 'invented', label: 'No debe agregarse' }
          ] },
          { key: 'flag', label: 'Confirmación local', help: 'Marcar si corresponde' }
        ]
      }
    }],
    settings: { definition: { disabledBuiltInKeys: [] } }
  });

  const merged = mergeInstitutionalBuiltIns([original], catalog);
  const result = merged[0];
  equal(result?.title, 'Índice institucional');
  equal(result?.shortTitle, 'Índice institucional');
  equal(result?.subtitle, 'Descripción institucional');
  equal(result?.category, 'local');
  equal(result?.source, 'Comité · personalizacion local v6');
  equal(result?.clinicalUse, 'Uso aprobado');
  equal(result?.calculate, calculate);
  equal(result?.fields[0]?.kind, 'number');
  equal(result?.fields[0]?.id, 'weight');
  equal(result?.fields[0]?.label, 'Peso actual');
  equal(result?.fields[0]?.kind === 'number' ? result.fields[0].unit : '', 'lb');
  equal(result?.fields[0]?.kind === 'number' ? result.fields[0].min : 0, 1);
  deepEqual(result?.fields[1]?.kind === 'select' ? result.fields[1].options : [], [
    { value: 'a', label: 'Opción A' },
    { value: 'b', label: 'Opción B local' }
  ]);
  equal(result?.fields[2]?.label, 'Confirmación local');
  equal(result?.fields[2]?.help, 'Marcar si corresponde');
  equal(original.fields[0]?.label, 'Peso');
});

test('formula and score replacements remain inert until their safe Angular engine exists', () => {
  const original = fakeCalculator('one', 'Índice — Uno');
  const catalog = normalizeInstitutionalCalculatorCatalog({
    ok: true,
    calculators: [
      { id: '1', key: 'formula', name: 'Formula', revision: 1,
        definition: { mode: 'formula', replacesBuiltInKey: 'indice_uno', expression: 'weight*2' } },
      { id: '2', key: 'score', name: 'Score nuevo', revision: 1,
        definition: { mode: 'score', fields: [] } }
    ],
    settings: { definition: { disabledBuiltInKeys: [] } }
  });

  const merged = mergeInstitutionalBuiltIns([original], catalog);
  equal(merged.length, 1);
  equal(merged[0], original);
  equal(merged[0]?.calculate, original.calculate);
});

test('disabled setting has precedence over an otherwise valid builtin override', () => {
  const original = fakeCalculator('one', 'Índice — Uno');
  const catalog = normalizeInstitutionalCalculatorCatalog({
    ok: true,
    calculators: [{ id: '1', key: 'override', name: 'Oculta', revision: 1,
      definition: { mode: 'builtin', replacesBuiltInKey: 'indice_uno' } }],
    settings: { definition: { disabledBuiltInKeys: ['indice_uno'] } }
  });
  equal(mergeInstitutionalBuiltIns([original], catalog).length, 0);
});

function fakeCalculator(id: string, title: string): CalculatorDefinition {
  return {
    id,
    title,
    shortTitle: title,
    category: 'general',
    subtitle: 'Original',
    source: 'Fuente original',
    clinicalUse: 'Uso original',
    fields: [
      { id: 'weight', kind: 'number', label: 'Peso', required: true, initialValue: '',
        exampleValue: 70, unit: 'kg', min: 1, max: 300, step: 0.1 },
      { id: 'method', kind: 'select', label: 'Método', required: true, initialValue: '', options: [
        { value: 'a', label: 'Opción A' }, { value: 'b', label: 'Opción B' }
      ] },
      { id: 'flag', kind: 'checkbox', label: 'Confirmación', required: false, initialValue: false }
    ],
    calculate: () => fixedResult()
  };
}

function fixedResult(): CalculatorResult {
  return {
    title: 'Resultado', detail: 'Original', badge: 'original', score: 0,
    showScore: false, severity: 'info', metrics: [], notes: []
  };
}

function equal(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) throw new Error(`Esperado ${String(expected)}, recibido ${String(actual)}.`);
}

function deepEqual(actual: unknown, expected: unknown): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`Esperado ${right}, recibido ${left}.`);
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
console.log(`OK · ${tests.length} pruebas puras del catalogo institucional de calculadoras`);
