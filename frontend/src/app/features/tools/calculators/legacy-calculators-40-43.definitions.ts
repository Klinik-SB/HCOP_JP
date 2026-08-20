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

const YES_NO_OPTIONS = [option('yes', 'Si'), option('no', 'No')];
const NODE_OPTIONS = [
  option('negative', 'Negativos'),
  option('isolated_tumor_cells', 'Solo celulas tumorales aisladas'),
  option('micrometastasis', 'Micrometastasis'),
  option('macrometastasis', 'Macrometastasis')
];
const MARGIN_OPTIONS = [option('negative', 'Negativos'), option('positive', 'Positivos')];

const FIELD_LABELS: Readonly<Record<string, string>> = {
  pelvicNodeStatus: 'estado de ganglios pelvicos',
  surgicalMarginStatus: 'estado de margenes quirurgicos',
  parametrialInvasion: 'invasion parametrial',
  lvsi: 'invasion linfovascular (LVSI)',
  stromalInvasion: 'tercio de invasion estromal',
  tumorSizeCm: 'tamano tumoral',
  poleStatus: 'estado POLE',
  mmrStatus: 'estado MMR',
  p53Status: 'patron p53',
  grade: 'grado histologico',
  erPercent: 'receptor de estrogeno',
  ca125: 'CA 125',
  menopausalStatus: 'estado menopausico'
};

function readableField(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/([A-Z])/g, ' $1').toLowerCase();
}

function joinNatural(values: readonly string[]): string {
  const items = values.filter(Boolean);
  if (!items.length) return 'ninguno';
  if (items.length === 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return 'no consignado';
  return value.toLocaleString('es-AR', { maximumFractionDigits: digits });
}

interface GyneInvalid {
  readonly valid: false;
  readonly missing: readonly string[];
  readonly errors: readonly string[];
}

function invalid(missing: readonly string[] = [], errors: readonly string[] = []): GyneInvalid {
  return { valid: false, missing, errors };
}

function validationResult(calculated: GyneInvalid, extraNotes: readonly string[] = []) {
  const missing = calculated.missing.map(readableField);
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
    notes: [
      'Los campos ausentes no se interpretan automaticamente como hallazgos negativos.',
      ...extraNotes
    ]
  });
}

type NodeStatus = 'negative' | 'isolated_tumor_cells' | 'micrometastasis' | 'macrometastasis';
type MarginStatus = 'negative' | 'positive';
type StromalThird = 'superficial' | 'middle' | 'deep';

function yesNo(values: CalculatorValues, fieldId: string): boolean | null {
  const value = values[fieldId];
  if (value === true || value === 'yes') return true;
  if (value === false || value === 'no') return false;
  return null;
}

function validNode(value: string): value is NodeStatus {
  return ['negative', 'isolated_tumor_cells', 'micrometastasis', 'macrometastasis'].includes(value);
}

function validMargin(value: string): value is MarginStatus {
  return ['negative', 'positive'].includes(value);
}

interface SedlisCriterion {
  readonly id: string;
  readonly label: string;
}

interface SedlisValid {
  readonly valid: true;
  readonly applicable: boolean;
  readonly met: boolean | null;
  readonly exclusionReasons: readonly string[];
  readonly matchedCriteria: readonly SedlisCriterion[];
  readonly notes: readonly string[];
}

type SedlisResult = SedlisValid | GyneInvalid;

