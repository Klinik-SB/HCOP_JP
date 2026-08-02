import { CalculatorDefinition, CalculatorResult } from './calculator.models';
import {
  InstitutionalCalculatorAssemblyError,
  assembleInstitutionalCalculatorCatalog
} from './institutional-calculator-catalog.assembler';
import {
  InstitutionalCalculatorCatalog,
  InstitutionalCalculatorDefinition,
  InstitutionalCalculatorField,
  InstitutionalCalculatorItem
} from './institutional-calculator-catalog.validator';
import { PORTED_CALCULATORS } from './ported-calculator.registry';

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

function throwsAssembly(run: () => unknown, fragment: string): void {
  assertions += 1;
  try {
    run();
  } catch (failure) {
    if (!(failure instanceof InstitutionalCalculatorAssemblyError)) {
      throw new Error(`Se esperaba InstitutionalCalculatorAssemblyError, recibido ${String(failure)}.`);
    }
    if (!failure.message.includes(fragment)) {
      throw new Error(`El error no contiene ${fragment}: ${failure.message}`);
    }
    return;
  }
  throw new Error('Se esperaba un error de ensamblado.');
}

test('empty validated catalog preserves all 57 built-ins by identity and order', () => {
  const assembled = assembleInstitutionalCalculatorCatalog(PORTED_CALCULATORS, catalog([]));
  equal(PORTED_CALCULATORS.length, 57);
  equal(assembled.length, 57);
  deepEqual(assembled.map((entry) => entry.id), PORTED_CALCULATORS.map((entry) => entry.id));
  for (let index = 0; index < assembled.length; index += 1) equal(assembled[index], PORTED_CALCULATORS[index]);
});

test('overrides keep their built-in slot/id while custom formula and score append in catalog order', () => {
  const alpha = fakeBuiltIn('alpha-id', 'Alpha', 'general');
  const beta = fakeBuiltIn('beta-id', 'Beta', 'mama');
  const gamma = fakeBuiltIn('gamma-id', 'Gamma', 'torax');
  const alphaCalculate = alpha.calculate;
  const betaCalculate = beta.calculate;
  const source = [alpha, beta, gamma] as const;
  const sourceSnapshot = JSON.stringify(source);
  const entries = [
    configurableItem('1', 'Alpha formula', formulaDefinition('alpha', 'override', 'x + 1')),
    builtinItem('2', 'Beta institucional', 'beta'),
    configurableItem('3', 'Formula custom', formulaDefinition('', 'custom-formula', 'x * 2')),
    configurableItem('4', 'Score custom', scoreDefinition())
  ] as const;
  const assembled = assembleInstitutionalCalculatorCatalog(source, catalog(entries, ['gamma']));

  deepEqual(assembled.map((entry) => entry.id), ['alpha-id', 'beta-id', 'config-3', 'config-4']);
  deepEqual(assembled.map((entry) => entry.category), ['override', 'local', 'custom-formula', 'custom-score']);
  equal(assembled[0]?.calculate === alphaCalculate, false);
  equal(assembled[1]?.calculate, betaCalculate);
  equal(assembled[0]?.calculate({ x: 2 }).title, 'Resultado: 3');
  equal(assembled[2]?.calculate({ x: 2 }).title, 'Resultado: 4');
  equal(assembled[3]?.calculate({ flag: true }).title, 'Resultado: 2');
  equal(JSON.stringify(source), sourceSnapshot, 'los built-ins fuente no deben mutar');
});

test('builtin copy customizes presentation and safe field labels without changing its engine contract', () => {
  const original = fakeBuiltIn('beta-id', 'Beta', 'mama');
  const item = builtinItem('2', 'Beta institucional', 'beta');
  const assembled = assembleInstitutionalCalculatorCatalog([original], catalog([item]));
  const replaced = assembled[0];
  equal(replaced?.id, 'beta-id');
  equal(replaced?.title, 'Beta institucional');
  equal(replaced?.shortTitle, 'Beta institucional');
  equal(replaced?.subtitle, 'Descripcion 2');
  equal(replaced?.category, 'local');
  equal(replaced?.source, 'Comite · personalizacion local v2');
  equal(replaced?.clinicalUse, 'Uso local');
  equal(replaced?.fields[0]?.label, 'Cantidad local');
  equal(replaced?.fields[0]?.kind === 'number' ? replaced.fields[0].unit : '', 'ml');
  deepEqual(replaced?.fields[1]?.kind === 'select' ? replaced.fields[1].options : [], [
    { value: 'a', label: 'Opcion A' }, { value: 'b', label: 'Opcion B local' }
  ]);
  equal(replaced?.calculate, original.calculate);
});

test('disabled built-ins disappear even when they have an override and no legacy fallback is injected', () => {
  const alpha = fakeBuiltIn('alpha-id', 'Alpha', 'general');
  const assembled = assembleInstitutionalCalculatorCatalog(
    [alpha],
    catalog([configurableItem('1', 'Alpha formula', formulaDefinition('alpha', 'local', 'x'))], ['alpha'])
  );
  deepEqual(assembled, []);
});

