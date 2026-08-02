import {
  booleanValue,
  defineCalculator,
  numberValue,
  result,
  stringValue
} from './calculator.engine';
import {
  CalculatorField,
  CalculatorMetric,
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
  options: Pick<FieldOptions, 'help' | 'scenario'> = {}
): CalculatorField {
  return {
    id,
    kind: 'checkbox',
    label,
    required: false,
    initialValue: false,
    help: options.help,
    scenario: options.scenario
  };
}

function section(
  id: string,
  label: string,
  help: string,
  scenario?: string
): CalculatorField {
  return {
    id,
    kind: 'section',
    label,
    required: false,
    initialValue: '',
    wide: true,
    help,
    scenario
  };
}

export const NMIBC_CALCULATOR = defineCalculator({
  id: 'nmibc',
  title: 'NMIBC EAU / EORTC / CUETO',
  category: 'vejiga',
  subtitle: 'Recurrencia, progresión y grupo práctico.',
  source: 'EORTC, CUETO, EAU NMIBC',
  clinicalUse: 'Estratifica recurrencia y progresión en cáncer de vejiga no músculo invasivo. Orienta intensidad de resección, instilaciones, BCG, vigilancia y discusión de cistectomía temprana en escenarios de muy alto riesgo.',
  fields: [
    selectField('scenario', 'Modelo', 'eau', [
      option('eau', 'EAU 2021/2026 — grupo de progresión'),
      option('eortc', 'EORTC 2006 — sin BCG contemporáneo'),
      option('cueto', 'CUETO 2009 — tratados con BCG')
    ], {
      initialValue: 'eau',
      wide: true,
      required: false,
      help: 'Cada modelo usa su propia población y no se combinan resultados.'
    }),
    section(
      'eau_nmibc',
      'EAU — datos obligatorios',
      'Modelo actual para agrupar progresión; los factores especiales llevan a muy alto riesgo sin aplicar probabilidades de la tabla.',
      'eau'
    ),
    selectField('eauPrimary', 'Presentación', 'yes', [
      option('yes', 'Primario'), option('no', 'Recurrente')
    ], { scenario: 'eau' }),
    numberField('eauAge', 'Edad', 70, { min: 18, max: 110, scenario: 'eau' }),
    numberField('eauCount', 'Número de tumores', 1, { min: 1, scenario: 'eau' }),
    numberField('eauSize', 'Diámetro máximo (cm)', 2, { min: 0, step: 0.1, scenario: 'eau' }),
    selectField('eauStage', 'Estadio', 'ta', [option('ta', 'Ta'), option('t1', 'T1')], {
      scenario: 'eau'
    }),
    checkbox('eauCis', 'CIS concomitante', { scenario: 'eau' }),
    checkbox('eauPureCis', 'CIS puro primario', {
      scenario: 'eau',
      help: 'Se clasifica como alto riesgo, pero queda fuera de las probabilidades de la tabla.'
    }),
    selectField('eauSystem', 'Sistema de grado', 'who2004', [
      option('who2004', 'WHO 2004/2022'), option('who1973', 'WHO 1973')
    ], { scenario: 'eau' }),
    selectField('eauGrade', 'Grado', 'low', [
      option('low', 'Low grade (WHO 2004/2022)'),
      option('high', 'High grade (WHO 2004/2022)'),
      option('g1', 'G1 (WHO 1973)'),
      option('g2', 'G2 (WHO 1973)'),
      option('g3', 'G3 (WHO 1973)')
    ], { scenario: 'eau' }),
    checkbox('eauLvi', 'Invasión linfovascular', { scenario: 'eau' }),
    checkbox('eauProstaticCis', 'CIS en uretra prostática', { scenario: 'eau' }),
    checkbox('eauVariant', 'Subtipo histológico agresivo', { scenario: 'eau' }),
    section(
      'eortc_nmibc',
      'EORTC 2006',
      'Usa grado WHO 1973; cohorte histórica con uso limitado de BCG.',
      'eortc'
    ),
    selectField('number', 'Número de tumores', '0', [
      option('0', 'Único'), option('3', '2-7'), option('6', '≥8')
    ], { scenario: 'eortc' }),
    selectField('size', 'Tamaño', '0', [option('0', '<3 cm'), option('3', '≥3 cm')], {
      scenario: 'eortc'
    }),
    selectField('prior', 'Recurrencias previas', '0', [
      option('0', 'Primario'), option('2', '≤1/año'), option('4', '>1/año')
    ], { scenario: 'eortc' }),
    checkbox('t1', 'T1', { scenario: 'eortc' }),
    checkbox('cis', 'CIS', { scenario: 'eortc' }),
    selectField('grade', 'Grado WHO 1973', '0', [
      option('0', 'G1'), option('1', 'G2'), option('2', 'G3')
    ], { scenario: 'eortc' }),
    section(
      'cueto_nmibc',
      'CUETO 2009',
      'Aplicable a pacientes tratados con 12 instilaciones de BCG durante 5-6 meses.',
      'cueto'
    ),
    selectField('cuetoSex', 'Sexo', 'male', [
      option('male', 'Varón'), option('female', 'Mujer')
    ], { scenario: 'cueto' }),
    numberField('cuetoAge', 'Edad', 65, { min: 18, max: 110, scenario: 'cueto' }),
    checkbox('cuetoMoreThree', '>3 tumores', { scenario: 'cueto' }),
    checkbox('cuetoRecurrent', 'Tumor recurrente', { scenario: 'cueto' }),
    checkbox('cuetoT1', 'T1', { scenario: 'cueto' }),
    checkbox('cuetoCis', 'CIS', { scenario: 'cueto' }),
    selectField('cuetoGrade', 'Grado WHO 1973', 'g1', [
      option('g1', 'G1'), option('g2', 'G2'), option('g3', 'G3')
    ], { scenario: 'cueto' }),
    checkbox('cuetoConfirmed', 'Confirmo cohorte CUETO con BCG 5–6 meses', {
      scenario: 'cueto',
      help: 'Sin esta condición no se muestran las probabilidades CUETO.'
    })
  ],
  calculate(values) {
    const scenario = stringValue(values, 'scenario');
    if (scenario === 'eau') return eauNmibcResult(values);
    if (scenario === 'cueto') return cuetoNmibcResult(values);
    return eortcNmibcResult(values);
  }
});