function sedlis(values: CalculatorValues): SedlisResult {
  const node = stringValue(values, 'sedlis_node_status');
  const margin = stringValue(values, 'sedlis_margin_status');
  const parametrium = yesNo(values, 'sedlis_parametrium');
  const missing: string[] = [];
  if (!validNode(node)) missing.push('pelvicNodeStatus');
  if (!validMargin(margin)) missing.push('surgicalMarginStatus');
  if (parametrium === null) missing.push('parametrialInvasion');
  if (missing.length) return invalid(missing);

  const exclusionReasons: string[] = [];
  if (node === 'micrometastasis' || node === 'macrometastasis') {
    exclusionReasons.push('metastasis ganglionar pelvica');
  }
  if (margin === 'positive') exclusionReasons.push('margen quirurgico positivo');
  if (parametrium) exclusionReasons.push('invasion parametrial');
  if (node === 'isolated_tumor_cells') {
    return {
      valid: true,
      applicable: false,
      met: null,
      exclusionReasons: ['celulas tumorales aisladas: significado adyuvante incierto'],
      matchedCriteria: [],
      notes: []
    };
  }
  if (exclusionReasons.length) {
    return {
      valid: true,
      applicable: false,
      met: null,
      exclusionReasons,
      matchedCriteria: [],
      notes: []
    };
  }

  const lvsi = yesNo(values, 'sedlis_lvsi');
  const stromal = stringValue(values, 'sedlis_stromal');
  const rawSize = values['sedlis_size'];
  const size = numberValue(values, 'sedlis_size');
  if (lvsi === null) missing.push('lvsi');
  if (!['superficial', 'middle', 'deep'].includes(stromal)) missing.push('stromalInvasion');
  if (rawSize === '' || !Number.isFinite(size) || size <= 0) missing.push('tumorSizeCm');
  if (missing.length) return invalid(missing);

  const matchedCriteria: SedlisCriterion[] = [];
  if (lvsi && stromal === 'deep') {
    matchedCriteria.push({
      id: 'lvsi_deep_any_size',
      label: 'LVSI positivo, tercio profundo, cualquier tamano'
    });
  }
  if (lvsi && stromal === 'middle' && size >= 2) {
    matchedCriteria.push({
      id: 'lvsi_middle_ge_2cm',
      label: 'LVSI positivo, tercio medio, tumor >=2 cm'
    });
  }
  if (lvsi && stromal === 'superficial' && size >= 5) {
    matchedCriteria.push({
      id: 'lvsi_superficial_ge_5cm',
      label: 'LVSI positivo, tercio superficial, tumor >=5 cm'
    });
  }
  if (!lvsi && (stromal === 'middle' || stromal === 'deep') && size >= 4) {
    matchedCriteria.push({
      id: 'no_lvsi_middle_or_deep_ge_4cm',
      label: 'LVSI negativo, tercio medio o profundo, tumor >=4 cm'
    });
  }
  const notes = [
    'La regla evalua combinaciones exactas; no cuenta simplemente dos de tres factores.',
    'El tamano de la tabla original fue determinado por palpacion clinica.'
  ];
  const sizeMethod = stringValue(values, 'sedlis_size_method');
  if (sizeMethod && sizeMethod !== 'clinical_palpation') {
    notes.push('El metodo de medicion informado no es la palpacion clinica del modelo original.');
  }
  return {
    valid: true,
    applicable: true,
    met: matchedCriteria.length > 0,
    exclusionReasons: [],
    matchedCriteria,
    notes
  };
}

