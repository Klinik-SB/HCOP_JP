import {
  booleanValue,
  checklistNote,
  defineCalculator,
  externalLink,
  numberValue,
  result,
  stringValue,
  tableNote
} from './calculator.engine';
import {
  CalculatorField,
  CalculatorOption,
  CalculatorResult,
  CalculatorValues
} from './calculator.models';

type MskccScenario = 'pre' | 'post' | 'salvage' | 'biopsy' | 'psadt' | 'life' | 'volume';
type ChecklistEntry = readonly [id: string, label: string];

interface MskccNomogram {
  readonly label: string;
  readonly href: string;
  readonly question: string;
  readonly required: readonly ChecklistEntry[];
  readonly optional?: readonly ChecklistEntry[];
}

const CLINICAL_T_OPTIONS: readonly CalculatorOption[] = [
  option('t1', 'cT1'),
  option('t2a', 'cT2a'),
  option('t2b', 'cT2b'),
  option('t2c', 'cT2c'),
  option('t3', 'cT3'),
  option('t4', 'cT4')
];
const YES_NO_OPTIONS = [option('no', 'No'), option('yes', 'Si')];
const YES_NO_UNSURE_OPTIONS = [...YES_NO_OPTIONS, option('unsure', 'No seguro')];
const GLEASON_PATTERN_OPTIONS = [3, 4, 5].map((value) => option(String(value), 'Patron ' + value));
const GLEASON_GRADE_OPTIONS = [
  option('6', 'Gleason 6 / GG1'),
  option('3+4', 'Gleason 3+4 / GG2'),
  option('4+3', 'Gleason 4+3 / GG3'),
  option('8', 'Gleason 8 / GG4'),
  option('9', 'Gleason 9-10 / GG5')
];

const MSKCC_SCENARIO_ORDER: readonly MskccScenario[] = [
  'pre', 'post', 'salvage', 'biopsy', 'psadt', 'life', 'volume'
];