export const CYSTECTOMY_CALCULATOR = defineCalculator({
  id: 'cystectomy',
  title: 'Post-cistectomía',
  category: 'vejiga',
  subtitle: 'Disparadores EAU 2026 para tratamiento adyuvante.',
  source: 'EAU MIBC Guidelines 2026',
  clinicalUse: 'Ordena criterios publicados para quimioterapia, nivolumab y consideración de radioterapia después de cistectomía; no inventa una probabilidad de recurrencia.',
  fields: [
    section(
      'cystectomy_path',
      'Patología post-cistectomía',
      'Usar informe patológico final. pT, pN y márgenes son los ejes principales de riesgo y adyuvancia.'
    ),
    selectField('m', 'Metástasis', 'mx', [
      option('mx', 'No confirmada'), option('m0', 'M0'), option('m1', 'M1')
    ]),
    selectField('pt', 'p/ypT', '2', [
      option('0', 'pT0/Tis/Ta/T1'), option('2', 'pT2 / ypT2'), option('3', 'pT3a'),
      option('3.5', 'pT3b'), option('4', 'pT4')
    ]),
    selectField('pn', 'pN', 'nx', [
      option('nx', 'pNx'), option('n0', 'pN0'), option('nplus', 'pN+')
    ]),
    checkbox('margin', 'Margen positivo', { help: 'Margen quirúrgico comprometido.' }),
    selectField('perioperative', 'Tratamiento perioperatorio previo', 'none', [
      option('none', 'Sin tratamiento perioperatorio'),
      option('nac', 'Neoadyuvancia convencional'),
      option('modern', 'Esquema perioperatorio moderno')
    ], {
      help: 'Con un esquema moderno prevalece el protocolo específico; no se apilan adyuvancias automáticamente.'
    }),
    selectField('cisStatus', 'Aptitud/decisión sobre cisplatino', 'unknown', [
      option('unknown', 'No evaluada'),
      option('eligible', 'Apto y acepta'),
      option('declined', 'Apto pero rechaza'),
      option('ineligible', 'No apto')
    ])
  ],
  calculate(values) {
    const cisStatus = stringValue(values, 'cisStatus');
    const cisplatinEligible = cisStatus === 'eligible' || cisStatus === 'declined'
      ? true
      : cisStatus === 'ineligible' ? false : undefined;
    const calculated = postCystectomy({
      metastatic: stringValue(values, 'm') === 'm1',
      mKnown: stringValue(values, 'm') !== 'mx',
      t: stringValue(values, 'pt'),
      nodeKnown: stringValue(values, 'pn') !== 'nx',
      nodePositive: stringValue(values, 'pn') === 'nplus',
      marginPositive: booleanValue(values, 'margin'),
      nac: stringValue(values, 'perioperative') === 'nac',
      modernPerioperative: stringValue(values, 'perioperative') === 'modern',
      cisplatinEligible,
      cisplatinDeclined: cisStatus === 'declined'
    });
    return result({
      title: calculated.inScope
        ? 'Revisión adyuvante post-cistectomía'
        : calculated.incomplete ? 'Datos incompletos' : 'Fuera de alcance adyuvante',
      detail: calculated.recommendations.join(' · '),
      badge: 'EAU 2026',
      score: 0,
      showScore: false,
      severity: calculated.inScope ? 'info' : 'warn',
      metrics: calculated.recommendations.map((value, index) => ({
        label: `Punto ${index + 1}`,
        value
      })),
      notes: [
        'Si recibió un esquema perioperatorio moderno, debe prevalecer el protocolo específico y la discusión multidisciplinaria.',
        'La radioterapia adyuvante puede mejorar control locorregional, pero no demostró beneficio en supervivencia global.'
      ]
    });
  }
});

