import { booleanValue, defineCalculator, numberValue, result, stringValue } from './calculator.engine';
import { CalculatorOption, CalculatorValues } from './calculator.models';

const ECOG_DESCRIPTIONS: Readonly<Record<number, string>> = {
  0: 'Actividad plena, sin restricción.',
  1: 'Restricción para actividad física intensa; ambulatorio y capaz de trabajo liviano o sedentario.',
  2: 'Ambulatorio y capaz de autocuidado; no puede trabajar; en cama o silla menos del 50% del día.',
  3: 'Capaz de autocuidado limitado; en cama o silla más del 50% del día.',
  4: 'Completamente dependiente; confinado a cama o silla.',
  5: 'Fallecido.'
};

const KPS_DESCRIPTIONS: Readonly<Record<number, string>> = {
  100: 'Normal, sin síntomas ni signos de enfermedad.',
  90: 'Actividad normal; síntomas o signos mínimos.',
  80: 'Actividad normal con esfuerzo; algunos síntomas o signos.',
  70: 'Se cuida solo; no puede realizar actividad normal o trabajo activo.',
  60: 'Requiere ayuda ocasional, pero puede cubrir la mayoría de sus necesidades.',
  50: 'Requiere ayuda considerable y cuidados médicos frecuentes.',
  40: 'Incapacitado; requiere cuidados especiales.',
  30: 'Severamente incapacitado; internación indicada aunque no haya muerte inminente.',
  20: 'Muy enfermo; requiere internación y tratamiento de soporte activo.',
  10: 'Moribundo; proceso fatal progresivo.',
  0: 'Fallecido.'
};

const IPSS_FREQUENCY_OPTIONS: readonly CalculatorOption[] = [
  { value: '0', label: '0 · Nunca' },
  { value: '1', label: '1 · Menos de 1 de cada 5 veces' },
  { value: '2', label: '2 · Menos de la mitad de las veces' },
  { value: '3', label: '3 · Aproximadamente la mitad' },
  { value: '4', label: '4 · Más de la mitad de las veces' },
  { value: '5', label: '5 · Casi siempre' }
];

const IPSS_NOCTURIA_OPTIONS: readonly CalculatorOption[] = [
  { value: '0', label: '0 · Ninguna' },
  { value: '1', label: '1 · Una vez' },
  { value: '2', label: '2 · 2 veces' },
  { value: '3', label: '3 · 3 veces' },
  { value: '4', label: '4 · 4 veces' },
  { value: '5', label: '5 · Cinco o más veces' }
];

const SHIM_FREQUENCY_OPTIONS: readonly CalculatorOption[] = [
  { value: '1', label: '1 · Casi nunca o nunca' },
  { value: '2', label: '2 · Pocas veces' },
  { value: '3', label: '3 · A veces' },
  { value: '4', label: '4 · La mayoría de las veces' },
  { value: '5', label: '5 · Casi siempre o siempre' }
];

const SHIM_CONFIDENCE_OPTIONS: readonly CalculatorOption[] = [
  { value: '1', label: '1 · Muy baja' },
  { value: '2', label: '2 · Baja' },
  { value: '3', label: '3 · Moderada' },
  { value: '4', label: '4 · Alta' },
  { value: '5', label: '5 · Muy alta' }
];

const SHIM_DIFFICULTY_OPTIONS: readonly CalculatorOption[] = [
  { value: '1', label: '1 · Extremadamente difícil' },
  { value: '2', label: '2 · Muy difícil' },
  { value: '3', label: '3 · Difícil' },
  { value: '4', label: '4 · Algo difícil' },
  { value: '5', label: '5 · No fue difícil' }
];