const MSKCC_PROSTATE_NOMOGRAMS: Readonly<Record<MskccScenario, MskccNomogram>> = {
  pre: {
    label: 'Pre-prostatectomia radical',
    href: 'https://www.mskcc.org/nomograms/prostate/pre_op',
    question: 'Cancer de prostata diagnosticado y sin tratamiento iniciado; estima extension y resultados luego de prostatectomia radical.',
    required: [
      ['msk_pre_no_hormone', 'Hormonoterapia perioperatoria: documentar si/no'],
      ['msk_pre_no_radiation', 'Radioterapia perioperatoria: documentar si/no'],
      ['msk_pre_age', 'Edad'],
      ['msk_pre_psa', 'PSA previo a la biopsia que diagnostico el cancer'],
      ['msk_pre_gleason_primary', 'Patron Gleason primario en biopsia'],
      ['msk_pre_gleason_secondary', 'Patron Gleason secundario en biopsia'],
      ['msk_pre_stage', 'Estadio clinico T por tacto rectal, AJCC 7/2010']
    ],
    optional: [
      ['msk_pre_positive_cores', 'Numero de cilindros positivos'],
      ['msk_pre_negative_cores', 'Numero de cilindros negativos']
    ]
  },
  post: {
    label: 'Post-prostatectomia radical',
    href: 'https://www.mskcc.org/nomograms/prostate/post_op',
    question: 'Luego de prostatectomia radical, con PSA indetectable; estima probabilidad de permanecer libre de recurrencia.',
    required: [
      ['msk_post_no_hormone', 'Hormonoterapia recibida o planificada: documentar si/no'],
      ['msk_post_no_radiation', 'Radioterapia recibida o planificada: documentar si/no'],
      ['msk_post_preop_psa', 'PSA preoperatorio'],
      ['msk_post_age_surgery', 'Edad al momento de la cirugia'],
      ['msk_post_months_undetectable', 'Meses desde cirugia sin PSA detectable ni ascenso'],
      ['msk_post_gleason_primary', 'Patron Gleason primario en pieza'],
      ['msk_post_gleason_secondary', 'Patron Gleason secundario en pieza'],
      ['msk_post_margins', 'Margenes quirurgicos positivos: si/no'],
      ['msk_post_ece', 'Extension extracapsular: si/no'],
      ['msk_post_svi', 'Invasion de vesiculas seminales: si/no'],
      ['msk_post_nodes', 'Ganglios pelvicos positivos: si/no']
    ],
    optional: [
      ['msk_post_clinical_stage', 'Estadio clinico T preoperatorio'],
      ['msk_post_biopsy_gleason_primary', 'Patron Gleason primario en biopsia'],
      ['msk_post_biopsy_gleason_secondary', 'Patron Gleason secundario en biopsia']
    ]
  },
  salvage: {
    label: 'PSA en ascenso post-prostatectomia',
    href: 'https://www.mskcc.org/nomograms/prostate/biochemical_recurrence',
    question: 'Recaida bioquimica luego de prostatectomia radical; estima riesgo de muerte por cancer de prostata desde el inicio del ascenso de PSA.',
    required: [
      ['msk_salvage_no_preop_hormone', 'Hormonoterapia pre-RP: documentar si/no'],
      ['msk_salvage_no_preop_radiation', 'Radioterapia pre-RP: documentar si/no'],
      ['msk_salvage_no_postop_hormone', 'Hormonoterapia post-RP antes del ascenso de PSA: documentar si/no'],
      ['msk_salvage_no_postop_radiation', 'Radioterapia post-RP antes del ascenso de PSA: documentar si/no'],
      ['msk_salvage_preop_psa', 'PSA preoperatorio'],
      ['msk_salvage_ece', 'Extension extracapsular en pieza: si/no'],
      ['msk_salvage_nodes', 'Ganglios pelvicos positivos: si/no'],
      ['msk_salvage_svi', 'Invasion de vesiculas seminales: si/no'],
      ['msk_salvage_gleason_primary', 'Patron Gleason primario en pieza'],
      ['msk_salvage_gleason_secondary', 'Patron Gleason secundario en pieza'],
      ['msk_salvage_margins', 'Margenes positivos: si/no'],
      ['msk_salvage_age_bcr', 'Edad al detectar recaida bioquimica'],
      ['msk_salvage_months_to_bcr', 'Meses desde cirugia hasta recaida bioquimica'],
      ['msk_salvage_psa_bcr', 'PSA al momento de recaida bioquimica']
    ],
    optional: [['msk_salvage_psadt', 'PSA doubling time en meses']]
  },
  biopsy: {
    label: 'Riesgo de cancer de alto grado en biopsia',
    href: 'https://www.mskcc.org/nomograms/prostate/biopsy_risk_dynamic',
    question: 'Hombre evaluado por urologo y considerado candidato a biopsia; estima probabilidad de cancer de alto grado.',
    required: [
      ['msk_biopsy_psa', 'PSA mas reciente'],
      ['msk_biopsy_age', 'Edad'],
      ['msk_biopsy_african_ancestry', 'Ascendencia africana: si/no'],
      ['msk_biopsy_dre', 'Tacto rectal sospechoso: si/no/no seguro'],
      ['msk_biopsy_prior_negative', 'Biopsia previa negativa: si/no/no seguro'],
      ['msk_biopsy_family', 'Familiar de primer grado con cancer de prostata: si/no/no seguro']
    ]
  },
  psadt: {
    label: 'PSA doubling time',
    href: 'https://www.mskcc.org/nomograms/prostate/psa_doubling_time',
    question: 'Calcula velocidad de ascenso del PSA y tiempo de duplicacion a partir de valores seriados con fecha.',
    required: [
      ['msk_psadt_dates', 'Fechas de cada laboratorio en formato mes/dia/anio'],
      ['msk_psadt_values', 'Valores de PSA correspondientes, uno por fecha'],
      ['msk_psadt_minimum_series', 'Al menos dos mediciones comparables; idealmente tres o mas']
    ]
  },
  life: {
    label: 'Expectativa de vida masculina',
    href: 'https://www.mskcc.org/nomograms/prostate/male_life_expectancy',
    question: 'Antes de tratamiento, integra cancer de prostata y salud general para discutir beneficio esperado y riesgo competitivo a 15 anios.',
    required: [
      ['msk_life_no_hormone', 'Hormonoterapia recibida o planificada: documentar si/no'],
      ['msk_life_no_radiation', 'Radioterapia recibida o planificada: documentar si/no'],
      ['msk_life_age', 'Edad'],
      ['msk_life_psa', 'PSA mas reciente'],
      ['msk_life_grade', 'Grado/Gleason: 6, 3+4, 4+3, 8, 9 o 10'],
      ['msk_life_t_stage', 'Estadio T clinico'],
      ['msk_life_m_stage', 'Estadio M: M0 o M1'],
      ['msk_life_angina', 'Angina/dolor toracico: si/no'],
      ['msk_life_mi', 'Infarto: si/no'],
      ['msk_life_chf', 'Insuficiencia cardiaca: si/no'],
      ['msk_life_valve', 'Valvulopatia significativa: si/no'],
      ['msk_life_afib', 'Fibrilacion auricular/arritmia: si/no'],
      ['msk_life_aaa', 'Aneurisma de aorta abdominal: si/no'],
      ['msk_life_diabetes', 'Diabetes: si/no'],
      ['msk_life_diabetes_duration', 'Duracion de diabetes si corresponde'],
      ['msk_life_pvd', 'Enfermedad vascular periferica/claudicacion: si/no'],
      ['msk_life_dvt', 'Trombosis venosa profunda: si/no'],
      ['msk_life_pe', 'Tromboembolismo pulmonar: si/no'],
      ['msk_life_tia', 'TIA/ministroke: si/no'],
      ['msk_life_stroke', 'ACV: si/no'],
      ['msk_life_stroke_type', 'Tipo de ACV si corresponde: hemorragia/coagulo/no seguro'],
      ['msk_life_asthma', 'Asma: si/no'],
      ['msk_life_asthma_impact', 'Impacto funcional del asma si corresponde'],
      ['msk_life_total_cholesterol', 'Colesterol total o categoria'],
      ['msk_life_hdl', 'HDL o categoria'],
      ['msk_life_systolic_bp', 'Presion sistolica o categoria'],
      ['msk_life_diastolic_bp', 'Presion diastolica o categoria'],
      ['msk_life_smoking_ever', 'Antecedente de >100 cigarrillos en la vida: si/no'],
      ['msk_life_smoking_current', 'Fumo en los ultimos 30 dias: si/no']
    ]
  },
  volume: {
    label: 'Volumen, dimensiones y densidad',
    href: 'https://www.mskcc.org/nomograms/prostate/volume',
    question: 'Calcula volumen prostatico y densidad de PSA a partir de medidas glandulares y PSA.',
    required: [
      ['msk_volume_length', 'Longitud prostatica en cm'],
      ['msk_volume_width', 'Ancho/transverso prostatico en cm'],
      ['msk_volume_height', 'Altura prostatica en cm'],
      ['msk_volume_psa', 'PSA antes de hormonoterapia']
    ]
  }
};