export const CISPLATIN_CALCULATOR = defineCalculator({
  id: 'cisplatin',
  title: 'Aptitud para cisplatino y platinum',
  category: 'vejiga',
  subtitle: 'Criterios EAU 2026 y zona renal limítrofe.',
  source: 'EAU MIBC 2026 · consenso de Galsky',
  clinicalUse: 'Distingue aptitud probable para cisplatino convencional, posible carboplatino e inelegibilidad para todo platinum. No selecciona por sí sola el tratamiento sistémico actual.',
  fields: [
    section(
      'cisplatin_patient',
      'Criterios de aptitud',
      'Edad sola no contraindica cisplatino. En casos renales equívocos conviene medir formalmente GFR.'
    ),
    selectField('ecog', 'ECOG', '1', [0, 1, 2, 3, 4].map((value) =>
      option(String(value), `ECOG ${value}`)), {
      help: 'ECOG >1 es criterio de no aptitud para cisplatino convencional.'
    }),
    selectField('renalMethod', 'Método de función renal', 'measured_gfr', [
      option('measured_gfr', 'GFR medida'),
      option('measured_crcl', 'CrCl medido'),
      option('calculated_crcl', 'CrCl calculado'),
      option('egfr', 'eGFR')
    ], { help: 'No mezclar métodos sin documentarlos.' }),
    numberField('gfr', 'Valor renal (ml/min)', 65, {
      min: 0.1,
      step: 0.1,
      help: 'Exactamente 60 se considera no apto para cisplatino convencional en este criterio conservador.'
    }),
    selectField('hearing', 'Hipoacusia CTCAE', '0', [0, 1, 2, 3].map((value) =>
      option(String(value), `G${value}`)), { help: 'Grado ≥2 pesa contra cisplatino pleno.' }),
    selectField('neuro', 'Neuropatía CTCAE', '0', [0, 1, 2, 3].map((value) =>
      option(String(value), `G${value}`)), { help: 'Grado ≥2 pesa contra cisplatino pleno.' }),
    selectField('nyha', 'NYHA', '1', [1, 2, 3, 4].map((value) =>
      option(String(value), `NYHA ${value}`)), { help: 'NYHA III/IV es criterio de inelegibilidad.' }),
    checkbox('severeComorbidity', 'Comorbilidad severa >G2', {
      help: 'Puede volver al paciente no apto para cualquier platinum.'
    })
  ],
  calculate(values) {
    const classified = cisplatinEligibility({
      ecog: numberValue(values, 'ecog'),
      gfr: numberValue(values, 'gfr'),
      hearing: numberValue(values, 'hearing'),
      neuropathy: numberValue(values, 'neuro'),
      nyha: numberValue(values, 'nyha'),
      severeComorbidity: booleanValue(values, 'severeComorbidity')
    });
    const title = classified.platinumIneligible
      ? 'No apto para platinum'
      : classified.eligible
        ? 'Apto probable para cisplatino convencional'
        : 'No apto para cisplatino convencional; posible carboplatino';
    return result({
      title,
      detail: classified.reasons.length
        ? `Criterios presentes: ${classified.reasons.join(', ')}.`
        : 'No se detectan criterios conservadores de no aptitud.',
      badge: classified.platinumIneligible
        ? 'no platinum'
        : classified.eligible ? 'cisplatino probable' : 'posible carboplatino',
      score: 0,
      showScore: false,
      severity: classified.platinumIneligible
        ? 'bad'
        : classified.eligible ? 'good' : 'warn',
      metrics: [
        { label: 'Función renal', value: `${numberValue(values, 'gfr')} ml/min` },
        { label: 'Método', value: stringValue(values, 'renalMethod') },
        { label: 'Criterios', value: classified.reasons.length }
      ],
      notes: [
        'Edad sola no contraindica cisplatino.',
        classified.borderlineRenal
          ? 'GFR 40–60: zona renal limítrofe; considerar medición isotópica/formal. Split-dose no se recomienda automáticamente.'
          : 'Aplicar la ficha y el protocolo específicos del régimen elegido.',
        'Regímenes perioperatorios modernos pueden tener umbrales propios; esos criterios prevalecen.'
      ]
    });
  }
});

