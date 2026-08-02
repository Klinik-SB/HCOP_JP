import {
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
  readonly exampleValue?: string;
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
  options: readonly CalculatorOption[],
  settings: FieldOptions = {}
): CalculatorField {
  return {
    id,
    kind: 'select',
    label,
    required: settings.required ?? true,
    initialValue: settings.initialValue ?? '',
    exampleValue: settings.exampleValue,
    options,
    help: settings.help,
    scenario: settings.scenario,
    wide: settings.wide
  };
}

function section(
  id: string,
  label: string,
  options: Pick<FieldOptions, 'help' | 'scenario'> = {}
): CalculatorField {
  return {
    id,
    kind: 'section',
    label,
    required: false,
    initialValue: '',
    wide: true,
    help: options.help,
    scenario: options.scenario
  };
}

const YES_NO_OPTIONS = [option('no', 'No'), option('yes', 'Si')];
const BIOMARKER_STATUS_OPTIONS = [
  option('positive', 'Positivo'),
  option('negative', 'Negativo'),
  option('unknown', 'Desconocido / no estudiado')
];
const KPS_OPTIONS = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0]
  .map((value) => option(String(value), `KPS ${value}`));

interface RuleError {
  readonly field: string;
  readonly message: string;
}

interface InvalidRule {
  readonly valid: false;
  readonly errors: readonly RuleError[];
  readonly warnings: readonly string[];
}

function invalidOutput(label: string, calculated: InvalidRule) {
  const messages = calculated.errors.map((item) => item.message || item.field).filter(Boolean);
  return result({
    title: `${label}: no calculable`,
    detail: messages.length ? messages.join('; ') : 'Revisar los datos ingresados.',
    badge: 'datos invalidos',
    score: 0,
    showScore: false,
    severity: 'warn',
    metrics: [],
    notes: calculated.warnings
  });
}

function fixed(value: number, digits = 1): string {
  return Number(value).toFixed(digits);
}

function isYes(values: CalculatorValues, fieldId: string): boolean {
  return stringValue(values, fieldId) === 'yes';
}

function prognosticSeverity(category: string): 'good' | 'warn' | 'bad' | 'info' {
  return category === 'good' || category === 'low' ? 'good'
    : category === 'intermediate' ? 'warn'
      : category === 'poor' || category === 'high' ? 'bad'
        : 'info';
}

interface LungGpaValid {
  readonly valid: true;
  readonly histology: 'adenocarcinoma' | 'non_adenocarcinoma' | 'sclc';
  readonly total: number;
  readonly prognosticBand: string;
  readonly medianOverallSurvivalMonths: number;
  readonly interquartileRangeMonths: readonly [number, number | null];
  readonly warnings: readonly string[];
}

type LungGpaResult = LungGpaValid | InvalidRule;

function gpaHistologyLabel(histology: LungGpaValid['histology']): string {
  return histology === 'adenocarcinoma' ? 'NSCLC adenocarcinoma'
    : histology === 'non_adenocarcinoma' ? 'NSCLC no adenocarcinoma'
      : 'SCLC';
}

function gpaIqrLabel(values: readonly [number, number | null]): string {
  return `${values[0]}-${values[1] === null ? 'no alcanzado' : values[1]} meses`;
}

function lungGpaBand(histology: LungGpaValid['histology'], total: number) {
  const index = total <= 1 ? 0 : total <= 2 ? 1 : total <= 3 ? 2 : 3;
  const bands = ['0-1.0', '1.5-2.0', '2.5-3.0', '3.5-4.0'] as const;
  const values = {
    adenocarcinoma: [
      { median: 6, iqr: [2, 13] as const },
      { median: 15, iqr: [5, 38] as const },
      { median: 30, iqr: [12, null] as const },
      { median: 52, iqr: [25, 69] as const }
    ],
    non_adenocarcinoma: [
      { median: 2, iqr: [1, 4] as const },
      { median: 5, iqr: [3, 12] as const },
      { median: 10, iqr: [4, 21] as const },
      { median: 19, iqr: [8, 33] as const }
    ],
    sclc: [
      { median: 4, iqr: [2, 8] as const },
      { median: 8, iqr: [4, 15] as const },
      { median: 13, iqr: [7, 23] as const },
      { median: 23, iqr: [11, null] as const }
    ]
  } as const;
  return { band: bands[index]!, ...values[histology][index]! };
}

function biomarkerStatus(values: CalculatorValues, fieldId: string): string {
  return stringValue(values, fieldId);
}

