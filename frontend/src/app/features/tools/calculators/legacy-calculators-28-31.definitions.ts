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

interface CisneValid {
  readonly valid: true;
  readonly total: number;
  readonly riskClass: string;
  readonly classNumber: 1 | 2 | 3;
  readonly glucoseThreshold: 121 | 250;
}

type CisneResult = CisneValid | InvalidRule;

function cisne(values: CalculatorValues): CisneResult {
  const glucose = numberValue(values, 'cisne_glucose');
  const threshold = booleanValue(values, 'cisne_diabetes_steroids') ? 250 : 121;
  if (!Number.isFinite(glucose) || glucose < 0) return invalid(['glucemia inicial']);
  const total = (booleanValue(values, 'cisne_ecog') ? 2 : 0)
    + (glucose >= threshold ? 2 : 0)
    + (booleanValue(values, 'cisne_copd') ? 1 : 0)
    + (booleanValue(values, 'cisne_cardiovascular') ? 1 : 0)
    + (booleanValue(values, 'cisne_mucositis') ? 1 : 0)
    + (booleanValue(values, 'cisne_monocytes') ? 1 : 0);
  const classNumber = total === 0 ? 1 : total <= 2 ? 2 : 3;
  return {
    valid: true,
    total,
    riskClass: classNumber === 1 ? 'I · bajo' : classNumber === 2 ? 'II · intermedio' : 'III · alto',
    classNumber,
    glucoseThreshold: threshold
  };
}

export const CISNE_FEBRILE_NEUTROPENIA_CALCULATOR = defineCalculator({
  id: 'cisne-febrile-neutropenia',
  title: 'CISNE — neutropenia febril estable',
  category: 'general',
  subtitle: 'Riesgo oculto de complicaciones en tumor sólido aparentemente estable.',
  source: 'FINITE / CISNE',
  clinicalUse: 'Estratifica complicaciones graves en adultos con tumor sólido, neutropenia febril y estabilidad clínica inicial.',
  fields: [
    section(
      'cisne_scope',
      'Usar solamente si el paciente con tumor sólido parece estable, sin disfunción orgánica, alteraciones vitales ni infección mayor evidente.'
    ),
    numberField('cisne_glucose', 'Glucemia inicial (mg/dL)', 100, { min: 0, step: 1 }),
    checkbox('cisne_diabetes_steroids', 'Diabetes o uso de corticoides'),
    checkbox('cisne_ecog', 'ECOG ≥2'),
    checkbox('cisne_copd', 'EPOC'),
    checkbox('cisne_cardiovascular', 'Enfermedad cardiovascular crónica'),
    checkbox('cisne_mucositis', 'Mucositis NCI grado ≥2'),
    checkbox('cisne_monocytes', 'Monocitos <200/µL')
  ],
  calculate(values) {
    const calculated = cisne(values);
    if (!calculated.valid) return invalidRuleResult('CISNE', calculated);
    return result({
      title: `CISNE ${calculated.total} · clase ${calculated.riskClass}`,
      detail: `Umbral de hiperglucemia aplicado: ${calculated.glucoseThreshold} mg/dL.`,
      badge: 'FN estable',
      score: 0,
      showScore: false,
      severity: calculated.classNumber >= 3 ? 'bad' : calculated.classNumber === 2 ? 'warn' : 'good',
      metrics: [
        { label: 'Puntaje', value: calculated.total },
        { label: 'Clase', value: calculated.riskClass },
        { label: 'Glucemia umbral', value: `${calculated.glucoseThreshold} mg/dL` }
      ],
      notes: [
        'No aplicar a pacientes inestables, neoplasias hematológicas, trasplante o quimioterapia de alta intensidad.',
        'CISNE busca evitar una falsa clasificación de bajo riesgo; no debe retrasar antibióticos.',
        'El resultado no define automáticamente manejo ambulatorio o internación.'
      ]
    });
  }
});

interface PpiValid {
  readonly valid: true;
  readonly total: number;
  readonly threshold: string;
}

type PpiResult = PpiValid | InvalidRule;

