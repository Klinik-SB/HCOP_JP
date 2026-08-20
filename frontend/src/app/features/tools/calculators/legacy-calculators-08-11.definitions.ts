import {
  booleanValue,
  defineCalculator,
  externalLink,
  numberValue,
  result,
  stringValue
} from './calculator.engine';
import { CalculatorOption, CalculatorResult, CalculatorValues } from './calculator.models';

const GRADE_GROUP_OPTIONS = [1, 2, 3, 4, 5]
  .map((value) => ({ value: String(value), label: `GG ${value}` }));
const GLEASON_PATTERN_OPTIONS = [3, 4, 5]
  .map((value) => ({ value: String(value), label: `Patron ${value}` }));
const CLINICAL_T_OPTIONS: readonly CalculatorOption[] = [
  { value: 't1', label: 'cT1' },
  { value: 't2a', label: 'cT2a' },
  { value: 't2b', label: 'cT2b' },
  { value: 't2c', label: 'cT2c' },
  { value: 't3', label: 'cT3' },
  { value: 't4', label: 'cT4' }
];

export const DAMICO_CALCULATOR = defineCalculator({
  id: 'damico',
  title: 'EAU 2026 — riesgo prostático',
  category: 'prostata',
  subtitle: 'Grupo clínico EAU para enfermedad localizada o localmente avanzada.',
  source: 'EAU Prostate Cancer Guidelines 2026 · tabla 4.3',
  clinicalUse: "Clasifica con PSA, Grade Group, cT basado en tacto rectal y estado ganglionar clínico. No mezcla las categorías D'Amico o NCCN.",
  fields: [
    section('damico_data', 'Datos de riesgo clínico',
      'Usá PSA pretratamiento, mayor Grade Group de biopsia y cT por tacto rectal. La EAU 2026 no usa la RM para asignar este cT.'),
    numberField('psa', 'PSA pretratamiento', 9, {
      min: 0, step: 0.1,
      help: 'ng/ml. En rangos frontera conviene confirmar tendencia y contexto de prostatitis/instrumentación.'
    }),
    selectField('gg', 'Grade Group máximo', '1', GRADE_GROUP_OPTIONS,
      'Usar el mayor ISUP/Grade Group informado en biopsia.'),
    selectField('ct', 'Estadio clínico', 't1', CLINICAL_T_OPTIONS,
      'Registrar el cT que se usará para decisión; RM puede reclasificar extensión local.'),
    selectField('n', 'Ganglios clínicos', 'nx', [
      { value: 'nx', label: 'No confirmado' }, { value: 'n0', label: 'cN0' }, { value: 'n1', label: 'cN+' }
    ], 'cN+ se considera localmente avanzado en esta clasificación.'),
    selectField('m', 'Metástasis', 'mx', [
      { value: 'mx', label: 'No confirmada' }, { value: 'm0', label: 'M0' }, { value: 'm1', label: 'M1' }
    ], 'La tabla de riesgo requiere M0; M1 queda fuera de alcance.')
  ],
  calculate(values) {
    const psa = numberValue(values, 'psa');
    const gg = numberValue(values, 'gg');
    const ct = stringValue(values, 'ct');
    const nodes = stringValue(values, 'n');
    const metastasis = stringValue(values, 'm');
    const classified = eauProstateRisk(psa, gg, ct, nodes, metastasis);
    const severity = classified.key === 'low' ? 'good'
      : ['favorable_intermediate', 'unfavorable_intermediate', 'unclassified', 'metastatic'].includes(classified.key)
        ? 'warn' : 'bad';
    return result({
      title: classified.label,
      detail: `PSA ${psa}, GG${gg}, c${ct.toUpperCase()}, ${nodes.toUpperCase()}, ${metastasis.toUpperCase()}.`,
      badge: classified.label,
      score: 0,
      showScore: false,
      severity,
      metrics: [
        { label: 'PSA', value: psa },
        { label: 'GG', value: gg },
        { label: 'cT', value: ct.toUpperCase() },
        { label: 'cN', value: nodes === 'n1' ? 'positivo' : nodes === 'n0' ? 'negativo' : 'no confirmado' },
        { label: 'M', value: metastasis.toUpperCase() }
      ],
      notes: [
        'Resultado determinístico de la tabla EAU 2026; no equivale automáticamente a una recomendación terapéutica.',
        'La clasificación exige enfermedad M0; M1 debe evaluarse con herramientas para enfermedad metastásica.'
      ]
    });
  }
});