export const UTUC_CALCULATOR = defineCalculator({
  id: 'utuc',
  title: 'UTUC — riesgo EAU 2026',
  category: 'vejiga',
  subtitle: 'Bajo vs alto riesgo en urotelio superior.',
  source: 'EAU UTUC risk stratification',
  clinicalUse: 'Diferencia bajo y alto riesgo en carcinoma urotelial del tracto superior. Orienta manejo conservador renal frente a nefroureterectomía y marca cuándo conviene confirmar grado, citología e imágenes.',
  fields: [
    selectField('utucM', 'Enfermedad metastásica', 'm0', [
      option('m0', 'No / M0'), option('m1', 'Sí / M1')
    ], { wide: true, help: 'M1 queda fuera de este módulo de estratificación local.' }),
    section(
      'utuc_low',
      'Datos para estratificar',
      'Los criterios fuertes y débiles se informan por separado. Un criterio débil aislado no convierte una lesión low-grade en alto riesgo.'
    ),
    numberField('size', 'Tamaño tumoral (cm)', 1.5, {
      min: 0,
      step: 0.1,
      help: 'Umbral práctico: ≥2 cm aumenta riesgo.'
    }),
    selectField('focality', 'Focalidad', 'missing', [
      option('missing', 'No evaluada'), option('unifocal', 'Unifocal'), option('multifocal', 'Multifocal')
    ], { help: 'La multifocalidad es un factor débil.' }),
    selectField('cytology', 'Citología', 'missing', [
      option('missing', 'No disponible'), option('negative', 'Negativa para high-grade'), option('high', 'High-grade')
    ], { help: 'Una citología high-grade es criterio fuerte.' }),
    selectField('biopsy', 'Biopsia URS', 'missing', [
      option('missing', 'No disponible'), option('low', 'Low-grade'),
      option('high', 'High-grade'), option('nondiagnostic', 'No diagnóstica')
    ], { help: 'No diagnóstica no equivale a high-grade.' }),
    selectField('ctAssessment', 'TC: invasión local', 'missing', [
      option('missing', 'No evaluada'), option('noninvasive', 'Sin aspecto invasivo'),
      option('invasive', 'Invasión local')
    ], { help: 'La invasión local en TC es criterio fuerte.' }),
    section(
      'utuc_high',
      'Señales de alto riesgo',
      'Subtipo histológico agresivo es un criterio fuerte; hidroureteronefrosis es un criterio débil.'
    ),
    checkbox('hydro', 'Hidroureteronefrosis', {
      help: 'Factor débil si los datos restantes son low-grade/no invasivos.'
    }),
    checkbox('variant', 'Histología variante', {
      help: 'Variante agresiva o diferenciación divergente.'
    })
  ],
  calculate(values) {
    const classified = utucRisk({
      metastatic: stringValue(values, 'utucM') === 'm1',
      size: numberValue(values, 'size'),
      focality: stringValue(values, 'focality'),
      cytology: stringValue(values, 'cytology'),
      biopsy: stringValue(values, 'biopsy'),
      ctAssessment: stringValue(values, 'ctAssessment'),
      hydronephrosis: booleanValue(values, 'hydro'),
      variant: booleanValue(values, 'variant')
    });
    const detail = classified.key === 'high'
      ? `Criterios fuertes: ${classified.strong.join(', ')}.`
      : classified.key === 'uncertain'
        ? `Faltan: ${(classified.missing ?? []).join(', ')}.`
        : classified.key === 'low_with_weak'
          ? `Factores débiles: ${classified.weak.join(', ')}. Decisión compartida.`
          : classified.key === 'low'
            ? 'Unifocal, <2 cm, citología negativa para high-grade, biopsia low-grade y TC no invasiva.'
            : classified.label;
    return result({
      title: classified.label,
      detail,
      badge: classified.key === 'high'
        ? 'criterio fuerte'
        : classified.key === 'low'
          ? 'bajo riesgo'
          : classified.key === 'out_of_scope' ? 'fuera de alcance' : 'revisar datos',
      score: 0,
      showScore: false,
      severity: classified.key === 'high'
        ? 'bad'
        : classified.key === 'low' ? 'good' : 'warn',
      metrics: [
        { label: 'Tamaño', value: `${numberValue(values, 'size')} cm` },
        { label: 'Biopsia', value: stringValue(values, 'biopsy') },
        { label: 'Criterios fuertes', value: classified.strong.length },
        { label: 'Factores débiles', value: classified.weak.length }
      ],
      notes: [
        'Los criterios débiles —tamaño ≥2 cm, multifocalidad e hidroureteronefrosis— no demuestran invasión por sí solos en enfermedad low-grade.',
        'La decisión entre preservación renal y nefroureterectomía requiere función renal, factibilidad técnica y discusión multidisciplinaria.'
      ]
    });
  }
});