export const ECOG_CALCULATOR = defineCalculator({
  id: 'ecog',
  title: 'ECOG / Karnofsky',
  category: 'general',
  subtitle: 'Estado funcional y aptitud basal.',
  source: 'ECOG, Karnofsky',
  clinicalUse: 'ECOG y Karnofsky describen el estado funcional basal: cuánto puede moverse, cuidarse y sostener actividad cotidiana. Se usan para documentar performance status, definir elegibilidad en ensayos/tratamientos y anticipar tolerancia clínica.',
  fields: [
    {
      id: 'ecog', kind: 'select', label: 'ECOG', required: true, initialValue: '', exampleValue: '1',
      options: [0, 1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: `ECOG ${value}` }))
    },
    {
      id: 'kps', kind: 'select', label: 'Karnofsky', required: true, initialValue: '', exampleValue: '80',
      options: [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0]
        .map((value) => ({ value: String(value), label: `${value}%` }))
    }
  ],
  calculate(values) {
    const ecog = numberValue(values, 'ecog');
    const kps = numberValue(values, 'kps');
    return result({
      title: 'ECOG y Karnofsky',
      detail: 'Son dos escalas distintas de estado funcional. Usá la que corresponda al protocolo, historia clínica o reporte que estés completando.',
      badge: 'escalas separadas',
      score: 0,
      scoreName: 'Señal integrada',
      showScore: false,
      severity: 'info',
      metrics: [
        { label: `ECOG ${ecog}`, value: ECOG_DESCRIPTIONS[ecog] ?? 'Seleccioná un valor ECOG.' },
        { label: `Karnofsky ${kps}%`, value: KPS_DESCRIPTIONS[kps] ?? 'Seleccioná un valor Karnofsky.' }
      ],
      notes: [
        'ECOG se usa mucho en oncología clínica y ensayos para definir performance status y elegibilidad terapéutica.',
        'Karnofsky ofrece una escala porcentual más granular para funcionalidad, dependencia y necesidad de asistencia.',
        'No se cruzan ni se convierten entre sí: registrar la escala usada y su valor exacto.'
      ]
    });
  }
});

export const CHARLSON_CALCULATOR = defineCalculator({
  id: 'charlson',
  title: 'Charlson comorbidity index',
  category: 'general',
  subtitle: 'Carga comórbida ajustada por edad.',
  source: 'Charlson Comorbidity Index',
  clinicalUse: 'Charlson mide carga de comorbilidad y la ajusta por edad para estimar riesgo de mortalidad atribuible a enfermedades no oncológicas. En uro-oncología ayuda a ponderar expectativa de vida, intensidad terapéutica, riesgo perioperatorio global y pertinencia de tratamientos con beneficio a largo plazo.',
  fields: [
    { id: 'age', kind: 'number', label: 'Edad', required: true, initialValue: '', exampleValue: 68, min: 18, max: 100, wide: true },
    checkbox('mi', 'Infarto previo', 1),
    checkbox('chf', 'Insuficiencia cardíaca', 1),
    checkbox('pvd', 'Enfermedad vascular periférica', 1),
    checkbox('cva', 'Enfermedad cerebrovascular', 1),
    checkbox('dementia', 'Demencia', 1),
    checkbox('copd', 'EPOC', 1),
    checkbox('connective', 'Enfermedad del tejido conectivo', 1),
    checkbox('ulcer', 'Enfermedad ulcerosa', 1),
    checkbox('liverMild', 'Hepatopatía leve', 1),
    checkbox('liverSevere', 'Hepatopatía moderada/severa', 3),
    checkbox('diabetes', 'Diabetes sin daño de órgano', 1),
    checkbox('diabetesComplicated', 'Diabetes con daño de órgano', 2),
    checkbox('hemiplegia', 'Hemiplejia', 2),
    checkbox('renal', 'Enfermedad renal moderada/severa', 2),
    checkbox('solidTumor', 'Tumor sólido', 2),
    checkbox('metastaticTumor', 'Tumor sólido metastásico', 6),
    checkbox('leukemia', 'Leucemia', 2),
    checkbox('lymphoma', 'Linfoma', 2),
    checkbox('aids', 'SIDA', 6)
  ],
  calculate(values) {
    const calculated = charlson(values);
    return result({
      title: `CCI ajustado: ${calculated.total}`,
      detail: `Comorbilidad ${calculated.comorbidityPoints} + edad ${calculated.agePoints}.`,
      badge: 'CCI ajustado por edad',
      score: 0,
      scoreName: 'Señal integrada',
      showScore: false,
      severity: 'info',
      metrics: [
        { label: 'CCI ajustado', value: calculated.total },
        { label: 'Comorbilidad', value: calculated.comorbidityPoints },
        { label: 'Edad', value: calculated.agePoints }
      ],
      notes: [
        'Las categorías excluyentes —diabetes, hepatopatía y tumor sólido— no se suman dos veces.',
        'Definir antes del cálculo si el tumor índice se incluye o se excluye y documentar ese criterio.',
        'Se retiró la conversión histórica a supervivencia de 10 años porque no está calibrada para oncología contemporánea.'
      ]
    });
  }
});