export const CAPRA_CALCULATOR = defineCalculator({
  id: 'capra',
  title: 'CAPRA / CAPRA-S',
  category: 'prostata',
  subtitle: 'Riesgo pretratamiento y post-prostatectomía.',
  source: 'UCSF CAPRA, CAPRA-S',
  clinicalUse: 'CAPRA cuantifica riesgo pretratamiento y CAPRA-S lo hace después de prostatectomía con variables patológicas. Ayudan a estimar recurrencia, comparar riesgo entre pacientes, planificar seguimiento y discutir adyuvancia o rescate.',
  fields: [
    {
      id: 'scenario', kind: 'select', label: 'Escala', required: false, initialValue: 'pre', exampleValue: 'pre', wide: true,
      help: 'Son dos escalas distintas y usan formularios separados.',
      options: [
        { value: 'pre', label: 'CAPRA pretratamiento' },
        { value: 'post', label: 'CAPRA-S postoperatorio' }
      ]
    },
    section('capra_clinical', 'Variables clínicas',
      'CAPRA pretratamiento: datos de la biopsia y del diagnóstico.', 'pre'),
    numberField('age', 'Edad al diagnóstico', 64, { min: 18, max: 100, scenario: 'pre' }),
    numberField('psa', 'PSA al diagnóstico', 8, { min: 0, step: 0.1, scenario: 'pre' }),
    selectField('capraPrimary', 'Gleason primario', '3', GLEASON_PATTERN_OPTIONS, undefined, 'pre'),
    selectField('capraSecondary', 'Gleason secundario', '4', GLEASON_PATTERN_OPTIONS, undefined, 'pre'),
    selectField('ct', 'cT', 't2a', [
      { value: 't1', label: 'cT1/cT1c' }, { value: 't2a', label: 'cT2a' },
      { value: 't2b', label: 'cT2b' }, { value: 't2c', label: 'cT2c' },
      { value: 't3a', label: 'cT3a' }, { value: 't3b', label: 'cT3b (fuera de modelo)' },
      { value: 't4', label: 'cT4 (fuera de modelo)' }
    ], 'CAPRA suma un punto sólo para cT3a; cT3b/T4 quedan fuera del modelo original.', 'pre'),
    numberField('positiveCores', 'Cilindros positivos', 3, { min: 0, scenario: 'pre' }),
    numberField('totalCores', 'Cilindros totales', 12, { min: 1, scenario: 'pre' }),
    section('capra_path', 'Variables patológicas para CAPRA-S',
      'CAPRA-S utiliza PSA preoperatorio y anatomía patológica final; no suma edad, cT ni cilindros.', 'post'),
    numberField('capraSpsa', 'PSA preoperatorio', 8, { min: 0, step: 0.1, scenario: 'post' }),
    selectField('capraSPrimary', 'Gleason patológico primario', '3', GLEASON_PATTERN_OPTIONS, undefined, 'post'),
    selectField('capraSSecondary', 'Gleason patológico secundario', '4', GLEASON_PATTERN_OPTIONS, undefined, 'post'),
    checkbox('margin', 'Margen quirúrgico positivo', 'post'),
    checkbox('ece', 'Extensión extraprostática', 'post'),
    checkbox('svi', 'Invasión de vesículas seminales', 'post'),
    checkbox('lni', 'Ganglios positivos', 'post')
  ],
  calculate(values) {
    if (stringValue(values, 'scenario') === 'post') {
      return capraOutput(capraS(values), true);
    }
    const calculated = capra(values);
    if (!calculated.valid) {
      return result({
        title: 'CAPRA no calculable',
        detail: calculated.reason,
        badge: 'fuera de modelo',
        score: 0,
        showScore: false,
        severity: 'warn',
        metrics: [],
        notes: ['No se extrapola la escala fuera de su definición original.']
      });
    }
    return capraOutput(calculated, false);
  }
});

