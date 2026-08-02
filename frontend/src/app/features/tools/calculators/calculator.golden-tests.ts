import { evaluateCalculator, externalLink, tableNote } from './calculator.engine';
import { CALCULATOR_INVENTORY, EXPECTED_CALCULATOR_ORIGIN_COUNTS } from './calculator.inventory';
import { BSA_CALCULATOR, BMI_CALCULATOR, CALVERT_CALCULATOR } from './core-calculator.definitions';
import {
  CHARLSON_CALCULATOR,
  ECOG_CALCULATOR,
  G8_CARG_CALCULATOR,
  IPSS_SHIM_CALCULATOR
} from './legacy-calculators-04-07.definitions';
import {
  CAPRA_CALCULATOR,
  DAMICO_CALCULATOR,
  NODAL_RISK_CALCULATOR,
  PARTIN_CALCULATOR
} from './legacy-calculators-08-11.definitions';
import {
  BIOPSY_RISK_CALCULATOR,
  CHAARTED_LATITUDE_CALCULATOR,
  MSKCC_PROSTATE_CALCULATOR,
  PSA_KINETICS_CALCULATOR
} from './legacy-calculators-12-15.definitions';
import {
  CISPLATIN_CALCULATOR,
  CYSTECTOMY_CALCULATOR,
  NMIBC_CALCULATOR,
  UTUC_CALCULATOR
} from './legacy-calculators-16-19.definitions';
import {
  IGCCCG_CALCULATOR,
  IMDC_CALCULATOR,
  LEIBOVICH_CALCULATOR,
  RENAL_COMPLEXITY_CALCULATOR
} from './legacy-calculators-20-23.definitions';
import {
  ANC_CTCAE_V6_CALCULATOR,
  KHORANA_VTE_CALCULATOR,
  MASCC_FEBRILE_NEUTROPENIA_CALCULATOR,
  RENAL_FUNCTION_ONCOLOGY_CALCULATOR
} from './legacy-calculators-24-27.definitions';
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