const MSKCC_INPUT_FIELDS: Readonly<Record<MskccScenario, readonly CalculatorField[]>> = {
  pre: [
    selectField('msk_pre_no_hormone', 'Hormonoterapia perioperatoria', 'no', YES_NO_OPTIONS,
      { help: 'MSKCC pregunta si recibio o recibira hormonoterapia alrededor de la cirugia.' }),
    selectField('msk_pre_no_radiation', 'Radioterapia perioperatoria', 'no', YES_NO_OPTIONS,
      { help: 'MSKCC pregunta si recibio o recibira radioterapia alrededor de la cirugia.' }),
    numberField('msk_pre_age', 'Edad', 65, { min: 35, max: 95 }),
    numberField('msk_pre_psa', 'PSA pre-biopsia', 8, { min: 0.01, step: 0.1 }),
    selectField('msk_pre_gleason_primary', 'Gleason primario biopsia', '3', GLEASON_PATTERN_OPTIONS),
    selectField('msk_pre_gleason_secondary', 'Gleason secundario biopsia', '4', GLEASON_PATTERN_OPTIONS),
    selectField('msk_pre_stage', 'Estadio clinico T', 't2a', CLINICAL_T_OPTIONS),
    numberField('msk_pre_positive_cores', 'Cilindros positivos', 3, { min: 0 }),
    numberField('msk_pre_negative_cores', 'Cilindros negativos', 9, { min: 0 })
  ],
  post: [
    selectField('msk_post_no_hormone', 'Hormonoterapia recibida o planificada', 'no', YES_NO_OPTIONS),
    selectField('msk_post_no_radiation', 'Radioterapia recibida o planificada', 'no', YES_NO_OPTIONS),
    numberField('msk_post_preop_psa', 'PSA preoperatorio', 8, { min: 0.01, step: 0.1 }),
    numberField('msk_post_age_surgery', 'Edad al momento de cirugia', 65, { min: 35, max: 95 }),
    numberField('msk_post_months_undetectable', 'Meses con PSA indetectable', 6, { min: 0, step: 1 }),
    selectField('msk_post_gleason_primary', 'Gleason primario en pieza', '3', GLEASON_PATTERN_OPTIONS),
    selectField('msk_post_gleason_secondary', 'Gleason secundario en pieza', '4', GLEASON_PATTERN_OPTIONS),
    selectField('msk_post_margins', 'Margenes positivos', 'no', YES_NO_OPTIONS),
    selectField('msk_post_ece', 'Extension extracapsular', 'no', YES_NO_OPTIONS),
    selectField('msk_post_svi', 'Invasion vesiculas seminales', 'no', YES_NO_OPTIONS),
    selectField('msk_post_nodes', 'Ganglios pelvicos positivos', 'no', YES_NO_OPTIONS),
    selectField('msk_post_clinical_stage', 'Estadio clinico T preoperatorio', 't2a', CLINICAL_T_OPTIONS),
    selectField('msk_post_biopsy_gleason_primary', 'Gleason primario biopsia', '3', GLEASON_PATTERN_OPTIONS),
    selectField('msk_post_biopsy_gleason_secondary', 'Gleason secundario biopsia', '4', GLEASON_PATTERN_OPTIONS)
  ],
  salvage: [
    selectField('msk_salvage_no_preop_hormone', 'Hormonoterapia pre-RP', 'no', YES_NO_OPTIONS),
    selectField('msk_salvage_no_preop_radiation', 'Radioterapia pre-RP', 'no', YES_NO_OPTIONS),
    selectField('msk_salvage_no_postop_hormone', 'Hormonoterapia post-RP antes del ascenso PSA', 'no', YES_NO_OPTIONS),
    selectField('msk_salvage_no_postop_radiation', 'Radioterapia post-RP antes del ascenso PSA', 'no', YES_NO_OPTIONS),
    numberField('msk_salvage_preop_psa', 'PSA preoperatorio', 8, { min: 0.01, step: 0.1 }),
    selectField('msk_salvage_ece', 'Extension extracapsular', 'no', YES_NO_OPTIONS),
    selectField('msk_salvage_nodes', 'Ganglios positivos', 'no', YES_NO_OPTIONS),
    selectField('msk_salvage_svi', 'Vesiculas seminales invadidas', 'no', YES_NO_OPTIONS),
    selectField('msk_salvage_gleason_primary', 'Gleason primario pieza', '4', GLEASON_PATTERN_OPTIONS),
    selectField('msk_salvage_gleason_secondary', 'Gleason secundario pieza', '3', GLEASON_PATTERN_OPTIONS),
    selectField('msk_salvage_margins', 'Margenes positivos', 'yes', YES_NO_OPTIONS),
    numberField('msk_salvage_age_bcr', 'Edad al detectar BCR', 68, { min: 35, max: 100 }),
    numberField('msk_salvage_months_to_bcr', 'Meses desde RP hasta BCR', 36, { min: 0, step: 1 }),
    numberField('msk_salvage_psa_bcr', 'PSA al momento de BCR', 0.4, { min: 0.01, step: 0.01 }),
    numberField('msk_salvage_psadt', 'PSA doubling time meses', 10, { min: 0.1, step: 0.1 })
  ],
  biopsy: [
    numberField('msk_biopsy_psa', 'PSA mas reciente', 7, { min: 0.01, step: 0.1 }),
    numberField('msk_biopsy_age', 'Edad', 65, { min: 35, max: 100 }),
    selectField('msk_biopsy_african_ancestry', 'Ascendencia africana', 'no', YES_NO_OPTIONS),
    selectField('msk_biopsy_dre', 'Tacto rectal sospechoso', 'no', YES_NO_UNSURE_OPTIONS),
    selectField('msk_biopsy_prior_negative', 'Biopsia previa negativa', 'no', YES_NO_UNSURE_OPTIONS),
    selectField('msk_biopsy_family', 'Familiar de primer grado con cancer de prostata', 'no', YES_NO_UNSURE_OPTIONS)
  ],
  psadt: [
    textField('msk_psadt_dates', 'Fechas de PSA', '01/01/2025, 01/01/2026',
      { wide: true, help: 'Formato libre separado por comas. Se conserva para copiar al MSKCC oficial.' }),
    textField('msk_psadt_values', 'Valores de PSA', '2.5, 5.0',
      { wide: true, help: 'Valores separados por comas en el mismo orden que las fechas.' }),
    selectField('msk_psadt_minimum_series', 'Cantidad de mediciones comparables', '2', [
      option('2', '2 mediciones'), option('3', '3 o mas mediciones')
    ]),
    numberField('msk_psadt_month_span', 'Meses entre primer y ultimo PSA', 12, { min: 0.1, step: 0.1 })
  ],
  life: [
    selectField('msk_life_no_hormone', 'Hormonoterapia recibida o planificada', 'no', YES_NO_OPTIONS),
    selectField('msk_life_no_radiation', 'Radioterapia recibida o planificada', 'no', YES_NO_OPTIONS),
    numberField('msk_life_age', 'Edad', 72, { min: 35, max: 100 }),
    numberField('msk_life_psa', 'PSA mas reciente', 8, { min: 0.01, step: 0.1 }),
    selectField('msk_life_grade', 'Grado/Gleason', '3+4', GLEASON_GRADE_OPTIONS),
    selectField('msk_life_t_stage', 'Estadio T clinico', 't2a', CLINICAL_T_OPTIONS),
    selectField('msk_life_m_stage', 'Estadio M', 'm0', [option('m0', 'M0'), option('m1', 'M1')]),
    selectField('msk_life_angina', 'Angina/dolor toracico', 'no', YES_NO_OPTIONS),
    selectField('msk_life_mi', 'Infarto', 'no', YES_NO_OPTIONS),
    selectField('msk_life_chf', 'Insuficiencia cardiaca', 'no', YES_NO_OPTIONS),
    selectField('msk_life_valve', 'Valvulopatia significativa', 'no', YES_NO_OPTIONS),
    selectField('msk_life_afib', 'Fibrilacion auricular/arritmia', 'no', YES_NO_OPTIONS),
    selectField('msk_life_aaa', 'Aneurisma aorta abdominal', 'no', YES_NO_OPTIONS),
    selectField('msk_life_diabetes', 'Diabetes', 'no', YES_NO_OPTIONS),
    numberField('msk_life_diabetes_duration', 'Duracion diabetes en anios', 0, { min: 0, step: 1 }),
    selectField('msk_life_pvd', 'Enfermedad vascular periferica', 'no', YES_NO_OPTIONS),
    selectField('msk_life_dvt', 'Trombosis venosa profunda', 'no', YES_NO_OPTIONS),
    selectField('msk_life_pe', 'Tromboembolismo pulmonar', 'no', YES_NO_OPTIONS),
    selectField('msk_life_tia', 'TIA/ministroke', 'no', YES_NO_OPTIONS),
    selectField('msk_life_stroke', 'ACV', 'no', YES_NO_OPTIONS),
    selectField('msk_life_stroke_type', 'Tipo de ACV', 'none', [
      option('none', 'No aplica'), option('hemorrhage', 'Hemorragia'),
      option('clot', 'Coagulo'), option('unsure', 'No seguro')
    ]),
    selectField('msk_life_asthma', 'Asma', 'no', YES_NO_OPTIONS),
    selectField('msk_life_asthma_impact', 'Impacto funcional del asma', 'none', [
      option('none', 'No aplica'), option('mild', 'Leve'),
      option('limited', 'Limita actividad'), option('severe', 'Severo')
    ]),
    numberField('msk_life_total_cholesterol', 'Colesterol total mg/dl', 190, { min: 80, max: 400 }),
    numberField('msk_life_hdl', 'HDL mg/dl', 45, { min: 10, max: 150 }),
    numberField('msk_life_systolic_bp', 'Presion sistolica', 130, { min: 70, max: 240 }),
    numberField('msk_life_diastolic_bp', 'Presion diastolica', 80, { min: 40, max: 140 }),
    selectField('msk_life_smoking_ever', '>100 cigarrillos en la vida', 'no', YES_NO_OPTIONS),
    selectField('msk_life_smoking_current', 'Fumo en ultimos 30 dias', 'no', YES_NO_OPTIONS)
  ],
  volume: [
    numberField('msk_volume_length', 'Longitud prostatica cm', 4.5, { min: 0.1, step: 0.1 }),
    numberField('msk_volume_width', 'Ancho/transverso prostatico cm', 4, { min: 0.1, step: 0.1 }),
    numberField('msk_volume_height', 'Altura prostatica cm', 3.5, { min: 0.1, step: 0.1 }),
    numberField('msk_volume_psa', 'PSA antes de hormonoterapia', 7, { min: 0.01, step: 0.1 })
  ]
};