function lungGpa2022(values: CalculatorValues): LungGpaResult {
  const histology = stringValue(values, 'scenario') as LungGpaValid['histology'];
  const ageYears = numberValue(values, 'lung_gpa_age');
  const kps = numberValue(values, 'lung_gpa_kps');
  const brainMetastases = numberValue(values, 'lung_gpa_brain_count');
  const extracranialMetastases = isYes(values, 'lung_gpa_ecm');
  const errors: RuleError[] = [];
  if (!['adenocarcinoma', 'non_adenocarcinoma', 'sclc'].includes(histology)) {
    errors.push({ field: 'histology', message: 'histology debe ser uno de: adenocarcinoma, non_adenocarcinoma, sclc' });
  }
  if (!Number.isFinite(ageYears) || ageYears < 18 || ageYears > 120) {
    errors.push({ field: 'ageYears', message: ageYears < 18
      ? 'ageYears no puede ser menor que 18' : 'ageYears no puede ser mayor que 120' });
  }
  if (!Number.isInteger(kps) || kps < 0 || kps > 100 || kps % 10 !== 0) {
    errors.push({ field: 'kps', message: 'kps debe expresarse en incrementos de 10' });
  }
  if (!Number.isInteger(brainMetastases) || brainMetastases < 1) {
    errors.push({ field: 'brainMetastases', message: 'brainMetastases debe ser un numero entero' });
  }
  const egfrStatus = biomarkerStatus(values, 'lung_gpa_egfr');
  const alkStatus = biomarkerStatus(values, 'lung_gpa_alk');
  const pdl1Status = biomarkerStatus(values, 'lung_gpa_pdl1');
  if (histology === 'adenocarcinoma') {
    for (const [field, status] of [
      ['egfrStatus', egfrStatus], ['alkStatus', alkStatus], ['pdl1Status', pdl1Status]
    ] as const) {
      if (!['positive', 'negative', 'unknown'].includes(status)) {
        errors.push({ field, message: `${field} debe ser positive, negative o unknown` });
      }
    }
  }
  if (errors.length) return { valid: false, errors, warnings: [] };

  let components: Readonly<Record<string, number>>;
  if (histology === 'adenocarcinoma') {
    components = {
      kps: kps <= 70 ? 0 : kps === 80 ? 0.5 : 1,
      age: ageYears < 70 ? 0.5 : 0,
      brainMetastases: brainMetastases <= 4 ? 0.5 : 0,
      extracranialMetastases: extracranialMetastases ? 0 : 1,
      egfrOrAlk: egfrStatus === 'positive' || alkStatus === 'positive' ? 0.5 : 0,
      pdl1: pdl1Status === 'positive' ? 0.5 : 0
    };
  } else if (histology === 'non_adenocarcinoma') {
    components = {
      kps: kps <= 60 ? 0 : kps === 70 ? 1 : kps === 80 ? 1.5 : 2,
      age: ageYears < 70 ? 0.5 : 0,
      brainMetastases: brainMetastases <= 4 ? 0.5 : 0,
      extracranialMetastases: extracranialMetastases ? 0 : 1
    };
  } else {
    components = {
      kps: kps <= 60 ? 0 : kps === 70 ? 0.5 : kps === 80 ? 1 : kps === 90 ? 1.5 : 2,
      age: ageYears < 75 ? 0.5 : 0,
      brainMetastases: brainMetastases <= 3 ? 1 : brainMetastases <= 7 ? 0.5 : 0,
      extracranialMetastases: extracranialMetastases ? 0 : 0.5
    };
  }
  const total = Object.values(components).reduce((sum, value) => sum + value, 0);
  const survival = lungGpaBand(histology, total);
  return {
    valid: true,
    histology,
    total,
    prognosticBand: survival.band,
    medianOverallSurvivalMonths: survival.median,
    interquartileRangeMonths: survival.iqr,
    warnings: []
  };
}