export const GYNE_SEDLIS_CALCULATOR = defineCalculator({
  id: 'gyne-sedlis',
  title: 'Cuello uterino — criterios de Sedlis',
  category: 'ginecologia',
  subtitle: 'Combinaciones de riesgo intermedio luego de cirugía radical.',
  source: 'GOG-92 / Sedlis - tabla vigente 2025',
  clinicalUse: 'Reproduce las cuatro combinaciones publicadas de LVSI, profundidad estromal y tamano tumoral. Solo corresponde con ganglios, margenes y parametrios negativos.',
  fields: [
    section('sedlis_context_section', 'Primero confirme el contexto posoperatorio',
      'La presencia de una caracteristica de alto riesgo hace que Sedlis no sea la regla aplicable.'),
    selectField('sedlis_node_status', 'Ganglios pelvicos', NODE_OPTIONS, {
      help: 'Las micrometastasis y macrometastasis son caracteristicas de alto riesgo.'
    }),
    selectField('sedlis_margin_status', 'Margenes quirurgicos', MARGIN_OPTIONS),
    selectField('sedlis_parametrium', 'Invasion parametrial', YES_NO_OPTIONS),
    section('sedlis_rule_section', 'Variables de la tabla de Sedlis',
      'Complete estas variables cuando ganglios y margenes sean negativos y no exista invasion parametrial.'),
    selectField('sedlis_lvsi', 'LVSI', YES_NO_OPTIONS, { required: false }),
    selectField('sedlis_stromal', 'Profundidad de invasion estromal', [
      option('superficial', 'Tercio superficial'),
      option('middle', 'Tercio medio'),
      option('deep', 'Tercio profundo')
    ], { required: false }),
    numberField('sedlis_size', 'Tamano tumoral (cm)', undefined, {
      min: 0.01,
      step: 0.01,
      required: false,
      help: 'La tabla original utilizo el tamano determinado por palpacion clinica.'
    }),
    selectField('sedlis_size_method', 'Metodo de medicion del tamano', [
      option('', 'No consignado'),
      option('clinical_palpation', 'Palpacion clinica'),
      option('pathology', 'Anatomia patologica'),
      option('imaging', 'Imagenes')
    ], { required: false })
  ],
  calculate(values) {
    const calculated = sedlis(values);
    if (!calculated.valid) return validationResult(calculated);
    if (!calculated.applicable) {
      return result({
        title: 'Sedlis no es aplicable en este contexto',
        detail: joinNatural(calculated.exclusionReasons),
        badge: 'fuera de la poblacion Sedlis',
        score: 0,
        showScore: false,
        severity: 'warn',
        metrics: [],
        notes: [
          'La salida solo delimita la aplicabilidad de esta regla historica.',
          'Las celulas tumorales aisladas conservan significado adyuvante incierto y no se fuerzan a una categoria negativa.'
        ]
      });
    }
    return result({
      title: calculated.met ? 'Cumple criterios de Sedlis' : 'No cumple criterios de Sedlis',
      detail: calculated.met
        ? joinNatural(calculated.matchedCriteria.map((item) => item.label))
        : 'No coincide con ninguna de las cuatro combinaciones exactas publicadas.',
      badge: calculated.met ? 'Sedlis positivo' : 'Sedlis negativo',
      score: 0,
      showScore: false,
      severity: calculated.met ? 'warn' : 'info',
      metrics: [
        { label: 'LVSI', value: stringValue(values, 'sedlis_lvsi') === 'yes' ? 'positivo' : 'negativo' },
        { label: 'Invasion estromal', value: stringValue(values, 'sedlis_stromal') },
        { label: 'Tamano', value: `${formatNumber(numberValue(values, 'sedlis_size'))} cm` }
      ],
      notes: [
        ...calculated.notes,
        'Es una clasificacion de riesgo; no constituye por si sola una indicacion terapeutica.'
      ]
    });
  }
});

interface PetersFeature {
  readonly id: string;
  readonly label: string;
}

interface PetersValid {
  readonly valid: true;
  readonly met: boolean | null;
  readonly positiveFeatures: readonly PetersFeature[];
  readonly nodalUncertainty: boolean;
}

type PetersResult = PetersValid | GyneInvalid;