test('only the first twenty-seven calculators are marked as ported', () => {
  deepEqual(CALCULATOR_INVENTORY.filter((entry) => entry.migrationStatus === 'ported').map((entry) => entry.id),
    ['bsa', 'bmi', 'calvert', 'ecog', 'charlson', 'g8-carg', 'ipss-shim', 'damico', 'capra', 'partin', 'nodal-risk',
      'mskcc-prostate', 'biopsy-risk', 'psa-kinetics', 'chaarted-latitude', 'nmibc', 'cystectomy', 'cisplatin', 'utuc',
      'renal-complexity', 'leibovich', 'imdc', 'igcccg', 'renal-function-oncology', 'anc-ctcae-v6',
      'khorana-vte', 'mascc-febrile-neutropenia']);
  deepEqual(PORTED_CALCULATORS.map((entry) => entry.id),
    ['bsa', 'bmi', 'calvert', 'ecog', 'charlson', 'g8-carg', 'ipss-shim', 'damico', 'capra', 'partin', 'nodal-risk',
      'mskcc-prostate', 'biopsy-risk', 'psa-kinetics', 'chaarted-latitude', 'nmibc', 'cystectomy', 'cisplatin', 'utuc',
      'renal-complexity', 'leibovich', 'imdc', 'igcccg', 'renal-function-oncology', 'anc-ctcae-v6',
      'khorana-vte', 'mascc-febrile-neutropenia']);
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

test('EAU prostate risk opens blank and requires its five clinical inputs', () => {
  const evaluation = evaluateCalculator(DAMICO_CALCULATOR);
  equal(evaluation.status, 'invalid');
  deepEqual(evaluation.issues.map((issue) => issue.fieldId), ['psa', 'gg', 'ct', 'n', 'm']);
});

test('EAU prostate risk golden groups and boundaries match the legacy rule', () => {
  const cases: readonly [Readonly<Record<string, unknown>>, string][] = [
    [{}, 'Bajo riesgo'],
    [{ psa: 10 }, 'Intermedio favorable'],
    [{ psa: 20 }, 'Intermedio favorable'],
    [{ psa: 20.1 }, 'Alto riesgo localizado'],
    [{ psa: 9, gg: '2' }, 'Intermedio favorable'],
    [{ psa: 10, gg: '2' }, 'Intermedio desfavorable'],
    [{ gg: '3' }, 'Intermedio desfavorable'],
    [{ gg: '4' }, 'Alto riesgo localizado']
  ];
  for (const [overrides, expected] of cases) {
    equal(evaluateCalculator(DAMICO_CALCULATOR, damicoInput(overrides)).result.title, expected);
  }
});

test('EAU prostate risk preserves metastatic and staging precedence', () => {
  equal(evaluateCalculator(DAMICO_CALCULATOR, damicoInput({ m: 'm1', n: 'n1', ct: 't4' })).result.title,
    'Fuera de alcance: enfermedad M1');
  equal(evaluateCalculator(DAMICO_CALCULATOR, damicoInput({ m: 'mx', n: 'n1', ct: 't4' })).result.title,
    'No clasificable: falta confirmar M0');
  equal(evaluateCalculator(DAMICO_CALCULATOR, damicoInput({ ct: 't3', n: 'nx' })).result.title,
    'Localmente avanzado');
  equal(evaluateCalculator(DAMICO_CALCULATOR, damicoInput({ n: 'n1' })).result.title,
    'Localmente avanzado');
  equal(evaluateCalculator(DAMICO_CALCULATOR, damicoInput({ n: 'nx' })).result.title,
    'No clasificable: falta confirmar cN0');
});

test('CAPRA starts in pre-treatment mode and validates only that scenario', () => {
  const initial = evaluateCalculator(CAPRA_CALCULATOR);
  equal(initial.status, 'invalid');
  equal(initial.values['scenario'], 'pre');
  deepEqual(initial.issues.map((issue) => issue.fieldId), [
    'age', 'psa', 'capraPrimary', 'capraSecondary', 'ct', 'positiveCores', 'totalCores'
  ]);

  const post = evaluateCalculator(CAPRA_CALCULATOR, { scenario: 'post' });
  deepEqual(post.issues.map((issue) => issue.fieldId), ['capraSpsa', 'capraSPrimary', 'capraSSecondary']);
});

test('CAPRA golden pre-treatment result and score thresholds match legacy', () => {
  const golden = evaluateCalculator(CAPRA_CALCULATOR, capraPreInput());
  equal(golden.status, 'calculated');
  equal(golden.result.title, 'CAPRA 3');
  equal(golden.result.badge, 'intermedio');
  deepEqual(golden.result.metrics, [
    { label: 'Puntaje', value: 3 },
    { label: 'Escala', value: 'CAPRA' },
    { label: 'Cilindros positivos', value: '25.0%' }
  ]);

  const cases: readonly [Readonly<Record<string, unknown>>, number][] = [
    [{ age: 49, psa: 6, capraSecondary: '3', positiveCores: 0, totalCores: 100 }, 0],
    [{ age: 50, psa: 6, capraSecondary: '3', positiveCores: 0, totalCores: 100 }, 1],
    [{ age: 49, psa: 6.1, capraSecondary: '3', positiveCores: 0, totalCores: 100 }, 1],
    [{ age: 49, psa: 10, capraSecondary: '3', positiveCores: 0, totalCores: 100 }, 1],
    [{ age: 49, psa: 10.1, capraSecondary: '3', positiveCores: 0, totalCores: 100 }, 2],
    [{ age: 49, psa: 20, capraSecondary: '3', positiveCores: 0, totalCores: 100 }, 2],
    [{ age: 49, psa: 20.1, capraSecondary: '3', positiveCores: 0, totalCores: 100 }, 3],
    [{ age: 49, psa: 30, capraSecondary: '3', positiveCores: 0, totalCores: 100 }, 3],
    [{ age: 49, psa: 30.1, capraSecondary: '3', positiveCores: 0, totalCores: 100 }, 4],
    [{ age: 49, psa: 6, capraSecondary: '3', positiveCores: 33, totalCores: 100 }, 0],
    [{ age: 49, psa: 6, capraSecondary: '3', positiveCores: 34, totalCores: 100 }, 1],
    [{ age: 49, psa: 6, capraSecondary: '3', ct: 't3a', positiveCores: 0, totalCores: 100 }, 1]
  ];
  for (const [overrides, expected] of cases) {
    equal(evaluateCalculator(CAPRA_CALCULATOR, capraPreInput(overrides)).result.metrics[0]?.value, expected);
  }
});

test('CAPRA keeps out-of-model stages and incoherent cores explicit', () => {
  const stage = evaluateCalculator(CAPRA_CALCULATOR, capraPreInput({ ct: 't3b' }));
  equal(stage.result.title, 'CAPRA no calculable');
  equal(stage.result.detail, 'CAPRA original no incluye cT3b ni cT4');

  const cores = evaluateCalculator(CAPRA_CALCULATOR, capraPreInput({ positiveCores: 13, totalCores: 12 }));
  equal(cores.result.title, 'CAPRA no calculable');
  equal(cores.result.detail, 'Revisar la cantidad de cilindros positivos y totales');
});

test('CAPRA-S golden case, categories and pathological factors match legacy', () => {
  const golden = evaluateCalculator(CAPRA_CALCULATOR, capraPostInput());
  equal(golden.status, 'calculated');
  equal(golden.result.title, 'CAPRA-S 2');
  equal(golden.result.badge, 'bajo');

  const maximum = evaluateCalculator(CAPRA_CALCULATOR, capraPostInput({
    capraSpsa: 20.1, capraSPrimary: '5', capraSSecondary: '5',
    margin: true, ece: true, svi: true, lni: true
  }));
  equal(maximum.result.title, 'CAPRA-S 12');
  equal(maximum.result.badge, 'alto');

  equal(evaluateCalculator(CAPRA_CALCULATOR,
    capraPostInput({ capraSpsa: 6, capraSPrimary: '3', capraSSecondary: '3' })).result.title, 'CAPRA-S 0');
  equal(evaluateCalculator(CAPRA_CALCULATOR,
    capraPostInput({ capraSpsa: 6.1, capraSPrimary: '3', capraSSecondary: '3' })).result.title, 'CAPRA-S 1');
  equal(evaluateCalculator(CAPRA_CALCULATOR,
    capraPostInput({ capraSpsa: 10.1, capraSPrimary: '3', capraSSecondary: '3' })).result.title, 'CAPRA-S 2');
});

test('Partin prepares the official lookup profile without inventing local percentages', () => {
  const blank = evaluateCalculator(PARTIN_CALCULATOR);
  deepEqual(blank.issues.map((issue) => issue.fieldId), ['psaCat', 'gg', 'ct']);

  const evaluation = evaluateCalculator(PARTIN_CALCULATOR, { psaCat: '4to10', gg: '2', ct: 't2a' });
  equal(evaluation.status, 'calculated');
  equal(evaluation.result.title, 'Consulta de tablas Partin oficiales');
  equal(evaluation.result.detail, 'Perfil preparado: PSA 4to10, T2A, GG2.');
  equal(evaluation.result.metrics.some((metric) => String(metric.value).includes('%')), false);
  const link = evaluation.result.notes[1];
  equal(typeof link === 'object' ? link.kind : '', 'external-link');
  equal(typeof link === 'object' && link.kind === 'external-link' ? link.label : '', 'Abrir tablas Partin de Johns Hopkins');
  equal(typeof link === 'object' && link.kind === 'external-link' ? new URL(link.href).protocol : '', 'https:');
});

test('Partin rejects unknown lookup categories', () => {
  const evaluation = evaluateCalculator(PARTIN_CALCULATOR, { psaCat: 'invented', gg: '2', ct: 't2a' });
  equal(evaluation.status, 'invalid');
  deepEqual(evaluation.issues.map((issue) => issue.code), ['unknown-option']);
});

test('Roach nodal risk keeps the historical formula exact and does not clamp it', () => {
  const blank = evaluateCalculator(NODAL_RISK_CALCULATOR);
  deepEqual(blank.issues.map((issue) => issue.fieldId), ['psa', 'gleason']);

  const golden = evaluateCalculator(NODAL_RISK_CALCULATOR, { psa: 12, gleason: '7' });
  equal(golden.result.title, 'Roach: 18.0%');
  equal(golden.result.severity, 'info');
  equal(evaluateCalculator(NODAL_RISK_CALCULATOR, { psa: 0, gleason: '6' }).result.title, 'Roach: 0.0%');
  equal(evaluateCalculator(NODAL_RISK_CALCULATOR, { psa: 90, gleason: '10' }).result.title, 'Roach: 100.0%');

  const above = evaluateCalculator(NODAL_RISK_CALCULATOR, { psa: 90.1, gleason: '10' });
  equal(above.result.title, 'Roach fuera del rango interpretable');
  equal(above.result.metrics[0]?.value, '100.1%');
  equal(above.result.severity, 'warn');
});

test('Roach exposes Briganti only as a typed HTTPS reference and validates its inputs', () => {
  const evaluation = evaluateCalculator(NODAL_RISK_CALCULATOR, { psa: 12, gleason: '7' });
  const link = evaluation.result.notes[1];
  equal(typeof link === 'object' ? link.kind : '', 'external-link');
  equal(typeof link === 'object' && link.kind === 'external-link' ? link.label : '', 'Abrir nomograma validado');
  equal(typeof link === 'object' && link.kind === 'external-link' ? new URL(link.href).protocol : '', 'https:');

  equal(evaluateCalculator(NODAL_RISK_CALCULATOR, { psa: -0.1, gleason: '7' }).issues[0]?.code, 'below-minimum');
  equal(evaluateCalculator(NODAL_RISK_CALCULATOR, { psa: 12.05, gleason: '7' }).issues[0]?.code, 'step-mismatch');
  equal(evaluateCalculator(NODAL_RISK_CALCULATOR, { psa: 12, gleason: '11' }).issues[0]?.code, 'unknown-option');
});

test('calculators 12 to 15 preserve blank forms and legacy examples', () => {
  const mskcc = evaluateCalculator(MSKCC_PROSTATE_CALCULATOR);
  equal(mskcc.status, 'invalid');
  equal(mskcc.values['scenario'], 'pre');
  deepEqual(mskcc.issues.map((issue) => issue.fieldId), [
    'msk_pre_no_hormone', 'msk_pre_no_radiation', 'msk_pre_age', 'msk_pre_psa',
    'msk_pre_gleason_primary', 'msk_pre_gleason_secondary', 'msk_pre_stage'
  ]);

  const psaDates = MSKCC_PROSTATE_CALCULATOR.fields.find((field) => field.id === 'msk_psadt_dates');
  equal(psaDates?.kind === 'text' ? psaDates.initialValue : null, '');
  equal(psaDates?.kind === 'text' ? psaDates.exampleValue : null, '01/01/2025, 01/01/2026');
  equal(psaDates?.kind === 'text' ? psaDates.placeholder : null, 'Ej.: 01/01/2025, 01/01/2026');

  const pbcg = evaluateCalculator(BIOPSY_RISK_CALCULATOR);
  deepEqual(pbcg.issues.map((issue) => issue.fieldId), ['psa', 'age']);
  equal(pbcg.values['dre'], false);

  const kinetics = evaluateCalculator(PSA_KINETICS_CALCULATOR);
  deepEqual(kinetics.issues.map((issue) => issue.fieldId), ['psa', 'volume', 'context']);
  equal(kinetics.values['psaSeries'], '');
  equal(kinetics.values['nadir'], '');
  const seriesField = PSA_KINETICS_CALCULATOR.fields.find((field) => field.id === 'psaSeries');
  equal(seriesField?.kind === 'textarea' ? seriesField.exampleValue : null,
    '01/01/2025; 1,0\n01/07/2025; 2,0\n01/01/2026; 4,0');

  const metastatic = evaluateCalculator(CHAARTED_LATITUDE_CALCULATOR);
  deepEqual(metastatic.issues.map((issue) => issue.fieldId), ['bone']);
  equal(metastatic.values['visceral'], false);
  equal(metastatic.values['outsideAxial'], false);
  equal(metastatic.values['gleasonHigh'], false);
});

test('MSKCC validates only the selected scenario and keeps optional inputs optional', () => {
  const scenarios: readonly [string, readonly string[]][] = [
    ['volume', ['msk_volume_length', 'msk_volume_width', 'msk_volume_height', 'msk_volume_psa']],
    ['psadt', ['msk_psadt_dates', 'msk_psadt_values', 'msk_psadt_minimum_series']],
    ['post', [
      'msk_post_no_hormone', 'msk_post_no_radiation', 'msk_post_preop_psa',
      'msk_post_age_surgery', 'msk_post_months_undetectable', 'msk_post_gleason_primary',
      'msk_post_gleason_secondary', 'msk_post_margins', 'msk_post_ece',
      'msk_post_svi', 'msk_post_nodes'
    ]]
  ];
  for (const [scenario, expected] of scenarios) {
    const evaluation = evaluateCalculator(MSKCC_PROSTATE_CALCULATOR, { scenario });
    deepEqual(evaluation.issues.map((issue) => issue.fieldId), expected);
  }
  const whitespace = evaluateCalculator(MSKCC_PROSTATE_CALCULATOR, {
    scenario: 'psadt',
    msk_psadt_dates: '   ',
    msk_psadt_values: '2.5, 5.0',
    msk_psadt_minimum_series: '2'
  });
  deepEqual(whitespace.issues.map((issue) => issue.fieldId), ['msk_psadt_dates']);
});

test('MSKCC preoperative golden result uses typed checklists and overview data', () => {
  const evaluation = evaluateCalculator(MSKCC_PROSTATE_CALCULATOR, mskccPreInput());
  equal(evaluation.status, 'calculated');
  deepEqual(evaluation.result, {
    title: 'Datos listos para MSKCC',
    detail: 'Escenario: Pre-prostatectomia radical. El resultado numérico se obtiene únicamente en el nomograma oficial.',
    badge: 'listo',
    score: 0,
    showScore: false,
    severity: 'good',
    metrics: [
      { label: 'Obligatorios', value: '7/7' },
      { label: 'Opcionales', value: '0/2' },
      { label: 'Faltantes', value: 0 },
      { label: 'Opcional', value: '0%' }
    ],
    notes: evaluation.result.notes
  });

  const link = evaluation.result.notes[0];
  equal(typeof link === 'object' && link.kind === 'external-link' ? link.label : '',
    'Abrir nomograma interactivo MSKCC: Pre-prostatectomia radical');
  equal(typeof link === 'object' && link.kind === 'external-link' ? new URL(link.href).protocol : '', 'https:');

  const required = evaluation.result.notes[1];
  equal(typeof required === 'object' && required.kind === 'checklist' ? required.items.length : 0, 7);
  equal(typeof required === 'object' && required.kind === 'checklist'
    ? required.items.every((item) => item.status === 'complete') : false, true);

  const optional = evaluation.result.notes[2];
  equal(typeof optional === 'object' && optional.kind === 'checklist' ? optional.items.length : 0, 2);
  equal(typeof optional === 'object' && optional.kind === 'checklist'
    ? optional.items.every((item) => item.status === 'missing') : false, true);

  const overview = evaluation.result.notes[3];
  equal(typeof overview === 'object' && overview.kind === 'table' ? overview.rows.length : 0, 7);
  if (typeof overview === 'object' && overview.kind === 'table') {
    deepEqual(overview.columns, ['Nomograma', 'Completitud', 'Faltante principal', 'MSKCC']);
    deepEqual(overview.rows[0]?.slice(0, 3), ['Pre-prostatectomia radical', '100%', 'Listo']);
    equal(overview.rows[1]?.[1], '0%');
    const overviewLink = overview.rows[0]?.[3];
    equal(typeof overviewLink === 'object' && overviewLink.kind === 'external-link'
      ? new URL(overviewLink.href).protocol : '', 'https:');
  }
  assertNoRawMarkup(evaluation.result.notes);
});

test('MSKCC volume scenario completes four required values without a local estimate', () => {
  const evaluation = evaluateCalculator(MSKCC_PROSTATE_CALCULATOR, {
    scenario: 'volume',
    msk_volume_length: 4.5,
    msk_volume_width: 4,
    msk_volume_height: 3.5,
    msk_volume_psa: 7.01
  });
  equal(evaluation.status, 'calculated');
  equal(evaluation.result.title, 'Datos listos para MSKCC');
  deepEqual(evaluation.result.metrics, [
    { label: 'Obligatorios', value: '4/4' },
    { label: 'Opcionales', value: 'no aplica' },
    { label: 'Faltantes', value: 0 },
    { label: 'Opcional', value: 'no aplica' }
  ]);
  equal(evaluation.result.metrics.some((metric) => String(metric.value).includes('riesgo')), false);
});

test('MSKCC rejects unknown scenarios and invalid values before opening an external model', () => {
  const scenario = evaluateCalculator(MSKCC_PROSTATE_CALCULATOR, { scenario: 'invented' });
  equal(scenario.status, 'invalid');
  deepEqual(scenario.issues.map((issue) => issue.code), ['unknown-option']);

  const age = evaluateCalculator(MSKCC_PROSTATE_CALCULATOR, mskccPreInput({ msk_pre_age: 34 }));
  equal(age.status, 'invalid');
  deepEqual(age.issues.map((issue) => issue.code), ['below-minimum']);
});

test('PBCG golden probabilities match the public legacy coefficients', () => {
  const evaluation = evaluateCalculator(BIOPSY_RISK_CALCULATOR, pbcgInput());
  equal(evaluation.status, 'calculated');
  deepEqual(evaluation.result, {
    title: 'PBCG: 30.0% de alto grado',
    detail: 'Probabilidades mutuamente excluyentes calculadas con los coeficientes públicos PBCG.',
    badge: 'PBCG',
    score: 0,
    showScore: false,
    severity: 'info',
    metrics: [
      { label: 'Sin cáncer', value: '49.8%' },
      { label: 'Bajo grado', value: '20.2%' },
      { label: 'Alto grado', value: '30.0%' }
    ],
    notes: evaluation.result.notes
  });
  const link = evaluation.result.notes[2];
  equal(typeof link === 'object' && link.kind === 'external-link' ? link.label : '',
    'Comparar con PBCG oficial');
  equal(typeof link === 'object' && link.kind === 'external-link' ? new URL(link.href).protocol : '', 'https:');
  assertNoRawMarkup(evaluation.result.notes);
});

test('PBCG accepts inclusive validated limits and rejects values outside them', () => {
  equal(evaluateCalculator(BIOPSY_RISK_CALCULATOR, pbcgInput({ psa: 2, age: 40 })).status, 'calculated');
  equal(evaluateCalculator(BIOPSY_RISK_CALCULATOR, pbcgInput({ psa: 50, age: 90 })).status, 'calculated');

  const belowPsa = evaluateCalculator(BIOPSY_RISK_CALCULATOR, pbcgInput({ psa: 1.9 }));
  deepEqual(belowPsa.issues.map((issue) => issue.code), ['below-minimum']);
  const abovePsa = evaluateCalculator(BIOPSY_RISK_CALCULATOR, pbcgInput({ psa: 50.1 }));
  deepEqual(abovePsa.issues.map((issue) => issue.code), ['above-maximum']);
  const belowAge = evaluateCalculator(BIOPSY_RISK_CALCULATOR, pbcgInput({ age: 39 }));
  deepEqual(belowAge.issues.map((issue) => issue.code), ['below-minimum']);
  const aboveAge = evaluateCalculator(BIOPSY_RISK_CALCULATOR, pbcgInput({ age: 91 }));
  deepEqual(aboveAge.issues.map((issue) => issue.code), ['above-maximum']);
});

test('PBCG preserves all four binary predictors and mutually exclusive output', () => {
  const evaluation = evaluateCalculator(BIOPSY_RISK_CALCULATOR, pbcgInput({
    african: true,
    priorNegative: true,
    dre: true,
    family: true
  }));
  deepEqual(evaluation.result.metrics, [
    { label: 'Sin cáncer', value: '34.2%' },
    { label: 'Bajo grado', value: '19.3%' },
    { label: 'Alto grado', value: '46.4%' }
  ]);
});

test('PSA kinetics golden series preserves density, dates, decimal commas and regression', () => {
  const evaluation = evaluateCalculator(PSA_KINETICS_CALCULATOR, psaKineticsInput());
  equal(evaluation.status, 'calculated');
  deepEqual(evaluation.result, {
    title: 'PSA-D 0.150 · PSA-DT 6.0 meses',
    detail: 'Sin criterio de recaida aplicable a este contexto',
    badge: 'sin criterio',
    score: 0,
    showScore: false,
    severity: 'info',
    metrics: [
      { label: 'PSA-D', value: '0.150' },
      { label: 'PSA-DT', value: '6.0 meses' },
      { label: 'Velocidad', value: '3.00/año' },
      { label: 'Mediciones', value: 3 }
    ],
    notes: [
      'PSA-DT calculado por regresión logarítmica de toda la serie.',
      'La separación temporal de la serie es adecuada para el cálculo.',
      'Se eliminó el score compuesto local: PSA-D, PSA-DT y BCR son resultados diferentes.'
    ]
  });

  const reordered = evaluateCalculator(PSA_KINETICS_CALCULATOR, psaKineticsInput({
    psaSeries: '01/01/2026\t4,0\ntexto invalido\n01/01/2025; 1,0\n01/07/2025; 2,0'
  }));
  equal(reordered.result.title, evaluation.result.title);
  equal(reordered.result.metrics[3]?.value, 3);
});

test('PSA kinetics filters malformed and non-positive rows and reports insufficient series', () => {
  const empty = evaluateCalculator(PSA_KINETICS_CALCULATOR, psaKineticsInput({ psaSeries: '' }));
  equal(empty.result.title, 'PSA-D 0.150 · PSA-DT sin duplicación calculable');
  deepEqual(empty.result.metrics.slice(1), [
    { label: 'PSA-DT', value: 'ND' },
    { label: 'Velocidad', value: 'ND' },
    { label: 'Mediciones', value: 0 }
  ]);
  equal(empty.result.notes[0], 'Con menos de tres mediciones el PSA-DT es frágil; agregar una tercera determinación.');
  equal(empty.result.notes[1], 'No hay una serie suficiente para evaluar intervalos temporales.');

  const one = evaluateCalculator(PSA_KINETICS_CALCULATOR, psaKineticsInput({
    psaSeries: 'sin-fecha; 2\n01/01/2025; 0\n01/01/2025; 1'
  }));
  equal(one.result.metrics[3]?.value, 1);
  equal(one.result.metrics[1]?.value, 'ND');
});

test('PSA kinetics reports short gaps and long windows independently', () => {
  const shortGap = evaluateCalculator(PSA_KINETICS_CALCULATOR, psaKineticsInput({
    psaSeries: '01/01/2025; 1\n15/01/2025; 2'
  }));
  equal(shortGap.result.notes[1],
    'Hay determinaciones separadas por menos de cuatro semanas; interpretar la cinética con cautela.');

  const longWindow = evaluateCalculator(PSA_KINETICS_CALCULATOR, psaKineticsInput({
    psaSeries: '01/01/2024; 1\n01/02/2025; 2'
  }));
  equal(longWindow.result.notes[1],
    'La serie abarca más de 12 meses; revisar si conviene usar una ventana clínica más reciente.');
});

test('PSA biochemical recurrence keeps post-RT nadir and Phoenix boundary exact', () => {
  const missing = evaluateCalculator(PSA_KINETICS_CALCULATOR, psaKineticsInput({
    context: 'post_rt',
    nadir: ''
  }));
  deepEqual(missing.result, {
    title: 'Falta el nadir post-radioterapia',
    detail: 'Phoenix requiere comparar el PSA actual con nadir + 2 ng/ml.',
    badge: 'no calculable',
    score: 0,
    showScore: false,
    severity: 'warn',
    metrics: [],
    notes: []
  });

  const met = evaluateCalculator(PSA_KINETICS_CALCULATOR, psaKineticsInput({
    psa: 2.4,
    context: 'post_rt',
    nadir: 0.4,
    psaSeries: ''
  }));
  equal(met.result.detail, 'Cumple Phoenix: PSA actual ≥ nadir + 2 ng/ml.');
  equal(met.result.badge, 'criterio cumplido');
  equal(met.result.severity, 'bad');

  const below = evaluateCalculator(PSA_KINETICS_CALCULATOR, psaKineticsInput({
    psa: 2.39,
    context: 'post_rt',
    nadir: 0.4,
    psaSeries: ''
  }));
  equal(below.result.detail, 'Phoenix: PSA actual ≥ nadir + 2 ng/ml');
  equal(below.result.badge, 'sin criterio');
});

test('PSA biochemical recurrence keeps post-RP confirmation gate exact', () => {
  const pending = evaluateCalculator(PSA_KINETICS_CALCULATOR, psaKineticsInput({
    psa: 0.2,
    context: 'post_rp',
    confirmed: false,
    psaSeries: ''
  }));
  equal(pending.result.detail, 'Umbral post-RP alcanzado; falta un PSA confirmatorio posterior.');
  equal(pending.result.badge, 'pendiente');
  equal(pending.result.severity, 'warn');

  const confirmed = evaluateCalculator(PSA_KINETICS_CALCULATOR, psaKineticsInput({
    psa: 0.2,
    context: 'post_rp',
    confirmed: true,
    psaSeries: ''
  }));
  equal(confirmed.result.detail, 'Cumple Post-RP: PSA ≥0,2 ng/ml confirmado.');
  equal(confirmed.result.badge, 'criterio cumplido');

  const below = evaluateCalculator(PSA_KINETICS_CALCULATOR, psaKineticsInput({
    psa: 0.19,
    context: 'post_rp',
    confirmed: true,
    psaSeries: ''
  }));
  equal(below.result.detail, 'Post-RP: PSA ≥0,2 ng/ml confirmado');
  equal(below.result.badge, 'sin criterio');
});

test('CHAARTED and LATITUDE preserve independent threshold logic', () => {
  const cases: readonly [Readonly<Record<string, unknown>>, string, string][] = [
    [{ bone: 0 }, 'CHAARTED bajo volumen · LATITUDE no alto riesgo', '0/3'],
    [{ bone: 3 }, 'CHAARTED bajo volumen · LATITUDE no alto riesgo', '1/3'],
    [{ bone: 4 }, 'CHAARTED bajo volumen · LATITUDE no alto riesgo', '1/3'],
    [{ bone: 4, outsideAxial: true }, 'CHAARTED alto volumen · LATITUDE no alto riesgo', '1/3'],
    [{ bone: 0, visceral: true }, 'CHAARTED alto volumen · LATITUDE no alto riesgo', '1/3'],
    [{ bone: 3, gleasonHigh: true }, 'CHAARTED bajo volumen · LATITUDE alto riesgo', '2/3'],
    [{ bone: 0, visceral: true, gleasonHigh: true }, 'CHAARTED alto volumen · LATITUDE alto riesgo', '2/3'],
    [{ bone: 3, visceral: true, gleasonHigh: true }, 'CHAARTED alto volumen · LATITUDE alto riesgo', '3/3']
  ];
  for (const [input, title, factors] of cases) {
    const evaluation = evaluateCalculator(CHAARTED_LATITUDE_CALCULATOR, input);
    equal(evaluation.result.title, title);
    equal(evaluation.result.metrics[1]?.value, factors);
  }
});

test('CHAARTED accepts zero and rejects negative bone lesion counts', () => {
  equal(evaluateCalculator(CHAARTED_LATITUDE_CALCULATOR, { bone: 0 }).status, 'calculated');
  const negative = evaluateCalculator(CHAARTED_LATITUDE_CALCULATOR, { bone: -0.1 });
  equal(negative.status, 'invalid');
  deepEqual(negative.issues.map((issue) => issue.code), ['below-minimum']);
});

test('ported 12 to 15 results never contain raw HTML notes', () => {
  const results = [
    evaluateCalculator(MSKCC_PROSTATE_CALCULATOR, mskccPreInput()).result,
    evaluateCalculator(BIOPSY_RISK_CALCULATOR, pbcgInput()).result,
    evaluateCalculator(PSA_KINETICS_CALCULATOR, psaKineticsInput()).result,
    evaluateCalculator(CHAARTED_LATITUDE_CALCULATOR, { bone: 3 }).result
  ];
  for (const current of results) assertNoRawMarkup(current.notes);
});

test('calculators 16 to 19 preserve blank legacy forms and scenario-only validation', () => {
  const nmibc = evaluateCalculator(NMIBC_CALCULATOR);
  equal(nmibc.status, 'invalid');
  equal(nmibc.values['scenario'], 'eau');
  deepEqual(nmibc.issues.map((issue) => issue.fieldId), [
    'eauPrimary', 'eauAge', 'eauCount', 'eauSize', 'eauStage', 'eauSystem', 'eauGrade'
  ]);
  equal(NMIBC_CALCULATOR.fields.filter((field) =>
    (field.kind === 'number' || field.kind === 'select') && field.id !== 'scenario'
  ).every((field) => field.initialValue === ''), true);

  const eortc = evaluateCalculator(NMIBC_CALCULATOR, { scenario: 'eortc' });
  deepEqual(eortc.issues.map((issue) => issue.fieldId), ['number', 'size', 'prior', 'grade']);
  const cueto = evaluateCalculator(NMIBC_CALCULATOR, { scenario: 'cueto' });
  deepEqual(cueto.issues.map((issue) => issue.fieldId), ['cuetoSex', 'cuetoAge', 'cuetoGrade']);

  deepEqual(evaluateCalculator(CYSTECTOMY_CALCULATOR).issues.map((issue) => issue.fieldId),
    ['m', 'pt', 'pn', 'perioperative', 'cisStatus']);
  deepEqual(evaluateCalculator(CISPLATIN_CALCULATOR).issues.map((issue) => issue.fieldId),
    ['ecog', 'renalMethod', 'gfr', 'hearing', 'neuro', 'nyha']);
  deepEqual(evaluateCalculator(UTUC_CALCULATOR).issues.map((issue) => issue.fieldId),
    ['utucM', 'size', 'focality', 'cytology', 'biopsy', 'ctAssessment']);
});

test('EAU NMIBC golden low-risk case preserves population probabilities', () => {
  const evaluation = evaluateCalculator(NMIBC_CALCULATOR, nmibcEauInput());
  equal(evaluation.status, 'calculated');
  deepEqual(evaluation.result, {
    title: 'EAU: riesgo bajo',
    detail: 'Probabilidades poblacionales para tumores primarios incluidos en el modelo.',
    badge: 'EAU 2021/2026',
    score: 0,
    showScore: false,
    severity: 'good',
    metrics: [
      { label: 'Grupo EAU', value: 'bajo' },
      { label: 'Factores clínicos', value: '0/3' },
      { label: 'Progresión 1 año', value: '0.06%' },
      { label: 'Progresión 5 años', value: '0.9%' },
      { label: 'Progresión 10 años', value: '3.7%' }
    ],
    notes: ['No combinar este grupo con EORTC o CUETO.']
  });
});

test('EAU NMIBC factor thresholds are strict for age and count and inclusive for size', () => {
  const boundaries: readonly [Readonly<Record<string, unknown>>, string, string][] = [
    [{ eauAge: 70, eauCount: 1, eauSize: 2.9 }, 'EAU: riesgo bajo', '0/3'],
    [{ eauAge: 71, eauCount: 1, eauSize: 2.9 }, 'EAU: riesgo bajo', '1/3'],
    [{ eauAge: 70, eauCount: 2, eauSize: 2.9 }, 'EAU: riesgo bajo', '1/3'],
    [{ eauAge: 70, eauCount: 1, eauSize: 3 }, 'EAU: riesgo bajo', '1/3'],
    [{ eauAge: 71, eauCount: 2, eauSize: 2.9 }, 'EAU: riesgo intermedio', '2/3'],
    [{ eauAge: 71, eauCount: 2, eauSize: 3 }, 'EAU: riesgo alto', '3/3']
  ];
  for (const [override, expectedTitle, expectedFactors] of boundaries) {
    const evaluation = evaluateCalculator(NMIBC_CALCULATOR, nmibcEauInput(override));
    equal(evaluation.result.title, expectedTitle);
    equal(evaluation.result.metrics[1]?.value, expectedFactors);
  }
});

test('EAU NMIBC rejects incompatible grade systems and separates special/recurrent outputs', () => {
  const incompatible = evaluateCalculator(NMIBC_CALCULATOR, nmibcEauInput({
    eauSystem: 'who2004', eauGrade: 'g1'
  }));
  equal(incompatible.result.title, 'EAU NMIBC no calculable');
  equal(incompatible.result.detail,
    'Completar sistema de grado, grado compatible, presentación, edad, tamaño, focalidad y estadio');

  const recurrent = evaluateCalculator(NMIBC_CALCULATOR, nmibcEauInput({ eauPrimary: 'no' }));
  equal(recurrent.result.title, 'EAU: riesgo intermedio');
  equal(recurrent.result.metrics.length, 2);
  equal(recurrent.result.detail,
    'Grupo asignado; la tabla no ofrece probabilidades válidas para este contexto.');

  const pureCis = evaluateCalculator(NMIBC_CALCULATOR, nmibcEauInput({ eauPureCis: true }));
  equal(pureCis.result.title, 'EAU: riesgo alto');
  equal(pureCis.result.metrics.length, 2);
  const lvi = evaluateCalculator(NMIBC_CALCULATOR, nmibcEauInput({ eauLvi: true }));
  equal(lvi.result.title, 'EAU: riesgo muy alto');
  equal(lvi.result.metrics.length, 2);
});

test('EAU NMIBC preserves the independent WHO 1973 probability table', () => {
  const low = evaluateCalculator(NMIBC_CALCULATOR, nmibcEauInput({
    eauSystem: 'who1973', eauGrade: 'g1'
  }));
  equal(low.result.title, 'EAU: riesgo bajo');
  deepEqual(low.result.metrics.slice(2), [
    { label: 'Progresión 1 año', value: '0.12%' },
    { label: 'Progresión 5 años', value: '0.6%' },
    { label: 'Progresión 10 años', value: '3.0%' }
  ]);

  const veryHigh = evaluateCalculator(NMIBC_CALCULATOR, nmibcEauInput({
    eauAge: 71, eauStage: 't1', eauCis: true, eauSystem: 'who1973', eauGrade: 'g3'
  }));
  equal(veryHigh.result.title, 'EAU: riesgo muy alto');
  deepEqual(veryHigh.result.metrics.slice(2), [
    { label: 'Progresión 1 año', value: '20.00%' },
    { label: 'Progresión 5 años', value: '44.0%' },
    { label: 'Progresión 10 años', value: '59.0%' }
  ]);
});

test('EORTC NMIBC golden endpoints preserve historical score tables', () => {
  const minimum = evaluateCalculator(NMIBC_CALCULATOR, nmibcEortcInput());
  deepEqual(minimum.result.metrics, [
    { label: 'Recurrencia 1/5 años', value: '15% / 31%' },
    { label: 'Progresión 1/5 años', value: '0.2% / 0.8%' }
  ]);
  equal(minimum.result.detail, 'Recurrencia 0; progresión 0.');

  const maximum = evaluateCalculator(NMIBC_CALCULATOR, nmibcEortcInput({
    number: '6', size: '3', prior: '4', t1: true, cis: true, grade: '2'
  }));
  equal(maximum.result.detail, 'Recurrencia 17; progresión 23.');
  deepEqual(maximum.result.metrics, [
    { label: 'Recurrencia 1/5 años', value: '61% / 78%' },
    { label: 'Progresión 1/5 años', value: '17% / 45%' }
  ]);
});

test('EORTC NMIBC keeps every recurrence and progression probability band', () => {
  const cases: readonly [Readonly<Record<string, unknown>>, string, string][] = [
    [{ t1: true }, '24% / 46%', '1% / 6%'],
    [{ number: '3', prior: '2' }, '38% / 62%', '1% / 6%'],
    [{ size: '3', t1: true }, '24% / 46%', '5% / 17%'],
    [{ number: '6', size: '3', t1: true }, '61% / 78%', '5% / 17%'],
    [{ number: '6', size: '3', prior: '4', t1: true, cis: true, grade: '2' },
      '61% / 78%', '17% / 45%']
  ];
  for (const [overrides, recurrence, progression] of cases) {
    const evaluation = evaluateCalculator(NMIBC_CALCULATOR, nmibcEortcInput(overrides));
    equal(evaluation.result.metrics[0]?.value, recurrence);
    equal(evaluation.result.metrics[1]?.value, progression);
  }
});

test('CUETO requires cohort confirmation and preserves age/tier boundaries', () => {
  const unconfirmed = evaluateCalculator(NMIBC_CALCULATOR, nmibcCuetoInput());
  equal(unconfirmed.result.title, 'Confirmar aplicabilidad CUETO');
  equal(unconfirmed.result.metrics.length, 0);

  const age70 = evaluateCalculator(NMIBC_CALCULATOR, nmibcCuetoInput({
    cuetoAge: 70, cuetoConfirmed: true
  }));
  equal(age70.result.detail, 'Recurrencia 1; progresión 0.');
  const age71 = evaluateCalculator(NMIBC_CALCULATOR, nmibcCuetoInput({
    cuetoAge: 71, cuetoConfirmed: true
  }));
  equal(age71.result.detail, 'Recurrencia 2; progresión 2.');

  const maximum = evaluateCalculator(NMIBC_CALCULATOR, nmibcCuetoInput({
    cuetoSex: 'female', cuetoAge: 71, cuetoMoreThree: true, cuetoRecurrent: true,
    cuetoT1: true, cuetoCis: true, cuetoGrade: 'g3', cuetoConfirmed: true
  }));
  equal(maximum.result.detail, 'Recurrencia 16; progresión 14.');
  deepEqual(maximum.result.metrics, [
    { label: 'Recurrencia 1/5 años', value: '42% / 68%' },
    { label: 'Progresión 1/5 años', value: '14% / 34%' }
  ]);
});

test('CUETO preserves all historical risk-table bands', () => {
  const cases: readonly [Readonly<Record<string, unknown>>, string, string][] = [
    [{ cuetoGrade: 'g3' }, '8% / 21%', '3% / 12%'],
    [{ cuetoSex: 'female', cuetoAge: 71 }, '12% / 36%', '1% / 4%'],
    [{ cuetoAge: 71, cuetoMoreThree: true, cuetoRecurrent: true }, '25% / 48%', '3% / 12%'],
    [{ cuetoAge: 71, cuetoMoreThree: true, cuetoRecurrent: true, cuetoT1: true, cuetoCis: true },
      '42% / 68%', '6% / 21%'],
    [{ cuetoSex: 'female', cuetoAge: 71, cuetoMoreThree: true, cuetoRecurrent: true,
      cuetoT1: true, cuetoCis: true, cuetoGrade: 'g3' }, '42% / 68%', '14% / 34%']
  ];
  for (const [overrides, recurrence, progression] of cases) {
    const evaluation = evaluateCalculator(NMIBC_CALCULATOR, nmibcCuetoInput({
      cuetoConfirmed: true,
      ...overrides
    }));
    equal(evaluation.result.metrics[0]?.value, recurrence);
    equal(evaluation.result.metrics[1]?.value, progression);
  }
});

test('post-cystectomy separates out-of-scope, incomplete and no-trigger cases', () => {
  const metastatic = evaluateCalculator(CYSTECTOMY_CALCULATOR, cystectomyInput({ m: 'm1' }));
  equal(metastatic.result.title, 'Fuera de alcance adyuvante');
  equal(metastatic.result.detail, 'Enfermedad M1: fuera del módulo adyuvante post-cistectomía');

  const unknownM = evaluateCalculator(CYSTECTOMY_CALCULATOR, cystectomyInput({ m: 'mx' }));
  equal(unknownM.result.title, 'Datos incompletos');
  const unknownNodes = evaluateCalculator(CYSTECTOMY_CALCULATOR, cystectomyInput({ pn: 'nx' }));
  equal(unknownNodes.result.title, 'Datos incompletos');

  const noTrigger = evaluateCalculator(CYSTECTOMY_CALCULATOR, cystectomyInput());
  equal(noTrigger.result.title, 'Revisión adyuvante post-cistectomía');
  equal(noTrigger.result.detail,
    'No cumple un disparador adyuvante EAU por estadio con los datos ingresados');
});

test('post-cystectomy preserves chemotherapy, nivolumab and radiotherapy gates', () => {
  const chemotherapy = evaluateCalculator(CYSTECTOMY_CALCULATOR, cystectomyInput({ pt: '3' }));
  equal(chemotherapy.result.detail, 'Ofrecer quimioterapia adyuvante combinada basada en cisplatino');

  const afterNac = evaluateCalculator(CYSTECTOMY_CALCULATOR, cystectomyInput({
    pt: '2', perioperative: 'nac'
  }));
  equal(afterNac.result.detail, 'Evaluar nivolumab adyuvante en comité multidisciplinario');

  const declined = evaluateCalculator(CYSTECTOMY_CALCULATOR, cystectomyInput({
    pt: '3', cisStatus: 'declined'
  }));
  equal(declined.result.detail, 'Evaluar nivolumab adyuvante en comité multidisciplinario');

  const thresholdBelow = evaluateCalculator(CYSTECTOMY_CALCULATOR, cystectomyInput({ pt: '3' }));
  equal(thresholdBelow.result.detail.includes('radioterapia'), false);
  const threshold = evaluateCalculator(CYSTECTOMY_CALCULATOR, cystectomyInput({ pt: '3.5' }));
  equal(threshold.result.detail.includes('Considerar radioterapia adyuvante'), true);
  const margin = evaluateCalculator(CYSTECTOMY_CALCULATOR, cystectomyInput({ margin: true }));
  equal(margin.result.detail.includes('Considerar radioterapia adyuvante'), true);
  const nodes = evaluateCalculator(CYSTECTOMY_CALCULATOR, cystectomyInput({ pn: 'nplus' }));
  equal(nodes.result.detail.includes('Considerar radioterapia adyuvante'), true);

  const modern = evaluateCalculator(CYSTECTOMY_CALCULATOR, cystectomyInput({
    pt: '4', perioperative: 'modern'
  }));
  equal(modern.result.detail.startsWith(
    'Aplicar el protocolo perioperatorio moderno y evitar apilar adyuvancias automáticamente'), true);
  equal(modern.result.detail.includes('Ofrecer quimioterapia'), false);
});

test('cisplatin golden eligible case and renal boundaries match legacy', () => {
  const eligible = evaluateCalculator(CISPLATIN_CALCULATOR, cisplatinInput());
  deepEqual(eligible.result, {
    title: 'Apto probable para cisplatino convencional',
    detail: 'No se detectan criterios conservadores de no aptitud.',
    badge: 'cisplatino probable',
    score: 0,
    showScore: false,
    severity: 'good',
    metrics: [
      { label: 'Función renal', value: '65 ml/min' },
      { label: 'Método', value: 'measured_gfr' },
      { label: 'Criterios', value: 0 }
    ],
    notes: [
      'Edad sola no contraindica cisplatino.',
      'Aplicar la ficha y el protocolo específicos del régimen elegido.',
      'Regímenes perioperatorios modernos pueden tener umbrales propios; esos criterios prevalecen.'
    ]
  });

  const sixty = evaluateCalculator(CISPLATIN_CALCULATOR, cisplatinInput({ gfr: 60 }));
  equal(sixty.result.title, 'No apto para cisplatino convencional; posible carboplatino');
  equal(sixty.result.detail, 'Criterios presentes: GFR ≤60 ml/min.');
  equal(sixty.result.notes[1],
    'GFR 40–60: zona renal limítrofe; considerar medición isotópica/formal. Split-dose no se recomienda automáticamente.');
  const thirty = evaluateCalculator(CISPLATIN_CALCULATOR, cisplatinInput({ gfr: 30 }));
  equal(thirty.result.title, 'No apto para cisplatino convencional; posible carboplatino');
  const belowThirty = evaluateCalculator(CISPLATIN_CALCULATOR, cisplatinInput({ gfr: 29.9 }));
  equal(belowThirty.result.title, 'No apto para platinum');
});

test('cisplatin preserves performance/comorbidity gates and renal method as display-only', () => {
  const ecogAtSixty = evaluateCalculator(CISPLATIN_CALCULATOR, cisplatinInput({ ecog: '2', gfr: 60 }));
  equal(ecogAtSixty.result.title, 'No apto para cisplatino convencional; posible carboplatino');
  const ecogBelowSixty = evaluateCalculator(CISPLATIN_CALCULATOR, cisplatinInput({ ecog: '2', gfr: 59.9 }));
  equal(ecogBelowSixty.result.title, 'No apto para platinum');
  equal(evaluateCalculator(CISPLATIN_CALCULATOR, cisplatinInput({ ecog: '3' })).result.title,
    'No apto para platinum');
  equal(evaluateCalculator(CISPLATIN_CALCULATOR, cisplatinInput({ severeComorbidity: true })).result.title,
    'No apto para platinum');

  const complications = evaluateCalculator(CISPLATIN_CALCULATOR, cisplatinInput({
    hearing: '2', neuro: '2', nyha: '3'
  }));
  equal(complications.result.title, 'No apto para cisplatino convencional; posible carboplatino');
  equal(complications.result.detail,
    'Criterios presentes: hipoacusia audiometrica ≥G2, neuropatia ≥G2, insuficiencia cardiaca NYHA III/IV.');

  const measured = evaluateCalculator(CISPLATIN_CALCULATOR, cisplatinInput({ renalMethod: 'measured_gfr' }));
  const estimated = evaluateCalculator(CISPLATIN_CALCULATOR, cisplatinInput({ renalMethod: 'egfr' }));
  equal(measured.result.title, estimated.result.title);
  equal(estimated.result.metrics[1]?.value, 'egfr');
});

test('UTUC golden low-risk and weak-factor boundaries remain distinct', () => {
  const low = evaluateCalculator(UTUC_CALCULATOR, utucInput());
  equal(low.result.title, 'Bajo riesgo probable');
  equal(low.result.detail,
    'Unifocal, <2 cm, citología negativa para high-grade, biopsia low-grade y TC no invasiva.');
  equal(low.result.badge, 'bajo riesgo');
  equal(low.result.severity, 'good');

  equal(evaluateCalculator(UTUC_CALCULATOR, utucInput({ size: 1.9 })).result.title,
    'Bajo riesgo probable');
  const weak = evaluateCalculator(UTUC_CALCULATOR, utucInput({
    size: 2, focality: 'multifocal', hydro: true
  }));
  equal(weak.result.title, 'Sin criterio fuerte; sólo factores débiles');
  equal(weak.result.detail,
    'Factores débiles: tamaño ≥2 cm, multifocalidad, hidroureteronefrosis. Decisión compartida.');
  equal(weak.result.metrics[3]?.value, 3);
});

test('UTUC strong criteria precede missing data and metastatic disease remains out of scope', () => {
  const uncertain = evaluateCalculator(UTUC_CALCULATOR, utucInput({
    size: 0, focality: 'missing', cytology: 'missing', biopsy: 'nondiagnostic', ctAssessment: 'missing'
  }));
  equal(uncertain.result.title, 'Información insuficiente para clasificar');
  equal(uncertain.result.detail,
    'Faltan: tamaño tumoral, focalidad, citología, biopsia low-grade confiable, evaluación de invasión en TC.');

  const strong = evaluateCalculator(UTUC_CALCULATOR, utucInput({
    size: 0, focality: 'missing', cytology: 'high', biopsy: 'missing', ctAssessment: 'missing'
  }));
  equal(strong.result.title, 'Alto riesgo: criterio fuerte');
  equal(strong.result.detail, 'Criterios fuertes: citología de alto grado.');

  const allStrong = evaluateCalculator(UTUC_CALCULATOR, utucInput({
    cytology: 'high', biopsy: 'high', ctAssessment: 'invasive', variant: true
  }));
  equal(allStrong.result.detail,
    'Criterios fuertes: citología de alto grado, biopsia de alto grado, invasión local en TC, variante histologica agresiva.');
  equal(allStrong.result.metrics[2]?.value, 4);

  const metastatic = evaluateCalculator(UTUC_CALCULATOR, utucInput({ utucM: 'm1' }));
  equal(metastatic.result.title, 'Fuera de alcance: enfermedad metastásica');
  equal(metastatic.result.badge, 'fuera de alcance');
});

test('ported 16 to 19 results contain typed text only and reject unknown selectors', () => {
  const results = [
    evaluateCalculator(NMIBC_CALCULATOR, nmibcEauInput()).result,
    evaluateCalculator(CYSTECTOMY_CALCULATOR, cystectomyInput()).result,
    evaluateCalculator(CISPLATIN_CALCULATOR, cisplatinInput()).result,
    evaluateCalculator(UTUC_CALCULATOR, utucInput()).result
  ];
  for (const current of results) assertNoRawMarkup(current.notes);
  const unknown = evaluateCalculator(NMIBC_CALCULATOR, nmibcEauInput({ scenario: 'combined' }));
  equal(unknown.status, 'invalid');
  deepEqual(unknown.issues.map((issue) => issue.code), ['unknown-option']);
});

test('ported 20 to 23 preserve canonical metadata and complete field order', () => {
  deepEqual([
    RENAL_COMPLEXITY_CALCULATOR,
    LEIBOVICH_CALCULATOR,
    IMDC_CALCULATOR,
    IGCCCG_CALCULATOR
  ].map((definition) => ({
    id: definition.id,
    title: definition.title,
    category: definition.category,
    subtitle: definition.subtitle,
    source: definition.source,
    fieldIds: definition.fields.map((field) => field.id)
  })), [
    {
      id: 'renal-complexity', title: 'RENAL / PADUA', category: 'renal',
      subtitle: 'Complejidad anatómica, con escalas separadas.',
      source: 'RENAL nephrometry 2009 · PADUA 2009',
      fieldIds: ['scenario', 'renal_anatomy', 'renalSize', 'renalExo', 'renalNear', 'renalAp',
        'renalLocation', 'renalHilar', 'padua_anatomy', 'paduaSize', 'paduaLong', 'paduaExo',
        'paduaRim', 'paduaSinus', 'paduaCollecting', 'paduaAp']
    },
    {
      id: 'leibovich', title: 'Leibovich 2003 / UISS localizado', category: 'renal',
      subtitle: 'Modelos posnefrectomía separados y sin porcentajes locales.',
      source: 'EAU RCC 2026 · Leibovich 2003 · UISS',
      fieldIds: ['scenario', 'leibovich_path', 'leibPt', 'leibPn', 'leibSize', 'leibGrade',
        'leibNecrosis', 'uiss_path', 'uissPt', 'uissN', 'uissM', 'uissGrade', 'uissEcog']
    },
    {
      id: 'imdc', title: 'IMDC — carcinoma renal metastásico', category: 'renal',
      subtitle: 'Pronóstico en carcinoma renal metastásico.', source: 'EAU RCC 2026 · IMDC',
      fieldIds: ['imdc_factors', 'kps', 'time', 'hb', 'calcium', 'neut', 'platelets']
    },
    {
      id: 'igcccg', title: 'IGCCCG testículo', category: 'testiculo',
      subtitle: 'Riesgo en tumores germinales metastásicos.',
      source: 'EAU Testicular Cancer 2026 · IGCCCG Update',
      fieldIds: ['igcccg_context', 'histology', 'primary', 'nonPulmonary', 'afp',
        'afpUpperLimit', 'hcg', 'ldhRatio']
    }
  ]);
});

test('renal, Leibovich and IGCCCG open without clinical defaults while preserving examples', () => {
  const renal = evaluateCalculator(RENAL_COMPLEXITY_CALCULATOR);
  equal(renal.status, 'invalid');
  equal(renal.values['scenario'], 'renal');
  deepEqual(renal.issues.map((issue) => issue.fieldId),
    ['renalSize', 'renalExo', 'renalNear', 'renalAp', 'renalLocation']);
  const renalSize = RENAL_COMPLEXITY_CALCULATOR.fields.find((field) => field.id === 'renalSize');
  equal(renalSize?.kind === 'number' ? renalSize.exampleValue : null, 3.2);

  const leibovich = evaluateCalculator(LEIBOVICH_CALCULATOR);
  equal(leibovich.status, 'invalid');
  equal(leibovich.values['scenario'], 'leibovich');
  deepEqual(leibovich.issues.map((issue) => issue.fieldId), ['leibPt', 'leibSize', 'leibGrade']);

  const igcccg = evaluateCalculator(IGCCCG_CALCULATOR);
  equal(igcccg.status, 'invalid');
  deepEqual(igcccg.issues.map((issue) => issue.fieldId),
    ['histology', 'primary', 'afp', 'afpUpperLimit', 'hcg', 'ldhRatio']);
  const histology = IGCCCG_CALCULATOR.fields.find((field) => field.id === 'histology');
  equal(histology?.kind === 'select' ? histology.exampleValue : null, 'nonseminoma');
});

test('RENAL golden minimum preserves descriptor, suffix and explanatory output', () => {
  const evaluation = evaluateCalculator(RENAL_COMPLEXITY_CALCULATOR, renalInput());
  deepEqual(evaluation.result, {
    title: 'RENAL 4x: complejidad baja',
    detail: 'Resultado anatómico de la escala seleccionada; no es una probabilidad de malignidad ni de complicaciones.',
    badge: 'RENAL', score: 0, showScore: false, severity: 'info',
    metrics: [
      { label: 'RENAL', value: '4x' },
      { label: 'Complejidad', value: 'baja' },
      { label: 'Tamaño', value: '3.2 cm' }
    ],
    notes: [
      'RENAL total 4–12: 4–6 baja, 7–9 moderada, 10–12 alta.',
      'Corroborar cada descriptor en imágenes multiplanares con contraste cuando sea posible.'
    ]
  });
});

test('RENAL preserves totals 6, 7, 9 and 10 and the exact 4/7 cm size borders', () => {
  const cases: readonly [Readonly<Record<string, unknown>>, string][] = [
    [{ renalSize: 4, renalLocation: '3' }, 'RENAL 6x: complejidad baja'],
    [{ renalSize: 4.1, renalLocation: '3' }, 'RENAL 7x: complejidad moderada'],
    [{ renalSize: 6.9, renalExo: '2', renalNear: '2', renalLocation: '3' },
      'RENAL 9x: complejidad moderada'],
    [{ renalSize: 7, renalExo: '2', renalNear: '2', renalLocation: '3' },
      'RENAL 10x: complejidad alta']
  ];
  for (const [overrides, expectedTitle] of cases) {
    equal(evaluateCalculator(RENAL_COMPLEXITY_CALCULATOR, renalInput(overrides)).result.title,
      expectedTitle);
  }
  const hilar = evaluateCalculator(RENAL_COMPLEXITY_CALCULATOR,
    renalInput({ renalAp: 'p', renalHilar: true }));
  equal(hilar.result.title, 'RENAL 4ph: complejidad baja');
  equal(hilar.result.metrics[0]?.value, '4ph');
});

test('PADUA golden minimum and 4/7 cm size borders preserve totals 6 through 10', () => {
  const minimum = evaluateCalculator(RENAL_COMPLEXITY_CALCULATOR, paduaInput());
  equal(minimum.result.title, 'PADUA 6x: complejidad baja');
  deepEqual(minimum.result.notes, [
    'PADUA total 6–14: 6–7 baja, 8–9 moderada, ≥10 alta.',
    'Corroborar cada descriptor en imágenes multiplanares con contraste cuando sea posible.'
  ]);
  const cases: readonly [Readonly<Record<string, unknown>>, string][] = [
    [{ paduaSize: 4.1 }, 'PADUA 7x: complejidad baja'],
    [{ paduaSize: 7 }, 'PADUA 7x: complejidad baja'],
    [{ paduaSize: 7.1 }, 'PADUA 8x: complejidad moderada'],
    [{ paduaSize: 7.1, paduaLong: '2' }, 'PADUA 9x: complejidad moderada'],
    [{ paduaSize: 7.1, paduaLong: '2', paduaRim: '2' }, 'PADUA 10x: complejidad alta']
  ];
  for (const [overrides, expectedTitle] of cases) {
    equal(evaluateCalculator(RENAL_COMPLEXITY_CALCULATOR, paduaInput(overrides)).result.title,
      expectedTitle);
  }
  equal(evaluateCalculator(RENAL_COMPLEXITY_CALCULATOR,
    paduaInput({ paduaAp: 'a' })).result.metrics[0]?.value, '6a');
});

test('RENAL and PADUA keep scenarios isolated and enforce browser constraints', () => {
  const paduaBlank = evaluateCalculator(RENAL_COMPLEXITY_CALCULATOR, { scenario: 'padua' });
  deepEqual(paduaBlank.issues.map((issue) => issue.fieldId),
    ['paduaSize', 'paduaLong', 'paduaExo', 'paduaRim', 'paduaSinus', 'paduaCollecting', 'paduaAp']);
  const below = evaluateCalculator(RENAL_COMPLEXITY_CALCULATOR, renalInput({ renalSize: 0 }));
  deepEqual(below.issues.map((issue) => issue.code), ['below-minimum']);
  const step = evaluateCalculator(RENAL_COMPLEXITY_CALCULATOR, renalInput({ renalSize: 3.25 }));
  deepEqual(step.issues.map((issue) => issue.code), ['step-mismatch']);
  const unknown = evaluateCalculator(RENAL_COMPLEXITY_CALCULATOR, renalInput({ renalAp: 'posterior' }));
  deepEqual(unknown.issues.map((issue) => issue.code), ['unknown-option']);
});

test('Leibovich golden output preserves totals 2, 3, 5 and 6 category borders', () => {
  const cases: readonly [Readonly<Record<string, unknown>>, string, string][] = [
    [{ leibPt: 'pt1b' }, 'Leibovich 2: riesgo bajo', 'good'],
    [{ leibPt: 'pt2' }, 'Leibovich 3: riesgo intermedio', 'warn'],
    [{ leibPt: 'pt3', leibNecrosis: true }, 'Leibovich 5: riesgo intermedio', 'warn'],
    [{ leibPt: 'pt3', leibPn: true }, 'Leibovich 6: riesgo alto', 'bad']
  ];
  for (const [overrides, expectedTitle, expectedSeverity] of cases) {
    const evaluation = evaluateCalculator(LEIBOVICH_CALCULATOR, leibovichInput(overrides));
    equal(evaluation.result.title, expectedTitle);
    equal(evaluation.result.severity, expectedSeverity);
  }
  const golden = evaluateCalculator(LEIBOVICH_CALCULATOR, leibovichInput({ leibPt: 'pt1b' }));
  equal(golden.result.detail, 'Puntaje determinístico publicado para ccRCC M0 operado.');
  deepEqual(golden.result.notes, [
    'Aplicar sólo a carcinoma renal de células claras, M0, después de cirugía.',
    'El grupo estratifica recurrencia; no indica por sí solo adyuvancia.'
  ]);
});

test('Leibovich uses the inclusive 10 cm threshold and independent point components', () => {
  const below = evaluateCalculator(LEIBOVICH_CALCULATOR,
    leibovichInput({ leibPt: 'pt1a', leibGrade: '1', leibSize: 9.9 }));
  equal(below.result.metrics[0]?.value, 0);
  const at = evaluateCalculator(LEIBOVICH_CALCULATOR,
    leibovichInput({ leibPt: 'pt1a', leibGrade: '1', leibSize: 10 }));
  equal(at.result.metrics[0]?.value, 1);
  const maximum = evaluateCalculator(LEIBOVICH_CALCULATOR, leibovichInput({
    leibPt: 'pt4', leibPn: true, leibSize: 10, leibGrade: '4', leibNecrosis: true
  }));
  equal(maximum.result.title, 'Leibovich 11: riesgo alto');
});

test('UISS preserves low, intermediate and high localized borders', () => {
  const cases: readonly [Readonly<Record<string, unknown>>, string][] = [
    [{ uissPt: 'pt1a', uissGrade: '2', uissEcog: '0' }, 'UISS: Bajo riesgo'],
    [{ uissPt: 'pt1a', uissGrade: '2', uissEcog: '1' }, 'UISS: Riesgo intermedio'],
    [{ uissPt: 'pt3', uissGrade: '2', uissEcog: '0' }, 'UISS: Riesgo intermedio'],
    [{ uissPt: 'pt3', uissGrade: '2', uissEcog: '1' }, 'UISS: Alto riesgo'],
    [{ uissPt: 'pt4', uissGrade: '1', uissEcog: '0' }, 'UISS: Alto riesgo']
  ];
  for (const [overrides, expectedTitle] of cases) {
    const evaluation = evaluateCalculator(LEIBOVICH_CALCULATOR, uissInput(overrides));
    equal(evaluation.result.title, expectedTitle);
    equal(evaluation.result.severity, 'info');
  }
});

test('UISS keeps N-positive and M1 outside its localized summary', () => {
  for (const overrides of [{ uissN: 'nplus' }, { uissM: 'm1' }]) {
    const evaluation = evaluateCalculator(LEIBOVICH_CALCULATOR, uissInput(overrides));
    equal(evaluation.result.title, 'UISS: No corresponde al UISS localizado');
    equal(evaluation.result.detail,
      'Esta versión resumida no clasifica N+ o M1 como enfermedad localizada.');
  }
  const switchedBlank = evaluateCalculator(LEIBOVICH_CALCULATOR, { scenario: 'uiss' });
  deepEqual(switchedBlank.issues.map((issue) => issue.fieldId),
    ['uissPt', 'uissN', 'uissM', 'uissGrade', 'uissEcog']);
});

test('IMDC accepts an empty checkbox form and preserves 0, 1, 2, 3 and 6 factor groups', () => {
  const cases: readonly [Readonly<Record<string, unknown>>, string, string, string][] = [
    [{}, 'IMDC favorable', '0 / 6', 'good'],
    [{ kps: true }, 'IMDC intermedio', '1 / 6', 'warn'],
    [{ kps: true, time: true }, 'IMDC intermedio', '2 / 6', 'warn'],
    [{ kps: true, time: true, hb: true }, 'IMDC pobre', '3 / 6', 'bad'],
    [{ kps: true, time: true, hb: true, calcium: true, neut: true, platelets: true },
      'IMDC pobre', '6 / 6', 'bad']
  ];
  for (const [input, expectedTitle, expectedFactors, expectedSeverity] of cases) {
    const evaluation = evaluateCalculator(IMDC_CALCULATOR, input);
    equal(evaluation.status, 'calculated');
    equal(evaluation.result.title, expectedTitle);
    equal(evaluation.result.metrics[0]?.value, expectedFactors);
    equal(evaluation.result.severity, expectedSeverity);
  }
  equal(evaluateCalculator(IMDC_CALCULATOR, { neut: true }).result.detail,
    '1 de 6 factores adversos.');
});

test('IGCCCG golden nonseminoma S1 output preserves contemporary population outcomes', () => {
  const evaluation = evaluateCalculator(IGCCCG_CALCULATOR, igcccgInput());
  deepEqual(evaluation.result, {
    title: 'IGCCCG: buen pronóstico',
    detail: 'No seminoma, grupo clásico S1.',
    badge: 'IGCCCG', score: 0, showScore: false, severity: 'good',
    metrics: [
      { label: 'S', value: 'S1' },
      { label: 'PFS 5 años', value: '90% poblacional' },
      { label: 'Supervivencia 5 años', value: '96% poblacional' },
      { label: 'Sitio primario', value: 'testis' }
    ],
    notes: [
      'Clasificar antes de iniciar quimioterapia.',
      'Los porcentajes son resultados de grupos poblacionales contemporáneos, no una predicción individual.',
      'Confirmar LDH, AFP, hCG, sitio primario y metástasis viscerales inmediatamente antes de primera línea.'
    ]
  });
});

test('IGCCCG preserves every inclusive S2 and strict S3 marker border', () => {
  const cases: readonly [Readonly<Record<string, unknown>>, string][] = [
    [{ afp: 999 }, 'S1'], [{ afp: 1000 }, 'S2'], [{ afp: 10000 }, 'S2'], [{ afp: 10001 }, 'S3'],
    [{ hcg: 4999 }, 'S1'], [{ hcg: 5000 }, 'S2'], [{ hcg: 50000 }, 'S2'], [{ hcg: 50001 }, 'S3'],
    [{ ldhRatio: 1.4 }, 'S1'], [{ ldhRatio: 1.5 }, 'S2'], [{ ldhRatio: 10 }, 'S2'],
    [{ ldhRatio: 10.1 }, 'S3']
  ];
  for (const [override, expectedMarker] of cases) {
    const evaluation = evaluateCalculator(IGCCCG_CALCULATOR,
      igcccgInput({ afp: 0, hcg: 0, ldhRatio: 0, ...override }));
    equal(evaluation.result.metrics[0]?.value, expectedMarker);
  }
});

test('IGCCCG nonseminoma maps S2 to intermediate and every poor criterion to unfavorable', () => {
  const intermediate = evaluateCalculator(IGCCCG_CALCULATOR,
    igcccgInput({ afp: 1000, hcg: 0, ldhRatio: 0 }));
  equal(intermediate.result.title, 'IGCCCG: pronóstico intermedio');
  deepEqual(intermediate.result.metrics.slice(1, 3), [
    { label: 'PFS 5 años', value: '78% poblacional' },
    { label: 'Supervivencia 5 años', value: '89% poblacional' }
  ]);
  for (const overrides of [
    { primary: 'mediastinal' },
    { nonPulmonary: true },
    { afp: 10001 }
  ]) {
    const poor = evaluateCalculator(IGCCCG_CALCULATOR,
      igcccgInput({ afp: 0, hcg: 0, ldhRatio: 0, ...overrides }));
    equal(poor.result.title, 'IGCCCG: pronóstico desfavorable');
    equal(poor.result.metrics[1]?.value, '54% poblacional');
    equal(poor.result.metrics[2]?.value, '67% poblacional');
  }
});

test('IGCCCG rejects nonseminoma other primary only until a poor criterion is present', () => {
  const unclassified = evaluateCalculator(IGCCCG_CALCULATOR, igcccgInput({
    primary: 'other', afp: 0, hcg: 0, ldhRatio: 0
  }));
  equal(unclassified.result.title, 'Sitio primario fuera de la clasificación clásica IGCCCG');
  equal(unclassified.result.badge, 'no clasificable');
  equal(unclassified.result.detail,
    'El perfil no entra en una categoría clásica sin aclarar el sitio primario.');
  const poor = evaluateCalculator(IGCCCG_CALCULATOR, igcccgInput({
    primary: 'other', nonPulmonary: true, afp: 0, hcg: 0, ldhRatio: 0
  }));
  equal(poor.result.title, 'IGCCCG: pronóstico desfavorable');
});

test('IGCCCG seminoma accepts AFP equal to ULN and rejects only AFP above it', () => {
  const equalLimit = evaluateCalculator(IGCCCG_CALCULATOR,
    igcccgInput({ histology: 'seminoma', afp: 10, afpUpperLimit: 10 }));
  equal(equalLimit.result.title, 'IGCCCG: buen pronóstico');
  const above = evaluateCalculator(IGCCCG_CALCULATOR,
    igcccgInput({ histology: 'seminoma', afp: 11, afpUpperLimit: 10 }));
  equal(above.result.title, 'No clasificable como seminoma puro: AFP elevada');
  equal(above.result.detail,
    'Revisar histología, componente no seminomatoso y otras causas de AFP elevada.');
  deepEqual(above.result.metrics, [
    { label: 'AFP', value: 11 }, { label: 'LSN AFP', value: 10 }
  ]);
});

test('IGCCCG seminoma preserves visceral group and strict LDH warning border', () => {
  const at = evaluateCalculator(IGCCCG_CALCULATOR, igcccgInput({
    histology: 'seminoma', afp: 0, hcg: 0, ldhRatio: 2.5
  }));
  equal(at.result.title, 'IGCCCG: buen pronóstico');
  equal(String(at.result.notes[1]).startsWith('Los porcentajes'), true);
  const above = evaluateCalculator(IGCCCG_CALCULATOR, igcccgInput({
    histology: 'seminoma', afp: 0, hcg: 0, ldhRatio: 2.6
  }));
  equal(above.result.title, 'IGCCCG: buen pronóstico');
  equal(above.result.metrics[0]?.value, 'S2');
  equal(String(above.result.notes[1]).startsWith(
    'Seminoma de buen grupo clásico con LDH >2,5× LSN'), true);
  const visceral = evaluateCalculator(IGCCCG_CALCULATOR, igcccgInput({
    histology: 'seminoma', nonPulmonary: true, afp: 0, hcg: 0, ldhRatio: 0
  }));
  equal(visceral.result.title, 'IGCCCG: pronóstico intermedio');
  equal(visceral.result.metrics[1]?.value, '79% poblacional');
  equal(visceral.result.metrics[2]?.value, '88% poblacional');
});

test('ported 20 to 23 preserve input validity and contain typed text only', () => {
  const invalid = evaluateCalculator(IGCCCG_CALCULATOR, igcccgInput({ ldhRatio: 1.55 }));
  deepEqual(invalid.issues.map((issue) => issue.code), ['step-mismatch']);
  const below = evaluateCalculator(IGCCCG_CALCULATOR, igcccgInput({ afpUpperLimit: 0 }));
  deepEqual(below.issues.map((issue) => issue.code), ['below-minimum']);
  const unknown = evaluateCalculator(LEIBOVICH_CALCULATOR, leibovichInput({ leibGrade: '5' }));
  deepEqual(unknown.issues.map((issue) => issue.code), ['unknown-option']);
  const results = [
    evaluateCalculator(RENAL_COMPLEXITY_CALCULATOR, renalInput()).result,
    evaluateCalculator(LEIBOVICH_CALCULATOR, leibovichInput()).result,
    evaluateCalculator(IMDC_CALCULATOR).result,
    evaluateCalculator(IGCCCG_CALCULATOR, igcccgInput()).result
  ];
  for (const current of results) assertNoRawMarkup(current.notes);
});

test('ported 24 to 27 preserve canonical metadata and complete field order', () => {
  deepEqual([
    RENAL_FUNCTION_ONCOLOGY_CALCULATOR,
    ANC_CTCAE_V6_CALCULATOR,
    KHORANA_VTE_CALCULATOR,
    MASCC_FEBRILE_NEUTROPENIA_CALCULATOR
  ].map((definition) => ({
    id: definition.id,
    title: definition.title,
    category: definition.category,
    subtitle: definition.subtitle,
    source: definition.source,
    fieldIds: definition.fields.map((field) => field.id)
  })), [
    {
      id: 'renal-function-oncology',
      title: 'Función renal: Cockcroft–Gault y CKD-EPI 2021',
      category: 'general',
      subtitle: 'Dos estimaciones en paralelo, con método y unidades visibles.',
      source: 'Cockcroft–Gault; CKD-EPI 2021',
      fieldIds: ['renal_scope', 'renal_age', 'renal_sex', 'renal_weight', 'renal_creatinine',
        'renal_cystatin', 'renal_bsa']
    },
    {
      id: 'anc-ctcae-v6',
      title: 'Recuento absoluto de neutrófilos — CTCAE v6',
      category: 'general',
      subtitle: 'ANC calculado y grado de neutrófilos disminuidos.',
      source: 'NCI CTCAE v6.0 (2025)',
      fieldIds: ['anc_wbc', 'anc_segmented', 'anc_bands']
    },
    {
      id: 'khorana-vte',
      title: 'Khorana — riesgo de VTE',
      category: 'general',
      subtitle: 'Estratificación basal antes de tratamiento sistémico ambulatorio.',
      source: 'Khorana et al.',
      fieldIds: ['khorana_site', 'khorana_platelets', 'khorana_hgb', 'khorana_wbc',
        'khorana_bmi', 'khorana_esa']
    },
    {
      id: 'mascc-febrile-neutropenia',
      title: 'MASCC — neutropenia febril',
      category: 'general',
      subtitle: 'Riesgo de complicaciones una vez presente la neutropenia febril.',
      source: 'MASCC Risk Index',
      fieldIds: ['mascc_scope', 'mascc_burden', 'mascc_no_hypotension', 'mascc_no_copd',
        'mascc_tumor_fungal', 'mascc_no_dehydration', 'mascc_outpatient', 'mascc_age_under_60']
    }
  ]);
});

test('ported 24 to 27 open blank and keep factory values only as examples', () => {
  const renal = evaluateCalculator(RENAL_FUNCTION_ONCOLOGY_CALCULATOR);
  deepEqual(renal.issues.map((issue) => issue.fieldId),
    ['renal_age', 'renal_sex', 'renal_weight', 'renal_creatinine']);
  equal(renal.values['renal_cystatin'], '');
  equal(renal.values['renal_bsa'], '');
  const renalAge = RENAL_FUNCTION_ONCOLOGY_CALCULATOR.fields.find((field) =>
    field.id === 'renal_age');
  equal(renalAge?.kind === 'number' ? renalAge.exampleValue : null, 65);
  const optionalCystatin = RENAL_FUNCTION_ONCOLOGY_CALCULATOR.fields.find((field) =>
    field.id === 'renal_cystatin');
  equal(optionalCystatin?.kind === 'number' ? optionalCystatin.exampleValue : null, undefined);

  deepEqual(evaluateCalculator(ANC_CTCAE_V6_CALCULATOR).issues.map((issue) => issue.fieldId),
    ['anc_wbc', 'anc_segmented', 'anc_bands']);
  deepEqual(evaluateCalculator(KHORANA_VTE_CALCULATOR).issues.map((issue) => issue.fieldId),
    ['khorana_site', 'khorana_platelets', 'khorana_hgb', 'khorana_wbc', 'khorana_bmi']);
  deepEqual(evaluateCalculator(MASCC_FEBRILE_NEUTROPENIA_CALCULATOR).issues.map((issue) => issue.fieldId),
    ['mascc_burden']);
  const burden = MASCC_FEBRILE_NEUTROPENIA_CALCULATOR.fields.find((field) =>
    field.id === 'mascc_burden');
  equal(burden?.kind === 'select' ? burden.exampleValue : null, '5');
  equal(burden?.initialValue, '');
});

test('renal function golden creatinine-only result keeps methods and units separate', () => {
  const evaluation = evaluateCalculator(RENAL_FUNCTION_ONCOLOGY_CALCULATOR,
    renalOncologyInput());
  deepEqual(evaluation.result, {
    title: 'CrCl 57.6 mL/min · eGFR 62.5 mL/min/1,73 m²',
    detail: 'Los resultados no son intercambiables: identificar qué estimación exige el protocolo o el prospecto del fármaco.',
    badge: 'función renal', score: 0, showScore: false, severity: 'info',
    metrics: [
      { label: 'Cockcroft–Gault', value: '57.6 mL/min' },
      { label: 'CKD-EPI 2021 creatinina', value: '62.5 mL/min/1,73 m²' },
      { label: 'Peso usado en CG', value: '65.0 kg' }
    ],
    notes: [
      'CKD-EPI está indexado a 1,73 m²; para una dosis que requiera GFR absoluta debe informarse la superficie corporal y desindexarse.',
      'Creatinina no estable, sarcopenia, caquexia, amputaciones o tamaño corporal extremo pueden volver imprecisas ambas estimaciones.',
      'Cerca de un punto de corte clínico, considerar cistatina C o GFR medida según disponibilidad y protocolo.'
    ]
  });
});

test('renal function switches to combined CKD-EPI and desindexes only with supplied BSA', () => {
  const evaluation = evaluateCalculator(RENAL_FUNCTION_ONCOLOGY_CALCULATOR,
    renalOncologyInput({ renal_cystatin: 1, renal_bsa: 1.8 }));
  equal(evaluation.result.title, 'CrCl 57.6 mL/min · eGFR 69.8 mL/min/1,73 m²');
  deepEqual(evaluation.result.metrics, [
    { label: 'Cockcroft–Gault', value: '57.6 mL/min' },
    { label: 'CKD-EPI 2021 creatinina-cistatina C', value: '69.8 mL/min/1,73 m²' },
    { label: 'GFR absoluta desindexada', value: '72.6 mL/min' },
    { label: 'Peso usado en CG', value: '65.0 kg' }
  ]);
  equal(evaluation.result.notes[0],
    'La GFR absoluta se obtuvo como eGFR × superficie corporal / 1,73.');
});

test('renal function preserves CKD-EPI piecewise knots for creatinine and cystatin C', () => {
  const femaleCreatinine = evaluateCalculator(RENAL_FUNCTION_ONCOLOGY_CALCULATOR,
    renalOncologyInput({ renal_creatinine: 0.7 }));
  equal(femaleCreatinine.result.metrics[1]?.value, '95.9 mL/min/1,73 m²');
  const maleCreatinine = evaluateCalculator(RENAL_FUNCTION_ONCOLOGY_CALCULATOR,
    renalOncologyInput({ renal_sex: 'male', renal_creatinine: 0.9 }));
  equal(maleCreatinine.result.metrics[1]?.value, '94.8 mL/min/1,73 m²');
  const femaleCombined = evaluateCalculator(RENAL_FUNCTION_ONCOLOGY_CALCULATOR,
    renalOncologyInput({ renal_creatinine: 0.7, renal_cystatin: 0.8 }));
  equal(femaleCombined.result.metrics[1]?.value, '100.8 mL/min/1,73 m²');
  const maleCombined = evaluateCalculator(RENAL_FUNCTION_ONCOLOGY_CALCULATOR,
    renalOncologyInput({ renal_sex: 'male', renal_creatinine: 0.9, renal_cystatin: 0.8 }));
  equal(maleCombined.result.metrics[1]?.value, '104.7 mL/min/1,73 m²');
});

test('renal function preserves sex factor and adult-age boundaries', () => {
  const male = evaluateCalculator(RENAL_FUNCTION_ONCOLOGY_CALCULATOR,
    renalOncologyInput({ renal_sex: 'male' }));
  equal(male.result.title, 'CrCl 67.7 mL/min · eGFR 83.5 mL/min/1,73 m²');
  equal(evaluateCalculator(RENAL_FUNCTION_ONCOLOGY_CALCULATOR,
    renalOncologyInput({ renal_age: 18, renal_sex: 'male', renal_weight: 70 })).status, 'calculated');
  equal(evaluateCalculator(RENAL_FUNCTION_ONCOLOGY_CALCULATOR,
    renalOncologyInput({ renal_age: 139, renal_sex: 'male', renal_weight: 70 })).status, 'calculated');
  for (const age of [17, 140]) {
    const invalidAge = evaluateCalculator(RENAL_FUNCTION_ONCOLOGY_CALCULATOR,
      renalOncologyInput({ renal_age: age }));
    equal(invalidAge.status, 'invalid');
    equal(invalidAge.issues[0]?.fieldId, 'renal_age');
  }
});

test('renal optional inputs stay optional but enforce declared limits and increments when supplied', () => {
  equal(evaluateCalculator(RENAL_FUNCTION_ONCOLOGY_CALCULATOR,
    renalOncologyInput({ renal_cystatin: '', renal_bsa: '' })).status, 'calculated');
  const cystatinBelow = evaluateCalculator(RENAL_FUNCTION_ONCOLOGY_CALCULATOR,
    renalOncologyInput({ renal_cystatin: 0 }));
  deepEqual(cystatinBelow.issues.map((issue) => issue.code), ['below-minimum']);
  const bsaAbove = evaluateCalculator(RENAL_FUNCTION_ONCOLOGY_CALCULATOR,
    renalOncologyInput({ renal_bsa: 4.01 }));
  deepEqual(bsaAbove.issues.map((issue) => issue.code), ['above-maximum']);
  const weightStep = evaluateCalculator(RENAL_FUNCTION_ONCOLOGY_CALCULATOR,
    renalOncologyInput({ renal_weight: 65.05 }));
  deepEqual(weightStep.issues.map((issue) => issue.code), ['step-mismatch']);
});

test('ANC golden result calculates cells per microliter and CTCAE grade', () => {
  const evaluation = evaluateCalculator(ANC_CTCAE_V6_CALCULATOR, ancInput());
  deepEqual(evaluation.result, {
    title: 'ANC 1200 células/µL', detail: 'CTCAE grado 1', badge: 'CTCAE v6',
    score: 0, showScore: false, severity: 'warn',
    metrics: [
      { label: 'ANC', value: '1200 células/µL' },
      { label: 'Grado', value: 'CTCAE grado 1' }
    ],
    notes: [
      'Usar el ANC directo del laboratorio cuando esté informado; esta fórmula es una estimación a partir del diferencial.',
      'La neutropenia febril es un evento clínico separado y no puede inferirse únicamente con este valor.',
      'Los límites de administración o modificación de un tratamiento dependen del esquema y del protocolo vigente.'
    ]
  });
});

test('ANC preserves strict CTCAE borders at 100, 500, 1000 and 1500 cells per microliter', () => {
  const cases: readonly [Readonly<Record<string, unknown>>, string, string, string][] = [
    [{ anc_wbc: 1, anc_segmented: 9.9 }, 'ANC 99 células/µL', 'CTCAE grado 4', 'bad'],
    [{ anc_wbc: 1, anc_segmented: 10 }, 'ANC 100 células/µL', 'CTCAE grado 3', 'bad'],
    [{ anc_wbc: 1, anc_segmented: 49.9 }, 'ANC 499 células/µL', 'CTCAE grado 3', 'bad'],
    [{ anc_wbc: 1, anc_segmented: 50 }, 'ANC 500 células/µL', 'CTCAE grado 2', 'warn'],
    [{ anc_wbc: 1, anc_segmented: 99.9 }, 'ANC 999 células/µL', 'CTCAE grado 2', 'warn'],
    [{ anc_wbc: 1, anc_segmented: 100 }, 'ANC 1000 células/µL', 'CTCAE grado 1', 'warn'],
    [{ anc_wbc: 1.5, anc_segmented: 99.9 }, 'ANC 1499 células/µL', 'CTCAE grado 1', 'warn'],
    [{ anc_wbc: 1.5, anc_segmented: 100 }, 'ANC 1500 células/µL', 'Sin grado CTCAE', 'good']
  ];
  for (const [overrides, expectedTitle, expectedDetail, expectedSeverity] of cases) {
    const evaluation = evaluateCalculator(ANC_CTCAE_V6_CALCULATOR,
      ancInput({ anc_bands: 0, ...overrides }));
    equal(evaluation.result.title, expectedTitle);
    equal(evaluation.result.detail, expectedDetail);
    equal(evaluation.result.severity, expectedSeverity);
  }
});

test('ANC rejects a differential over 100 percent and preserves custom rule message', () => {
  const evaluation = evaluateCalculator(ANC_CTCAE_V6_CALCULATOR,
    ancInput({ anc_segmented: 60, anc_bands: 40.1 }));
  equal(evaluation.status, 'calculated');
  deepEqual(evaluation.result, {
    title: 'Datos incompletos',
    detail: 'Revisar: suma de segmentados y bandas ≤100%.',
    badge: 'ANC / CTCAE v6', score: 0, showScore: false, severity: 'warn',
    metrics: [], notes: ['Corregir los datos antes de interpretar el resultado.']
  });
});

test('ANC preserves the legacy raw-grade versus rounded-display inconsistency', () => {
  const evaluation = evaluateCalculator(ANC_CTCAE_V6_CALCULATOR,
    ancInput({ anc_wbc: 1.02, anc_segmented: 49, anc_bands: 0 }));
  equal(evaluation.result.title, 'ANC 500 células/µL');
  equal(evaluation.result.detail, 'CTCAE grado 3');
});

test('Khorana golden zero case preserves original category and component count', () => {
  const evaluation = evaluateCalculator(KHORANA_VTE_CALCULATOR, khoranaInput());
  deepEqual(evaluation.result, {
    title: 'Khorana 0 · riesgo bajo',
    detail: 'Clasificación original: 0 bajo, 1–2 intermedio y ≥3 alto.',
    badge: 'VTE ambulatorio', score: 0, showScore: false, severity: 'good',
    metrics: [
      { label: 'Puntaje', value: 0 },
      { label: 'Categoría original', value: 'bajo' },
      { label: 'Componentes con puntos', value: 0 }
    ],
    notes: [
      'Población: pacientes ambulatorios con cáncer antes de comenzar quimioterapia sistémica.',
      'El umbral moderno ≥2 abre una evaluación clínica individual; no indica anticoagulación automática.',
      'Valorar por separado hemorragia, interacciones, función renal, tipo de cáncer y situación clínica.'
    ]
  });
});

test('Khorana preserves site weights and original 0, 1-2 and at least 3 categories', () => {
  for (const site of ['stomach', 'pancreas']) {
    const evaluation = evaluateCalculator(KHORANA_VTE_CALCULATOR, khoranaInput({ khorana_site: site }));
    equal(evaluation.result.title, 'Khorana 2 · riesgo intermedio');
    equal(evaluation.result.metrics[2]?.value, 1);
  }
  for (const site of ['lung', 'lymphoma', 'gynecologic', 'bladder', 'testicular']) {
    equal(evaluateCalculator(KHORANA_VTE_CALCULATOR,
      khoranaInput({ khorana_site: site })).result.title, 'Khorana 1 · riesgo intermedio');
  }
  equal(evaluateCalculator(KHORANA_VTE_CALCULATOR,
    khoranaInput({ khorana_site: 'other' })).result.title, 'Khorana 0 · riesgo bajo');
  equal(evaluateCalculator(KHORANA_VTE_CALCULATOR, khoranaInput({
    khorana_site: 'stomach', khorana_platelets: 350
  })).result.title, 'Khorana 3 · riesgo alto');
});

test('Khorana preserves every laboratory and BMI border', () => {
  const cases: readonly [string, number, number, number][] = [
    ['khorana_platelets', 349, 350, 1],
    ['khorana_hgb', 10, 9.9, 1],
    ['khorana_wbc', 11, 11.1, 1],
    ['khorana_bmi', 34.9, 35, 1]
  ];
  for (const [fieldId, noPointValue, pointValue, expected] of cases) {
    equal(evaluateCalculator(KHORANA_VTE_CALCULATOR,
      khoranaInput({ [fieldId]: noPointValue })).result.metrics[0]?.value, 0);
    equal(evaluateCalculator(KHORANA_VTE_CALCULATOR,
      khoranaInput({ [fieldId]: pointValue })).result.metrics[0]?.value, expected);
  }
  equal(evaluateCalculator(KHORANA_VTE_CALCULATOR,
    khoranaInput({ khorana_esa: true })).result.metrics[0]?.value, 1);
  equal(evaluateCalculator(KHORANA_VTE_CALCULATOR,
    khoranaInput({ khorana_hgb: 9.9, khorana_esa: true })).result.metrics[0]?.value, 1);
});

test('Khorana maximum counts five positive components despite a six-point total', () => {
  const evaluation = evaluateCalculator(KHORANA_VTE_CALCULATOR, khoranaInput({
    khorana_site: 'stomach', khorana_platelets: 350, khorana_hgb: 9.9,
    khorana_wbc: 11.1, khorana_bmi: 35, khorana_esa: true
  }));
  equal(evaluation.result.title, 'Khorana 6 · riesgo alto');
  deepEqual(evaluation.result.metrics, [
    { label: 'Puntaje', value: 6 },
    { label: 'Categoría original', value: 'alto' },
    { label: 'Componentes con puntos', value: 5 }
  ]);
});

test('MASCC preserves 20/21 threshold and maximum 26', () => {
  const twenty = evaluateCalculator(MASCC_FEBRILE_NEUTROPENIA_CALCULATOR, masccInput({
    mascc_burden: '5', mascc_no_hypotension: true, mascc_no_copd: true,
    mascc_no_dehydration: true, mascc_outpatient: true
  }));
  equal(twenty.result.title, 'MASCC 20/26');
  equal(twenty.result.detail, 'alto riesgo por MASCC');
  equal(twenty.result.metrics[1]?.value, '<21');
  equal(twenty.result.severity, 'bad');

  const twentyOne = evaluateCalculator(MASCC_FEBRILE_NEUTROPENIA_CALCULATOR,
    masccInput({ mascc_burden: '0', mascc_no_hypotension: true, mascc_no_copd: true,
      mascc_tumor_fungal: true, mascc_no_dehydration: true, mascc_outpatient: true,
      mascc_age_under_60: true }));
  equal(twentyOne.result.title, 'MASCC 21/26');
  equal(twentyOne.result.detail, 'bajo riesgo por MASCC');
  equal(twentyOne.result.metrics[1]?.value, '≥21');

  const maximum = evaluateCalculator(MASCC_FEBRILE_NEUTROPENIA_CALCULATOR,
    masccInput({ mascc_burden: '5', mascc_no_hypotension: true, mascc_no_copd: true,
      mascc_tumor_fungal: true, mascc_no_dehydration: true, mascc_outpatient: true,
      mascc_age_under_60: true }));
  deepEqual(maximum.result, {
    title: 'MASCC 26/26', detail: 'bajo riesgo por MASCC', badge: 'neutropenia febril',
    score: 0, showScore: false, severity: 'good',
    metrics: [{ label: 'Puntaje', value: '26/26' }, { label: 'Umbral', value: '≥21' }],
    notes: [
      'Un resultado de bajo riesgo no reemplaza estabilidad, examen, foco infeccioso, comorbilidades ni condiciones para seguimiento.',
      'No usar como predictor de neutropenia antes de la quimioterapia.',
      'No define por sí solo internación, vía antibiótica ni alta.'
    ]
  });
});

test('MASCC preserves the severe-burden contradiction and requires clinical precedence', () => {
  const contradictory = evaluateCalculator(MASCC_FEBRILE_NEUTROPENIA_CALCULATOR,
    masccInput({ mascc_burden: '0', mascc_no_hypotension: true, mascc_no_copd: true,
      mascc_tumor_fungal: true, mascc_no_dehydration: true, mascc_outpatient: true,
      mascc_age_under_60: true }));
  equal(contradictory.result.title, 'MASCC 21/26');
  equal(contradictory.result.detail, 'bajo riesgo por MASCC');
  equal(MASCC_FEBRILE_NEUTROPENIA_CALCULATOR.fields[0]?.label,
    'Aplicar después de identificar neutropenia febril. La impresión de inestabilidad clínica prevalece sobre el puntaje.');
});

test('ported 24 to 27 reject unknown selectors and contain typed text only', () => {
  const unknownSex = evaluateCalculator(RENAL_FUNCTION_ONCOLOGY_CALCULATOR,
    renalOncologyInput({ renal_sex: 'other' }));
  deepEqual(unknownSex.issues.map((issue) => issue.code), ['unknown-option']);
  const unknownBurden = evaluateCalculator(MASCC_FEBRILE_NEUTROPENIA_CALCULATOR,
    masccInput({ mascc_burden: '4' }));
  deepEqual(unknownBurden.issues.map((issue) => issue.code), ['unknown-option']);
  const results = [
    evaluateCalculator(RENAL_FUNCTION_ONCOLOGY_CALCULATOR, renalOncologyInput()).result,
    evaluateCalculator(ANC_CTCAE_V6_CALCULATOR, ancInput()).result,
    evaluateCalculator(KHORANA_VTE_CALCULATOR, khoranaInput()).result,
    evaluateCalculator(MASCC_FEBRILE_NEUTROPENIA_CALCULATOR,
      masccInput({ mascc_burden: '5' })).result
  ];
  for (const current of results) assertNoRawMarkup(current.notes);
});

test('structured note factories reject unsafe links and malformed tables', () => {
  throws(() => externalLink('inseguro', 'http://example.test'), 'El enlace externo debe usar HTTPS');
  throws(() => tableNote('invalida', ['una'], [['a', 'b']]), 'cantidad de celdas invalida');
});

function g8Input(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    g8_food: '2', g8_weight: '3', g8_mobility: '2', g8_neuro: '2',
    g8_bmi: '3', g8_meds: '1', g8_health: '1', g8_age: '2',
    ...overrides
  };
}

function damicoInput(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return { psa: 9, gg: '1', ct: 't1', n: 'n0', m: 'm0', ...overrides };
}

function capraPreInput(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    scenario: 'pre', age: 64, psa: 8, capraPrimary: '3', capraSecondary: '4',
    ct: 't2a', positiveCores: 3, totalCores: 12, ...overrides
  };
}