export const THORAX_LUNG_GPA_2022_CALCULATOR = defineCalculator({
  id: 'thorax_lung_gpa_2022',
  title: 'Lung GPA 2022',
  category: 'pulmon',
  subtitle: 'Pronóstico en metástasis cerebrales de cáncer pulmonar.',
  source: 'Sperduto et al., Int J Radiat Oncol Biol Phys 2022',
  clinicalUse: 'Estratifica el pronostico desde el diagnostico inicial de metastasis cerebrales mediante una hoja especifica para adenocarcinoma, otros NSCLC o SCLC.',
  fields: [
    selectField('scenario', 'Histologia', [
      option('adenocarcinoma', 'NSCLC adenocarcinoma'),
      option('non_adenocarcinoma', 'NSCLC no adenocarcinoma'),
      option('sclc', 'Cancer pulmonar de celulas pequenas (SCLC)')
    ], {
      initialValue: 'adenocarcinoma',
      exampleValue: 'adenocarcinoma',
      wide: true,
      help: 'Cada histologia utiliza ponderaciones diferentes.'
    }),
    section('lung_gpa_common_section', 'Datos al diagnostico de metastasis cerebrales'),
    numberField('lung_gpa_age', 'Edad (anos)', 65, { min: 18, max: 120, step: 1 }),
    selectField('lung_gpa_kps', 'Karnofsky (KPS)', KPS_OPTIONS),
    numberField('lung_gpa_brain_count', 'Numero de metastasis cerebrales', 1, { min: 1, step: 1 }),
    selectField('lung_gpa_ecm', 'Metastasis extracraneales presentes', YES_NO_OPTIONS),
    section('lung_gpa_biomarker_section', 'Biomarcadores del adenocarcinoma', {
      scenario: 'adenocarcinoma',
      help: 'Desconocido puntua 0 en la definicion publicada; debe registrarse de forma explicita.'
    }),
    selectField('lung_gpa_egfr', 'EGFR', BIOMARKER_STATUS_OPTIONS, { scenario: 'adenocarcinoma' }),
    selectField('lung_gpa_alk', 'ALK', BIOMARKER_STATUS_OPTIONS, { scenario: 'adenocarcinoma' }),
    selectField('lung_gpa_pdl1', 'PD-L1 (positivo si es mayor o igual a 1%)', BIOMARKER_STATUS_OPTIONS, {
      scenario: 'adenocarcinoma'
    })
  ],
  calculate(values) {
    const calculated = lungGpa2022(values);
    if (!calculated.valid) return invalidOutput('Lung GPA 2022', calculated);
    const severity = calculated.total <= 1 ? 'bad' : calculated.total <= 2 ? 'warn' : 'good';
    return result({
      title: `Lung GPA ${fixed(calculated.total, 1)}`,
      detail: `${gpaHistologyLabel(calculated.histology)} - banda ${calculated.prognosticBand}.`,
      badge: 'pronostico 2022',
      score: 0,
      showScore: false,
      severity,
      metrics: [
        { label: 'Puntaje', value: fixed(calculated.total, 1) },
        { label: 'Banda', value: calculated.prognosticBand },
        { label: 'Mediana OS de cohorte', value: `${calculated.medianOverallSurvivalMonths} meses` },
        { label: 'Rango intercuartil', value: gpaIqrLabel(calculated.interquartileRangeMonths) }
      ],
      notes: [
        'Las supervivencias corresponden a cohortes y no son una prediccion individual exacta.',
        'Aplicable al diagnostico inicial de metastasis cerebrales; la cohorte excluyo recurrencia cerebral y carcinomatosis leptomeningea.',
        'Es un indice pronostico y no compara eficacia entre tratamientos.',
        ...calculated.warnings
      ]
    });
  }
});

interface LipiValid {
  readonly valid: true;
  readonly total: number;
  readonly category: 'good' | 'intermediate' | 'poor';
  readonly derivedNeutrophilLymphocyteRatio: number;
  readonly components: {
    readonly dnlrAbove3: number;
    readonly ldhAboveUpperLimitNormal: number;
  };
  readonly warnings: readonly string[];
}

type LipiResult = LipiValid | InvalidRule;