function palliativePrognosticIndex(values: CalculatorValues): PpiResult {
  const pps = numberValue(values, 'ppi_pps');
  const oral = stringValue(values, 'ppi_oral').toLowerCase();
  if (![10, 20, 30, 40, 50, 60, 70, 80, 90, 100].includes(pps)) return invalid(['PPS']);
  if (!['normal', 'moderate', 'severe'].includes(oral)) return invalid(['ingesta oral']);
  const ppsPoints = pps <= 20 ? 4 : pps <= 50 ? 2.5 : 0;
  const oralPoints = oral === 'severe' ? 2.5 : oral === 'moderate' ? 1 : 0;
  const total = ppsPoints
    + oralPoints
    + (booleanValue(values, 'ppi_edema') ? 1 : 0)
    + (booleanValue(values, 'ppi_dyspnea') ? 3.5 : 0)
    + (booleanValue(values, 'ppi_delirium') ? 4 : 0);
  const threshold = total > 6
    ? '>6 · cohorte original: alta probabilidad de supervivencia <3 semanas'
    : total > 4
      ? '>4 · cohorte original: alta probabilidad de supervivencia <6 semanas'
      : '≤4 · no cruza los puntos de corte originales';
  return { valid: true, total, threshold };
}

export const PALLIATIVE_PROGNOSTIC_INDEX_CALCULATOR = defineCalculator({
  id: 'palliative-prognostic-index',
  title: 'Palliative Prognostic Index — PPI',
  category: 'general',
  subtitle: 'Señal pronóstica en cuidados paliativos avanzados.',
  source: 'Palliative Prognostic Index',
  clinicalUse: 'Integra PPS, ingesta, edema, disnea de reposo y delirium para contextualizar pronóstico poblacional.',
  fields: [
    selectField('ppi_pps', 'Palliative Performance Scale (PPS)', '50',
      [100, 90, 80, 70, 60, 50, 40, 30, 20, 10].map((value) =>
        option(String(value), `${value}%`))),
    selectField('ppi_oral', 'Ingesta oral', 'normal', [
      option('normal', 'Normal'),
      option('moderate', 'Moderadamente reducida'),
      option('severe', 'Severamente reducida')
    ]),
    checkbox('ppi_edema', 'Edema'),
    checkbox('ppi_dyspnea', 'Disnea en reposo'),
    checkbox('ppi_delirium', 'Delirium')
  ],
  calculate(values) {
    const calculated = palliativePrognosticIndex(values);
    if (!calculated.valid) return invalidRuleResult('PPI', calculated);
    return result({
      title: `PPI ${format(calculated.total, 1)}`,
      detail: calculated.threshold,
      badge: 'pronóstico paliativo',
      score: 0,
      showScore: false,
      severity: calculated.total > 6 ? 'bad' : calculated.total > 4 ? 'warn' : 'info',
      metrics: [
        { label: 'Puntaje', value: format(calculated.total, 1) },
        { label: 'Lectura', value: calculated.threshold }
      ],
      notes: [
        'Los puntos de corte describen probabilidades observadas en cohortes; no predicen una fecha individual.',
        'Delirium potencialmente reversible por medicación, infección o trastorno metabólico debe interpretarse con cautela.',
        'No usar el PPI de forma aislada para limitar estudios, hidratación, derivación o tratamientos.'
      ]
    });
  }
});

interface BedEqd2Valid {
  readonly valid: true;
  readonly totalDose: number;
  readonly bed: number;
  readonly eqd2: number;
}

type BedEqd2Result = BedEqd2Valid | InvalidRule;