function capraPostInput(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    scenario: 'post', capraSpsa: 8, capraSPrimary: '3', capraSSecondary: '4',
    margin: false, ece: false, svi: false, lni: false, ...overrides
  };
}

function mskccPreInput(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    scenario: 'pre',
    msk_pre_no_hormone: 'no',
    msk_pre_no_radiation: 'no',
    msk_pre_age: 65,
    msk_pre_psa: 8.01,
    msk_pre_gleason_primary: '3',
    msk_pre_gleason_secondary: '4',
    msk_pre_stage: 't2a',
    ...overrides
  };
}

function pbcgInput(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    psa: 7,
    age: 65,
    dre: false,
    family: false,
    african: false,
    priorNegative: false,
    ...overrides
  };
}

function psaKineticsInput(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    psa: 6,
    volume: 40,
    psaSeries: '01/01/2025; 1,0\n01/07/2025; 2,0\n01/01/2026; 4,0',
    context: 'intact',
    nadir: '',
    confirmed: false,
    ...overrides
  };
}

function nmibcEauInput(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    scenario: 'eau', eauPrimary: 'yes', eauAge: 70, eauCount: 1, eauSize: 2,
    eauStage: 'ta', eauCis: false, eauPureCis: false, eauSystem: 'who2004',
    eauGrade: 'low', eauLvi: false, eauProstaticCis: false, eauVariant: false,
    ...overrides
  };
}

