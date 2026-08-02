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
  readonly required?: boolean;
  readonly wide?: boolean;
}

function option(value: string, label: string): CalculatorOption {
  return { value, label };
}

function numberField(
  id: string,
  label: string,
  exampleValue: number | undefined,
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
    initialValue: '',
    exampleValue,
    options,
    help: settings.help,
    wide: settings.wide
  };
}

function checkbox(
  id: string,
  label: string,
  options: Pick<FieldOptions, 'help' | 'wide'> = {}
): CalculatorField {
  return {
    id,
    kind: 'checkbox',
    label,
    required: false,
    initialValue: false,
    help: options.help,
    wide: options.wide
  };
}

function section(id: string, label: string): CalculatorField {
  return {
    id,
    kind: 'section',
    label,
    required: false,
    initialValue: '',
    wide: true
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

function invalidRuleResult(label: string, ...evaluations: readonly InvalidRule[]) {
  const failed = evaluations.filter((evaluation) => !evaluation || evaluation.valid === false);
  const missing = [...new Set(failed.flatMap((evaluation) => evaluation?.missing ?? []).filter(Boolean))];
  const messages = [...new Set(failed.map((evaluation) => evaluation?.message).filter(Boolean))];
  return result({
    title: 'Datos incompletos',
    detail: missing.length
      ? `Revisar: ${missing.join(', ')}.`
      : messages.join(' ') || 'No fue posible completar el cálculo.',
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

interface CockcroftGaultValid {
  readonly valid: true;
  readonly crcl: number;
}

type CockcroftGaultResult = CockcroftGaultValid | InvalidRule;

function cockcroftGault(values: CalculatorValues): CockcroftGaultResult {
  const age = numberValue(values, 'renal_age');
  const weightKg = numberValue(values, 'renal_weight');
  const creatinineMgDl = numberValue(values, 'renal_creatinine');
  const sex = stringValue(values, 'renal_sex').toLowerCase();
  const missing: string[] = [];
  if (!Number.isFinite(age) || age < 18 || age >= 140) missing.push('edad adulta válida');
  if (!Number.isFinite(weightKg) || weightKg <= 0) missing.push('peso usado para la fórmula');
  if (!Number.isFinite(creatinineMgDl) || creatinineMgDl <= 0) missing.push('creatinina');
  if (!['female', 'male'].includes(sex)) missing.push('sexo');
  if (missing.length) return invalid(missing);
  const sexFactor = sex === 'female' ? 0.85 : 1;
  return {
    valid: true,
    crcl: ((140 - age) * weightKg * sexFactor) / (72 * creatinineMgDl)
  };
}

interface CkdEpiValid {
  readonly valid: true;
  readonly egfr: number;
  readonly absoluteGfr: number | null;
  readonly method: string;
}

type CkdEpiResult = CkdEpiValid | InvalidRule;

function ckdEpi2021(values: CalculatorValues): CkdEpiResult {
  const age = numberValue(values, 'renal_age');
  const creatinineMgDl = numberValue(values, 'renal_creatinine');
  const sex = stringValue(values, 'renal_sex').toLowerCase();
  const hasCystatin = values['renal_cystatin'] !== '';
  const hasBsa = values['renal_bsa'] !== '';
  const cystatinCMgL = numberValue(values, 'renal_cystatin');
  const bsaM2 = numberValue(values, 'renal_bsa');
  const missing: string[] = [];
  if (!Number.isFinite(age) || age < 18 || age >= 140) missing.push('edad adulta válida');
  if (!Number.isFinite(creatinineMgDl) || creatinineMgDl <= 0) {
    missing.push('creatinina estandarizada');
  }
  if (!['female', 'male'].includes(sex)) missing.push('sexo');
  if (hasCystatin && (!Number.isFinite(cystatinCMgL) || cystatinCMgL <= 0)) {
    missing.push('cistatina C');
  }
  if (hasBsa && (!Number.isFinite(bsaM2) || bsaM2 <= 0)) missing.push('superficie corporal');
  if (missing.length) return invalid(missing);
  const female = sex === 'female';
  const kappa = female ? 0.7 : 0.9;
  const ratio = creatinineMgDl / kappa;
  let egfr: number;
  let method: string;
  if (hasCystatin) {
    const alpha = female ? -0.219 : -0.144;
    const cystatinRatio = cystatinCMgL / 0.8;
    egfr = 135
      * Math.pow(Math.min(ratio, 1), alpha)
      * Math.pow(Math.max(ratio, 1), -0.544)
      * Math.pow(Math.min(cystatinRatio, 1), -0.323)
      * Math.pow(Math.max(cystatinRatio, 1), -0.778)
      * Math.pow(0.9961, age)
      * (female ? 0.963 : 1);
    method = 'CKD-EPI 2021 creatinina-cistatina C';
  } else {
    const alpha = female ? -0.241 : -0.302;
    egfr = 142
      * Math.pow(Math.min(ratio, 1), alpha)
      * Math.pow(Math.max(ratio, 1), -1.2)
      * Math.pow(0.9938, age)
      * (female ? 1.012 : 1);
    method = 'CKD-EPI 2021 creatinina';
  }
  return {
    valid: true,
    egfr,
    absoluteGfr: hasBsa ? egfr * bsaM2 / 1.73 : null,
    method
  };
}

export const RENAL_FUNCTION_ONCOLOGY_CALCULATOR = defineCalculator({
  id: 'renal-function-oncology',
  title: 'Función renal: Cockcroft–Gault y CKD-EPI 2021',
  category: 'general',
  subtitle: 'Dos estimaciones en paralelo, con método y unidades visibles.',
  source: 'Cockcroft–Gault; CKD-EPI 2021',
  clinicalUse: 'Compara clearance de creatinina estimado y eGFR indexado para documentar función renal antes de decisiones oncológicas dependientes del método.',
  fields: [
    section(
      'renal_scope',
      'Ingresar creatinina estable. El peso corresponde al peso elegido explícitamente para Cockcroft–Gault; la herramienta no decide entre peso real, ideal o ajustado.'
    ),
    numberField('renal_age', 'Edad (años)', 65, { min: 18, max: 139, step: 1 }),
    selectField('renal_sex', 'Sexo usado por las ecuaciones', 'female', [
      option('female', 'Mujer'), option('male', 'Varón')
    ]),
    numberField('renal_weight', 'Peso usado en Cockcroft–Gault (kg)', 65, {
      min: 1, step: 0.1
    }),
    numberField('renal_creatinine', 'Creatinina sérica (mg/dL)', 1, {
      min: 0.01, step: 0.01
    }),
    numberField('renal_cystatin', 'Cistatina C (mg/L, opcional)', undefined, {
      min: 0.01,
      step: 0.01,
      required: false,
      help: 'Si se informa, CKD-EPI usa la ecuación combinada creatinina–cistatina C.'
    }),
    numberField('renal_bsa', 'Superficie corporal (m², opcional)', undefined, {
      min: 0.1,
      max: 4,
      step: 0.01,
      required: false,
      help: 'Si se informa, se muestra también GFR absoluta desindexada.'
    })
  ],
  calculate(values) {
    const cockcroft = cockcroftGault(values);
    const ckdEpi = ckdEpi2021(values);
    if (!cockcroft.valid || !ckdEpi.valid) {
      const failures: InvalidRule[] = [];
      if (!cockcroft.valid) failures.push(cockcroft);
      if (!ckdEpi.valid) failures.push(ckdEpi);
      return invalidRuleResult('Función renal', ...failures);
    }
    return result({
      title: `CrCl ${format(cockcroft.crcl)} mL/min · eGFR ${format(ckdEpi.egfr)} mL/min/1,73 m²`,
      detail: 'Los resultados no son intercambiables: identificar qué estimación exige el protocolo o el prospecto del fármaco.',
      badge: 'función renal',
      score: 0,
      showScore: false,
      severity: 'info',
      metrics: [
        { label: 'Cockcroft–Gault', value: `${format(cockcroft.crcl)} mL/min` },
        { label: ckdEpi.method, value: `${format(ckdEpi.egfr)} mL/min/1,73 m²` },
        ...(ckdEpi.absoluteGfr === null
          ? []
          : [{ label: 'GFR absoluta desindexada', value: `${format(ckdEpi.absoluteGfr)} mL/min` }]),
        { label: 'Peso usado en CG', value: `${format(numberValue(values, 'renal_weight'))} kg` }
      ],
      notes: [
        ckdEpi.absoluteGfr === null
          ? 'CKD-EPI está indexado a 1,73 m²; para una dosis que requiera GFR absoluta debe informarse la superficie corporal y desindexarse.'
          : 'La GFR absoluta se obtuvo como eGFR × superficie corporal / 1,73.',
        'Creatinina no estable, sarcopenia, caquexia, amputaciones o tamaño corporal extremo pueden volver imprecisas ambas estimaciones.',
        'Cerca de un punto de corte clínico, considerar cistatina C o GFR medida según disponibilidad y protocolo.'
      ]
    });
  }
});

interface AncValid {
  readonly valid: true;
  readonly anc: number;
  readonly grade: 0 | 1 | 2 | 3 | 4;
}

type AncResult = AncValid | InvalidRule;

function absoluteNeutrophilCount(values: CalculatorValues): AncResult {
  const wbc = numberValue(values, 'anc_wbc');
  const segmented = numberValue(values, 'anc_segmented');
  const bands = numberValue(values, 'anc_bands');
  const missing: string[] = [];
  if (!Number.isFinite(wbc) || wbc < 0) missing.push('leucocitos');
  if (!Number.isFinite(segmented) || segmented < 0 || segmented > 100) {
    missing.push('neutrófilos segmentados');
  }
  if (!Number.isFinite(bands) || bands < 0 || bands > 100) missing.push('bandas');
  if (segmented + bands > 100) missing.push('suma de segmentados y bandas ≤100%');
  if (missing.length) return invalid(missing);
  const anc = wbc * 1000 * (segmented + bands) / 100;
  const grade = anc < 100 ? 4 : anc < 500 ? 3 : anc < 1000 ? 2 : anc < 1500 ? 1 : 0;
  return { valid: true, anc, grade };
}

export const ANC_CTCAE_V6_CALCULATOR = defineCalculator({
  id: 'anc-ctcae-v6',
  title: 'Recuento absoluto de neutrófilos — CTCAE v6',
  category: 'general',
  subtitle: 'ANC calculado y grado de neutrófilos disminuidos.',
  source: 'NCI CTCAE v6.0 (2025)',
  clinicalUse: 'Calcula ANC a partir del hemograma diferencial y lo clasifica con los límites de CTCAE v6.0.',
  fields: [
    numberField('anc_wbc', 'Leucocitos (×10⁹/L)', 3, { min: 0, step: 0.01 }),
    numberField('anc_segmented', 'Neutrófilos segmentados (%)', 40, {
      min: 0, max: 100, step: 0.1
    }),
    numberField('anc_bands', 'Bandas (%)', 0, { min: 0, max: 100, step: 0.1 })
  ],
  calculate(values) {
    const calculated = absoluteNeutrophilCount(values);
    if (!calculated.valid) return invalidRuleResult('ANC / CTCAE v6', calculated);
    const gradeLabel = calculated.grade === 0
      ? 'Sin grado CTCAE'
      : `CTCAE grado ${calculated.grade}`;
    return result({
      title: `ANC ${Math.round(calculated.anc)} células/µL`,
      detail: gradeLabel,
      badge: 'CTCAE v6',
      score: 0,
      showScore: false,
      severity: calculated.grade >= 3 ? 'bad' : calculated.grade > 0 ? 'warn' : 'good',
      metrics: [
        { label: 'ANC', value: `${Math.round(calculated.anc)} células/µL` },
        { label: 'Grado', value: gradeLabel }
      ],
      notes: [
        'Usar el ANC directo del laboratorio cuando esté informado; esta fórmula es una estimación a partir del diferencial.',
        'La neutropenia febril es un evento clínico separado y no puede inferirse únicamente con este valor.',
        'Los límites de administración o modificación de un tratamiento dependen del esquema y del protocolo vigente.'
      ]
    });
  }
});

interface KhoranaValid {
  readonly valid: true;
  readonly total: number;
  readonly factors: Readonly<Record<string, number>>;
  readonly originalCategory: 'bajo' | 'intermedio' | 'alto';
}

type KhoranaResult = KhoranaValid | InvalidRule;

function khorana(values: CalculatorValues): KhoranaResult {
  const site = stringValue(values, 'khorana_site').toLowerCase();
  const platelets = numberValue(values, 'khorana_platelets');
  const hemoglobin = numberValue(values, 'khorana_hgb');
  const wbc = numberValue(values, 'khorana_wbc');
  const bmi = numberValue(values, 'khorana_bmi');
  const missing: string[] = [];
  if (!site) missing.push('sitio tumoral');
  if (!Number.isFinite(platelets) || platelets < 0) missing.push('plaquetas');
  if (!Number.isFinite(hemoglobin) || hemoglobin < 0) missing.push('hemoglobina');
  if (!Number.isFinite(wbc) || wbc < 0) missing.push('leucocitos');
  if (!Number.isFinite(bmi) || bmi <= 0) missing.push('IMC');
  if (missing.length) return invalid(missing);
  const sitePoints = ['stomach', 'pancreas'].includes(site)
    ? 2
    : ['lung', 'lymphoma', 'gynecologic', 'bladder', 'testicular'].includes(site) ? 1 : 0;
  const factors = {
    site: sitePoints,
    platelets: platelets >= 350 ? 1 : 0,
    anemiaOrEsa: hemoglobin < 10 || booleanValue(values, 'khorana_esa') ? 1 : 0,
    leukocytes: wbc > 11 ? 1 : 0,
    bmi: bmi >= 35 ? 1 : 0
  };
  const total = Object.values(factors).reduce((sum, value) => sum + value, 0);
  return {
    valid: true,
    total,
    factors,
    originalCategory: total === 0 ? 'bajo' : total <= 2 ? 'intermedio' : 'alto'
  };
}

export const KHORANA_VTE_CALCULATOR = defineCalculator({
  id: 'khorana-vte',
  title: 'Khorana — riesgo de VTE',
  category: 'general',
  subtitle: 'Estratificación basal antes de tratamiento sistémico ambulatorio.',
  source: 'Khorana et al.',
  clinicalUse: 'Suma sitio tumoral, hemograma basal, uso de estimulantes eritropoyéticos e IMC para clasificar riesgo tromboembólico.',
  fields: [
    selectField('khorana_site', 'Sitio tumoral', 'other', [
      option('stomach', 'Estómago'),
      option('pancreas', 'Páncreas'),
      option('lung', 'Pulmón'),
      option('lymphoma', 'Linfoma'),
      option('gynecologic', 'Ginecológico'),
      option('bladder', 'Vejiga'),
      option('testicular', 'Testículo'),
      option('other', 'Otro sitio')
    ], { wide: true }),
    numberField('khorana_platelets', 'Plaquetas (×10⁹/L)', 250, { min: 0, step: 1 }),
    numberField('khorana_hgb', 'Hemoglobina (g/dL)', 12, { min: 0, step: 0.1 }),
    numberField('khorana_wbc', 'Leucocitos (×10⁹/L)', 7, { min: 0, step: 0.1 }),
    numberField('khorana_bmi', 'IMC (kg/m²)', 25, { min: 1, step: 0.1 }),
    checkbox('khorana_esa', 'Uso de agente estimulante de eritropoyesis')
  ],
  calculate(values) {
    const calculated = khorana(values);
    if (!calculated.valid) return invalidRuleResult('Khorana', calculated);
    const factors = Object.values(calculated.factors).filter((points) => points > 0).length;
    return result({
      title: `Khorana ${calculated.total} · riesgo ${calculated.originalCategory}`,
      detail: 'Clasificación original: 0 bajo, 1–2 intermedio y ≥3 alto.',
      badge: 'VTE ambulatorio',
      score: 0,
      showScore: false,
      severity: calculated.total >= 3 ? 'bad' : calculated.total >= 1 ? 'warn' : 'good',
      metrics: [
        { label: 'Puntaje', value: calculated.total },
        { label: 'Categoría original', value: calculated.originalCategory },
        { label: 'Componentes con puntos', value: factors }
      ],
      notes: [
        'Población: pacientes ambulatorios con cáncer antes de comenzar quimioterapia sistémica.',
        'El umbral moderno ≥2 abre una evaluación clínica individual; no indica anticoagulación automática.',
        'Valorar por separado hemorragia, interacciones, función renal, tipo de cáncer y situación clínica.'
      ]
    });
  }
});

interface MasccValid {
  readonly valid: true;
  readonly total: number;
  readonly category: string;
  readonly lowRisk: boolean;
}

type MasccResult = MasccValid | InvalidRule;

function mascc(values: CalculatorValues): MasccResult {
  const burden = numberValue(values, 'mascc_burden');
  if (![0, 3, 5].includes(burden)) return invalid(['carga sintomática']);
  const total = burden
    + (booleanValue(values, 'mascc_no_hypotension') ? 5 : 0)
    + (booleanValue(values, 'mascc_no_copd') ? 4 : 0)
    + (booleanValue(values, 'mascc_tumor_fungal') ? 4 : 0)
    + (booleanValue(values, 'mascc_no_dehydration') ? 3 : 0)
    + (booleanValue(values, 'mascc_outpatient') ? 3 : 0)
    + (booleanValue(values, 'mascc_age_under_60') ? 2 : 0);
  const lowRisk = total >= 21;
  return {
    valid: true,
    total,
    category: lowRisk ? 'bajo riesgo por MASCC' : 'alto riesgo por MASCC',
    lowRisk
  };
}

export const MASCC_FEBRILE_NEUTROPENIA_CALCULATOR = defineCalculator({
  id: 'mascc-febrile-neutropenia',
  title: 'MASCC — neutropenia febril',
  category: 'general',
  subtitle: 'Riesgo de complicaciones una vez presente la neutropenia febril.',
  source: 'MASCC Risk Index',
  clinicalUse: 'Integra carga sintomática y condiciones clínicas al inicio de la fiebre para estratificar complicaciones.',
  fields: [
    section(
      'mascc_scope',
      'Aplicar después de identificar neutropenia febril. La impresión de inestabilidad clínica prevalece sobre el puntaje.'
    ),
    selectField('mascc_burden', 'Carga de enfermedad/síntomas', '5', [
      option('5', 'Ninguna o leve · 5 puntos'),
      option('3', 'Moderada · 3 puntos'),
      option('0', 'Grave o moribundo · 0 puntos')
    ], { wide: true }),
    checkbox('mascc_no_hypotension', 'Sin hipotensión (PAS >90 mmHg)'),
    checkbox('mascc_no_copd', 'Sin EPOC'),
    checkbox(
      'mascc_tumor_fungal',
      'Tumor sólido o neoplasia hematológica sin infección fúngica invasiva previa',
      { wide: true }
    ),
    checkbox('mascc_no_dehydration', 'Sin deshidratación que requiera fluidos IV'),
    checkbox('mascc_outpatient', 'Ambulatorio al comienzo de la fiebre'),
    checkbox('mascc_age_under_60', 'Edad menor de 60 años')
  ],
  calculate(values) {
    const calculated = mascc(values);
    if (!calculated.valid) return invalidRuleResult('MASCC', calculated);
    return result({
      title: `MASCC ${calculated.total}/26`,
      detail: calculated.category,
      badge: 'neutropenia febril',
      score: 0,
      showScore: false,
      severity: calculated.lowRisk ? 'good' : 'bad',
      metrics: [
        { label: 'Puntaje', value: `${calculated.total}/26` },
        { label: 'Umbral', value: calculated.lowRisk ? '≥21' : '<21' }
      ],
      notes: [
        'Un resultado de bajo riesgo no reemplaza estabilidad, examen, foco infeccioso, comorbilidades ni condiciones para seguimiento.',
        'No usar como predictor de neutropenia antes de la quimioterapia.',
        'No define por sí solo internación, vía antibiótica ni alta.'
      ]
    });
  }
});

export const LEGACY_CALCULATORS_24_27 = [
  RENAL_FUNCTION_ONCOLOGY_CALCULATOR,
  ANC_CTCAE_V6_CALCULATOR,
  KHORANA_VTE_CALCULATOR,
  MASCC_FEBRILE_NEUTROPENIA_CALCULATOR
] as const;