function bedEqd2(values: CalculatorValues): BedEqd2Result {
  const fractions = numberValue(values, 'bed_fractions');
  const dosePerFraction = numberValue(values, 'bed_dose_fraction');
  const alphaBeta = numberValue(values, 'bed_alpha_beta');
  const missing: string[] = [];
  if (!Number.isFinite(fractions) || fractions <= 0 || !Number.isInteger(fractions)) {
    missing.push('número entero de fracciones');
  }
  if (!Number.isFinite(dosePerFraction) || dosePerFraction <= 0) {
    missing.push('dosis por fracción');
  }
  if (!Number.isFinite(alphaBeta) || alphaBeta <= 0) missing.push('relación α/β');
  if (missing.length) return invalid(missing);
  const totalDose = fractions * dosePerFraction;
  const bed = totalDose * (1 + dosePerFraction / alphaBeta);
  const eqd2 = bed / (1 + 2 / alphaBeta);
  return { valid: true, totalDose, bed, eqd2 };
}

export const BED_EQD2_CALCULATOR = defineCalculator({
  id: 'bed-eqd2',
  title: 'BED y EQD2 del fraccionamiento',
  shortTitle: 'BED y EQD2',
  category: 'radioterapia',
  subtitle: 'Dosis física y equivalencia biológica con el modelo lineal-cuadrático.',
  source: 'Modelo LQ · Pangea',
  clinicalUse: 'Calcula dosis biológicamente efectiva y dosis equiefectiva en fracciones de 2 Gy para un α/β elegido explícitamente. Reúne las calculadoras BED y EQD2 del módulo original.',
  fields: [
    section(
      'bed_scope',
      'Fraccionamiento administrado',
      'Ingresá el número de fracciones, la dosis por fracción y el α/β correspondiente al tejido u objetivo que se analiza.'
    ),
    numberField('bed_fractions', 'Número de fracciones', 25, { min: 1, step: 1 }),
    numberField('bed_dose_fraction', 'Dosis por fracción (Gy)', 2, { min: 0.01, step: 0.01 }),
    numberField('bed_alpha_beta', 'Relación α/β (Gy)', 10, { min: 0.1, step: 0.1 })
  ],
  calculate(values) {
    const calculated = bedEqd2(values);
    if (!calculated.valid) return invalidRuleResult('BED / EQD2', calculated);
    const dosePerFraction = numberValue(values, 'bed_dose_fraction');
    const alphaBeta = numberValue(values, 'bed_alpha_beta');
    return result({
      title: `BED ${format(calculated.bed, 2)} · EQD2 ${format(calculated.eqd2, 2)}`,
      detail: `Dosis física total: ${format(calculated.totalDose, 2)} Gy.`,
      badge: 'lineal-cuadrático',
      score: 0,
      showScore: false,
      severity: dosePerFraction > 5 ? 'warn' : 'info',
      metrics: [
        { label: 'Dosis total', value: `${format(calculated.totalDose, 2)} Gy` },
        { label: 'BED', value: `${format(calculated.bed, 2)} Gy (α/β ${format(alphaBeta, 1)})` },
        { label: 'EQD2', value: `${format(calculated.eqd2, 2)} Gy (α/β ${format(alphaBeta, 1)})` },
        { label: 'α/β', value: `${format(alphaBeta, 1)} Gy` }
      ],
      notes: [
        'El resultado depende por completo del α/β seleccionado y del tejido o objetivo analizado.',
        dosePerFraction > 5
          ? 'Dosis por fracción >5 Gy: el modelo LQ sigue siendo una estimación y su extrapolación es especialmente incierta en hipofraccionamiento extremo.'
          : 'El modelo LQ es una aproximación; la incertidumbre aumenta al alejarse del fraccionamiento convencional.',
        'No incorpora repoblación, reparación incompleta, tiempo total, heterogeneidad de dosis, recuperación tisular ni reirradiación.',
        'No constituye una prescripción ni un límite automático de órgano a riesgo.'
      ]
    });
  }
});

interface QtcValid {
  readonly valid: true;
  readonly qtcF: number;
  readonly rrSeconds: number;
  readonly upperReference: 450 | 460;
  readonly delta: number | null;
  readonly band: string;
}

type QtcResult = QtcValid | InvalidRule;

