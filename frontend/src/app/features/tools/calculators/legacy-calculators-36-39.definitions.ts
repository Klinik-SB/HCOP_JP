import {
  booleanValue,
  defineCalculator,
  numberValue,
  result,
  stringValue
} from './calculator.engine';
import {
  CalculatorField,
  CalculatorOption,
  CalculatorValues
} from './calculator.models';

interface FieldOptions {
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly help?: string;
  readonly scenario?: string;
  readonly required?: boolean;
  readonly initialValue?: string;
  readonly wide?: boolean;
}

function option(value: string, label: string): CalculatorOption {
  return { value, label };
}

function numberField(
  id: string,
  label: string,
  exampleValue: number,
  options: FieldOptions = {}
): CalculatorField {
  return {
    id,
    kind: 'number',
    label,
    required: options.required ?? true,
    initialValue: '',
    exampleValue,
    min: options.min,
    max: options.max,
    step: options.step,
    help: options.help,
    scenario: options.scenario,
    wide: options.wide
  };
}

function selectField(
  id: string,
  label: string,
  exampleValue: string,
  options: readonly CalculatorOption[],
  settings: FieldOptions = {}
): CalculatorField {
  return {
    id,
    kind: 'select',
    label,
    required: settings.required ?? true,
    initialValue: settings.initialValue ?? '',
    exampleValue,
    options,
    help: settings.help,
    scenario: settings.scenario,
    wide: settings.wide
  };
}

function checkbox(
  id: string,
  label: string,
  options: Pick<FieldOptions, 'help' | 'scenario' | 'wide'> = {}
): CalculatorField {
  return {
    id,
    kind: 'checkbox',
    label,
    required: false,
    initialValue: false,
    help: options.help,
    scenario: options.scenario,
    wide: options.wide
  };
}

function section(id: string, label: string, help?: string): CalculatorField {
  return {
    id,
    kind: 'section',
    label,
    required: false,
    initialValue: '',
    wide: true,
    help
  };
}

interface InvalidRule {
  readonly valid: false;
  readonly missing: readonly string[];
  readonly message: string;
}

function invalid(missing: readonly string[] = [], message = 'Faltan datos válidos para calcular.'): InvalidRule {
  return { valid: false, missing, message };
}

function invalidRuleResult(label: string, evaluation: InvalidRule) {
  const missing = [...new Set(evaluation.missing.filter(Boolean))];
  return result({
    title: 'Datos incompletos',
    detail: missing.length
      ? `Revisar: ${missing.join(', ')}.`
      : evaluation.message || 'No fue posible completar el cálculo.',
    badge: label,
    score: 0,
    showScore: false,
    severity: 'warn',
    metrics: [],
    notes: ['Corregir los datos antes de interpretar el resultado.']
  });
}

function format(value: number, digits = 1): string {
  return Number(value).toFixed(digits);
}

const GRADE_OPTIONS = [1, 2, 3].map((value) => option(String(value), `Grado ${value}`));
const ECOG_OPTIONS = [0, 1, 2, 3, 4].map((value) => option(String(value), `ECOG ${value}`));

interface MonarcheValid {
  readonly valid: true;
  readonly meetsCohort1: boolean;
  readonly biologicScope: boolean;
  readonly highRiskAnatomy: boolean;
  readonly ki67Required: false;
}

type MonarcheResult = MonarcheValid | InvalidRule;

function monarchE(values: CalculatorValues): MonarcheResult {
  const nodes = numberValue(values, 'monarche_nodes');
  const sizeMm = numberValue(values, 'monarche_size');
  const grade = numberValue(values, 'monarche_grade');
  const missing: string[] = [];
  if (!Number.isFinite(nodes) || nodes < 0 || !Number.isInteger(nodes)) {
    missing.push('ganglios axilares positivos');
  }
  if (!Number.isFinite(sizeMm) || sizeMm <= 0) missing.push('tamaño tumoral');
  if (![1, 2, 3].includes(grade)) missing.push('grado');
  if (missing.length) return invalid(missing);
  const biologicScope = booleanValue(values, 'monarche_hr_positive')
    && booleanValue(values, 'monarche_her2_negative')
    && booleanValue(values, 'monarche_early');
  const highRiskAnatomy = nodes >= 4
    || (nodes >= 1 && nodes <= 3 && (grade === 3 || sizeMm >= 50));
  return {
    valid: true,
    meetsCohort1: biologicScope && highRiskAnatomy,
    biologicScope,
    highRiskAnatomy,
    ki67Required: false
  };
}