export const G8_CARG_CALCULATOR = defineCalculator({
  id: 'g8-carg',
  title: 'G8 / CARG',
  category: 'general',
  subtitle: 'Screening geriátrico y toxicidad de quimioterapia.',
  source: 'G8, CARG toxicity score',
  clinicalUse: 'G8 y CARG son complementarias en adultos mayores con cáncer. G8 es un screening geriátrico rápido: si está alterado, sugiere vulnerabilidad y necesidad de evaluación geriátrica integral. CARG estima riesgo de toxicidad severa por quimioterapia usando factores del paciente, laboratorio, función y características del tratamiento.',
  fields: [
    section('g8_section', 'G8 screening geriátrico', 'Completá los 8 ítems. Total máximo 17; menor puntaje indica mayor vulnerabilidad. Un total ≤14 suele considerarse alterado.'),
    select('g8_food', 'Ingesta alimentaria en 3 meses', '2', [
      ['0', 'Disminución severa'], ['1', 'Disminución moderada'], ['2', 'Sin disminución']
    ]),
    select('g8_weight', 'Pérdida de peso en 3 meses', '3', [
      ['0', '>3 kg'], ['1', 'No sabe'], ['2', '1-3 kg'], ['3', 'Sin pérdida']
    ]),
    select('g8_mobility', 'Movilidad', '2', [
      ['0', 'Cama/silla'], ['1', 'Se levanta, no sale'], ['2', 'Sale del domicilio']
    ]),
    select('g8_neuro', 'Neuropsicológico', '2', [
      ['0', 'Demencia/depresión severa'], ['1', 'Demencia/depresión leve'], ['2', 'Sin problemas']
    ]),
    select('g8_bmi', 'Índice de masa corporal', '3', [
      ['0', '<19'], ['1', '19 a <21'], ['2', '21 a <23'], ['3', '≥23']
    ]),
    select('g8_meds', 'Más de 3 fármacos diarios', '1', [['0', 'Sí'], ['1', 'No']]),
    select('g8_health', 'Salud vs pares de edad', '1', [
      ['0', 'Peor'], ['0.5', 'No sabe'], ['1', 'Igual'], ['2', 'Mejor']
    ]),
    select('g8_age', 'Edad', '2', [['0', '>85 años'], ['1', '80-85 años'], ['2', '<80 años']]),
    section('carg_section', 'CARG toxicidad por quimioterapia', 'Marcá los factores presentes. Total máximo 23; bajo 0-5, intermedio 6-9, alto ≥10.'),
    checkbox('carg_age72', 'Edad ≥72 años', 2),
    checkbox('carg_gigu', 'Tumor gastrointestinal o genitourinario', 2),
    checkbox('carg_standard', 'Quimioterapia a dosis estándar', 2),
    checkbox('carg_poly', 'Poliquimioterapia', 2),
    checkbox('carg_hb', 'Hemoglobina baja según sexo', 3),
    checkbox('carg_crcl', 'Clearance de creatinina <34 ml/min', 3),
    checkbox('carg_hearing', 'Audición regular o mala', 2),
    checkbox('carg_falls', 'Caídas en los últimos 6 meses', 3),
    checkbox('carg_meds_help', 'Necesita ayuda para tomar medicación', 1),
    checkbox('carg_walk', 'Limitación para caminar una cuadra', 2),
    checkbox('carg_social', 'Actividad social limitada por salud', 1)
  ],
  calculate(values) {
    const g8Result = g8(values);
    const cargResult = carg(values);
    return result({
      title: `${g8Result.altered ? 'G8 alterado' : 'G8 conservado'} · CARG ${cargResult.category}`,
      detail: 'G8 y CARG se informan por separado: no existe un puntaje combinado validado.',
      badge: g8Result.altered ? 'evaluación geriátrica' : cargResult.category,
      score: 0,
      scoreName: 'Señal integrada',
      showScore: false,
      severity: g8Result.altered || cargResult.category === 'alto'
        ? 'bad' : cargResult.category === 'intermedio' ? 'warn' : 'good',
      metrics: [
        { label: 'G8 total', value: `${g8Result.total.toFixed(1)} / 17` },
        { label: 'Lectura G8', value: g8Result.altered ? 'screening alterado' : 'screening conservado' },
        { label: 'CARG total', value: cargResult.total },
        { label: 'Toxicidad G3-5', value: `${cargResult.toxicity}% (cohorte original)` }
      ],
      notes: [
        'G8 no mide toxicidad de quimioterapia: identifica vulnerabilidad geriátrica y necesidad de evaluación más completa.',
        'CARG no mide fragilidad global: estima probabilidad de toxicidad severa con quimioterapia.',
        'Si G8 está alterado o CARG es alto, considerar geriatría, soporte, ajuste de esquema/dosis o alternativa terapéutica.'
      ]
    });
  }
});