export const MSKCC_PROSTATE_CALCULATOR = defineCalculator({
  id: 'mskcc-prostate',
  title: 'Nomogramas MSKCC próstata',
  category: 'prostata',
  subtitle: 'Aplicabilidad, datos requeridos y acceso al modelo oficial.',
  source: 'Memorial Sloan Kettering Cancer Center',
  clinicalUse: 'Prepara los datos para el nomograma dinámico oficial. No reproduce localmente sus coeficientes ni muestra porcentajes aproximados.',
  fields: [
    section('mskcc_scope', 'Escenario de uso',
      'Primero definí el momento clínico. El mayor error con nomogramas suele ser usar el modelo correcto en el paciente incorrecto.'),
    selectField('scenario', 'Escenario', 'pre', [
      option('pre', 'Antes de prostatectomía'),
      option('post', 'Luego de prostatectomía'),
      option('salvage', 'PSA en ascenso post-RP'),
      option('biopsy', 'Riesgo en biopsia'),
      option('psadt', 'PSA doubling time'),
      option('volume', 'Volumen / densidad'),
      option('life', 'Expectativa de vida')
    ], {
      required: false,
      initialValue: 'pre',
      wide: true,
      help: 'Seleccioná el nomograma que coincide con la decisión clínica.'
    }),
    section('mskcc_inputs', 'Matriz completa MSKCC',
      'Marcá los datos disponibles. El panel de resultado muestra faltantes del nomograma elegido y una vista global de los demás escenarios.'),
    ...MSKCC_SCENARIO_ORDER.flatMap((scenario) => [
      section('mskcc_' + scenario, MSKCC_PROSTATE_NOMOGRAMS[scenario].label,
        MSKCC_PROSTATE_NOMOGRAMS[scenario].question, scenario),
      ...mskccScenarioFields(scenario)
    ])
  ],
  calculate(values) {
    const scenario = stringValue(values, 'scenario') as MskccScenario;
    const selected = MSKCC_PROSTATE_NOMOGRAMS[scenario] ?? MSKCC_PROSTATE_NOMOGRAMS.pre;
    const state = mskccCompletion(values, selected);
    const optionalPct = state.optional.length
      ? state.doneOptional.length / state.optional.length * 100
      : 100;
    const missingCount = state.missingRequired.length;
    return result({
      title: missingCount ? missingCount + ' datos obligatorios pendientes' : 'Datos listos para MSKCC',
      detail: 'Escenario: ' + selected.label + '. El resultado numérico se obtiene únicamente en el nomograma oficial.',
      badge: missingCount ? 'incompleto' : 'listo',
      score: 0,
      showScore: false,
      severity: missingCount ? 'warn' : 'good',
      metrics: [
        { label: 'Obligatorios', value: state.doneRequired.length + '/' + state.required.length },
        {
          label: 'Opcionales',
          value: state.optional.length ? state.doneOptional.length + '/' + state.optional.length : 'no aplica'
        },
        { label: 'Faltantes', value: missingCount },
        { label: 'Opcional', value: state.optional.length ? percentage(optionalPct) : 'no aplica' }
      ],
      notes: [
        externalLink('Abrir nomograma interactivo MSKCC: ' + selected.label, selected.href),
        mskccChecklist('Datos obligatorios del escenario seleccionado', state.required, values),
        mskccChecklist(
          'Datos opcionales del escenario seleccionado',
          state.optional,
          values,
          'Este nomograma no declara campos opcionales en el formulario MSKCC.'
        ),
        mskccOverview(values),
        'Se retiraron todas las regresiones locales no validadas y sus porcentajes.',
        'No comparar resultados entre nomogramas distintos: cada herramienta responde una pregunta clinica diferente.'
      ]
    });
  }
});