export const MONARCHE_COHORT_1_CALCULATOR = defineCalculator({
  id: 'monarche-cohort-1',
  title: 'monarchE — criterios de cohorte 1',
  category: 'mama',
  subtitle: 'Reconstrucción de criterios clínico-patológicos del ensayo.',
  source: 'monarchE cohort 1',
  clinicalUse: 'Comprueba alcance biológico y anatomía de alto riesgo utilizados para la cohorte 1 de monarchE.',
  fields: [
    checkbox('monarche_hr_positive', 'Receptores hormonales positivos'),
    checkbox('monarche_her2_negative', 'HER2 negativo'),
    checkbox('monarche_early', 'Enfermedad temprana no metastásica'),
    numberField('monarche_nodes', 'Ganglios axilares positivos', 1, { min: 0, step: 1 }),
    numberField('monarche_size', 'Tamaño tumoral (mm)', 30, { min: 0.1, step: 0.1 }),
    selectField('monarche_grade', 'Grado histológico', '2', GRADE_OPTIONS)
  ],
  calculate(values) {
    const calculated = monarchE(values);
    if (!calculated.valid) return invalidRuleResult('monarchE cohorte 1', calculated);
    return result({
      title: calculated.meetsCohort1 ? 'Coincide con cohorte 1' : 'No coincide con cohorte 1',
      detail: calculated.meetsCohort1
        ? 'Cumple el alcance biológico y la definición anatómica reconstruida del ensayo.'
        : 'Falta alcance biológico, anatomía de alto riesgo o ambos.',
      badge: 'criterios de ensayo',
      score: 0,
      showScore: false,
      severity: calculated.meetsCohort1 ? 'info' : 'warn',
      metrics: [
        { label: 'Alcance biológico', value: calculated.biologicScope ? 'Sí' : 'No' },
        { label: 'Anatomía de alto riesgo', value: calculated.highRiskAnatomy ? 'Sí' : 'No' },
        { label: 'Ki-67 requerido por cohorte 1', value: calculated.ki67Required ? 'Sí' : 'No' }
      ],
      notes: [
        'Criterio anatómico: ≥4 ganglios, o 1–3 ganglios con grado 3 o tumor ≥50 mm.',
        'Esta pantalla reproduce criterios de cohorte, no toda la elegibilidad regulatoria, temporal o clínica.',
        'Coincidir con el ensayo no constituye una indicación automática de tratamiento.'
      ]
    });
  }
});

interface OlympiaValid {
  readonly valid: true;
  readonly baseScope: boolean;
  readonly highRisk: boolean;
  readonly meetsTrialCriteria: boolean;
  readonly cpsEg: number | null;
}

type OlympiaResult = OlympiaValid | InvalidRule;

function olympia(values: CalculatorValues): OlympiaResult {
  const scenario = stringValue(values, 'scenario');
  const missing: string[] = [];
  if (!['neo_tnbc', 'neo_hr', 'adj_tnbc', 'adj_hr'].includes(scenario)) {
    missing.push('escenario clínico');
  }
  if (missing.length) return invalid(missing);
  const baseScope = booleanValue(values, 'olympia_gbrca')
    && booleanValue(values, 'olympia_her2_negative');
  let cpsEg: number | null = null;
  let highRisk = false;
  if (scenario === 'neo_hr') {
    const cStage = stringValue(values, 'olympia_c_stage');
    const pStage = stringValue(values, 'olympia_p_stage');
    const er = stringValue(values, 'olympia_er');
    const grade = numberValue(values, 'olympia_nuclear_grade');
    if (!['i_iia', 'iib_iiia', 'iiib_iiic'].includes(cStage)) {
      missing.push('estadio clínico pretratamiento');
    }
    if (!['zero_i', 'iia_iiib', 'iiic'].includes(pStage)) {
      missing.push('estadio patológico postratamiento');
    }
    if (!['positive', 'negative'].includes(er)) missing.push('estado ER');
    if (![1, 2, 3].includes(grade)) missing.push('grado nuclear');
    if (missing.length) return invalid(missing);
    const cPoints = cStage === 'i_iia' ? 0 : cStage === 'iib_iiia' ? 1 : 2;
    const pPoints = pStage === 'zero_i' ? 0 : pStage === 'iia_iiib' ? 1 : 2;
    cpsEg = cPoints + pPoints + (er === 'negative' ? 1 : 0) + (grade === 3 ? 1 : 0);
    highRisk = booleanValue(values, 'olympia_residual') && cpsEg >= 3;
  } else if (scenario === 'neo_tnbc') {
    highRisk = booleanValue(values, 'olympia_residual');
  } else {
    const nodes = scenario === 'adj_tnbc'
      ? numberValue(values, 'olympia_nodes_tnbc')
      : numberValue(values, 'olympia_nodes_hr');
    const sizeCm = numberValue(values, 'olympia_size');
    if (!Number.isFinite(nodes) || nodes < 0 || !Number.isInteger(nodes)) {
      missing.push('ganglios positivos');
    }
    if (scenario === 'adj_tnbc' && (!Number.isFinite(sizeCm) || sizeCm <= 0)) {
      missing.push('tamaño tumoral');
    }
    if (missing.length) return invalid(missing);
    highRisk = scenario === 'adj_hr' ? nodes >= 4 : nodes > 0 || (nodes === 0 && sizeCm >= 2);
  }
  return { valid: true, baseScope, highRisk, meetsTrialCriteria: baseScope && highRisk, cpsEg };
}