export const IPSS_SHIM_CALCULATOR = defineCalculator({
  id: 'ipss-shim',
  title: 'IPSS / SHIM',
  category: 'prostata',
  subtitle: 'Síntomas urinarios y función sexual basal.',
  source: 'IPSS, SHIM, EPIC-26 como complemento',
  clinicalUse: 'IPSS cuantifica síntomas urinarios bajos y su impacto en calidad de vida; es útil antes de cirugía, radioterapia, braquiterapia o vigilancia para documentar basal y anticipar toxicidad urinaria. SHIM evalúa función eréctil basal y ayuda a discutir efectos esperados de cirugía, radioterapia, hormonoterapia y preservación funcional.',
  fields: [
    section('ipss_section', 'IPSS síntomas urinarios', 'Cada ítem va de 0 a 5 según frecuencia. Total 0-35: leve 0-7, moderado 8-19, severo 20-35.'),
    selectWithOptions('ipss_emptying', 'Vaciado incompleto', '1', IPSS_FREQUENCY_OPTIONS),
    selectWithOptions('ipss_frequency', 'Frecuencia', '1', IPSS_FREQUENCY_OPTIONS),
    selectWithOptions('ipss_intermittency', 'Intermitencia', '1', IPSS_FREQUENCY_OPTIONS),
    selectWithOptions('ipss_urgency', 'Urgencia', '1', IPSS_FREQUENCY_OPTIONS),
    selectWithOptions('ipss_stream', 'Chorro débil', '1', IPSS_FREQUENCY_OPTIONS),
    selectWithOptions('ipss_straining', 'Esfuerzo miccional', '1', IPSS_FREQUENCY_OPTIONS),
    selectWithOptions('ipss_nocturia', 'Nocturia', '2', IPSS_NOCTURIA_OPTIONS),
    {
      ...selectWithOptions('ipss_qol', 'Calidad de vida urinaria', '2', [
        { value: '0', label: '0 encantado' }, { value: '1', label: '1 satisfecho' },
        { value: '2', label: '2 mayormente satisfecho' }, { value: '3', label: '3 mixto' },
        { value: '4', label: '4 mayormente insatisfecho' }, { value: '5', label: '5 infeliz' },
        { value: '6', label: '6 terrible' }
      ]),
      wide: true
    },
    section('shim_section', 'SHIM función eréctil', 'Cada ítem va de 1 a 5. Total 5-25; menor puntaje indica mayor disfunción eréctil. Si no hubo actividad sexual suficiente, registrar no evaluable fuera de la escala.'),
    {
      id: 'shim_not_evaluable', kind: 'checkbox',
      label: 'Sin actividad sexual suficiente en los últimos 6 meses', required: false, initialValue: false,
      help: 'SHIM no genera un puntaje válido en este contexto.'
    },
    selectWithOptions('shim_confidence', 'Confianza para lograr/mantener erección', '4', SHIM_CONFIDENCE_OPTIONS),
    selectWithOptions('shim_hardness', 'Erección suficiente para penetración', '4', SHIM_FREQUENCY_OPTIONS),
    selectWithOptions('shim_maintenance', 'Mantener erección luego de penetrar', '4', SHIM_FREQUENCY_OPTIONS),
    selectWithOptions('shim_completion', 'Dificultad para mantenerla hasta completar', '3', SHIM_DIFFICULTY_OPTIONS),
    selectWithOptions('shim_satisfaction', 'Relaciones sexuales satisfactorias', '3', SHIM_FREQUENCY_OPTIONS)
  ],
  isFieldValidationActive(fieldId, values) {
    return !fieldId.startsWith('shim_') || fieldId === 'shim_not_evaluable'
      || !booleanValue(values, 'shim_not_evaluable');
  },
  calculate(values) {
    const ipssKeys = [
      'ipss_emptying', 'ipss_frequency', 'ipss_intermittency', 'ipss_urgency',
      'ipss_stream', 'ipss_straining', 'ipss_nocturia'
    ];
    const shimKeys = ['shim_confidence', 'shim_hardness', 'shim_maintenance', 'shim_completion', 'shim_satisfaction'];
    const ipssResult = ipss(ipssKeys.map((key) => stringValue(values, key)));
    const shimResult = booleanValue(values, 'shim_not_evaluable')
      ? null : shim(shimKeys.map((key) => stringValue(values, key)));
    const ipssTotal = ipssResult.total;
    const shimTotal = shimResult?.total;
    const ipssLabel = ipssResult.category;
    const shimLabel = shimResult?.category ?? 'no evaluable';
    return result({
      title: `IPSS ${ipssTotal} (${ipssLabel})`,
      detail: `QoL urinaria ${stringValue(values, 'ipss_qol')}/6. ${shimResult
        ? `SHIM ${shimTotal}: ${shimLabel}.`
        : 'SHIM no evaluable por ausencia de actividad sexual suficiente.'}`,
      badge: ipssLabel,
      score: clamp(ipssTotal / 35 * 100),
      scoreName: 'Carga de síntomas urinarios',
      showScore: true,
      severity: ipssTotal <= 7 ? 'good' : ipssTotal <= 19 ? 'warn' : 'bad',
      metrics: [
        { label: 'IPSS total', value: `${ipssTotal} / 35` },
        { label: 'Severidad IPSS', value: ipssLabel },
        { label: 'QoL urinaria', value: `${stringValue(values, 'ipss_qol')} / 6` },
        { label: 'SHIM total', value: shimResult ? `${shimTotal} / 25` : 'no evaluable' },
        { label: 'Lectura SHIM', value: shimLabel }
      ],
      notes: [
        'IPSS alto antes de RT, braquiterapia o cirugía requiere optimización urinaria y discusión de toxicidad.',
        'SHIM bajo documenta función sexual basal y ayuda a anticipar recuperación o preservación funcional.',
        'EPIC-26 completo es mejor para calidad de vida multidominio cuando se necesita evaluación más amplia.'
      ]
    });
  }
});