function lipi(values: CalculatorValues): LipiResult {
  const whiteBloodCells = numberValue(values, 'lipi_wbc');
  const absoluteNeutrophils = numberValue(values, 'lipi_anc');
  const ldh = numberValue(values, 'lipi_ldh');
  const ldhUpperLimitNormal = numberValue(values, 'lipi_ldh_uln');
  const errors: RuleError[] = [];
  if (!Number.isFinite(whiteBloodCells) || whiteBloodCells <= 0) {
    errors.push({ field: 'whiteBloodCells', message: 'whiteBloodCells debe ser mayor que 0' });
  }
  if (!Number.isFinite(absoluteNeutrophils) || absoluteNeutrophils < 0) {
    errors.push({ field: 'absoluteNeutrophils', message: 'absoluteNeutrophils no puede ser menor que 0' });
  }
  if (!Number.isFinite(ldh) || ldh <= 0) {
    errors.push({ field: 'ldh', message: 'ldh debe ser mayor que 0' });
  }
  if (!Number.isFinite(ldhUpperLimitNormal) || ldhUpperLimitNormal <= 0) {
    errors.push({ field: 'ldhUpperLimitNormal', message: 'ldhUpperLimitNormal debe ser mayor que 0' });
  }
  if (absoluteNeutrophils >= whiteBloodCells) {
    errors.push({
      field: 'absoluteNeutrophils',
      message: 'absoluteNeutrophils debe ser menor que whiteBloodCells'
    });
  }
  if (errors.length) return { valid: false, errors, warnings: [] };
  const derivedNeutrophilLymphocyteRatio = absoluteNeutrophils
    / (whiteBloodCells - absoluteNeutrophils);
  const dnlrPoint = derivedNeutrophilLymphocyteRatio > 3 ? 1 : 0;
  const ldhPoint = ldh > ldhUpperLimitNormal ? 1 : 0;
  const total = dnlrPoint + ldhPoint;
  return {
    valid: true,
    total,
    category: total === 0 ? 'good' : total === 1 ? 'intermediate' : 'poor',
    derivedNeutrophilLymphocyteRatio,
    components: { dnlrAbove3: dnlrPoint, ldhAboveUpperLimitNormal: ldhPoint },
    warnings: ['Indice pronostico; no predice por si solo el beneficio de un tratamiento']
  };
}

export const THORAX_LIPI_CALCULATOR = defineCalculator({
  id: 'thorax_lipi',
  title: 'LIPI',
  category: 'pulmon',
  subtitle: 'Índice pronóstico pulmonar por dNLR y LDH.',
  source: 'Mezquita et al., JAMA Oncology 2018',
  clinicalUse: 'Calcula el Lung Immune Prognostic Index basal en NSCLC avanzado a partir de hemograma y LDH previos al tratamiento.',
  fields: [
    section('lipi_labs_section', 'Laboratorio basal', {
      help: 'Leucocitos y neutrofilos deben usar las mismas unidades.'
    }),
    numberField('lipi_wbc', 'Leucocitos totales', 7, { min: 0.001, step: 0.01 }),
    numberField('lipi_anc', 'Neutrofilos absolutos', 4, { min: 0, step: 0.01 }),
    numberField('lipi_ldh', 'LDH', 200, { min: 0.001, step: 0.1 }),
    numberField('lipi_ldh_uln', 'Limite superior normal de LDH', 250, { min: 0.001, step: 0.1 })
  ],
  calculate(values) {
    const calculated = lipi(values);
    if (!calculated.valid) return invalidOutput('LIPI', calculated);
    const labels = { good: 'bueno', intermediate: 'intermedio', poor: 'pobre' } as const;
    return result({
      title: `LIPI ${calculated.total} - ${labels[calculated.category]}`,
      detail: 'Indice pronostico compuesto por dNLR mayor de 3 y LDH por encima del limite normal.',
      badge: 'LIPI',
      score: 0,
      showScore: false,
      severity: prognosticSeverity(calculated.category),
      metrics: [
        { label: 'Puntaje', value: calculated.total },
        { label: 'dNLR', value: fixed(calculated.derivedNeutrophilLymphocyteRatio, 2) },
        { label: 'dNLR >3', value: calculated.components.dnlrAbove3 ? 'Si' : 'No' },
        { label: 'LDH >LSN', value: calculated.components.ldhAboveUpperLimitNormal ? 'Si' : 'No' }
      ],
      notes: [
        'Infeccion, inflamacion aguda, corticoides o factores estimulantes pueden modificar los componentes.',
        'No usar el LIPI como prueba aislada de respuesta ni como selector de tratamiento.',
        ...calculated.warnings
      ]
    });
  }
});

interface AlbiValid {
  readonly valid: true;
  readonly score: number;
  readonly grade: 1 | 2 | 3;
  readonly modifiedGrade: '1' | '2a' | '2b' | '3';
  readonly inputs: {
    readonly bilirubinMicromolL: number;
    readonly albuminGL: number;
  };
  readonly warnings: readonly string[];
}

type AlbiResult = AlbiValid | InvalidRule;