export const BIOPSY_RISK_CALCULATOR = defineCalculator({
  id: 'biopsy-risk',
  title: 'PBCG — riesgo antes de biopsia',
  category: 'prostata',
  subtitle: 'Modelo público validado para cáncer de bajo y alto grado.',
  source: 'Prostate Biopsy Collaborative Group',
  clinicalUse: 'Integra edad, PSA, ascendencia africana, tacto rectal, antecedente familiar y biopsia previa para estimar probabilidades PBCG de ausencia de cáncer, bajo grado y alto grado.',
  fields: [
    section('biopsy_data', 'Riesgo antes de biopsia',
      'Pensado para decidir biopsia inicial o repetida, integrando PSA, volumen, RM y factores clínicos.'),
    numberField('psa', 'PSA', 7, {
      min: 2, max: 50, step: 0.1, help: 'Rango validado PBCG: 2-50 ng/ml.'
    }),
    numberField('age', 'Edad', 65, {
      min: 40, max: 90, help: 'Rango validado PBCG: 40-90 años.'
    }),
    checkbox('dre', 'Tacto sospechoso', 'Nódulo, induración, asimetría sospechosa o fijación.'),
    checkbox('family', 'Antecedente familiar', 'Familiar de primer grado o historia genética relevante.'),
    checkbox('african', 'Ascendencia africana', 'Factor incluido en modelos de riesgo prebiopsia como PBCG.'),
    checkbox('priorNegative', 'Biopsia previa negativa',
      'Reduce probabilidad estimada, pero no descarta lesión por RM/PSA-D.')
  ],
  calculate(values) {
    const calculated = pbcg(values);
    if (!calculated.valid) {
      return result({
        title: 'Fuera del rango validado',
        detail: calculated.reason,
        badge: 'no calculable',
        score: 0,
        showScore: false,
        severity: 'warn',
        metrics: [],
        notes: ['No se extrapola PBCG fuera de su población validada.']
      });
    }
    return result({
      title: 'PBCG: ' + percentage(calculated.highGrade, 1) + ' de alto grado',
      detail: 'Probabilidades mutuamente excluyentes calculadas con los coeficientes públicos PBCG.',
      badge: 'PBCG',
      score: 0,
      showScore: false,
      severity: 'info',
      metrics: [
        { label: 'Sin cáncer', value: percentage(calculated.noCancer, 1) },
        { label: 'Bajo grado', value: percentage(calculated.lowGrade, 1) },
        { label: 'Alto grado', value: percentage(calculated.highGrade, 1) }
      ],
      notes: [
        'Aplicabilidad: edad 40-90 años y PSA 2-50 ng/ml; la RM y PSA-D se interpretan aparte.',
        'Coeficientes públicos Cleveland Clinic PBCG; uso sujeto a PolyForm Noncommercial 1.0.0. Atribución completa en herramientas/NOTICE.md.',
        externalLink('Comparar con PBCG oficial', 'https://riskcalc.org/PBCG/')
      ]
    });
  }
});