export const OLYMPIA_CPSEG_CALCULATOR = defineCalculator({
  id: 'olympia-cpseg',
  title: 'OlympiA y CPS+EG',
  category: 'mama',
  subtitle: 'Criterios de alto riesgo según escenario neoadyuvante o adyuvante.',
  source: 'OlympiA / CPS+EG',
  clinicalUse: 'Reconstruye el alcance basal y los criterios de alto riesgo usados en OlympiA; calcula CPS+EG en el escenario neoadyuvante HR positivo.',
  fields: [
    section('olympia_scope', 'Seleccionar el escenario correcto. Los campos no utilizados por ese escenario se ignoran, pero la elegibilidad completa debe verificarse externamente.'),
    selectField('scenario', 'Escenario', 'neo_hr', [
      option('neo_tnbc', 'Neoadyuvancia · triple negativo'),
      option('neo_hr', 'Neoadyuvancia · HR positivo'),
      option('adj_tnbc', 'Cirugía inicial/adyuvancia · triple negativo'),
      option('adj_hr', 'Cirugía inicial/adyuvancia · HR positivo')
    ], { initialValue: 'neo_hr', wide: true }),
    checkbox('olympia_gbrca', 'Variante germinal patogénica/probablemente patogénica BRCA1/2', { wide: true }),
    checkbox('olympia_her2_negative', 'HER2 negativo'),
    checkbox('olympia_residual', 'Enfermedad invasiva residual posneoadyuvancia'),
    selectField('olympia_c_stage', 'Grupo clínico pretratamiento (para CPS+EG)', 'i_iia', [
      option('i_iia', 'I–IIA · 0 puntos'),
      option('iib_iiia', 'IIB–IIIA · 1 punto'),
      option('iiib_iiic', 'IIIB–IIIC · 2 puntos')
    ], { scenario: 'neo_hr' }),
    selectField('olympia_p_stage', 'Grupo patológico postratamiento (para CPS+EG)', 'zero_i', [
      option('zero_i', '0–I · 0 puntos'),
      option('iia_iiib', 'IIA–IIIB · 1 punto'),
      option('iiic', 'IIIC · 2 puntos')
    ], { scenario: 'neo_hr' }),
    selectField('olympia_er', 'Estado ER para CPS+EG', 'positive', [
      option('positive', 'ER positivo'), option('negative', 'ER negativo')
    ], { scenario: 'neo_hr' }),
    selectField('olympia_nuclear_grade', 'Grado nuclear para CPS+EG', '2', GRADE_OPTIONS, {
      scenario: 'neo_hr'
    }),
    numberField('olympia_nodes_tnbc', 'Ganglios positivos', 0, {
      min: 0, step: 1, scenario: 'adj_tnbc'
    }),
    numberField('olympia_size', 'Tamaño tumoral (cm)', 2, {
      min: 0.01, step: 0.1, scenario: 'adj_tnbc'
    }),
    numberField('olympia_nodes_hr', 'Ganglios positivos', 4, {
      min: 0, step: 1, scenario: 'adj_hr'
    })
  ],
  calculate(values) {
    const calculated = olympia(values);
    if (!calculated.valid) return invalidRuleResult('OlympiA / CPS+EG', calculated);
    const cpsMetric = calculated.cpsEg === null ? 'No aplica' : calculated.cpsEg;
    return result({
      title: calculated.meetsTrialCriteria
        ? 'Coincide con criterios reconstruidos'
        : 'No coincide con criterios reconstruidos',
      detail: calculated.cpsEg === null
        ? 'El escenario seleccionado no utiliza CPS+EG.'
        : `CPS+EG calculado: ${calculated.cpsEg}.`,
      badge: 'criterios de ensayo',
      score: 0,
      showScore: false,
      severity: calculated.meetsTrialCriteria ? 'info' : 'warn',
      metrics: [
        { label: 'gBRCA + HER2 negativo', value: calculated.baseScope ? 'Sí' : 'No' },
        { label: 'Criterio de alto riesgo', value: calculated.highRisk ? 'Sí' : 'No' },
        { label: 'CPS+EG', value: cpsMetric }
      ],
      notes: [
        'Neoadyuvancia HR positiva: requiere enfermedad invasiva residual y CPS+EG ≥3 en la reconstrucción del ensayo.',
        'Los otros escenarios utilizan definiciones anatómicas específicas; verificar subtipo, estadio, tratamiento previo, temporalidad y genética.',
        'Coincidir con criterios históricos del ensayo no constituye una indicación automática de tratamiento.'
      ]
    });
  }
});