function peters(values: CalculatorValues): PetersResult {
  const node = stringValue(values, 'peters_node_status');
  const margin = stringValue(values, 'peters_margin_status');
  const parametrium = yesNo(values, 'peters_parametrium');
  const missing: string[] = [];
  if (!validNode(node)) missing.push('pelvicNodeStatus');
  if (!validMargin(margin)) missing.push('surgicalMarginStatus');
  if (parametrium === null) missing.push('parametrialInvasion');
  if (missing.length) return invalid(missing);

  const positiveFeatures: PetersFeature[] = [];
  if (node === 'micrometastasis' || node === 'macrometastasis') {
    positiveFeatures.push({ id: 'positive_pelvic_nodes', label: 'Ganglio pelvico metastasico' });
  }
  if (margin === 'positive') {
    positiveFeatures.push({ id: 'positive_margin', label: 'Margen quirurgico positivo' });
  }
  if (parametrium) {
    positiveFeatures.push({ id: 'parametrial_invasion', label: 'Invasion parametrial' });
  }
  if (positiveFeatures.length) {
    return {
      valid: true,
      met: true,
      positiveFeatures,
      nodalUncertainty: node === 'isolated_tumor_cells'
    };
  }
  if (node === 'isolated_tumor_cells') {
    return { valid: true, met: null, positiveFeatures: [], nodalUncertainty: true };
  }
  return { valid: true, met: false, positiveFeatures: [], nodalUncertainty: false };
}

export const GYNE_PETERS_CALCULATOR = defineCalculator({
  id: 'gyne-peters',
  title: 'Cuello uterino — criterios de Peters',
  category: 'ginecologia',
  subtitle: 'Características de alto riesgo en la anatomía patológica posoperatoria.',
  source: 'GOG-109 / Peters - ESGO 2023',
  clinicalUse: 'Identifica la presencia de ganglios pelvicos metastasicos, margenes positivos o invasion parametrial luego de cirugia radical.',
  fields: [
    section('peters_section', 'Anatomia patologica definitiva',
      'Seleccione el estado observado; no se asumen resultados negativos por omision.'),
    selectField('peters_node_status', 'Ganglios pelvicos', NODE_OPTIONS),
    selectField('peters_margin_status', 'Margenes quirurgicos', MARGIN_OPTIONS),
    selectField('peters_parametrium', 'Invasion parametrial', YES_NO_OPTIONS)
  ],
  calculate(values) {
    const calculated = peters(values);
    if (!calculated.valid) return validationResult(calculated);
    if (calculated.met === null) {
      return result({
        title: 'Resultado indeterminado por celulas tumorales aisladas',
        detail: 'No hay otra caracteristica Peters positiva, pero las celulas tumorales aisladas no deben tratarse como ganglios completamente negativos.',
        badge: 'incertidumbre nodal',
        score: 0,
        showScore: false,
        severity: 'warn',
        metrics: [{ label: 'Ganglios', value: 'ITC solamente' }],
        notes: ['La salida no asigna una conducta terapeutica automatica.']
      });
    }
    return result({
      title: calculated.met ? 'Cumple criterios de Peters' : 'No cumple criterios de Peters',
      detail: calculated.met
        ? joinNatural(calculated.positiveFeatures.map((item) => item.label))
        : 'No se identificaron ganglios pelvicos metastasicos, margenes positivos ni invasion parametrial.',
      badge: calculated.met ? 'Peters positivo' : 'Peters negativo',
      score: 0,
      showScore: false,
      severity: calculated.met ? 'warn' : 'info',
      metrics: [
        { label: 'Ganglios', value: stringValue(values, 'peters_node_status') },
        { label: 'Margenes', value: stringValue(values, 'peters_margin_status') },
        { label: 'Parametrio', value: stringValue(values, 'peters_parametrium') === 'yes' ? 'invadido' : 'sin invasion' }
      ],
      notes: [
        calculated.nodalUncertainty
          ? 'Hay incertidumbre adicional por celulas tumorales aisladas.'
          : 'La clasificacion se obtuvo con los tres datos requeridos.',
        'El resultado describe riesgo patologico y no prescribe un esquema adyuvante.'
      ]
    });
  }
});

interface NsmpRefinement {
  readonly applicable: boolean;
  readonly valid: boolean;
  readonly subgroup: 'nsmp_low_grade_er_positive' | 'nsmp_high_grade_or_er_negative' | null;
  readonly missing: readonly string[];
}