export const PSA_KINETICS_CALCULATOR = defineCalculator({
  id: 'psa-kinetics',
  title: 'PSA-D / PSA doubling time / BCR',
  category: 'prostata',
  subtitle: 'Densidad, cinética y criterios de recaída.',
  source: 'PSA density, PSA-DT, Phoenix/AUA BCR',
  clinicalUse: 'Calcula densidad de PSA, tiempo de duplicación y criterios de recaída bioquímica cuando corresponden. Es útil en vigilancia activa, sospecha de recaída, priorización de imágenes y planificación de rescate.',
  fields: [
    section('psa_density', 'PSA density',
      'Útil sobre todo en sospecha diagnóstica, vigilancia activa y lectura junto a RM.'),
    numberField('psa', 'PSA actual', 6, { min: 0, step: 0.01, help: 'PSA más reciente.' }),
    numberField('volume', 'Volumen prostático (cc)', 40, {
      min: 1, help: 'Volumen por RM o ecografía.'
    }),
    section('psa_dt', 'Cinética y recaída',
      'Ingresá al menos tres mediciones con fecha; el cálculo usa regresión de ln(PSA) contra tiempo real.'),
    textareaField(
      'psaSeries',
      'Serie fecha; PSA',
      '01/01/2025; 1,0\n01/07/2025; 2,0\n01/01/2026; 4,0',
      {
        required: false,
        wide: true,
        help: 'Una medición por línea. Formato DD/MM/AAAA; valor. Para PSA-DT se recomiendan al menos tres mediciones.'
      }
    ),
    selectField('context', 'Contexto clínico', 'intact', [
      option('intact', 'Próstata intacta / diagnóstico'),
      option('post_rp', 'Post-prostatectomía'),
      option('post_rt', 'Post-radioterapia'),
      option('crpc', 'CRPC / enfermedad avanzada')
    ], { help: 'Evita aplicar criterios de recaída del contexto equivocado.' }),
    numberField('nadir', 'Nadir post-RT si aplica', 0.4, {
      min: 0,
      step: 0.01,
      required: false,
      help: 'Sólo es necesario en el contexto post-radioterapia.'
    }),
    checkbox('confirmed', 'Segundo PSA confirmatorio post-prostatectomía',
      'Marcar sólo si un valor posterior confirma PSA >0,2 ng/ml.')
  ],
  calculate(values) {
    const context = stringValue(values, 'context');
    if (context === 'post_rt' && values['nadir'] === '') {
      return result({
        title: 'Falta el nadir post-radioterapia',
        detail: 'Phoenix requiere comparar el PSA actual con nadir + 2 ng/ml.',
        badge: 'no calculable',
        score: 0,
        showScore: false,
        severity: 'warn',
        metrics: [],
        notes: []
      });
    }
    const psa = numberValue(values, 'psa');
    const psad = psaDensity(psa, numberValue(values, 'volume'));
    const kinetics = psaKinetics(parsePsaSeries(stringValue(values, 'psaSeries')));
    const recurrence = biochemicalRecurrence({
      context,
      psa,
      nadir: numberValue(values, 'nadir'),
      confirmed: booleanValue(values, 'confirmed')
    });
    const doublingTime = kinetics.doublingTimeMonths;
    const velocity = kinetics.velocityPerYear;
    return result({
      title: 'PSA-D ' + (psad === null ? 'ND' : psad.toFixed(3))
        + ' · PSA-DT '
        + (doublingTime === null ? 'sin duplicación calculable' : doublingTime.toFixed(1) + ' meses'),
      detail: recurrence.pendingConfirmation
        ? 'Umbral post-RP alcanzado; falta un PSA confirmatorio posterior.'
        : recurrence.met
          ? 'Cumple ' + recurrence.label + '.'
          : recurrence.label,
      badge: recurrence.met ? 'criterio cumplido' : recurrence.pendingConfirmation ? 'pendiente' : 'sin criterio',
      score: 0,
      showScore: false,
      severity: recurrence.met ? 'bad' : recurrence.pendingConfirmation ? 'warn' : 'info',
      metrics: [
        { label: 'PSA-D', value: psad === null ? 'ND' : psad.toFixed(3) },
        {
          label: 'PSA-DT',
          value: doublingTime === null ? 'ND' : doublingTime.toFixed(1) + ' meses'
        },
        { label: 'Velocidad', value: velocity === null ? 'ND' : velocity.toFixed(2) + '/año' },
        { label: 'Mediciones', value: kinetics.count }
      ],
      notes: [
        kinetics.count < 3
          ? 'Con menos de tres mediciones el PSA-DT es frágil; agregar una tercera determinación.'
          : 'PSA-DT calculado por regresión logarítmica de toda la serie.',
        kinetics.count < 2
          ? 'No hay una serie suficiente para evaluar intervalos temporales.'
          : (kinetics.minimumGapDays ?? Number.POSITIVE_INFINITY) < 28
            ? 'Hay determinaciones separadas por menos de cuatro semanas; interpretar la cinética con cautela.'
            : !kinetics.withinTwelveMonths
              ? 'La serie abarca más de 12 meses; revisar si conviene usar una ventana clínica más reciente.'
              : 'La separación temporal de la serie es adecuada para el cálculo.',
        'Se eliminó el score compuesto local: PSA-D, PSA-DT y BCR son resultados diferentes.'
      ]
    });
  }
});