export const PARTIN_CALCULATOR = defineCalculator({
  id: 'partin',
  title: 'Partin tables',
  category: 'prostata',
  subtitle: 'Estimación patológica pre-prostatectomía.',
  source: 'Partin tables',
  clinicalUse: 'Estima la probabilidad de hallazgos patológicos en prostatectomía, como enfermedad órgano confinada, extensión extraprostática, compromiso vesicular y ganglionar. Es útil para consejería prequirúrgica y discusión de linfadenectomía.',
  fields: [
    section('partin_data', 'Datos preoperatorios',
      'Usar solo variables disponibles antes de prostatectomía. La salida es orientativa y debe contrastarse con tablas/nomogramas oficiales si define conducta.'),
    selectField('psaCat', 'PSA', '4to10', [
      { value: 'lt4', label: '<4' }, { value: '4to10', label: '4-10' },
      { value: '10to20', label: '10-20' }, { value: 'gt20', label: '>20' }
    ], 'Categoría de PSA preoperatorio.'),
    selectField('gg', 'Grade Group', '2', GRADE_GROUP_OPTIONS, 'Mayor Grade Group en biopsia.'),
    selectField('ct', 'Estadio clínico', 't2a', CLINICAL_T_OPTIONS,
      'Estadio clínico usado para consejería quirúrgica.')
  ],
  calculate(values) {
    const psaCategory = stringValue(values, 'psaCat');
    const gg = numberValue(values, 'gg');
    const ct = stringValue(values, 'ct');
    return result({
      title: 'Consulta de tablas Partin oficiales',
      detail: `Perfil preparado: PSA ${psaCategory}, ${ct.toUpperCase()}, GG${gg}.`,
      badge: 'sin estimación local',
      score: 0,
      showScore: false,
      severity: 'info',
      metrics: [
        { label: 'PSA', value: psaCategory },
        { label: 'cT', value: ct.toUpperCase() },
        { label: 'Grade Group', value: gg }
      ],
      notes: [
        'Se retiraron los porcentajes locales porque no correspondían a las tablas Partin publicadas.',
        externalLink('Abrir tablas Partin de Johns Hopkins',
          'https://www.hopkinsmedicine.org/brady-urology-institute/conditions-and-treatments/prostate-cancer/risk-assessment-tools/partin-tables')
      ]
    });
  }
});