interface PromiseValid {
  readonly valid: true;
  readonly molecularClass: 'POLEmut' | 'MMRd' | 'p53abn' | 'NSMP';
  readonly detectedFeatures: readonly string[];
  readonly multipleClassifier: boolean;
  readonly nsmpRefinement: NsmpRefinement;
  readonly warnings: readonly string[];
}

type PromiseResult = PromiseValid | GyneInvalid;

function promiseEsgo2025(values: CalculatorValues): PromiseResult {
  const pole = stringValue(values, 'promise_pole');
  const mmr = stringValue(values, 'promise_mmr');
  const p53 = stringValue(values, 'promise_p53');
  const missing: string[] = [];
  if (!['pathogenic', 'non_pathogenic', 'vus'].includes(pole)) missing.push('poleStatus');
  if (!['deficient', 'proficient'].includes(mmr)) missing.push('mmrStatus');
  if (!['abnormal', 'wild_type'].includes(p53)) missing.push('p53Status');
  if (missing.length) return invalid(missing);

  const detectedFeatures: string[] = [];
  if (pole === 'pathogenic') detectedFeatures.push('POLEmut');
  if (mmr === 'deficient') detectedFeatures.push('MMRd');
  if (p53 === 'abnormal') detectedFeatures.push('p53abn');
  const molecularClass = pole === 'pathogenic'
    ? 'POLEmut'
    : mmr === 'deficient'
      ? 'MMRd'
      : p53 === 'abnormal'
        ? 'p53abn'
        : 'NSMP';
  const warnings = pole === 'vus'
    ? ['Una variante POLE de significado incierto no se clasifica como POLEmut.']
    : [];
  let nsmpRefinement: NsmpRefinement = {
    applicable: false,
    valid: true,
    subgroup: null,
    missing: []
  };
  if (molecularClass === 'NSMP') {
    const grade = stringValue(values, 'promise_grade');
    const rawEr = values['promise_er'];
    const er = numberValue(values, 'promise_er');
    const refinementMissing: string[] = [];
    if (!['low', 'high'].includes(grade)) refinementMissing.push('grade');
    if (rawEr === '' || !Number.isFinite(er)) refinementMissing.push('erPercent');
    const refinementValid = refinementMissing.length === 0;
    nsmpRefinement = {
      applicable: true,
      valid: refinementValid,
      subgroup: refinementValid
        ? grade === 'low' && er >= 10
          ? 'nsmp_low_grade_er_positive'
          : 'nsmp_high_grade_or_er_negative'
        : null,
      missing: refinementMissing
    };
  }
  return {
    valid: true,
    molecularClass,
    detectedFeatures,
    multipleClassifier: detectedFeatures.length > 1,
    nsmpRefinement,
    warnings
  };
}

