import { evaluateCalculator } from './calculator.engine';
import { CALCULATOR_INVENTORY, EXPECTED_CALCULATOR_ORIGIN_COUNTS } from './calculator.inventory';
import { BSA_CALCULATOR, BMI_CALCULATOR, CALVERT_CALCULATOR, PORTED_CALCULATORS } from './core-calculator.definitions';
import { CalculatorOrigin } from './calculator.models';

interface GoldenTest {
  readonly name: string;
  readonly run: () => void;
}

const tests: GoldenTest[] = [];

function test(name: string, run: () => void): void {
  tests.push({ name, run });
}

test('inventory contains the exact 57 unique legacy tools in stable order', () => {
  equal(CALCULATOR_INVENTORY.length, 57);
  equal(new Set(CALCULATOR_INVENTORY.map((entry) => entry.id)).size, 57);
  equal(new Set(CALCULATOR_INVENTORY.map((entry) => entry.title)).size, 57);
  deepEqual(CALCULATOR_INVENTORY.map((entry) => entry.ordinal), Array.from({ length: 57 }, (_, index) => index + 1));
  for (const [origin, expected] of Object.entries(EXPECTED_CALCULATOR_ORIGIN_COUNTS)) {
    equal(CALCULATOR_INVENTORY.filter((entry) => entry.origin === origin as CalculatorOrigin).length, expected);
  }
});

test('only the first three calculators are marked as ported', () => {
  deepEqual(CALCULATOR_INVENTORY.filter((entry) => entry.migrationStatus === 'ported').map((entry) => entry.id),
    ['bsa', 'bmi', 'calvert']);
  deepEqual(PORTED_CALCULATORS.map((entry) => entry.id), ['bsa', 'bmi', 'calvert']);
});

test('BSA uses legacy defaults only when fields are absent', () => {
  const defaults = evaluateCalculator(BSA_CALCULATOR);
  equal(defaults.status, 'calculated');
  deepEqual(defaults.values, { bsa_weight: 70, bsa_height: 170 });
  equal(defaults.result.title, '1.82 m²');
  equal(BSA_CALCULATOR.fields[0]?.kind === 'number' ? BSA_CALCULATOR.fields[0].initialValue : null, 70);
  equal(BSA_CALCULATOR.fields[1]?.kind === 'number' ? BSA_CALCULATOR.fields[1].initialValue : null, 170);

  const cleared = evaluateCalculator(BSA_CALCULATOR, { bsa_weight: '', bsa_height: '' });
  equal(cleared.status, 'invalid');
  deepEqual(cleared.values, { bsa_weight: '', bsa_height: '' });
  deepEqual(cleared.issues.map((issue) => issue.code), ['required', 'required']);
  deepEqual(cleared.result, {
    title: 'Faltan datos para calcular',
    detail: 'Completá: Peso (kg), Altura (cm).',
    badge: 'datos incompletos',
    score: 0,
    showScore: false,
    severity: 'warn',
    metrics: [],
    notes: []
  });
});

test('Mosteller golden normal case', () => {
  const evaluation = evaluateCalculator(BSA_CALCULATOR, { bsa_weight: 70, bsa_height: 170 });
  equal(evaluation.status, 'calculated');
  deepEqual(evaluation.result, {
    title: '1.82 m²',
    detail: 'Superficie corporal estimada mediante la formula de Mosteller.',
    badge: 'Mosteller',
    score: 0,
    showScore: false,
    metrics: [{ label: 'SC', value: '1.82 m²' }],
    severity: 'info',
    notes: ['Verificar peso y altura actuales. La superficie corporal no define por sí sola una dosis ni un tope de dosificación.']
  });
});

test('Mosteller accepts exact field minima and rejects values below them', () => {
  equal(evaluateCalculator(BSA_CALCULATOR, { bsa_weight: 1, bsa_height: 30 }).result.title, '0.09 m²');
  const below = evaluateCalculator(BSA_CALCULATOR, { bsa_weight: 0.9, bsa_height: 30 });
  equal(below.status, 'invalid');
  deepEqual(below.issues.map((issue) => issue.code), ['below-minimum']);
  equal(below.result.detail, 'Peso (kg)');
});

test('Mosteller preserves browser step validation', () => {
  const mismatch = evaluateCalculator(BSA_CALCULATOR, { bsa_weight: 70.05, bsa_height: 170 });
  equal(mismatch.status, 'invalid');
  deepEqual(mismatch.issues.map((issue) => issue.code), ['step-mismatch']);
});

test('BMI golden normal case', () => {
  const evaluation = evaluateCalculator(BMI_CALCULATOR);
  equal(evaluation.status, 'calculated');
  deepEqual(evaluation.values, { bmi_weight: 70, bmi_height: 170 });
  deepEqual(evaluation.result, {
    title: '24.2 kg/m²',
    detail: 'Rango saludable',
    badge: 'IMC adulto',
    score: 0,
    showScore: false,
    severity: 'info',
    metrics: [{ label: 'IMC', value: '24.2' }, { label: 'Categoria', value: 'Rango saludable' }],
    notes: ['Interpretar junto con composicion corporal, estado nutricional y contexto clinico.']
  });
});

test('BMI explicit empty values do not fall back to defaults', () => {
  const evaluation = evaluateCalculator(BMI_CALCULATOR, { bmi_weight: '', bmi_height: '' });
  equal(evaluation.status, 'invalid');
  deepEqual(evaluation.values, { bmi_weight: '', bmi_height: '' });
  deepEqual(evaluation.issues.map((issue) => issue.code), ['required', 'required']);
});

