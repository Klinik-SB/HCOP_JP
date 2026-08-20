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
  options: readonly CalculatorOption[],
  settings: FieldOptions = {}
): CalculatorField {
  return {
    id,
    kind: 'select',
    label,
    required: settings.required ?? true,
    initialValue: '',
    options,
    help: settings.help,
    wide: settings.wide
  };
}

function checkbox(id: string, label: string, help?: string): CalculatorField {
  return {
    id,
    kind: 'checkbox',
    label,
    required: false,
    initialValue: false,
    help
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

const GYNE_YES_NO_OPTIONS = [option('yes', 'Si'), option('no', 'No')];
const THORAX_YES_NO_OPTIONS = [option('no', 'No'), option('yes', 'Si')];

function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return 'no consignado';
  return value.toLocaleString('es-AR', { maximumFractionDigits: digits });
}

function joinNatural(values: readonly string[]): string {
  const items = values.filter(Boolean);
  if (!items.length) return 'ninguno';
  if (items.length === 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

interface GyneInvalid {
  readonly valid: false;
  readonly missing: readonly string[];
  readonly errors: readonly string[];
}

function gyneInvalid(missing: readonly string[] = [], errors: readonly string[] = []): GyneInvalid {
  return { valid: false, missing, errors };
}

const GYNE_FIELD_LABELS: Readonly<Record<string, string>> = {
  ecog: 'ECOG',
  ascitesMl: 'volumen de ascitis',
  completeResectionInitialSurgery: 'reseccion completa inicial'
};

function gyneValidationResult(calculated: GyneInvalid) {
  const missing = calculated.missing.map((field) => GYNE_FIELD_LABELS[field] ?? field);
  const pieces: string[] = [];
  if (missing.length) pieces.push(`Falta completar: ${missing.join(', ')}.`);
  if (calculated.errors.length) pieces.push(`Revisar: ${calculated.errors.join('; ')}.`);
  return result({
    title: 'No calculable con los datos actuales',
    detail: pieces.join(' ') || 'La regla no pudo aplicarse con los datos ingresados.',
    badge: 'datos incompletos',
    score: 0,
    showScore: false,
    severity: 'warn',
    metrics: [],
    notes: ['Los campos ausentes no se interpretan automaticamente como hallazgos negativos.']
  });
}

interface FagottiFeature {
  readonly id: string;
  readonly label: string;
  readonly points: 2;
}

interface FagottiValid {
  readonly valid: true;
  readonly score: number;
  readonly legacyThresholdMet: boolean;
  readonly positiveFeatures: readonly FagottiFeature[];
  readonly notes: readonly string[];
}

type FagottiResult = FagottiValid | GyneInvalid;

function fagotti2006(values: CalculatorValues): FagottiResult {
  const definitions = [
    ['fagotti_peritoneal', 'peritoneal_carcinomatosis', 'Carcinomatosis peritoneal masiva o miliar'],
    ['fagotti_diaphragm', 'diaphragmatic_disease', 'Enfermedad diafragmatica extensa o confluente'],
    ['fagotti_mesentery', 'mesenteric_disease', 'Grandes nodulos mesentericos o compromiso de la raiz'],
    ['fagotti_omentum', 'omental_disease', 'Enfermedad omental hasta la curvatura mayor'],
    ['fagotti_bowel', 'bowel_infiltration', 'Reseccion intestinal prevista o enfermedad serosa extensa'],
    ['fagotti_stomach', 'stomach_infiltration', 'Compromiso evidente de la pared gastrica']
  ] as const;
  const largestLiverSurfaceLesionCm = numberValue(values, 'fagotti_liver');
  if (!Number.isFinite(largestLiverSurfaceLesionCm) || largestLiverSurfaceLesionCm < 0) {
    return gyneInvalid(['largestLiverSurfaceLesionCm']);
  }
  const positiveFeatures: FagottiFeature[] = definitions
    .filter(([field]) => booleanValue(values, field))
    .map(([, id, label]) => ({ id, label, points: 2 }));
  if (largestLiverSurfaceLesionCm > 2) {
    positiveFeatures.push({
      id: 'liver_surface_metastasis_over_2cm',
      label: 'Lesion superficial hepatica >2 cm',
      points: 2
    });
  }
  const score = positiveFeatures.reduce((total, feature) => total + feature.points, 0);
  return {
    valid: true,
    score,
    legacyThresholdMet: score >= 8,
    positiveFeatures,
    notes: [
      'El umbral historico predice riesgo de citorreduccion suboptima segun la definicion de residuo >1 cm.',
      'El resultado no equivale a irresecabilidad ni reemplaza la evaluacion de un centro experto.'
    ]
  };
}

export const GYNE_FAGOTTI_CALCULATOR = defineCalculator({
  id: 'gyne-fagotti',
  title: 'Ovario — Fagotti PIV clásico',
  category: 'ginecologia',
  subtitle: 'Siete parámetros laparoscópicos del modelo de 2006.',
  source: 'Fagotti 2006 - PIV clasico',
  clinicalUse: 'Suma dos puntos por cada definicion laparoscopica presente. Mantiene separado el modelo clasico de las versiones modificadas posteriores.',
  fields: [
    section('fagotti_section', 'Evaluacion laparoscopica',
      'Marque solamente cuando se cumpla la definicion completa de 2 puntos. Sin marcar equivale a 0 puntos.'),
    checkbox('fagotti_peritoneal', 'Peritoneo: compromiso masivo o patron miliar',
      'No marcar para enfermedad limitada removible por peritonectomia.'),
    checkbox('fagotti_diaphragm', 'Diafragma: infiltracion extensa o nodulos confluentes',
      'Debe comprometer la mayor parte de la superficie diafragmatica.'),
    checkbox('fagotti_mesentery', 'Mesenterio: grandes nodulos o raiz comprometida',
      'Incluye limitacion de la movilidad de segmentos intestinales.'),
    checkbox('fagotti_omentum', 'Omento: enfermedad hasta la curvatura mayor gastrica'),
    checkbox('fagotti_bowel', 'Intestino: reseccion prevista o enfermedad serosa extensa'),
    checkbox('fagotti_stomach', 'Estomago: compromiso evidente de la pared'),
    numberField('fagotti_liver', 'Mayor lesion superficial hepatica (cm)', undefined, {
      min: 0,
      step: 0.1,
      help: 'Ingrese 0 si no existe. En el modelo clasico suma 2 solamente si es mayor de 2 cm.'
    })
  ],
  calculate(values) {
    const calculated = fagotti2006(values);
    if (!calculated.valid) return gyneValidationResult(calculated);
    return result({
      title: `Fagotti PIV: ${calculated.score} / 14`,
      detail: calculated.legacyThresholdMet
        ? 'Alcanza el umbral historico PIV >=8.'
        : 'No alcanza el umbral historico PIV >=8.',
      badge: calculated.legacyThresholdMet ? 'PIV >=8' : 'PIV <8',
      score: 0,
      showScore: false,
      severity: calculated.legacyThresholdMet ? 'warn' : 'info',
      metrics: [
        { label: 'Puntaje', value: `${calculated.score} / 14` },
        { label: 'Parametros con 2 puntos', value: calculated.positiveFeatures.length },
        { label: 'Lesion hepatica', value: `${formatNumber(numberValue(values, 'fagotti_liver'))} cm` },
        { label: 'Umbral clasico', value: calculated.legacyThresholdMet ? 'alcanzado' : 'no alcanzado' }
      ],
      notes: calculated.notes
    });
  }
});

interface AgoValid {
  readonly valid: true;
  readonly applicable: boolean;
  readonly positive: boolean | null;
  readonly reasons: readonly string[];
  readonly components?: {
    readonly ecogZero: boolean;
    readonly ascitesBelow500Ml: boolean;
    readonly completeResectionInitialSurgery: boolean;
  };
  readonly context?: { readonly platinumFreeIntervalMonths: number };
  readonly notes: readonly string[];
}

type AgoResult = AgoValid | GyneInvalid;

function explicitYesNo(values: CalculatorValues, fieldId: string): boolean | null {
  const value = stringValue(values, fieldId);
  return value === 'yes' ? true : value === 'no' ? false : null;
}

function agoDesktopIII(values: CalculatorValues): AgoResult {
  const firstRelapse = explicitYesNo(values, 'ago_first_relapse');
  const rawInterval = values['ago_platinum_interval'];
  const platinumFreeIntervalMonths = numberValue(values, 'ago_platinum_interval');
  const missing: string[] = [];
  if (firstRelapse === null) missing.push('firstRelapse');
  if (rawInterval === '' || !Number.isFinite(platinumFreeIntervalMonths) || platinumFreeIntervalMonths < 0) {
    missing.push('platinumFreeIntervalMonths');
  }
  if (missing.length) return gyneInvalid(missing);
  if (!firstRelapse || platinumFreeIntervalMonths < 6) {
    const reasons: string[] = [];
    if (!firstRelapse) reasons.push('no corresponde a la primera recaida');
    if (platinumFreeIntervalMonths < 6) reasons.push('intervalo libre de platino <6 meses');
    return { valid: true, applicable: false, positive: null, reasons, notes: [] };
  }

  const ecogRaw = stringValue(values, 'ago_ecog');
  const ascitesRaw = values['ago_ascites'];
  const resection = explicitYesNo(values, 'ago_initial_resection');
  const ecog = numberValue(values, 'ago_ecog');
  const ascitesMl = numberValue(values, 'ago_ascites');
  if (!ecogRaw) missing.push('ecog');
  if (ascitesRaw === '') missing.push('ascitesMl');
  if (resection === null) missing.push('completeResectionInitialSurgery');
  if (missing.length) return gyneInvalid(missing);
  const components = {
    ecogZero: ecog === 0,
    ascitesBelow500Ml: ascitesMl < 500,
    completeResectionInitialSurgery: resection === true
  };
  return {
    valid: true,
    applicable: true,
    positive: components.ecogZero
      && components.ascitesBelow500Ml
      && components.completeResectionInitialSurgery,
    reasons: [],
    components,
    context: { platinumFreeIntervalMonths },
    notes: [
      'Un AGO positivo identifica mayor probabilidad de reseccion completa; no garantiza resecabilidad ni beneficio individual.'
    ]
  };
}

export const GYNE_AGO_DESKTOP_CALCULATOR = defineCalculator({
  id: 'gyne-ago-desktop',
  title: 'Ovario recurrente — AGO / DESKTOP III',
  category: 'ginecologia',
  subtitle: 'Selección reproducible de la población del ensayo DESKTOP III.',
  source: 'AGO score - DESKTOP III',
  clinicalUse: 'Evalua el contexto de primera recaida con intervalo libre de platino de al menos seis meses y los tres componentes del AGO score.',
  fields: [
    section('ago_population_section', 'Poblacion de DESKTOP III',
      'Primero confirme primera recaida e intervalo libre de platino >=6 meses.'),
    selectField('ago_first_relapse', 'Es la primera recaida', GYNE_YES_NO_OPTIONS),
    numberField('ago_platinum_interval', 'Intervalo libre de platino (meses)', undefined, {
      min: 0, step: 0.1
    }),
    section('ago_score_section', 'Tres componentes del AGO score',
      'AGO positivo requiere simultaneamente ECOG 0, ascitis <500 ml y reseccion macroscópica completa inicial.'),
    selectField('ago_ecog', 'ECOG actual', [
      option('', 'No consignado'), option('0', 'ECOG 0'), option('1', 'ECOG 1'),
      option('2', 'ECOG 2'), option('3', 'ECOG 3'), option('4', 'ECOG 4')
    ], { required: false }),
    numberField('ago_ascites', 'Ascitis (ml)', undefined, { min: 0, step: 1, required: false }),
    selectField('ago_initial_resection', 'Reseccion macroscópica completa en cirugia inicial', [
      option('', 'No consignado'), ...GYNE_YES_NO_OPTIONS
    ], { required: false })
  ],
  calculate(values) {
    const calculated = agoDesktopIII(values);
    if (!calculated.valid) return gyneValidationResult(calculated);
    if (!calculated.applicable) {
      return result({
        title: 'Fuera de la poblacion DESKTOP III',
        detail: joinNatural(calculated.reasons),
        badge: 'AGO no aplicable',
        score: 0,
        showScore: false,
        severity: 'warn',
        metrics: [],
        notes: ['No se extrapola el AGO score fuera del contexto en que se valido.']
      });
    }
    const components = calculated.components!;
    const context = calculated.context!;
    return result({
      title: calculated.positive ? 'AGO score positivo' : 'AGO score negativo',
      detail: calculated.positive
        ? 'Se cumplen simultaneamente los tres componentes publicados.'
        : 'No se cumplen simultaneamente los tres componentes publicados.',
      badge: calculated.positive ? 'AGO positivo' : 'AGO negativo',
      score: 0,
      showScore: false,
      severity: calculated.positive ? 'info' : 'warn',
      metrics: [
        { label: 'ECOG 0', value: components.ecogZero ? 'si' : 'no' },
        { label: 'Ascitis <500 ml', value: components.ascitesBelow500Ml ? 'si' : 'no' },
        { label: 'Reseccion inicial completa', value: components.completeResectionInitialSurgery ? 'si' : 'no' },
        { label: 'Intervalo libre de platino', value: `${formatNumber(context.platinumFreeIntervalMonths)} meses` }
      ],
      notes: [
        ...calculated.notes,
        'El score no indica automaticamente cirugia ni sustituye imagenes, resecabilidad tecnica y evaluacion multidisciplinaria.'
      ]
    });
  }
});

interface ThoraxError {
  readonly field: string;
  readonly message: string;
}

interface ThoraxInvalid {
  readonly valid: false;
  readonly errors: readonly ThoraxError[];
  readonly warnings: readonly string[];
}

function thoraxInvalidOutput(label: string, calculated: ThoraxInvalid) {
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

function percent(value: number, digits = 1): string {
  return `${fixed(value, digits)}%`;
}

function logistic(value: number): number {
  if (value >= 0) {
    const expNegative = Math.exp(-value);
    return 1 / (1 + expNegative);
  }
  const expPositive = Math.exp(value);
  return expPositive / (1 + expPositive);
}

function isYes(values: CalculatorValues, fieldId: string): boolean {
  return stringValue(values, fieldId) === 'yes';
}

interface BrockValid {
  readonly valid: true;
  readonly probabilityPercent: number;
  readonly linearPredictor: number;
  readonly inputs: { readonly diameterMm: number; readonly noduleType: string };
  readonly warnings: readonly string[];
}

type BrockResult = BrockValid | ThoraxInvalid;

function brock(values: CalculatorValues): BrockResult {
  const ageYears = numberValue(values, 'brock_age');
  const diameterMm = numberValue(values, 'brock_diameter');
  const noduleCount = numberValue(values, 'brock_nodule_count');
  const noduleType = stringValue(values, 'brock_type');
  const errors: ThoraxError[] = [];
  if (!Number.isFinite(ageYears) || ageYears <= 0 || ageYears > 120) {
    errors.push({ field: 'ageYears', message: 'ageYears debe ser mayor que 0' });
  }
  if (!Number.isFinite(diameterMm) || diameterMm <= 0 || diameterMm > 30) {
    errors.push({ field: 'diameterMm', message: 'diameterMm debe ser mayor que 0' });
  }
  if (!Number.isFinite(noduleCount) || noduleCount < 1 || !Number.isInteger(noduleCount)) {
    errors.push({ field: 'noduleCount', message: 'noduleCount debe ser un numero entero' });
  }
  if (!['solid', 'part_solid', 'ground_glass'].includes(noduleType)) {
    errors.push({ field: 'noduleType', message: 'noduleType no es valido' });
  }
  if (errors.length) return { valid: false, errors, warnings: [] };
  const warnings = ageYears < 50 || ageYears > 75
    ? ['Edad fuera del rango 50-75 anos de la cohorte de desarrollo PanCan']
    : [];
  const typeCoefficient = noduleType === 'ground_glass' ? -0.1276
    : noduleType === 'part_solid' ? 0.377 : 0;
  const sizeTransform = Math.pow(diameterMm / 10, -0.5) - 1.58113883;
  const linearPredictor = -6.7892
    + 0.0287 * (ageYears - 62)
    + (stringValue(values, 'brock_sex') === 'female' ? 0.6011 : 0)
    + (isYes(values, 'brock_family_history') ? 0.2961 : 0)
    + (isYes(values, 'brock_emphysema') ? 0.2953 : 0)
    - 5.3854 * sizeTransform
    + typeCoefficient
    + (isYes(values, 'brock_upper_lobe') ? 0.6581 : 0)
    - 0.0824 * (noduleCount - 4)
    + (isYes(values, 'brock_spiculation') ? 0.7729 : 0);
  return {
    valid: true,
    probabilityPercent: logistic(linearPredictor) * 100,
    linearPredictor,
    inputs: { diameterMm, noduleType },
    warnings
  };
}

export const THORAX_BROCK_CALCULATOR = defineCalculator({
  id: 'thorax_brock',
  title: 'Brock / PanCan — nódulo pulmonar',
  category: 'pulmon',
  subtitle: 'Probabilidad de malignidad por datos clínicos y TC.',
  source: 'McWilliams et al., NEJM 2013 - modelo Brock completo',
  clinicalUse: 'Estima la probabilidad de malignidad de un nodulo pulmonar detectado por TC mediante la version completa de Brock/PanCan, incluida la espiculacion.',
  fields: [
    section('brock_patient_section', 'Paciente', 'Completar cada dato de forma explicita.'),
    numberField('brock_age', 'Edad (anos)', 62, { min: 18, max: 120, step: 1 }),
    selectField('brock_sex', 'Sexo', [option('male', 'Masculino'), option('female', 'Femenino')]),
    selectField('brock_family_history', 'Antecedente familiar de cancer pulmonar', THORAX_YES_NO_OPTIONS),
    selectField('brock_emphysema', 'Enfisema en TC', THORAX_YES_NO_OPTIONS),
    section('brock_nodule_section', 'Nodulo y TC', 'Diametro maximo y caracteristicas del estudio basal.'),
    numberField('brock_diameter', 'Diametro maximo (mm)', 8, { min: 0.1, max: 30, step: 0.1 }),
    selectField('brock_type', 'Tipo de nodulo', [
      option('solid', 'Solido'), option('part_solid', 'Parcialmente solido'),
      option('ground_glass', 'No solido / vidrio esmerilado')
    ]),
    selectField('brock_upper_lobe', 'Ubicacion en lobulo superior', THORAX_YES_NO_OPTIONS),
    numberField('brock_nodule_count', 'Numero total de nodulos', 1, { min: 1, step: 1 }),
    selectField('brock_spiculation', 'Espiculacion', THORAX_YES_NO_OPTIONS)
  ],
  calculate(values) {
    const calculated = brock(values);
    if (!calculated.valid) return thoraxInvalidOutput('Brock', calculated);
    return result({
      title: percent(calculated.probabilityPercent, 1),
      detail: 'Probabilidad modelada de malignidad para el nodulo evaluado.',
      badge: 'Brock completo',
      score: 0,
      showScore: false,
      severity: 'info',
      metrics: [
        { label: 'Probabilidad', value: percent(calculated.probabilityPercent, 2) },
        { label: 'Predictor lineal', value: fixed(calculated.linearPredictor, 4) },
        { label: 'Diametro', value: `${fixed(calculated.inputs.diameterMm, 1)} mm` },
        { label: 'Tipo', value: calculated.inputs.noduleType.replace(/_/g, ' ') }
      ],
      notes: [
        'Modelo de screening: su calibracion puede cambiar en nodulos incidentales o poblaciones con otra prevalencia.',
        'La probabilidad no equivale a confirmacion histologica ni compara alternativas de manejo.',
        ...calculated.warnings
      ]
    });
  }
});

interface MayoHerderValid {
  readonly valid: true;
  readonly mayo: { readonly probabilityPercent: number };
  readonly herder: { readonly probabilityPercent: number; readonly petCoefficient: number };
  readonly inputs: { readonly petUptake: string };
  readonly warnings: readonly string[];
}

type MayoHerderResult = MayoHerderValid | ThoraxInvalid;

function mayoHerder(values: CalculatorValues): MayoHerderResult {
  const ageYears = numberValue(values, 'herder_age');
  const diameterMm = numberValue(values, 'herder_diameter');
  const petUptake = stringValue(values, 'herder_pet');
  const errors: ThoraxError[] = [];
  if (!Number.isFinite(ageYears) || ageYears <= 0 || ageYears > 120) {
    errors.push({ field: 'ageYears', message: 'ageYears debe ser mayor que 0' });
  }
  if (!Number.isFinite(diameterMm) || diameterMm < 4 || diameterMm > 30) {
    errors.push({ field: 'diameterMm', message: 'diameterMm debe estar entre 4 y 30' });
  }
  if (!['absent', 'faint', 'moderate', 'intense'].includes(petUptake)) {
    errors.push({ field: 'petUptake', message: 'petUptake no es valido' });
  }
  if (errors.length) return { valid: false, errors, warnings: [] };
  const warnings = diameterMm <= 10
    ? ['La sensibilidad de PET-FDG puede ser menor en nodulos de 10 mm o menos']
    : [];
  const mayoLinearPredictor = -6.8272
    + 0.0391 * ageYears
    + (isYes(values, 'herder_smoker') ? 0.7917 : 0)
    + (isYes(values, 'herder_prior_cancer') ? 1.3388 : 0)
    + 0.1274 * diameterMm
    + (isYes(values, 'herder_spiculation') ? 1.0407 : 0)
    + (isYes(values, 'herder_upper_lobe') ? 0.7838 : 0);
  const mayoProbability = logistic(mayoLinearPredictor);
  const petCoefficient = petUptake === 'faint' ? 2.322
    : petUptake === 'moderate' ? 4.617
      : petUptake === 'intense' ? 4.771 : 0;
  const herderProbability = logistic(-4.739 + 3.691 * mayoProbability + petCoefficient);
  return {
    valid: true,
    mayo: { probabilityPercent: mayoProbability * 100 },
    herder: { probabilityPercent: herderProbability * 100, petCoefficient },
    inputs: { petUptake },
    warnings
  };
}

export const THORAX_MAYO_HERDER_CALCULATOR = defineCalculator({
  id: 'thorax_mayo_herder',
  title: 'Mayo-Herder con PET-FDG',
  category: 'pulmon',
  subtitle: 'Probabilidad pretest Mayo refinada por captación PET.',
  source: 'Swensen 1997; Herder et al., Chest 2005',
  clinicalUse: 'Calcula primero la probabilidad Mayo de un nodulo pulmonar solitario y luego la actualiza con la categoria ordinal de captacion de FDG del modelo Herder.',
  fields: [
    section('herder_patient_section', 'Paciente y antecedentes'),
    numberField('herder_age', 'Edad (anos)', 65, { min: 18, max: 120, step: 1 }),
    selectField('herder_smoker', 'Fumador actual o previo', THORAX_YES_NO_OPTIONS),
    selectField('herder_prior_cancer', 'Cancer extratoracico diagnosticado hace mas de 5 anos', THORAX_YES_NO_OPTIONS),
    section('herder_nodule_section', 'Nodulo y PET-FDG'),
    numberField('herder_diameter', 'Diametro maximo (mm)', 12, { min: 4, max: 30, step: 0.1 }),
    selectField('herder_spiculation', 'Espiculacion', THORAX_YES_NO_OPTIONS),
    selectField('herder_upper_lobe', 'Ubicacion en lobulo superior', THORAX_YES_NO_OPTIONS),
    selectField('herder_pet', 'Captacion FDG', [
      option('absent', 'Ausente - indistinguible del pulmon de fondo'),
      option('faint', 'Tenue - menor o igual al pool mediastinal'),
      option('moderate', 'Moderada - mayor al pool mediastinal'),
      option('intense', 'Intensa - marcadamente mayor al pool mediastinal')
    ], { wide: true })
  ],
  calculate(values) {
    const calculated = mayoHerder(values);
    if (!calculated.valid) return thoraxInvalidOutput('Mayo-Herder', calculated);
    return result({
      title: percent(calculated.herder.probabilityPercent, 1),
      detail: 'Probabilidad Herder posterior a incorporar la categoria visual de PET-FDG.',
      badge: 'Mayo-Herder',
      score: 0,
      showScore: false,
      severity: 'info',
      metrics: [
        { label: 'Mayo pretest', value: percent(calculated.mayo.probabilityPercent, 2) },
        { label: 'Herder con PET', value: percent(calculated.herder.probabilityPercent, 2) },
        { label: 'Captacion', value: calculated.inputs.petUptake },
        { label: 'Coeficiente PET', value: fixed(calculated.herder.petCoefficient, 3) }
      ],
      notes: [
        'Herder utiliza la probabilidad Mayo como decimal entre 0 y 1, no como porcentaje.',
        'La escala PET es visual; procesos inflamatorios y granulomatosos pueden alterar la especificidad.',
        'Resultado probabilistico, no diagnostico ni recomendacion de tratamiento.',
        ...calculated.warnings
      ]
    });
  }
});

export const LEGACY_CALCULATORS_44_47 = [
  GYNE_FAGOTTI_CALCULATOR,
  GYNE_AGO_DESKTOP_CALCULATOR,
  THORAX_BROCK_CALCULATOR,
  THORAX_MAYO_HERDER_CALCULATOR
] as const;