function nmibcEortcInput(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    scenario: 'eortc', number: '0', size: '0', prior: '0', t1: false, cis: false, grade: '0',
    ...overrides
  };
}

function nmibcCuetoInput(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    scenario: 'cueto', cuetoSex: 'male', cuetoAge: 65, cuetoMoreThree: false,
    cuetoRecurrent: false, cuetoT1: false, cuetoCis: false, cuetoGrade: 'g1',
    cuetoConfirmed: false, ...overrides
  };
}

function cystectomyInput(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    m: 'm0', pt: '2', pn: 'n0', margin: false, perioperative: 'none', cisStatus: 'eligible',
    ...overrides
  };
}

function cisplatinInput(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    ecog: '1', renalMethod: 'measured_gfr', gfr: 65, hearing: '0', neuro: '0',
    nyha: '1', severeComorbidity: false, ...overrides
  };
}

function utucInput(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    utucM: 'm0', size: 1.5, focality: 'unifocal', cytology: 'negative', biopsy: 'low',
    ctAssessment: 'noninvasive', hydro: false, variant: false, ...overrides
  };
}

function renalInput(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    scenario: 'renal', renalSize: 3.2, renalExo: '1', renalNear: '1', renalAp: 'x',
    renalLocation: '1', renalHilar: false, ...overrides
  };
}