interface IpiFactors {
  readonly age: 0 | 1;
  readonly stage: 0 | 1;
  readonly ldh: 0 | 1;
  readonly ecog: 0 | 1;
  readonly extranodal: 0 | 1;
}

interface IpiValid {
  readonly valid: true;
  readonly total: number;
  readonly factors: IpiFactors;
  readonly group: string;
}

type IpiResult = IpiValid | InvalidRule;

function internationalPrognosticIndex(values: CalculatorValues): IpiResult {
  const age = numberValue(values, 'ipi_age');
  const stage = numberValue(values, 'ipi_stage');
  const ecog = numberValue(values, 'ipi_ecog');
  const extranodalSites = numberValue(values, 'ipi_extranodal');
  const missing: string[] = [];
  if (!Number.isFinite(age) || age < 0) missing.push('edad');
  if (![1, 2, 3, 4].includes(stage)) missing.push('estadio Ann Arbor');
  if (![0, 1, 2, 3, 4].includes(ecog)) missing.push('ECOG');
  if (!Number.isFinite(extranodalSites) || extranodalSites < 0 || !Number.isInteger(extranodalSites)) {
    missing.push('sitios extranodales');
  }
  if (missing.length) return invalid(missing);
  const factors: IpiFactors = {
    age: age > 60 ? 1 : 0,
    stage: stage >= 3 ? 1 : 0,
    ldh: booleanValue(values, 'ipi_ldh') ? 1 : 0,
    ecog: ecog >= 2 ? 1 : 0,
    extranodal: extranodalSites > 1 ? 1 : 0
  };
  const total = Object.values(factors).reduce((sum, value) => sum + value, 0);
  const group = total <= 1
    ? 'bajo'
    : total === 2
      ? 'bajo-intermedio'
      : total === 3
        ? 'alto-intermedio'
        : 'alto';
  return { valid: true, total, factors, group };
}

export const INTERNATIONAL_PROGNOSTIC_INDEX_CALCULATOR = defineCalculator({
  id: 'international-prognostic-index',
  title: 'International Prognostic Index — IPI',
  category: 'hematologia',
  subtitle: 'Índice clínico clásico para linfomas agresivos.',
  source: 'International Prognostic Index',
  clinicalUse: 'Suma edad, estadio, LDH, ECOG y sitios extranodales para asignar el grupo IPI clásico.',
  fields: [
    numberField('ipi_age', 'Edad (años)', 60, { min: 0, step: 1 }),
    selectField('ipi_stage', 'Estadio Ann Arbor', '2', [1, 2, 3, 4].map((value) =>
      option(String(value), `Estadio ${value}`))),
    checkbox('ipi_ldh', 'LDH por encima del límite superior normal'),
    selectField('ipi_ecog', 'ECOG', '1', ECOG_OPTIONS),
    numberField('ipi_extranodal', 'Número de sitios extranodales', 0, { min: 0, step: 1 })
  ],
  calculate(values) {
    const calculated = internationalPrognosticIndex(values);
    if (!calculated.valid) return invalidRuleResult('IPI', calculated);
    return result({
      title: `IPI ${calculated.total}/5 · ${calculated.group}`,
      detail: 'Grupo del IPI internacional clásico.',
      badge: 'linfoma agresivo',
      score: 0,
      showScore: false,
      severity: calculated.total >= 4 ? 'bad' : calculated.total >= 2 ? 'warn' : 'good',
      metrics: [
        { label: 'Puntaje', value: `${calculated.total}/5` },
        { label: 'Grupo', value: calculated.group },
        { label: 'Factores presentes', value: Object.values(calculated.factors).filter(Boolean).length }
      ],
      notes: [
        'Población original: linfomas no Hodgkin agresivos; la calibración absoluta cambia con subtipo y era terapéutica.',
        'No reemplaza índices específicos como NCCN-IPI, CNS-IPI ni la clasificación biológica del linfoma.',
        'El IPI es pronóstico y no selecciona automáticamente un régimen.'
      ]
    });
  }
});