function qtcFridericia(values: CalculatorValues): QtcResult {
  const qtMs = numberValue(values, 'qtc_qt');
  const heartRate = numberValue(values, 'qtc_hr');
  const sex = stringValue(values, 'qtc_sex').toLowerCase();
  const hasBaseline = values['qtc_baseline'] !== '';
  const baselineQtcMs = numberValue(values, 'qtc_baseline');
  const missing: string[] = [];
  if (!Number.isFinite(qtMs) || qtMs <= 0) missing.push('QT medido');
  if (!Number.isFinite(heartRate) || heartRate <= 0) missing.push('frecuencia cardíaca');
  if (!['female', 'male'].includes(sex)) missing.push('sexo');
  if (hasBaseline && (!Number.isFinite(baselineQtcMs) || baselineQtcMs <= 0)) {
    missing.push('QTc basal');
  }
  if (missing.length) return invalid(missing);
  const rrSeconds = 60 / heartRate;
  const qtcF = qtMs / Math.cbrt(rrSeconds);
  const upperReference = sex === 'female' ? 460 : 450;
  const delta = hasBaseline && baselineQtcMs > 0 ? qtcF - baselineQtcMs : null;
  const band = qtcF >= 500
    ? '≥500 ms'
    : qtcF >= 480
      ? '480–499 ms'
      : qtcF > upperReference ? `sobre referencia (${upperReference} ms)` : 'dentro de referencia por sexo';
  return { valid: true, qtcF, rrSeconds, upperReference, delta, band };
}

export const QTC_FRIDERICIA_CALCULATOR = defineCalculator({
  id: 'qtc-fridericia',
  title: 'QT corregido — Fridericia',
  category: 'general',
  subtitle: 'QTcF para vigilancia cardio-oncológica.',
  source: 'ESC Cardio-Oncology / Fridericia',
  clinicalUse: 'Corrige el QT medido por frecuencia cardíaca y lo contextualiza con límites de referencia y cambio desde basal.',
  fields: [
    numberField('qtc_qt', 'QT medido (ms)', 400, { min: 1, step: 1 }),
    numberField('qtc_hr', 'Frecuencia cardíaca (lpm)', 70, { min: 1, step: 1 }),
    selectField('qtc_sex', 'Sexo para límite de referencia', 'female', [
      option('female', 'Mujer'), option('male', 'Varón')
    ]),
    numberField('qtc_baseline', 'QTcF basal (ms, opcional)', undefined, {
      min: 1, step: 1, required: false
    })
  ],
  calculate(values) {
    const calculated = qtcFridericia(values);
    if (!calculated.valid) return invalidRuleResult('QTcF', calculated);
    const deltaText = calculated.delta === null
      ? 'No informado'
      : `${calculated.delta >= 0 ? '+' : ''}${format(calculated.delta, 0)} ms`;
    return result({
      title: `QTcF ${format(calculated.qtcF, 0)} ms`,
      detail: calculated.band,
      badge: 'Fridericia',
      score: 0,
      showScore: false,
      severity: calculated.qtcF >= 500 ? 'bad' : calculated.qtcF >= 480 ? 'warn' : 'info',
      metrics: [
        { label: 'QTcF', value: `${format(calculated.qtcF, 0)} ms` },
        { label: 'RR', value: `${format(calculated.rrSeconds, 3)} s` },
        { label: 'Límite por sexo', value: `${calculated.upperReference} ms` },
        { label: 'Cambio desde basal', value: deltaText }
      ],
      notes: [
        'QTcF 480–499 ms requiere revisar causas reversibles y monitorización; ≥500 ms se asocia con mayor riesgo de torsade.',
        'QRS ancho, marcapasos, fibrilación auricular o trazado dudoso requieren medición e interpretación especializada.',
        'El prospecto del fármaco y la evaluación clínica determinan la conducta; el cálculo no indica suspensión automática.'
      ]
    });
  }
});

export const LEGACY_CALCULATORS_28_31 = [
  CISNE_FEBRILE_NEUTROPENIA_CALCULATOR,
  PALLIATIVE_PROGNOSTIC_INDEX_CALCULATOR,
  BED_EQD2_CALCULATOR,
  QTC_FRIDERICIA_CALCULATOR
] as const;