function albi(values: CalculatorValues): AlbiResult {
  const bilirubin = numberValue(values, 'albi_bilirubin');
  const albumin = numberValue(values, 'albi_albumin');
  const bilirubinUnit = stringValue(values, 'albi_bilirubin_unit');
  const albuminUnit = stringValue(values, 'albi_albumin_unit');
  const errors: RuleError[] = [];
  if (!Number.isFinite(bilirubin) || bilirubin <= 0) {
    errors.push({ field: 'bilirubin', message: 'bilirubin debe ser mayor que 0' });
  }
  if (!Number.isFinite(albumin) || albumin <= 0) {
    errors.push({ field: 'albumin', message: 'albumin debe ser mayor que 0' });
  }
  if (!['mg/dL', 'umol/L'].includes(bilirubinUnit)) {
    errors.push({ field: 'bilirubinUnit', message: 'bilirubinUnit debe ser umol/L o mg/dL' });
  }
  if (!['g/dL', 'g/L'].includes(albuminUnit)) {
    errors.push({ field: 'albuminUnit', message: 'albuminUnit debe ser g/L o g/dL' });
  }
  if (errors.length) return { valid: false, errors, warnings: [] };
  const bilirubinMicromolL = bilirubinUnit === 'mg/dL' ? bilirubin * 17.1 : bilirubin;
  const albuminGL = albuminUnit === 'g/dL' ? albumin * 10 : albumin;
  const score = 0.66 * Math.log10(bilirubinMicromolL) - 0.085 * albuminGL;
  const cutoffTolerance = 1e-12;
  const grade = score <= -2.60 + cutoffTolerance ? 1
    : score <= -1.39 + cutoffTolerance ? 2 : 3;
  const modifiedGrade = grade === 1 ? '1'
    : score <= -2.27 + cutoffTolerance ? '2a'
      : grade === 2 ? '2b' : '3';
  return {
    valid: true,
    score,
    grade,
    modifiedGrade,
    inputs: { bilirubinMicromolL, albuminGL },
    warnings: []
  };
}

export const DIGESTIVE_ALBI_CALCULATOR = defineCalculator({
  id: 'digestive_albi',
  title: 'ALBI / mALBI',
  category: 'digestivo',
  subtitle: 'Reserva hepática objetiva por albúmina y bilirrubina.',
  source: 'Johnson et al., Journal of Clinical Oncology 2015',
  clinicalUse: 'Cuantifica funcion hepatica en pacientes con hepatocarcinoma mediante albumina y bilirrubina, sin variables clinicas subjetivas.',
  fields: [
    section('albi_labs_section', 'Laboratorio', {
      help: 'Seleccionar las unidades exactas del informe.'
    }),
    numberField('albi_bilirubin', 'Bilirrubina total', 1, { min: 0.001, step: 0.01 }),
    selectField('albi_bilirubin_unit', 'Unidad de bilirrubina', [
      option('mg/dL', 'mg/dL'), option('umol/L', 'umol/L')
    ], { initialValue: 'mg/dL', exampleValue: 'mg/dL' }),
    numberField('albi_albumin', 'Albumina', 4, { min: 0.001, step: 0.01 }),
    selectField('albi_albumin_unit', 'Unidad de albumina', [
      option('g/dL', 'g/dL'), option('g/L', 'g/L')
    ], { initialValue: 'g/dL', exampleValue: 'g/dL' })
  ],
  calculate(values) {
    const calculated = albi(values);
    if (!calculated.valid) return invalidOutput('ALBI', calculated);
    return result({
      title: `ALBI grado ${calculated.grade}`,
      detail: `Puntaje continuo ${fixed(calculated.score, 3)}.`,
      badge: 'funcion hepatica',
      score: 0,
      showScore: false,
      severity: calculated.grade === 1 ? 'good' : calculated.grade === 2 ? 'warn' : 'bad',
      metrics: [
        { label: 'ALBI', value: fixed(calculated.score, 3) },
        { label: 'Grado', value: calculated.grade },
        { label: 'mALBI', value: calculated.modifiedGrade },
        { label: 'Bilirrubina usada', value: `${fixed(calculated.inputs.bilirubinMicromolL, 2)} umol/L` },
        { label: 'Albumina usada', value: `${fixed(calculated.inputs.albuminGL, 2)} g/L` }
      ],
      notes: [
        'ALBI: grado 1 ≤-2,60; grado 2 >-2,60 a ≤-1,39; grado 3 >-1,39. mALBI divide grado 2 en 2a ≤-2,27 y 2b >-2,27.',
        'No incorpora ascitis, encefalopatia, hipertension portal ni volumen hepatico remanente.',
        'Describe reserva hepatica; no determina por si solo una conducta oncologica.',
        ...calculated.warnings
      ]
    });
  }
});