export const GYNE_PROMISE_CALCULATOR = defineCalculator({
  id: 'gyne-promise',
  title: 'Endometrio — ProMisE / ESGO 2025',
  category: 'ginecologia',
  subtitle: 'Clasificación molecular TCGA subrogada y refinamiento NSMP.',
  source: 'ProMisE - ESGO/ESTRO/ESP 2025',
  clinicalUse: 'Integra POLE, MMR y p53 con la jerarquia actual. Para tumores NSMP puede agregar el refinamiento por grado y receptor de estrogeno.',
  fields: [
    section('promise_core_section', 'Clasificadores moleculares obligatorios',
      'Use la interpretacion validada del informe molecular o inmunohistoquimico; no infiera p53 desde un porcentaje aislado.'),
    selectField('promise_pole', 'POLE - dominio exonucleasa', [
      option('pathogenic', 'Mutacion patogenica'),
      option('non_pathogenic', 'Sin mutacion patogenica'),
      option('vus', 'Variante de significado incierto (VUS)')
    ]),
    selectField('promise_mmr', 'MMR', [
      option('deficient', 'Deficiente (MMRd)'),
      option('proficient', 'Competente (MMRp)')
    ]),
    selectField('promise_p53', 'p53 / TP53', [
      option('abnormal', 'Anormal / mutante'),
      option('wild_type', 'Patron wild type')
    ]),
    section('promise_nsmp_section', 'Refinamiento ESGO 2025 para NSMP',
      'Opcional para obtener la clase molecular; necesario para subdividir NSMP.'),
    selectField('promise_grade', 'Grado histologico', [
      option('', 'No consignado'),
      option('low', 'Bajo grado'),
      option('high', 'Alto grado')
    ], { required: false }),
    numberField('promise_er', 'Receptor de estrogeno (%)', undefined, {
      min: 0,
      max: 100,
      step: 0.1,
      required: false,
      help: 'ESGO 2025 propone 10% como punto de corte para el refinamiento NSMP.'
    })
  ],
  calculate(values) {
    const calculated = promiseEsgo2025(values);
    if (!calculated.valid) return validationResult(calculated);
    const refinement = calculated.nsmpRefinement;
    const refinementLabel = !refinement.applicable
      ? 'No corresponde'
      : !refinement.valid
        ? 'Pendiente'
        : refinement.subgroup === 'nsmp_low_grade_er_positive'
          ? 'NSMP bajo grado y ER positivo'
          : 'NSMP alto grado o ER negativo';
    const refinementNotes = refinement.applicable && !refinement.valid
      ? [`Para completar el refinamiento NSMP falta: ${refinement.missing.map(readableField).join(', ')}.`]
      : [];
    return result({
      title: `Clase molecular: ${calculated.molecularClass}`,
      detail: calculated.multipleClassifier
        ? `Clasificador multiple resuelto por jerarquia: ${calculated.detectedFeatures.join(' + ')}.`
        : 'Clasificacion obtenida mediante la jerarquia POLEmut, MMRd, p53abn y NSMP.',
      badge: calculated.molecularClass,
      score: 0,
      showScore: false,
      severity: 'info',
      metrics: [
        { label: 'Clase', value: calculated.molecularClass },
        { label: 'Rasgos detectados', value: calculated.detectedFeatures.join(' + ') || 'ninguno de los tres' },
        { label: 'Clasificador multiple', value: calculated.multipleClassifier ? 'si' : 'no' },
        { label: 'Refinamiento NSMP', value: refinementLabel }
      ],
      notes: [
        ...calculated.warnings,
        ...refinementNotes,
        'La clase molecular no reemplaza el estadio FIGO ni define por si sola un tratamiento.'
      ]
    });
  }
});

interface RmiValid {
  readonly valid: true;
  readonly score: number;
  readonly ultrasoundFeatureCount: number;
  readonly ultrasoundMultiplier: 0 | 1 | 3;
  readonly menopausalMultiplier: 1 | 3;
  readonly thresholds: {
    readonly nice: { readonly value: 250; readonly met: boolean };
    readonly historical: { readonly value: 200; readonly met: boolean };
  };
}

type RmiResult = RmiValid | GyneInvalid;

function rmiI(values: CalculatorValues): RmiResult {
  const ca125 = numberValue(values, 'rmi_ca125');
  const menopause = stringValue(values, 'rmi_menopause');
  const missing: string[] = [];
  if (!Number.isFinite(ca125) || ca125 < 0) missing.push('ca125');
  if (!['premenopausal', 'postmenopausal'].includes(menopause)) missing.push('menopausalStatus');
  if (missing.length) return invalid(missing);
  const ultrasoundFields = [
    'rmi_multilocular', 'rmi_solid', 'rmi_metastases', 'rmi_ascites', 'rmi_bilateral'
  ];
  const ultrasoundFeatureCount = ultrasoundFields.reduce((total, fieldId) =>
    total + (booleanValue(values, fieldId) ? 1 : 0), 0);
  const ultrasoundMultiplier = ultrasoundFeatureCount === 0 ? 0 : ultrasoundFeatureCount === 1 ? 1 : 3;
  const menopausalMultiplier = menopause === 'postmenopausal' ? 3 : 1;
  const score = ultrasoundMultiplier * menopausalMultiplier * ca125;
  return {
    valid: true,
    score,
    ultrasoundFeatureCount,
    ultrasoundMultiplier,
    menopausalMultiplier,
    thresholds: {
      nice: { value: 250, met: score >= 250 },
      historical: { value: 200, met: score >= 200 }
    }
  };
}