export const CHAARTED_LATITUDE_CALCULATOR = defineCalculator({
  id: 'chaarted-latitude',
  title: 'CHAARTED / LATITUDE',
  category: 'prostata',
  subtitle: 'Volumen y riesgo en cáncer de próstata metastásico sensible.',
  source: 'CHAARTED, LATITUDE',
  clinicalUse: 'Clasifica volumen y riesgo en cáncer de próstata metastásico sensible a la castración. Ayuda a ordenar evidencia de ensayos, decidir intensificación sistémica y discutir radioterapia a próstata en enfermedad de bajo volumen.',
  fields: [
    section('mHSPC_volume', 'Volumen CHAARTED',
      'Alto volumen: metástasis visceral o ≥4 lesiones óseas con al menos una fuera de columna/pelvis.'),
    checkbox('visceral', 'Metástasis visceral',
      'Hígado, pulmón u otra visceral; no incluye ganglios.'),
    numberField('bone', 'Número de metástasis óseas', 3, {
      min: 0, help: 'Número total de lesiones óseas documentadas.'
    }),
    checkbox('outsideAxial', 'Al menos una fuera de columna/pelvis',
      'Relevante si hay ≥4 metástasis óseas.'),
    section('mHSPC_risk', 'Riesgo LATITUDE',
      'Alto riesgo LATITUDE: al menos 2 de 3 factores: Gleason ≥8, ≥3 metástasis óseas, metástasis visceral.'),
    checkbox('gleasonHigh', 'Gleason ≥8', 'Patrón de alto grado en biopsia/pieza.')
  ],
  calculate(values) {
    const classified = metastaticProstate(values);
    return result({
      title: 'CHAARTED ' + (classified.chaartedHigh ? 'alto volumen' : 'bajo volumen')
        + ' · LATITUDE ' + (classified.latitudeHigh ? 'alto riesgo' : 'no alto riesgo'),
      detail: 'LATITUDE suma ' + classified.latitudeFactors
        + '/3 factores. Clasificación basada en imagen convencional.',
      badge: 'clasificación pronóstica',
      score: 0,
      showScore: false,
      severity: 'info',
      metrics: [
        { label: 'CHAARTED', value: classified.chaartedHigh ? 'alto' : 'bajo' },
        { label: 'LATITUDE', value: classified.latitudeFactors + '/3' }
      ],
      notes: [
        'En 2026 estas categorías no determinan por sí solas si corresponde combinación sistémica.',
        'CHAARTED bajo volumen de novo puede abrir discusión de radioterapia a próstata según guía y contexto.'
      ]
    });
  }
});

export const LEGACY_CALCULATORS_12_15 = [
  MSKCC_PROSTATE_CALCULATOR,
  BIOPSY_RISK_CALCULATOR,
  PSA_KINETICS_CALCULATOR,
  CHAARTED_LATITUDE_CALCULATOR
] as const;

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