export const LEGACY_CALCULATORS_16_19 = [
  NMIBC_CALCULATOR,
  CYSTECTOMY_CALCULATOR,
  CISPLATIN_CALCULATOR,
  UTUC_CALCULATOR
] as const;

interface EauNmibcValid {
  readonly valid: true;
  readonly group: string;
  readonly factors: number;
  readonly probabilities: readonly number[] | null;
  readonly special: boolean;
}

interface EauNmibcInvalid {
  readonly valid: false;
  readonly reason: string;
}

function eauNmibc(values: CalculatorValues): EauNmibcValid | EauNmibcInvalid {
  const system = stringValue(values, 'eauSystem') || 'who2004';
  const stage = stringValue(values, 'eauStage') || 'ta';
  const grade = stringValue(values, 'eauGrade') || 'low';
  const primary = stringValue(values, 'eauPrimary') === 'yes';
  const age = numberValue(values, 'eauAge');
  const size = numberValue(values, 'eauSize');
  const multiple = numberValue(values, 'eauCount') > 1;
  const cis = booleanValue(values, 'eauCis');
  const gradeValid = system === 'who2004'
    ? ['low', 'high'].includes(grade)
    : system === 'who1973' ? ['g1', 'g2', 'g3'].includes(grade) : false;
  if (!['who2004', 'who1973'].includes(system)
    || !['ta', 't1'].includes(stage)
    || !gradeValid
    || !Number.isFinite(age)
    || age <= 0
    || !Number.isFinite(size)
    || size < 0) {
    return {
      valid: false,
      reason: 'Completar sistema de grado, grado compatible, presentación, edad, tamaño, focalidad y estadio'
    };
  }
  const factors = (age > 70 ? 1 : 0) + (multiple ? 1 : 0) + (size >= 3 ? 1 : 0);
  if (booleanValue(values, 'eauLvi')
    || booleanValue(values, 'eauProstaticCis')
    || booleanValue(values, 'eauVariant')) {
    return { valid: true, group: 'muy alto', factors, probabilities: null, special: true };
  }
  if (booleanValue(values, 'eauPureCis')) {
    return { valid: true, group: 'alto', factors, probabilities: null, special: true };
  }
  let group = 'intermedio';
  if (system === 'who1973') {
    const g1 = grade === 'g1';
    const g2 = grade === 'g2';
    const g3 = grade === 'g3';
    const veryHigh = (stage === 'ta' && g3 && cis && factors === 3)
      || (stage === 't1' && g2 && cis && factors >= 2)
      || (stage === 't1' && g3 && cis && factors >= 1)
      || (stage === 't1' && g3 && !cis && factors === 3);
    const high = (stage === 't1' && g3 && !cis)
      || cis
      || (stage === 'ta' && g2 && !cis && factors === 3)
      || (stage === 't1' && g1 && !cis && factors === 3)
      || (stage === 'ta' && g3 && !cis && factors >= 2)
      || (stage === 't1' && g2 && !cis && factors >= 1);
    const low = primary && !cis && g1
      && ((!multiple && size < 3 && age <= 70) || (stage === 'ta' && factors <= 1));
    group = veryHigh ? 'muy alto' : high ? 'alto' : low ? 'bajo' : 'intermedio';
  } else {
    const lowGrade = grade === 'low';
    const highGrade = grade === 'high';
    const veryHigh = (stage === 'ta' && highGrade && cis && factors === 3)
      || (stage === 't1' && highGrade && cis && factors >= 1)
      || (stage === 't1' && highGrade && !cis && factors === 3);
    const high = (stage === 't1' && highGrade && !cis)
      || cis
      || (stage === 'ta' && lowGrade && !cis && factors === 3)
      || (((stage === 'ta' && highGrade) || (stage === 't1' && lowGrade))
        && !cis && factors >= 2);
    const low = primary && !cis && lowGrade
      && ((!multiple && size < 3 && age <= 70) || (stage === 'ta' && factors <= 1));
    group = veryHigh ? 'muy alto' : high ? 'alto' : low ? 'bajo' : 'intermedio';
  }
  if (!primary && group === 'bajo') group = 'intermedio';
  const tables: Readonly<Record<string, Readonly<Record<string, readonly number[]>>>> = {
    who2004: {
      bajo: [0.06, 0.93, 3.7],
      intermedio: [1, 4.9, 8.5],
      alto: [3.5, 9.6, 14],
      'muy alto': [16, 40, 53]
    },
    who1973: {
      bajo: [0.12, 0.57, 3],
      intermedio: [0.65, 3.6, 7.4],
      alto: [3.8, 11, 14],
      'muy alto': [20, 44, 59]
    }
  };
  return {
    valid: true,
    group,
    factors,
    probabilities: primary ? tables[system]?.[group] ?? null : null,
    special: false
  };
}