export const GYNE_RMI_I_CALCULATOR = defineCalculator({
  id: 'gyne-rmi-i',
  title: 'Masa anexial — RMI I',
  category: 'ginecologia',
  subtitle: 'CA 125, menopausia y cinco hallazgos ecográficos.',
  source: 'Jacobs RMI I - NICE CG122 actualizado 2026',
  clinicalUse: 'Calcula el Risk of Malignancy Index I para triage preoperatorio de una masa anexial. Muestra por separado el umbral NICE 250 y el umbral historico 200.',
  fields: [
    numberField('rmi_ca125', 'CA 125 (IU/ml)', undefined, { min: 0, step: 0.1 }),
    selectField('rmi_menopause', 'Estado menopausico', [
      option('premenopausal', 'Premenopausia'),
      option('postmenopausal', 'Posmenopausia')
    ], { help: 'NICE: mas de un ano sin menstruacion o mayor de 50 anos luego de histerectomia.' }),
    section('rmi_ultrasound_section', 'Ecografia - marque cada hallazgo presente',
      'Una casilla sin marcar se registra como hallazgo ausente. U=0 sin hallazgos, U=1 con uno y U=3 con dos o mas.'),
    checkbox('rmi_multilocular', 'Quiste multilocular'),
    checkbox('rmi_solid', 'Areas solidas'),
    checkbox('rmi_metastases', 'Metastasis'),
    checkbox('rmi_ascites', 'Ascitis'),
    checkbox('rmi_bilateral', 'Lesiones bilaterales')
  ],
  calculate(values) {
    const calculated = rmiI(values);
    if (!calculated.valid) return validationResult(calculated);
    const ca125 = numberValue(values, 'rmi_ca125');
    return result({
      title: `RMI I: ${formatNumber(calculated.score)}`,
      detail: `U ${calculated.ultrasoundMultiplier} x M ${calculated.menopausalMultiplier} x CA 125 ${formatNumber(ca125)}.`,
      badge: calculated.thresholds.nice.met
        ? 'en o sobre umbral NICE 250'
        : 'debajo de umbral NICE 250',
      score: 0,
      showScore: false,
      severity: calculated.thresholds.nice.met ? 'warn' : 'info',
      metrics: [
        { label: 'RMI I', value: formatNumber(calculated.score) },
        { label: 'Hallazgos ecograficos', value: calculated.ultrasoundFeatureCount },
        { label: 'Umbral NICE 250', value: calculated.thresholds.nice.met ? 'alcanzado' : 'no alcanzado' },
        { label: 'Umbral historico 200', value: calculated.thresholds.historical.met ? 'alcanzado' : 'no alcanzado' }
      ],
      notes: [
        'El umbral vigente mostrado es el de NICE; otros sistemas pueden utilizar un punto de corte distinto.',
        'RMI I es una herramienta de triage preoperatorio y no confirma ni excluye malignidad.'
      ]
    });
  }
});

export const LEGACY_CALCULATORS_40_43 = [
  GYNE_SEDLIS_CALCULATOR,
  GYNE_PETERS_CALCULATOR,
  GYNE_PROMISE_CALCULATOR,
  GYNE_RMI_I_CALCULATOR
] as const;