export const NODAL_RISK_CALCULATOR = defineCalculator({
  id: 'nodal-risk',
  title: 'Roach nodal / Briganti oficial',
  category: 'prostata',
  subtitle: 'Riesgo ganglionar orientativo.',
  source: 'Roach III; Briganti/MSKCC sólo mediante modelo oficial',
  clinicalUse: 'Estima riesgo de compromiso ganglionar en próstata localizada o de alto riesgo. Ayuda a decidir linfadenectomía extendida, irradiación pélvica y necesidad de estadificación avanzada, idealmente validando con nomogramas oficiales.',
  fields: [
    section('nodal_data', 'Estimación ganglionar',
      'Calcula sólo la fórmula histórica de Roach. Para decidir ePLND o RT pélvica, validar con Briganti/MSKCC oficial.'),
    numberField('psa', 'PSA', 12, { min: 0, step: 0.1, help: 'PSA pretratamiento.' }),
    selectField('gleason', 'Gleason total', '7', [6, 7, 8, 9, 10]
      .map((value) => ({ value: String(value), label: `Gleason ${value}` })),
    'La fórmula Roach requiere el Gleason total exacto.'),
    section('briganti_reference', 'Briganti / MSKCC',
      'No se calcula un porcentaje local. Briganti 2012/2019 necesita sus variables exactas; PI-RADS aislado no sustituye el nomograma.')
  ],
  calculate(values) {
    const psa = numberValue(values, 'psa');
    const gleason = numberValue(values, 'gleason');
    const roachRaw = (2 / 3) * psa + 10 * (gleason - 6);
    const interpretable = roachRaw >= 0 && roachRaw <= 100;
    return result({
      title: interpretable ? `Roach: ${percentage(roachRaw, 1)}` : 'Roach fuera del rango interpretable',
      detail: interpretable
        ? 'La fórmula histórica Roach se informa de manera independiente; no se promedia con Briganti.'
        : `La fórmula produjo ${percentage(roachRaw, 1)}. No se recorta silenciosamente a 0–100%.`,
      badge: 'fórmula histórica',
      score: 0,
      showScore: false,
      severity: interpretable ? 'info' : 'warn',
      metrics: [
        { label: 'Roach', value: percentage(roachRaw, 1) },
        { label: 'PSA', value: psa },
        { label: 'Gleason total', value: gleason }
      ],
      notes: [
        'Se eliminó el cálculo Briganti-like porque no correspondía a un nomograma validado.',
        externalLink('Abrir nomograma validado', 'https://www.mskcc.org/nomograms/prostate/pre_op')
      ]
    });
  }
});

export const LEGACY_CALCULATORS_08_11 = [
  DAMICO_CALCULATOR,
  CAPRA_CALCULATOR,
  PARTIN_CALCULATOR,
  NODAL_RISK_CALCULATOR
] as const;

interface NumberFieldOptions {
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly help?: string;
  readonly scenario?: string;
}

function numberField(id: string, label: string, exampleValue: number, options: NumberFieldOptions = {}) {
  return {
    id, kind: 'number' as const, label, required: true as const, initialValue: '' as const,
    exampleValue, ...options
  };
}

function selectField(
  id: string,
  label: string,
  exampleValue: string,
  options: readonly CalculatorOption[],
  help?: string,
  scenario?: string
) {
  return {
    id, kind: 'select' as const, label, required: true as const, initialValue: '',
    exampleValue, options, help, scenario
  };
}

function checkbox(id: string, label: string, scenario?: string) {
  return { id, kind: 'checkbox' as const, label, required: false as const, initialValue: false, scenario };
}

function section(id: string, label: string, help: string, scenario?: string) {
  return {
    id, kind: 'section' as const, label, required: false as const, initialValue: '' as const,
    wide: true, help, scenario
  };
}

interface ProstateRiskClassification {
  readonly key: string;
  readonly label: string;
}

function eauProstateRisk(
  psa: number,
  gg: number,
  stage: string,
  nodes: string,
  metastasis: string
): ProstateRiskClassification {
  if (metastasis === 'm1') return { key: 'metastatic', label: 'Fuera de alcance: enfermedad M1' };
  if (metastasis !== 'm0') return { key: 'unclassified', label: 'No clasificable: falta confirmar M0' };
  if (nodes === 'n1' || stage.startsWith('t3') || stage.startsWith('t4')) {
    return { key: 'locally_advanced', label: 'Localmente avanzado' };
  }
  if (nodes !== 'n0') return { key: 'unclassified', label: 'No clasificable: falta confirmar cN0' };
  if (gg >= 4 || psa > 20) return { key: 'high', label: 'Alto riesgo localizado' };
  if ((gg === 2 && psa >= 10 && psa <= 20) || gg === 3) {
    return { key: 'unfavorable_intermediate', label: 'Intermedio desfavorable' };
  }
  if ((gg === 2 && psa < 10) || (gg === 1 && psa >= 10 && psa <= 20)) {
    return { key: 'favorable_intermediate', label: 'Intermedio favorable' };
  }
  if (gg === 1 && psa < 10) return { key: 'low', label: 'Bajo riesgo' };
  return { key: 'unclassified', label: 'No clasificable con estos datos' };
}