export const LEGACY_CALCULATORS_04_07 = [
  ECOG_CALCULATOR,
  CHARLSON_CALCULATOR,
  G8_CARG_CALCULATOR,
  IPSS_SHIM_CALCULATOR
] as const;

function checkbox(id: string, label: string, weight?: number) {
  return { id, kind: 'checkbox' as const, label, required: false as const, initialValue: false, weight };
}

function section(id: string, label: string, help: string) {
  return { id, kind: 'section' as const, label, required: false as const, initialValue: '' as const, wide: true, help };
}

function select(id: string, label: string, exampleValue: string, options: readonly (readonly [string, string])[]) {
  return selectWithOptions(id, label, exampleValue, options.map(([value, optionLabel]) => ({ value, label: optionLabel })));
}

function selectWithOptions(id: string, label: string, exampleValue: string, options: readonly CalculatorOption[]) {
  return { id, kind: 'select' as const, label, required: true as const, initialValue: '' as const, exampleValue, options };
}

function charlson(values: CalculatorValues): { readonly total: number; readonly comorbidityPoints: number; readonly agePoints: number } {
  let comorbidityPoints = 0;
  const add = (id: string, weight: number): void => { if (booleanValue(values, id)) comorbidityPoints += weight; };
  for (const [id, weight] of [
    ['mi', 1], ['chf', 1], ['pvd', 1], ['cva', 1], ['dementia', 1], ['copd', 1],
    ['connective', 1], ['ulcer', 1]
  ] as const) add(id, weight);
  if (booleanValue(values, 'liverSevere')) comorbidityPoints += 3;
  else add('liverMild', 1);
  if (booleanValue(values, 'diabetesComplicated')) comorbidityPoints += 2;
  else add('diabetes', 1);
  add('hemiplegia', 2);
  add('renal', 2);
  if (booleanValue(values, 'metastaticTumor')) comorbidityPoints += 6;
  else add('solidTumor', 2);
  add('leukemia', 2);
  add('lymphoma', 2);
  add('aids', 6);
  const age = numberValue(values, 'age');
  const agePoints = age >= 80 ? 4 : age >= 70 ? 3 : age >= 60 ? 2 : age >= 50 ? 1 : 0;
  return { total: comorbidityPoints + agePoints, comorbidityPoints, agePoints };
}