function eauNmibcResult(values: CalculatorValues) {
  const calculated = eauNmibc(values);
  if (!calculated.valid) {
    return result({
      title: 'EAU NMIBC no calculable',
      detail: calculated.reason,
      badge: 'revisar datos',
      score: 0,
      showScore: false,
      severity: 'warn',
      metrics: [],
      notes: ['WHO 2004/2022 requiere low/high grade; WHO 1973 requiere G1/G2/G3.']
    });
  }
  const metrics: CalculatorMetric[] = [
    { label: 'Grupo EAU', value: calculated.group },
    { label: 'Factores clínicos', value: `${calculated.factors}/3` }
  ];
  if (calculated.probabilities) {
    metrics.push(
      { label: 'Progresión 1 año', value: percentage(calculated.probabilities[0] ?? 0, 2) },
      { label: 'Progresión 5 años', value: percentage(calculated.probabilities[1] ?? 0, 1) },
      { label: 'Progresión 10 años', value: percentage(calculated.probabilities[2] ?? 0, 1) }
    );
  }
  return result({
    title: `EAU: riesgo ${calculated.group}`,
    detail: calculated.probabilities
      ? 'Probabilidades poblacionales para tumores primarios incluidos en el modelo.'
      : 'Grupo asignado; la tabla no ofrece probabilidades válidas para este contexto.',
    badge: 'EAU 2021/2026',
    score: 0,
    showScore: false,
    severity: calculated.group === 'bajo'
      ? 'good'
      : calculated.group === 'intermedio' ? 'warn' : 'bad',
    metrics,
    notes: ['No combinar este grupo con EORTC o CUETO.']
  });
}

interface EortcNmibc {
  readonly recurrenceScore: number;
  readonly progressionScore: number;
  readonly recurrence1y: number;
  readonly recurrence5y: number;
  readonly progression1y: number;
  readonly progression5y: number;
}

function eortcNmibc(values: CalculatorValues): EortcNmibc {
  const number = numberValue(values, 'number');
  const size = numberValue(values, 'size');
  const prior = numberValue(values, 'prior');
  const grade = numberValue(values, 'grade');
  const recurrenceScore = number + size + prior
    + (booleanValue(values, 't1') ? 1 : 0)
    + (booleanValue(values, 'cis') ? 1 : 0)
    + grade;
  const progressionScore = (number > 0 ? 3 : 0)
    + size
    + (prior > 0 ? 2 : 0)
    + (booleanValue(values, 't1') ? 4 : 0)
    + (booleanValue(values, 'cis') ? 6 : 0)
    + (grade === 2 ? 5 : 0);
  const recurrence = recurrenceScore === 0 ? [15, 31]
    : recurrenceScore <= 4 ? [24, 46]
      : recurrenceScore <= 9 ? [38, 62] : [61, 78];
  const progression = progressionScore === 0 ? [0.2, 0.8]
    : progressionScore <= 6 ? [1, 6]
      : progressionScore <= 13 ? [5, 17] : [17, 45];
  return {
    recurrenceScore,
    progressionScore,
    recurrence1y: recurrence[0] ?? 0,
    recurrence5y: recurrence[1] ?? 0,
    progression1y: progression[0] ?? 0,
    progression5y: progression[1] ?? 0
  };
}

function eortcNmibcResult(values: CalculatorValues) {
  const calculated = eortcNmibc(values);
  return result({
    title: 'EORTC 2006',
    detail: `Recurrencia ${calculated.recurrenceScore}; progresión ${calculated.progressionScore}.`,
    badge: 'cohorte histórica',
    score: 0,
    showScore: false,
    severity: 'info',
    metrics: [
      { label: 'Recurrencia 1/5 años', value: `${calculated.recurrence1y}% / ${calculated.recurrence5y}%` },
      { label: 'Progresión 1/5 años', value: `${calculated.progression1y}% / ${calculated.progression5y}%` }
    ],
    notes: ['Puede sobreestimar riesgo con BCG contemporáneo; no equivale al grupo EAU actual.']
  });
}

interface CuetoNmibc {
  readonly recurrenceScore: number;
  readonly progressionScore: number;
  readonly recurrence: readonly number[];
  readonly progression: readonly number[];
}