interface R2IssFactors {
  readonly iss: 0 | 1 | 1.5;
  readonly del17p: 0 | 1;
  readonly highLdh: 0 | 1;
  readonly t414: 0 | 1;
  readonly oneQGainAmp: 0 | 0.5;
}

interface R2IssValid {
  readonly valid: true;
  readonly total: number;
  readonly factors: R2IssFactors;
  readonly iss: 1 | 2 | 3;
  readonly stage: string;
}

type R2IssResult = R2IssValid | InvalidRule;

function r2Iss(values: CalculatorValues): R2IssResult {
  const beta2 = numberValue(values, 'r2iss_beta2');
  const albumin = numberValue(values, 'r2iss_albumin');
  const missing: string[] = [];
  if (!Number.isFinite(beta2) || beta2 <= 0) missing.push('β2-microglobulina');
  if (!Number.isFinite(albumin) || albumin <= 0) missing.push('albúmina');
  if (missing.length) return invalid(missing);
  const iss = beta2 >= 5.5 ? 3 : beta2 < 3.5 && albumin >= 3.5 ? 1 : 2;
  const factors: R2IssFactors = {
    iss: iss === 2 ? 1 : iss === 3 ? 1.5 : 0,
    del17p: booleanValue(values, 'r2iss_del17p') ? 1 : 0,
    highLdh: booleanValue(values, 'r2iss_high_ldh') ? 1 : 0,
    t414: booleanValue(values, 'r2iss_t414') ? 1 : 0,
    oneQGainAmp: booleanValue(values, 'r2iss_1q') ? 0.5 : 0
  };
  const total = Object.values(factors).reduce((sum, value) => sum + value, 0);
  const stage = total === 0
    ? 'R2-ISS I'
    : total <= 1
      ? 'R2-ISS II'
      : total <= 2.5
        ? 'R2-ISS III'
        : 'R2-ISS IV';
  return { valid: true, total, factors, iss, stage };
}

export const R2_ISS_MYELOMA_CALCULATOR = defineCalculator({
  id: 'r2-iss-myeloma',
  title: 'R2-ISS — mieloma múltiple',
  category: 'hematologia',
  subtitle: 'Revised 2nd International Staging System.',
  source: 'European Myeloma Network R2-ISS',
  clinicalUse: 'Integra ISS, LDH y alteraciones citogenéticas para estratificación pronóstica del mieloma múltiple recién diagnosticado.',
  fields: [
    numberField('r2iss_beta2', 'β2-microglobulina (mg/L)', 3, { min: 0.01, step: 0.01 }),
    numberField('r2iss_albumin', 'Albúmina (g/dL)', 4, { min: 0.01, step: 0.01 }),
    checkbox('r2iss_del17p', 'del(17p)'),
    checkbox('r2iss_high_ldh', 'LDH por encima del límite superior normal'),
    checkbox('r2iss_t414', 't(4;14)'),
    checkbox('r2iss_1q', 'Ganancia o amplificación 1q')
  ],
  calculate(values) {
    const calculated = r2Iss(values);
    if (!calculated.valid) return invalidRuleResult('R2-ISS', calculated);
    return result({
      title: `${calculated.stage} · ${format(calculated.total, 1)} puntos`,
      detail: `ISS basal derivado: estadio ${calculated.iss}.`,
      badge: 'mieloma múltiple',
      score: 0,
      showScore: false,
      severity: calculated.stage === 'R2-ISS IV'
        ? 'bad'
        : calculated.stage === 'R2-ISS III'
          ? 'warn'
          : 'info',
      metrics: [
        { label: 'R2-ISS', value: calculated.stage },
        { label: 'Puntaje', value: format(calculated.total, 1) },
        { label: 'ISS derivado', value: calculated.iss }
      ],
      notes: [
        'Población: mieloma múltiple recién diagnosticado con estudios citogenéticos adecuados.',
        'La calidad y sensibilidad de FISH, el umbral de del(17p) y la disponibilidad de 1q deben documentarse.',
        'R2-ISS es pronóstico poblacional; no define por sí solo tratamiento, trasplante ni mantenimiento.'
      ]
    });
  }
});

export const LEGACY_CALCULATORS_36_39 = [
  MONARCHE_COHORT_1_CALCULATOR,
  OLYMPIA_CPSEG_CALCULATOR,
  INTERNATIONAL_PROGNOSTIC_INDEX_CALCULATOR,
  R2_ISS_MYELOMA_CALCULATOR
] as const;