interface CapraValid {
  readonly valid: true;
  readonly total: number;
  readonly corePercent: number;
  readonly category: string;
}

interface CapraInvalid {
  readonly valid: false;
  readonly reason: string;
}

function capra(values: CalculatorValues): CapraValid | CapraInvalid {
  const age = numberValue(values, 'age');
  const psa = numberValue(values, 'psa');
  const primary = numberValue(values, 'capraPrimary');
  const secondary = numberValue(values, 'capraSecondary');
  const stage = stringValue(values, 'ct').toLowerCase();
  const positiveCores = numberValue(values, 'positiveCores');
  const totalCores = numberValue(values, 'totalCores');
  if (!['t1', 't1c', 't2a', 't2b', 't2c', 't3a'].includes(stage)) {
    return { valid: false, reason: 'CAPRA original no incluye cT3b ni cT4' };
  }
  if (totalCores <= 0 || positiveCores < 0 || positiveCores > totalCores) {
    return { valid: false, reason: 'Revisar la cantidad de cilindros positivos y totales' };
  }
  let total = age >= 50 ? 1 : 0;
  total += psa > 30 ? 4 : psa > 20 ? 3 : psa > 10 ? 2 : psa > 6 ? 1 : 0;
  total += primary >= 4 ? 3 : secondary >= 4 ? 1 : 0;
  total += stage.startsWith('t3a') ? 1 : 0;
  const corePercent = positiveCores / totalCores * 100;
  total += corePercent >= 34 ? 1 : 0;
  total = clamp(total, 0, 10);
  return { valid: true, total, corePercent, category: total <= 2 ? 'bajo' : total <= 5 ? 'intermedio' : 'alto' };
}

interface CapraSResult {
  readonly total: number;
  readonly category: string;
}

function capraS(values: CalculatorValues): CapraSResult {
  const psa = numberValue(values, 'capraSpsa');
  const primary = numberValue(values, 'capraSPrimary');
  const secondary = numberValue(values, 'capraSSecondary');
  let total = psa > 20 ? 3 : psa > 10 ? 2 : psa > 6 ? 1 : 0;
  const gleasonSum = primary + secondary;
  total += gleasonSum >= 8 ? 3
    : primary === 4 && secondary === 3 ? 2
      : primary === 3 && secondary === 4 ? 1
        : primary >= 5 || secondary >= 5 ? 3 : 0;
  total += booleanValue(values, 'margin') ? 2 : 0;
  total += booleanValue(values, 'ece') ? 1 : 0;
  total += booleanValue(values, 'svi') ? 2 : 0;
  total += booleanValue(values, 'lni') ? 1 : 0;
  return { total, category: total <= 2 ? 'bajo' : total <= 5 ? 'intermedio' : 'alto' };
}

function capraOutput(calculated: CapraValid | CapraSResult, post: boolean): CalculatorResult {
  const label = calculated.category;
  const metrics = [
    { label: 'Puntaje', value: calculated.total },
    { label: 'Escala', value: post ? 'CAPRA-S' : 'CAPRA' }
  ];
  if (!post && 'corePercent' in calculated) {
    metrics.push({ label: 'Cilindros positivos', value: `${calculated.corePercent.toFixed(1)}%` });
  }
  return result({
    title: `${post ? 'CAPRA-S' : 'CAPRA'} ${calculated.total}`,
    detail: `Grupo de riesgo ${label}; puntaje determinístico publicado.`,
    badge: label,
    score: 0,
    showScore: false,
    severity: label === 'bajo' ? 'good' : label === 'intermedio' ? 'warn' : 'bad',
    metrics,
    notes: [
      post
        ? 'CAPRA-S: PSA preoperatorio, Gleason patológico, margen, ECE, SVI y ganglios.'
        : 'CAPRA: edad, PSA, Gleason de biopsia, cT y proporción de cilindros positivos.',
      'La escala estratifica riesgo; no indica por sí sola un tratamiento.'
    ]
  });
}

function percentage(value: number, digits = 0): string {
  return `${value.toFixed(digits)}%`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