test('BMI category boundaries match the legacy rules', () => {
  const cases: readonly [number, string][] = [
    [18.4, 'Bajo peso'],
    [18.5, 'Rango saludable'],
    [25, 'Sobrepeso'],
    [30, 'Obesidad clase I'],
    [35, 'Obesidad clase II'],
    [40, 'Obesidad clase III']
  ];
  for (const [weight, expected] of cases) {
    equal(evaluateCalculator(BMI_CALCULATOR, { bmi_weight: weight, bmi_height: 100 }).result.detail, expected);
  }
});

test('Calvert golden measured-GFR case', () => {
  const evaluation = evaluateCalculator(CALVERT_CALCULATOR);
  equal(evaluation.status, 'calculated');
  deepEqual(evaluation.values, {
    calvert_method: 'measured', calvert_auc: 5, calvert_gfr: 80, calvert_bsa: 1.8, calvert_cap: false
  });
  deepEqual(evaluation.result, {
    title: '525 mg',
    detail: 'Dosis calculada sin redondear: 525.00 mg.',
    badge: 'formula de Calvert',
    score: 0,
    showScore: false,
    severity: 'info',
    metrics: [
      { label: 'Dosis redondeada', value: '525 mg' },
      { label: 'GFR absoluta usada', value: '80.00 ml/min' },
      { label: 'AUC', value: 5 },
      { label: 'Método', value: 'GFR medida' }
    ],
    notes: [
      'La función renal ingresada se utilizó como valor absoluto.',
      'No se aplicó un tope adicional.',
      'La diálisis y situaciones de función renal inestable requieren un planteo específico.'
    ]
  });
});

test('Calvert desindexes eGFR only when BSA is present', () => {
  const missing = evaluateCalculator(CALVERT_CALCULATOR, {
    calvert_method: 'indexed', calvert_auc: 5, calvert_gfr: 80, calvert_bsa: '', calvert_cap: false
  });
  equal(missing.status, 'calculated');
  deepEqual(missing.result, {
    title: 'Falta la superficie corporal',
    detail: 'Para eGFR indexado se necesita desindexar: eGFR × SC / 1,73.',
    badge: 'no calculable',
    score: 0,
    showScore: false,
    severity: 'warn',
    metrics: [],
    notes: []
  });

  const calculated = evaluateCalculator(CALVERT_CALCULATOR, {
    calvert_method: 'indexed', calvert_auc: 5, calvert_gfr: 80, calvert_bsa: 1.8, calvert_cap: false
  });
  equal(calculated.result.title, '541 mg');
  equal(calculated.result.detail, 'Dosis calculada sin redondear: 541.18 mg.');
  equal(calculated.result.metrics[1]?.value, '83.24 ml/min');
  equal(calculated.result.notes[0], 'eGFR 80 × SC 1.80 / 1,73 = 83.24 ml/min.');
});

test('Calvert cap is explicit and never silently applied', () => {
  const input = { calvert_method: 'measured', calvert_auc: 5, calvert_gfr: 150, calvert_bsa: '' };
  const uncapped = evaluateCalculator(CALVERT_CALCULATOR, { ...input, calvert_cap: false });
  equal(uncapped.result.title, '875 mg');
  equal(uncapped.result.metrics[1]?.value, '150.00 ml/min');
  equal(uncapped.result.notes[1], 'El valor supera 125 ml/min. Revisar el protocolo antes de decidir si corresponde un tope.');

  const capped = evaluateCalculator(CALVERT_CALCULATOR, { ...input, calvert_cap: true });
  equal(capped.result.title, '750 mg');
  equal(capped.result.metrics[1]?.value, '125.00 ml/min');
  equal(capped.result.notes[1], 'Se aplicó el tope de 125 ml/min solicitado.');
});

test('Calvert accepts exact minima and rejects unknown renal methods', () => {
  const minimum = evaluateCalculator(CALVERT_CALCULATOR, {
    calvert_method: 'measured', calvert_auc: 0.1, calvert_gfr: 0.1, calvert_bsa: '', calvert_cap: false
  });
  equal(minimum.result.title, '3 mg');
  equal(minimum.result.detail, 'Dosis calculada sin redondear: 2.51 mg.');

  const unknown = evaluateCalculator(CALVERT_CALCULATOR, {
    calvert_method: 'invented', calvert_auc: 5, calvert_gfr: 80, calvert_bsa: '', calvert_cap: false
  });
  equal(unknown.status, 'invalid');
  deepEqual(unknown.issues.map((issue) => issue.code), ['unknown-option']);
});

run();

function run(): void {
  const failures: string[] = [];
  for (const current of tests) {
    try {
      current.run();
    } catch (failure) {
      failures.push(`${current.name}: ${failure instanceof Error ? failure.message : String(failure)}`);
    }
  }
  if (failures.length) throw new Error(`Fallaron ${failures.length}/${tests.length} pruebas doradas:\n${failures.join('\n')}`);
  console.log(`OK · ${tests.length} pruebas doradas de calculadoras`);
}

function equal<T>(actual: T, expected: T): void {
  if (!Object.is(actual, expected)) throw new Error(`Esperado ${print(expected)}; recibido ${print(actual)}.`);
}

function deepEqual(actual: unknown, expected: unknown): void {
  const actualText = JSON.stringify(actual);
  const expectedText = JSON.stringify(expected);
  if (actualText !== expectedText) throw new Error(`Esperado ${expectedText}; recibido ${actualText}.`);
}

function print(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}