test('assembler fails fast for a catalog that did not pass the validated contract', () => {
  const alpha = fakeBuiltIn('alpha-id', 'Alpha', 'general');
  const valid = catalog([]);
  const invalidTotal = { ...valid, total: 9 } as InstitutionalCalculatorCatalog;
  throwsAssembly(() => assembleInstitutionalCalculatorCatalog([alpha], invalidTotal), 'contrato validado');

  const unknown = catalog([
    configurableItem('1', 'Desconocida', formulaDefinition('missing', 'local', 'x'))
  ]);
  throwsAssembly(() => assembleInstitutionalCalculatorCatalog([alpha], unknown), 'No existe');

  const duplicate = catalog([
    configurableItem('1', 'Primera', formulaDefinition('alpha', 'local', 'x')),
    configurableItem('2', 'Segunda', formulaDefinition('alpha', 'local', 'x'))
  ]);
  throwsAssembly(() => assembleInstitutionalCalculatorCatalog([alpha], duplicate), 'mas de un override');
});

test('assembler rejects duplicate source/final ids instead of silently dropping entries', () => {
  const duplicateSource = [
    fakeBuiltIn('same', 'Alpha', 'general'),
    fakeBuiltIn('same', 'Beta', 'general')
  ];
  throwsAssembly(() => assembleInstitutionalCalculatorCatalog(duplicateSource, catalog([])), 'ID builtin duplicado');

  const collidingBuiltIn = fakeBuiltIn('config-99', 'Alpha', 'general');
  const custom = configurableItem('99', 'Custom', formulaDefinition('', 'local', 'x'));
  throwsAssembly(() => assembleInstitutionalCalculatorCatalog([collidingBuiltIn], catalog([custom])), 'ID final duplicado');
});

test('assembler rejects a typed-but-invalid custom builtin instead of returning a fallback', () => {
  const customBuiltin = configurableItem('1', 'Builtin huerfana', {
    ...baseDefinition(), mode: 'builtin', replacesBuiltInKey: ''
  });
  throwsAssembly(
    () => assembleInstitutionalCalculatorCatalog([fakeBuiltIn('alpha-id', 'Alpha', 'general')], catalog([customBuiltin])),
    'no indica una calculadora reemplazada'
  );
});

function fakeBuiltIn(id: string, title: string, category: string): CalculatorDefinition {
  return {
    id,
    title,
    shortTitle: title,
    category,
    subtitle: `Original ${title}`,
    source: `Fuente ${title}`,
    clinicalUse: `Uso ${title}`,
    fields: [
      { id: 'amount', kind: 'number', label: 'Cantidad', required: true, initialValue: '', unit: 'mg' },
      { id: 'method', kind: 'select', label: 'Metodo', required: true, initialValue: '', options: [
        { value: 'a', label: 'Opcion A' }, { value: 'b', label: 'Opcion B' }
      ] }
    ],
    calculate: () => fixedResult(title)
  };
}

function fixedResult(title: string): CalculatorResult {
  return {
    title, detail: title, badge: 'original', score: 0, showScore: false,
    severity: 'info', metrics: [], notes: []
  };
}

function baseDefinition(): InstitutionalCalculatorDefinition {
  return {
    mode: 'formula', replacesBuiltInKey: '', category: 'general', source: '', clinicalUse: '',
    fields: [numberField('x', 'X')], expression: 'x', basePoints: 0,
    resultLabel: 'Resultado', resultUnit: '', decimals: 0, ranges: [], notes: []
  };
}

function formulaDefinition(
  replacement: string,
  category: string,
  expression: string
): InstitutionalCalculatorDefinition {
  return { ...baseDefinition(), replacesBuiltInKey: replacement, category, expression };
}

function scoreDefinition(): InstitutionalCalculatorDefinition {
  return {
    ...baseDefinition(), mode: 'score', category: 'custom-score', expression: '',
    fields: [{ ...numberField('flag', 'Criterio'), type: 'checkbox', checkedPoints: 2 }]
  };
}

function numberField(key: string, label: string): InstitutionalCalculatorField {
  return {
    key, label, type: 'number', required: true, unit: '', help: '', placeholder: '',
    min: null, max: null, step: null, value: null, options: [], checkedPoints: 0, scoreRules: []
  };
}

function builtinItem(id: string, name: string, replacement: string): InstitutionalCalculatorItem {
  return configurableItem(id, name, {
    ...baseDefinition(),
    mode: 'builtin',
    replacesBuiltInKey: replacement,
    category: 'local',
    source: 'Comite',
    clinicalUse: 'Uso local',
    fields: [
      { ...numberField('amount', 'Cantidad local'), unit: 'ml', help: 'Ayuda local' },
      { ...numberField('method', 'Metodo local'), type: 'select', options: [
        { value: 'b', label: 'Opcion B local', points: 0 }
      ] }
    ]
  });
}

function configurableItem(
  id: string,
  name: string,
  definition: InstitutionalCalculatorDefinition
): InstitutionalCalculatorItem {
  return { id, key: `calculator:${id}`, name, description: `Descripcion ${id}`, revision: Number(id) || 1, definition };
}

function catalog(
  calculators: readonly InstitutionalCalculatorItem[],
  disabledBuiltInKeys: readonly string[] = []
): InstitutionalCalculatorCatalog {
  return {
    ok: true,
    calculators,
    settings: {
      id: '', key: 'tools-main', name: 'Herramientas', description: '', revision: 0,
      definition: { enabled: true, disabledBuiltInKeys }
    },
    total: calculators.length
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
console.log(`OK · ${tests.length} pruebas · ${assertions} aserciones del ensamblador institucional`);