function paduaInput(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    scenario: 'padua', paduaSize: 3.2, paduaLong: '1', paduaExo: '1', paduaRim: '1',
    paduaSinus: '1', paduaCollecting: '1', paduaAp: 'x', ...overrides
  };
}

function leibovichInput(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    scenario: 'leibovich', leibPt: 'pt1a', leibPn: false, leibSize: 5,
    leibGrade: '1', leibNecrosis: false, ...overrides
  };
}

function uissInput(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    scenario: 'uiss', uissPt: 'pt1a', uissN: 'n0', uissM: 'm0', uissGrade: '2',
    uissEcog: '0', ...overrides
  };
}

function igcccgInput(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    histology: 'nonseminoma', primary: 'testis', nonPulmonary: false, afp: 120,
    afpUpperLimit: 10, hcg: 800, ldhRatio: 1.1, ...overrides
  };
}

function renalOncologyInput(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    renal_age: 65, renal_sex: 'female', renal_weight: 65, renal_creatinine: 1,
    renal_cystatin: '', renal_bsa: '', ...overrides
  };
}

function ancInput(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return { anc_wbc: 3, anc_segmented: 40, anc_bands: 0, ...overrides };
}

function khoranaInput(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    khorana_site: 'other', khorana_platelets: 250, khorana_hgb: 12, khorana_wbc: 7,
    khorana_bmi: 25, khorana_esa: false, ...overrides
  };
}

function masccInput(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    mascc_burden: '5', mascc_no_hypotension: false, mascc_no_copd: false,
    mascc_tumor_fungal: false, mascc_no_dehydration: false, mascc_outpatient: false,
    mascc_age_under_60: false, ...overrides
  };
}

function assertNoRawMarkup(value: unknown): void {
  const serialized = JSON.stringify(value);
  equal(serialized.includes('<'), false);
  equal(serialized.includes('href='), false);
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

function throws(run: () => void, expectedMessage: string): void {
  try {
    run();
  } catch (failure) {
    if (failure instanceof Error && failure.message.includes(expectedMessage)) return;
    throw new Error('Error inesperado: ' + String(failure));
  }
  throw new Error('Se esperaba una excepcion que contuviera ' + JSON.stringify(expectedMessage) + '.');
}