function cuetoNmibc(values: CalculatorValues): CuetoNmibc {
  const female = stringValue(values, 'cuetoSex') === 'female';
  const age = numberValue(values, 'cuetoAge');
  const grade = stringValue(values, 'cuetoGrade') || 'g1';
  const recurrenceScore = (female ? 3 : 0)
    + (age > 70 ? 2 : age >= 60 ? 1 : 0)
    + (booleanValue(values, 'cuetoMoreThree') ? 2 : 0)
    + (booleanValue(values, 'cuetoRecurrent') ? 4 : 0)
    + (booleanValue(values, 'cuetoCis') ? 2 : 0)
    + (grade === 'g3' ? 3 : grade === 'g2' ? 1 : 0);
  const progressionScore = (age > 70 ? 2 : 0)
    + (booleanValue(values, 'cuetoMoreThree') ? 1 : 0)
    + (booleanValue(values, 'cuetoRecurrent') ? 2 : 0)
    + (booleanValue(values, 'cuetoT1') ? 2 : 0)
    + (booleanValue(values, 'cuetoCis') ? 1 : 0)
    + (grade === 'g3' ? 6 : grade === 'g2' ? 2 : 0);
  const risks = recurrenceScore <= 4 ? [8, 21]
    : recurrenceScore <= 6 ? [12, 36]
      : recurrenceScore <= 9 ? [25, 48] : [42, 68];
  const progression = progressionScore <= 4 ? [1, 4]
    : progressionScore <= 6 ? [3, 12]
      : progressionScore <= 9 ? [6, 21] : [14, 34];
  return { recurrenceScore, progressionScore, recurrence: risks, progression };
}

function cuetoNmibcResult(values: CalculatorValues) {
  if (!booleanValue(values, 'cuetoConfirmed')) {
    return result({
      title: 'Confirmar aplicabilidad CUETO',
      detail: 'Las probabilidades sólo corresponden a la cohorte tratada con 12 instilaciones de BCG durante 5–6 meses.',
      badge: 'sin cálculo',
      score: 0,
      showScore: false,
      severity: 'warn',
      metrics: [],
      notes: []
    });
  }
  const calculated = cuetoNmibc(values);
  return result({
    title: 'CUETO — cohorte tratada con BCG',
    detail: `Recurrencia ${calculated.recurrenceScore}; progresión ${calculated.progressionScore}.`,
    badge: 'CUETO 2009',
    score: 0,
    showScore: false,
    severity: 'info',
    metrics: [
      {
        label: 'Recurrencia 1/5 años',
        value: `${calculated.recurrence[0]}% / ${calculated.recurrence[1]}%`
      },
      {
        label: 'Progresión 1/5 años',
        value: `${calculated.progression[0]}% / ${calculated.progression[1]}%`
      }
    ],
    notes: ['Aplicar sólo al esquema CUETO de BCG durante 5-6 meses.']
  });
}

interface PostCystectomyInput {
  readonly metastatic: boolean;
  readonly mKnown: boolean;
  readonly t: string;
  readonly nodeKnown: boolean;
  readonly nodePositive: boolean;
  readonly marginPositive: boolean;
  readonly nac: boolean;
  readonly modernPerioperative: boolean;
  readonly cisplatinEligible?: boolean;
  readonly cisplatinDeclined: boolean;
}

interface PostCystectomyResult {
  readonly inScope: boolean;
  readonly incomplete?: boolean;
  readonly highRiskAfterNac?: boolean;
  readonly highRiskWithoutNac?: boolean;
  readonly recommendations: readonly string[];
}

function postCystectomy(input: PostCystectomyInput): PostCystectomyResult {
  if (input.metastatic) {
    return { inScope: false, recommendations: ['Enfermedad M1: fuera del módulo adyuvante post-cistectomía'] };
  }
  if (!input.mKnown) {
    return {
      inScope: false,
      incomplete: true,
      recommendations: ['Falta confirmar M0 antes de aplicar el módulo adyuvante']
    };
  }
  if (!input.nodeKnown) {
    return {
      inScope: false,
      incomplete: true,
      recommendations: ['pNx: completar evaluación ganglionar y discutir en comité']
    };
  }
  const t = Number(input.t);
  const highRiskAfterNac = input.nac && (t >= 2 || input.nodePositive);
  const highRiskWithoutNac = !input.nac && (t >= 3 || input.nodePositive);
  const recommendations: string[] = [];
  if (input.modernPerioperative) {
    recommendations.push('Aplicar el protocolo perioperatorio moderno y evitar apilar adyuvancias automáticamente');
  } else {
    if (highRiskWithoutNac && input.cisplatinEligible && !input.cisplatinDeclined) {
      recommendations.push('Ofrecer quimioterapia adyuvante combinada basada en cisplatino');
    }
    if (highRiskAfterNac
      || (highRiskWithoutNac && (input.cisplatinEligible === false || input.cisplatinDeclined))) {
      recommendations.push('Evaluar nivolumab adyuvante en comité multidisciplinario');
    }
    if (highRiskWithoutNac
      && input.cisplatinEligible === undefined
      && !input.cisplatinDeclined) {
      recommendations.push('Falta definir aptitud para cisplatino antes de seleccionar adyuvancia');
    }
  }
  if (t >= 3.5 || input.nodePositive || input.marginPositive) {
    recommendations.push('Considerar radioterapia adyuvante para control locorregional; sin beneficio demostrado en supervivencia global');
  }
  if (!recommendations.length) {
    recommendations.push('No cumple un disparador adyuvante EAU por estadio con los datos ingresados');
  }
  return { inScope: true, highRiskAfterNac, highRiskWithoutNac, recommendations };
}