function numberField(id: string, label: string, exampleValue: number, options: FieldOptions = {}): CalculatorField {
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

function textField(id: string, label: string, exampleValue: string, options: FieldOptions = {}): CalculatorField {
  return {
    id,
    kind: 'text',
    label,
    required: options.required ?? true,
    initialValue: '',
    exampleValue,
    placeholder: 'Ej.: ' + exampleValue,
    help: options.help,
    scenario: options.scenario,
    wide: options.wide
  };
}

function textareaField(
  id: string,
  label: string,
  exampleValue: string,
  options: FieldOptions = {}
): CalculatorField {
  return {
    id,
    kind: 'textarea',
    label,
    required: options.required ?? true,
    initialValue: '',
    exampleValue,
    placeholder: exampleValue,
    rows: 4,
    help: options.help,
    scenario: options.scenario,
    wide: options.wide
  };
}

function checkbox(id: string, label: string, help?: string): CalculatorField {
  return { id, kind: 'checkbox', label, required: false, initialValue: false, help };
}

function section(id: string, label: string, help: string, scenario?: string): CalculatorField {
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

function mskccScenarioFields(scenario: MskccScenario): CalculatorField[] {
  const requiredIds = new Set(MSKCC_PROSTATE_NOMOGRAMS[scenario].required.map(([id]) => id));
  return MSKCC_INPUT_FIELDS[scenario].map((field) => {
    if (field.kind === 'section') throw new Error('Los campos MSKCC de entrada no pueden ser secciones.');
    return { ...field, scenario, required: requiredIds.has(field.id) } as CalculatorField;
  });
}

interface MskccCompletion {
  readonly required: readonly ChecklistEntry[];
  readonly optional: readonly ChecklistEntry[];
  readonly doneRequired: readonly ChecklistEntry[];
  readonly doneOptional: readonly ChecklistEntry[];
  readonly missingRequired: readonly ChecklistEntry[];
  readonly requiredPct: number;
}

function mskccCompletion(values: CalculatorValues, nomogram: MskccNomogram): MskccCompletion {
  const required = nomogram.required;
  const optional = nomogram.optional ?? [];
  const hasValue = (id: string) => values[id] !== '' && values[id] !== null && values[id] !== undefined;
  const doneRequired = required.filter(([id]) => hasValue(id));
  const doneOptional = optional.filter(([id]) => hasValue(id));
  const missingRequired = required.filter(([id]) => !hasValue(id));
  const requiredPct = required.length ? doneRequired.length / required.length * 100 : 100;
  return { required, optional, doneRequired, doneOptional, missingRequired, requiredPct };
}

function mskccChecklist(
  title: string,
  items: readonly ChecklistEntry[],
  values: CalculatorValues,
  emptyText = 'Sin items.'
) {
  return checklistNote(
    title,
    items.map(([id, label]) => ({
      label,
      status: values[id] !== '' && values[id] !== null && values[id] !== undefined
        ? 'complete' as const
        : 'missing' as const
    })),
    emptyText
  );
}

function mskccOverview(values: CalculatorValues) {
  return tableNote(
    'Matriz MSKCC completa',
    ['Nomograma', 'Completitud', 'Faltante principal', 'MSKCC'],
    MSKCC_SCENARIO_ORDER.map((scenario) => {
      const nomogram = MSKCC_PROSTATE_NOMOGRAMS[scenario];
      const state = mskccCompletion(values, nomogram);
      return [
        nomogram.label,
        Math.round(state.requiredPct) + '%',
        state.missingRequired.length
          ? state.missingRequired.slice(0, 4).map(([, label]) => label).join('; ')
          : 'Listo',
        externalLink('abrir', nomogram.href)
      ];
    })
  );
}

interface PbcgValid {
  readonly valid: true;
  readonly noCancer: number;
  readonly lowGrade: number;
  readonly highGrade: number;
}

interface PbcgInvalid {
  readonly valid: false;
  readonly reason: string;
}

function pbcg(values: CalculatorValues): PbcgValid | PbcgInvalid {
  const psa = numberValue(values, 'psa');
  const age = numberValue(values, 'age');
  if (psa < 2 || psa > 50 || age < 40 || age > 90) {
    return { valid: false, reason: 'PBCG fue validado para edad 40-90 y PSA 2-50 ng/ml' };
  }
  const predictors = [
    1,
    Math.log2(psa),
    age,
    booleanValue(values, 'african') ? 1 : 0,
    booleanValue(values, 'priorNegative') ? 1 : 0,
    booleanValue(values, 'dre') ? 1 : 0,
    booleanValue(values, 'family') ? 1 : 0
  ];
  const lowCoefficients = [-2.44052108, 0.13617244, 0.01780617, 0.78721039, -0.83613721, 0.04612721, 0.33233636];
  const highCoefficients = [-6.36851856, 0.79996510, 0.05566536, 0.61596975, -1.27437249, 0.85780143, 0.61003848];
  const dot = (coefficients: readonly number[]) => coefficients.reduce(
    (sum, coefficient, index) => sum + coefficient * (predictors[index] ?? 0),
    0
  );
  const lowExp = Math.exp(dot(lowCoefficients));
  const highExp = Math.exp(dot(highCoefficients));
  const denominator = 1 + lowExp + highExp;
  return {
    valid: true,
    noCancer: 100 / denominator,
    lowGrade: 100 * lowExp / denominator,
    highGrade: 100 * highExp / denominator
  };
}

interface PsaMeasurement {
  readonly date: string;
  readonly value: number;
}

interface PsaKinetics {
  readonly count: number;
  readonly doublingTimeMonths: number | null;
  readonly velocityPerYear: number | null;
  readonly spanMonths?: number;
  readonly minimumGapDays?: number;
  readonly withinTwelveMonths?: boolean;
  readonly first?: PsaKineticsRow;
  readonly last?: PsaKineticsRow;
}

interface PsaKineticsRow {
  readonly date: Date;
  readonly value: number;
}

function parsePsaSeries(textValue: string): PsaMeasurement[] {
  return String(textValue || '').split(/\n+/).map((line) => {
    const parts = line.trim().split(/\s*[;\t]\s*/, 2).map((item) => item.trim());
    if (parts.length < 2) return null;
    let date = parts[0] ?? '';
    const match = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      date = (match[3] ?? '') + '-' + (match[2] ?? '').padStart(2, '0')
        + '-' + (match[1] ?? '').padStart(2, '0');
    }
    return { date, value: Number((parts[1] ?? '').replace(',', '.')) };
  }).filter((item): item is PsaMeasurement => item !== null);
}

function psaKinetics(measurements: readonly PsaMeasurement[]): PsaKinetics {
  const rows = measurements
    .map((item) => ({ date: new Date(item.date), value: finiteNumber(item.value, -1) }))
    .filter((item) => !Number.isNaN(item.date.getTime()) && item.value > 0)
    .sort((left, right) => left.date.getTime() - right.date.getTime());
  if (rows.length < 2) {
    return { count: rows.length, doublingTimeMonths: null, velocityPerYear: null };
  }
  const origin = rows[0]?.date.getTime() ?? 0;
  const xs = rows.map((item) => (item.date.getTime() - origin) / 2629800000);
  const logs = rows.map((item) => Math.log(item.value));
  const values = rows.map((item) => item.value);
  const slope = linearSlope(xs, logs);
  const velocityMonth = linearSlope(xs, values);
  const gapsDays = rows.slice(1).map((item, index) =>
    (item.date.getTime() - (rows[index]?.date.getTime() ?? item.date.getTime())) / 86400000
  );
  const spanMonths = (xs[xs.length - 1] ?? 0) - (xs[0] ?? 0);
  return {
    count: rows.length,
    doublingTimeMonths: slope > 0 ? Math.log(2) / slope : null,
    velocityPerYear: Number.isFinite(velocityMonth) ? velocityMonth * 12 : null,
    spanMonths,
    minimumGapDays: Math.min(...gapsDays),
    withinTwelveMonths: spanMonths <= 12.1,
    first: rows[0],
    last: rows[rows.length - 1]
  };
}

function linearSlope(xs: readonly number[], ys: readonly number[]): number {
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const denominator = xs.reduce((sum, value) => sum + Math.pow(value - meanX, 2), 0);
  if (!denominator) return Number.NaN;
  return xs.reduce(
    (sum, value, index) => sum + (value - meanX) * ((ys[index] ?? 0) - meanY),
    0
  ) / denominator;
}

interface BiochemicalRecurrence {
  readonly met: boolean;
  readonly pendingConfirmation?: boolean;
  readonly label: string;
}

function biochemicalRecurrence(input: {
  readonly context: string;
  readonly psa: number;
  readonly nadir: number;
  readonly confirmed: boolean;
}): BiochemicalRecurrence {
  if (input.context === 'post_rt') {
    return {
      met: input.psa >= input.nadir + 2,
      label: 'Phoenix: PSA actual ≥ nadir + 2 ng/ml'
    };
  }
  if (input.context === 'post_rp') {
    return {
      met: input.psa >= 0.2 && input.confirmed,
      pendingConfirmation: input.psa >= 0.2 && !input.confirmed,
      label: 'Post-RP: PSA ≥0,2 ng/ml confirmado'
    };
  }
  return { met: false, label: 'Sin criterio de recaida aplicable a este contexto' };
}

function psaDensity(psa: number, volume: number): number | null {
  return volume > 0 ? psa / volume : null;
}

function metastaticProstate(values: CalculatorValues) {
  const bone = numberValue(values, 'bone');
  const visceral = booleanValue(values, 'visceral');
  const gleasonHigh = booleanValue(values, 'gleasonHigh');
  const chaartedHigh = visceral || (bone >= 4 && booleanValue(values, 'outsideAxial'));
  const latitudeFactors = (visceral ? 1 : 0) + (gleasonHigh ? 1 : 0) + (bone >= 3 ? 1 : 0);
  return { chaartedHigh, latitudeFactors, latitudeHigh: latitudeFactors >= 2 };
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function percentage(value: number, digits = 0): string {
  return value.toFixed(digits) + '%';
}
