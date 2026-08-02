import { evaluateCalculator } from './calculator.engine';
import { CALCULATOR_INVENTORY, EXPECTED_CALCULATOR_ORIGIN_COUNTS } from './calculator.inventory';
import { BSA_CALCULATOR, BMI_CALCULATOR, CALVERT_CALCULATOR } from './core-calculator.definitions';
import {
  CHARLSON_CALCULATOR,
  ECOG_CALCULATOR,
  G8_CARG_CALCULATOR,
  IPSS_SHIM_CALCULATOR
} from './legacy-calculators-04-07.definitions';
import { PORTED_CALCULATORS } from './ported-calculator.registry';
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

test('only the first seven calculators are marked as ported', () => {
  deepEqual(CALCULATOR_INVENTORY.filter((entry) => entry.migrationStatus === 'ported').map((entry) => entry.id),
    ['bsa', 'bmi', 'calvert', 'ecog', 'charlson', 'g8-carg', 'ipss-shim']);
  deepEqual(PORTED_CALCULATORS.map((entry) => entry.id),
    ['bsa', 'bmi', 'calvert', 'ecog', 'charlson', 'g8-carg', 'ipss-shim']);
});

test('BSA opens blank and keeps legacy values only as examples', () => {
  const blank = evaluateCalculator(BSA_CALCULATOR);
  equal(blank.status, 'invalid');
  deepEqual(blank.values, { bsa_weight: '', bsa_height: '' });
  deepEqual(blank.issues.map((issue) => issue.code), ['required', 'required']);
  equal(BSA_CALCULATOR.fields[0]?.kind === 'number' ? BSA_CALCULATOR.fields[0].exampleValue : null, 70);
  equal(BSA_CALCULATOR.fields[1]?.kind === 'number' ? BSA_CALCULATOR.fields[1].exampleValue : null, 170);
  deepEqual(blank.result, {
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
  const evaluation = evaluateCalculator(BMI_CALCULATOR, { bmi_weight: 70, bmi_height: 170 });
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
  const evaluation = evaluateCalculator(CALVERT_CALCULATOR, {
    calvert_method: 'measured', calvert_auc: 5, calvert_gfr: 80, calvert_bsa: 1.8, calvert_cap: false
  });
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

test('ported clinical scores preserve the blank legacy form instead of calculating examples', () => {
  const ecog = evaluateCalculator(ECOG_CALCULATOR);
  equal(ecog.status, 'invalid');
  deepEqual(ecog.issues.map((issue) => issue.label), ['ECOG', 'Karnofsky']);

  const charlson = evaluateCalculator(CHARLSON_CALCULATOR);
  equal(charlson.status, 'invalid');
  deepEqual(charlson.issues.map((issue) => issue.label), ['Edad']);

  const g8Carg = evaluateCalculator(G8_CARG_CALCULATOR);
  equal(g8Carg.status, 'invalid');
  equal(g8Carg.issues.length, 8);
  deepEqual(g8Carg.issues.map((issue) => issue.fieldId), [
    'g8_food', 'g8_weight', 'g8_mobility', 'g8_neuro',
    'g8_bmi', 'g8_meds', 'g8_health', 'g8_age'
  ]);

  const ipssShim = evaluateCalculator(IPSS_SHIM_CALCULATOR);
  equal(ipssShim.status, 'invalid');
  equal(ipssShim.issues.length, 13);
  const nocturia = IPSS_SHIM_CALCULATOR.fields.find((field) => field.id === 'ipss_nocturia');
  equal(nocturia?.kind === 'select' ? nocturia.exampleValue : null, '2');
});

test('ECOG and Karnofsky golden result matches legacy wording', () => {
  const evaluation = evaluateCalculator(ECOG_CALCULATOR, { ecog: '1', kps: '80' });
  equal(evaluation.status, 'calculated');
  deepEqual(evaluation.result, {
    title: 'ECOG y Karnofsky',
    detail: 'Son dos escalas distintas de estado funcional. Usá la que corresponda al protocolo, historia clínica o reporte que estés completando.',
    badge: 'escalas separadas',
    score: 0,
    scoreName: 'Señal integrada',
    showScore: false,
    severity: 'info',
    metrics: [
      { label: 'ECOG 1', value: 'Restricción para actividad física intensa; ambulatorio y capaz de trabajo liviano o sedentario.' },
      { label: 'Karnofsky 80%', value: 'Actividad normal con esfuerzo; algunos síntomas o signos.' }
    ],
    notes: [
      'ECOG se usa mucho en oncología clínica y ensayos para definir performance status y elegibilidad terapéutica.',
      'Karnofsky ofrece una escala porcentual más granular para funcionalidad, dependencia y necesidad de asistencia.',
      'No se cruzan ni se convierten entre sí: registrar la escala usada y su valor exacto.'
    ]
  });
});

test('ECOG and Karnofsky accept exact extremes and reject values outside their options', () => {
  const best = evaluateCalculator(ECOG_CALCULATOR, { ecog: '0', kps: '100' });
  equal(best.result.metrics[0]?.value, 'Actividad plena, sin restricción.');
  equal(best.result.metrics[1]?.value, 'Normal, sin síntomas ni signos de enfermedad.');

  const worst = evaluateCalculator(ECOG_CALCULATOR, { ecog: '5', kps: '0' });
  equal(worst.result.metrics[0]?.value, 'Fallecido.');
  equal(worst.result.metrics[1]?.value, 'Fallecido.');

  const invalid = evaluateCalculator(ECOG_CALCULATOR, { ecog: '6', kps: '80' });
  equal(invalid.status, 'invalid');
  deepEqual(invalid.issues.map((issue) => issue.code), ['unknown-option']);
});

test('Charlson golden case and age brackets match the legacy rule', () => {
  const plain = evaluateCalculator(CHARLSON_CALCULATOR, { age: 68 });
  equal(plain.status, 'calculated');
  equal(plain.result.title, 'CCI ajustado: 2');
  equal(plain.result.detail, 'Comorbilidad 0 + edad 2.');

  const brackets: readonly [number, number][] = [[49.9, 0], [50, 1], [60, 2], [70, 3], [80, 4]];
  for (const [age, expectedPoints] of brackets) {
    equal(evaluateCalculator(CHARLSON_CALCULATOR, { age }).result.metrics[2]?.value, expectedPoints);
  }
});

test('Charlson mutually exclusive conditions are never counted twice', () => {
  const evaluation = evaluateCalculator(CHARLSON_CALCULATOR, {
    age: 80,
    liverMild: true, liverSevere: true,
    diabetes: true, diabetesComplicated: true,
    solidTumor: true, metastaticTumor: true
  });
  equal(evaluation.status, 'calculated');
  equal(evaluation.result.title, 'CCI ajustado: 15');
  equal(evaluation.result.detail, 'Comorbilidad 11 + edad 4.');
});

test('Charlson reaches its legacy maximum and enforces the UI age limits', () => {
  const allConditions = Object.fromEntries(
    CHARLSON_CALCULATOR.fields
      .filter((field) => field.kind === 'checkbox')
      .map((field) => [field.id, true])
  );
  const maximum = evaluateCalculator(CHARLSON_CALCULATOR, { age: 100, ...allConditions });
  equal(maximum.result.title, 'CCI ajustado: 37');
  equal(maximum.result.detail, 'Comorbilidad 33 + edad 4.');

  equal(evaluateCalculator(CHARLSON_CALCULATOR, { age: 17 }).issues[0]?.code, 'below-minimum');
  equal(evaluateCalculator(CHARLSON_CALCULATOR, { age: 101 }).issues[0]?.code, 'above-maximum');
});

test('G8 and CARG golden result keeps both scores separate', () => {
  const evaluation = evaluateCalculator(G8_CARG_CALCULATOR, g8Input());
  equal(evaluation.status, 'calculated');
  equal(evaluation.result.title, 'G8 conservado · CARG bajo');
  equal(evaluation.result.badge, 'bajo');
  equal(evaluation.result.severity, 'good');
  deepEqual(evaluation.result.metrics, [
    { label: 'G8 total', value: '16.0 / 17' },
    { label: 'Lectura G8', value: 'screening conservado' },
    { label: 'CARG total', value: 0 },
    { label: 'Toxicidad G3-5', value: '30% (cohorte original)' }
  ]);
});

test('G8 uses the inclusive altered threshold and preserves half points', () => {
  const threshold = evaluateCalculator(G8_CARG_CALCULATOR, g8Input({ g8_food: '0' }));
  equal(threshold.result.title, 'G8 alterado · CARG bajo');
  equal(threshold.result.metrics[0]?.value, '14.0 / 17');
  equal(threshold.result.severity, 'bad');

  const halfPoint = evaluateCalculator(G8_CARG_CALCULATOR, g8Input({ g8_health: '0.5' }));
  equal(halfPoint.result.metrics[0]?.value, '15.5 / 17');
});

test('CARG low, intermediate and high thresholds retain their original toxicity rates', () => {
  const low = evaluateCalculator(G8_CARG_CALCULATOR, g8Input({ carg_hb: true, carg_age72: true }));
  equal(low.result.title, 'G8 conservado · CARG bajo');
  equal(low.result.metrics[2]?.value, 5);
  equal(low.result.metrics[3]?.value, '30% (cohorte original)');

  const intermediate = evaluateCalculator(G8_CARG_CALCULATOR, g8Input({ carg_hb: true, carg_falls: true }));
  equal(intermediate.result.title, 'G8 conservado · CARG intermedio');
  equal(intermediate.result.metrics[2]?.value, 6);
  equal(intermediate.result.metrics[3]?.value, '52% (cohorte original)');
  equal(intermediate.result.severity, 'warn');

  const high = evaluateCalculator(G8_CARG_CALCULATOR, g8Input({
    carg_hb: true, carg_crcl: true, carg_age72: true, carg_gigu: true
  }));
  equal(high.result.title, 'G8 conservado · CARG alto');
  equal(high.result.metrics[2]?.value, 10);
  equal(high.result.metrics[3]?.value, '83% (cohorte original)');
  equal(high.result.severity, 'bad');
});

test('G8 rejects options outside the published response set', () => {
  const invalid = evaluateCalculator(G8_CARG_CALCULATOR, g8Input({ g8_health: '1.5' }));
  equal(invalid.status, 'invalid');
  deepEqual(invalid.issues.map((issue) => issue.code), ['unknown-option']);
});

test('IPSS and SHIM golden result matches the legacy examples when explicitly entered', () => {
  const evaluation = evaluateCalculator(IPSS_SHIM_CALCULATOR, ipssShimInput());
  equal(evaluation.status, 'calculated');
  equal(evaluation.result.title, 'IPSS 8 (moderado)');
  equal(evaluation.result.detail, 'QoL urinaria 2/6. SHIM 18: disfuncion leve.');
  equal(evaluation.result.score, 8 / 35 * 100);
  equal(evaluation.result.scoreName, 'Carga de síntomas urinarios');
  deepEqual(evaluation.result.metrics, [
    { label: 'IPSS total', value: '8 / 35' },
    { label: 'Severidad IPSS', value: 'moderado' },
    { label: 'QoL urinaria', value: '2 / 6' },
    { label: 'SHIM total', value: '18 / 25' },
    { label: 'Lectura SHIM', value: 'disfuncion leve' }
  ]);
});

test('IPSS category and severity boundaries are inclusive in the same places as legacy', () => {
  const cases: readonly [readonly string[], string, string][] = [
    [['0', '0', '0', '0', '0', '0', '0'], 'IPSS 0 (asintomático)', 'good'],
    [['1', '1', '1', '1', '1', '1', '1'], 'IPSS 7 (leve)', 'good'],
    [['1', '1', '1', '1', '1', '1', '2'], 'IPSS 8 (moderado)', 'warn'],
    [['3', '3', '3', '3', '3', '2', '2'], 'IPSS 19 (moderado)', 'warn'],
    [['3', '3', '3', '3', '3', '3', '2'], 'IPSS 20 (severo)', 'bad'],
    [['5', '5', '5', '5', '5', '5', '5'], 'IPSS 35 (severo)', 'bad']
  ];
  for (const [answers, expectedTitle, expectedSeverity] of cases) {
    const evaluation = evaluateCalculator(IPSS_SHIM_CALCULATOR, ipssShimInput(ipssAnswers(answers)));
    equal(evaluation.result.title, expectedTitle);
    equal(evaluation.result.severity, expectedSeverity);
  }
});

test('SHIM category boundaries match the legacy rule', () => {
  const cases: readonly [readonly string[], string][] = [
    [['5', '5', '4', '4', '4'], 'sin disfuncion erectil significativa'],
    [['5', '4', '4', '4', '4'], 'disfuncion leve'],
    [['4', '4', '3', '3', '3'], 'disfuncion leve'],
    [['4', '3', '3', '3', '3'], 'disfuncion leve-moderada'],
    [['3', '3', '2', '2', '2'], 'disfuncion leve-moderada'],
    [['3', '2', '2', '2', '2'], 'disfuncion moderada'],
    [['2', '2', '2', '1', '1'], 'disfuncion moderada'],
    [['2', '1', '1', '1', '1'], 'disfuncion severa']
  ];
  for (const [answers, expected] of cases) {
    const evaluation = evaluateCalculator(IPSS_SHIM_CALCULATOR, ipssShimInput(shimAnswers(answers)));
    equal(evaluation.result.metrics[4]?.value, expected);
  }
});

test('SHIM not evaluable skips its five answers but keeps IPSS and QoL required', () => {
  const withoutShim = ipssShimInput({ shim_not_evaluable: true });
  for (const fieldId of ['shim_confidence', 'shim_hardness', 'shim_maintenance', 'shim_completion', 'shim_satisfaction']) {
    delete withoutShim[fieldId];
  }
  const evaluation = evaluateCalculator(IPSS_SHIM_CALCULATOR, withoutShim);
  equal(evaluation.status, 'calculated');
  equal(evaluation.result.detail, 'QoL urinaria 2/6. SHIM no evaluable por ausencia de actividad sexual suficiente.');
  equal(evaluation.result.metrics[3]?.value, 'no evaluable');
  equal(evaluation.result.metrics[4]?.value, 'no evaluable');

  const missingQol = { ...withoutShim, ipss_qol: '' };
  const invalid = evaluateCalculator(IPSS_SHIM_CALCULATOR, missingQol);
  equal(invalid.status, 'invalid');
  deepEqual(invalid.issues.map((issue) => issue.fieldId), ['ipss_qol']);
});

function g8Input(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    g8_food: '2', g8_weight: '3', g8_mobility: '2', g8_neuro: '2',
    g8_bmi: '3', g8_meds: '1', g8_health: '1', g8_age: '2',
    ...overrides
  };
}

function ipssShimInput(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    ipss_emptying: '1', ipss_frequency: '1', ipss_intermittency: '1', ipss_urgency: '1',
    ipss_stream: '1', ipss_straining: '1', ipss_nocturia: '2', ipss_qol: '2',
    shim_not_evaluable: false, shim_confidence: '4', shim_hardness: '4',
    shim_maintenance: '4', shim_completion: '3', shim_satisfaction: '3',
    ...overrides
  };
}

function ipssAnswers(values: readonly string[]): Record<string, unknown> {
  const ids = [
    'ipss_emptying', 'ipss_frequency', 'ipss_intermittency', 'ipss_urgency',
    'ipss_stream', 'ipss_straining', 'ipss_nocturia'
  ];
  return Object.fromEntries(ids.map((id, index) => [id, values[index]]));
}

function shimAnswers(values: readonly string[]): Record<string, unknown> {
  const ids = ['shim_confidence', 'shim_hardness', 'shim_maintenance', 'shim_completion', 'shim_satisfaction'];
  return Object.fromEntries(ids.map((id, index) => [id, values[index]]));
}

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