interface CisplatinEligibility {
  readonly eligible: boolean;
  readonly platinumIneligible: boolean;
  readonly reasons: readonly string[];
  readonly borderlineRenal: boolean;
}

function cisplatinEligibility(input: {
  readonly ecog: number;
  readonly gfr: number;
  readonly hearing: number;
  readonly neuropathy: number;
  readonly nyha: number;
  readonly severeComorbidity: boolean;
}): CisplatinEligibility {
  const reasons: string[] = [];
  if (input.ecog > 1) reasons.push('ECOG >1');
  if (input.gfr <= 60) reasons.push('GFR ≤60 ml/min');
  if (input.hearing >= 2) reasons.push('hipoacusia audiometrica ≥G2');
  if (input.neuropathy >= 2) reasons.push('neuropatia ≥G2');
  if (input.nyha >= 3) reasons.push('insuficiencia cardiaca NYHA III/IV');
  if (input.severeComorbidity) reasons.push('comorbilidad severa >G2');
  const platinumIneligible = input.gfr < 30
    || input.ecog > 2
    || (input.ecog === 2 && input.gfr < 60)
    || input.severeComorbidity;
  return {
    eligible: reasons.length === 0 && !platinumIneligible,
    platinumIneligible,
    reasons,
    borderlineRenal: input.gfr >= 40 && input.gfr <= 60
  };
}

type UtucKey = 'out_of_scope' | 'high' | 'uncertain' | 'low' | 'low_with_weak';

interface UtucResult {
  readonly key: UtucKey;
  readonly label: string;
  readonly strong: readonly string[];
  readonly weak: readonly string[];
  readonly missing?: readonly string[];
}

function utucRisk(input: {
  readonly metastatic: boolean;
  readonly size: number;
  readonly focality: string;
  readonly cytology: string;
  readonly biopsy: string;
  readonly ctAssessment: string;
  readonly hydronephrosis: boolean;
  readonly variant: boolean;
}): UtucResult {
  if (input.metastatic) {
    return { key: 'out_of_scope', label: 'Fuera de alcance: enfermedad metastásica', strong: [], weak: [] };
  }
  const strong: string[] = [];
  if (input.cytology === 'high') strong.push('citología de alto grado');
  if (input.biopsy === 'high') strong.push('biopsia de alto grado');
  if (input.ctAssessment === 'invasive') strong.push('invasión local en TC');
  if (input.variant) strong.push('variante histologica agresiva');
  const weak: string[] = [];
  if (input.size >= 2) weak.push('tamaño ≥2 cm');
  if (input.focality === 'multifocal') weak.push('multifocalidad');
  if (input.hydronephrosis) weak.push('hidroureteronefrosis');
  if (strong.length) {
    return { key: 'high', label: 'Alto riesgo: criterio fuerte', strong, weak };
  }
  const missing: string[] = [];
  if (!Number.isFinite(input.size) || input.size <= 0) missing.push('tamaño tumoral');
  if (!['unifocal', 'multifocal'].includes(input.focality)) missing.push('focalidad');
  if (!['negative', 'high', 'missing'].includes(input.cytology)) missing.push('citología válida');
  if (!['low', 'high', 'nondiagnostic', 'missing'].includes(input.biopsy)) missing.push('biopsia válida');
  if (!['noninvasive', 'invasive', 'missing'].includes(input.ctAssessment)) {
    missing.push('evaluación de TC válida');
  }
  if (input.cytology === 'missing') missing.push('citología');
  if (input.biopsy === 'missing' || input.biopsy === 'nondiagnostic') {
    missing.push('biopsia low-grade confiable');
  }
  if (input.ctAssessment === 'missing') missing.push('evaluación de invasión en TC');
  if (missing.length) {
    return {
      key: 'uncertain',
      label: 'Información insuficiente para clasificar',
      strong,
      weak,
      missing
    };
  }
  if (!weak.length) return { key: 'low', label: 'Bajo riesgo probable', strong, weak };
  return {
    key: 'low_with_weak',
    label: 'Sin criterio fuerte; sólo factores débiles',
    strong,
    weak
  };
}

function percentage(value: number, digits = 0): string {
  return value.toFixed(digits) + '%';
}