interface FrenchAfpHccValid {
  readonly valid: true;
  readonly total: number;
  readonly category: 'low' | 'high';
  readonly components: {
    readonly diameterPoints: number;
    readonly nodulePoints: number;
    readonly afpPoints: number;
  };
  readonly warnings: readonly string[];
}

type FrenchAfpHccResult = FrenchAfpHccValid | InvalidRule;

function frenchAfpHcc(values: CalculatorValues): FrenchAfpHccResult {
  const largestTumorDiameterCm = numberValue(values, 'afp_hcc_diameter');
  const noduleCount = numberValue(values, 'afp_hcc_nodules');
  const afpNgMl = numberValue(values, 'afp_hcc_value');
  const errors: RuleError[] = [];
  if (!Number.isFinite(largestTumorDiameterCm) || largestTumorDiameterCm <= 0) {
    errors.push({ field: 'largestTumorDiameterCm', message: 'largestTumorDiameterCm debe ser mayor que 0' });
  }
  if (!Number.isInteger(noduleCount) || noduleCount < 1) {
    errors.push({ field: 'noduleCount', message: 'noduleCount debe ser un numero entero' });
  }
  if (!Number.isFinite(afpNgMl) || afpNgMl < 0) {
    errors.push({ field: 'afpNgMl', message: 'afpNgMl no puede ser menor que 0' });
  }
  if (errors.length) return { valid: false, errors, warnings: [] };
  const diameterPoints = largestTumorDiameterCm <= 3 ? 0
    : largestTumorDiameterCm <= 6 ? 1 : 4;
  const nodulePoints = noduleCount <= 3 ? 0 : 2;
  const afpPoints = afpNgMl <= 100 ? 0 : afpNgMl <= 1000 ? 2 : 3;
  const total = diameterPoints + nodulePoints + afpPoints;
  return {
    valid: true,
    total,
    category: total <= 2 ? 'low' : 'high',
    components: { diameterPoints, nodulePoints, afpPoints },
    warnings: []
  };
}

export const DIGESTIVE_FRENCH_AFP_HCC_CALCULATOR = defineCalculator({
  id: 'digestive_french_afp_hcc',
  title: 'AFP francés para trasplante en HCC',
  category: 'digestivo',
  subtitle: 'Carga tumoral y AFP en candidatos con hepatocarcinoma.',
  source: 'Duvoux et al., Gastroenterology 2012',
  clinicalUse: 'Estratifica el riesgo de recurrencia postrasplante en hepatocarcinoma con diametro tumoral, numero de nodulos y AFP.',
  fields: [
    section('afp_hcc_section', 'Evaluacion pretrasplante', {
      help: 'Usar imagen y AFP de la misma evaluacion clinica.'
    }),
    numberField('afp_hcc_diameter', 'Mayor diametro tumoral (cm)', 3, { min: 0.01, step: 0.1 }),
    numberField('afp_hcc_nodules', 'Numero de nodulos HCC', 1, { min: 1, step: 1 }),
    numberField('afp_hcc_value', 'AFP (ng/mL)', 100, { min: 0, step: 0.1 })
  ],
  calculate(values) {
    const calculated = frenchAfpHcc(values);
    if (!calculated.valid) return invalidOutput('AFP frances HCC', calculated);
    const label = calculated.category === 'low'
      ? 'menor riesgo segun el modelo' : 'mayor riesgo segun el modelo';
    return result({
      title: `AFP score ${calculated.total}`,
      detail: label,
      badge: 'HCC pretrasplante',
      score: 0,
      showScore: false,
      severity: calculated.category === 'low' ? 'good' : 'bad',
      metrics: [
        { label: 'Puntaje total', value: calculated.total },
        { label: 'Diametro', value: calculated.components.diameterPoints },
        { label: 'Numero de nodulos', value: calculated.components.nodulePoints },
        { label: 'AFP', value: calculated.components.afpPoints }
      ],
      notes: [
        'El umbral publicado separa puntaje menor o igual a 2 de puntaje mayor de 2.',
        'Es un modelo de recurrencia postrasplante y no una estadificacion general del HCC.',
        'No incorpora por si solo invasion macrovascular, enfermedad extrahepatica ni criterios administrativos locales.',
        ...calculated.warnings
      ]
    });
  }
});

export const LEGACY_CALCULATORS_48_51 = [
  THORAX_LUNG_GPA_2022_CALCULATOR,
  THORAX_LIPI_CALCULATOR,
  DIGESTIVE_ALBI_CALCULATOR,
  DIGESTIVE_FRENCH_AFP_HCC_CALCULATOR
] as const;