function g8(values: CalculatorValues): { readonly total: number; readonly altered: boolean } {
  const total = ['g8_food', 'g8_weight', 'g8_mobility', 'g8_neuro', 'g8_bmi', 'g8_meds', 'g8_health', 'g8_age']
    .reduce((sum, id) => sum + numberValue(values, id), 0);
  return { total, altered: total <= 14 };
}

function carg(values: CalculatorValues): { readonly total: number; readonly category: string; readonly toxicity: number } {
  const weighted = [
    ['carg_age72', 2], ['carg_gigu', 2], ['carg_standard', 2], ['carg_poly', 2],
    ['carg_hb', 3], ['carg_crcl', 3], ['carg_hearing', 2], ['carg_falls', 3],
    ['carg_meds_help', 1], ['carg_walk', 2], ['carg_social', 1]
  ] as const;
  const total = weighted.reduce((sum, [id, weight]) => sum + (booleanValue(values, id) ? weight : 0), 0);
  const category = total <= 5 ? 'bajo' : total <= 9 ? 'intermedio' : 'alto';
  return { total, category, toxicity: category === 'bajo' ? 30 : category === 'intermedio' ? 52 : 83 };
}

function ipss(values: readonly string[]): { readonly total: number; readonly category: string } {
  const total = values.reduce((sum, value) => sum + Number(value), 0);
  return { total, category: total === 0 ? 'asintomático' : total <= 7 ? 'leve' : total <= 19 ? 'moderado' : 'severo' };
}

function shim(values: readonly string[]): { readonly total: number; readonly category: string } {
  const total = values.reduce((sum, value) => sum + Number(value), 0);
  const category = total >= 22 ? 'sin disfuncion erectil significativa'
    : total >= 17 ? 'disfuncion leve'
      : total >= 12 ? 'disfuncion leve-moderada'
        : total >= 8 ? 'disfuncion moderada' : 'disfuncion severa';
  return { total, category };
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}
