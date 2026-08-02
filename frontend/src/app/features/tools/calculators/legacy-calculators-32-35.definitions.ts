import {
  defineCalculator,
  externalLink,
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
const YES_NO_OPTIONS = [option('no', 'No'), option('yes', 'Sí')];

interface NpiValid {
  readonly valid: true;
  readonly total: number;
  readonly nodeScore: 1 | 2 | 3;
  readonly group: string;
}

type NpiResult = NpiValid | InvalidRule;

function nottinghamPrognosticIndex(values: CalculatorValues): NpiResult {
  const sizeCm = numberValue(values, 'npi_size');
  const grade = numberValue(values, 'npi_grade');
  const positiveNodes = numberValue(values, 'npi_nodes');
  const missing: string[] = [];
  if (!Number.isFinite(sizeCm) || sizeCm <= 0) missing.push('tamaño invasivo');
  if (![1, 2, 3].includes(grade)) missing.push('grado histológico');
  if (!Number.isFinite(positiveNodes) || positiveNodes < 0 || !Number.isInteger(positiveNodes)) {
    missing.push('ganglios positivos');
  }
  if (missing.length) return invalid(missing);
  const nodeScore = positiveNodes === 0 ? 1 : positiveNodes <= 3 ? 2 : 3;
  const total = 0.2 * sizeCm + grade + nodeScore;
  const group = total <= 2.4
    ? 'excelente'
    : total <= 3.4
      ? 'bueno'
      : total <= 4.4
        ? 'moderado I'
        : total <= 5.4
          ? 'moderado II'
          : total <= 6.4
            ? 'pobre'
            : 'muy pobre';
  return { valid: true, total, nodeScore, group };
}

export const NOTTINGHAM_PROGNOSTIC_INDEX_CALCULATOR = defineCalculator({
  id: 'nottingham-prognostic-index',
  title: 'Nottingham Prognostic Index — NPI',
  category: 'mama',
  subtitle: 'Índice anatomopatológico clásico en cáncer de mama invasivo.',
  source: 'Nottingham Prognostic Index',
  clinicalUse: 'Integra tamaño invasivo, grado histológico y carga ganglionar para asignar un grupo pronóstico histórico.',
  fields: [
    numberField('npi_size', 'Tamaño invasivo (cm)', 2, { min: 0.01, step: 0.1 }),
    selectField('npi_grade', 'Grado histológico', '2', GRADE_OPTIONS),
    numberField('npi_nodes', 'Ganglios positivos', 0, { min: 0, step: 1 })
  ],
  calculate(values) {
    const calculated = nottinghamPrognosticIndex(values);
    if (!calculated.valid) return invalidRuleResult('NPI', calculated);
    return result({
      title: `NPI ${format(calculated.total, 2)} · ${calculated.group}`,
      detail: 'Índice = 0,2 × tamaño en cm + grado + categoría ganglionar.',
      badge: 'mama invasiva',
      score: 0,
      showScore: false,
      severity: 'info',
      metrics: [
        { label: 'NPI', value: format(calculated.total, 2) },
        { label: 'Grupo', value: calculated.group },
        { label: 'Categoría ganglionar', value: calculated.nodeScore }
      ],
      notes: [
        'Es un modelo pronóstico histórico; no incorpora ER, HER2, Ki-67, genómica ni tratamientos contemporáneos.',
        'Usar tamaño del componente invasivo y grado histológico definitivo.',
        'No determina por sí solo indicación o intensidad de tratamiento.'
      ]
    });
  }
});

interface RcbValid {
  readonly valid: true;
  readonly total: number;
  readonly rcbClass: string;
  readonly dPrim: number;
  readonly fInv: number;
  readonly primaryTerm: number;
  readonly nodeTerm: number;
}

type RcbResult = RcbValid | InvalidRule;

function residualCancerBurden(values: CalculatorValues): RcbResult {
  const d1Mm = numberValue(values, 'rcb_d1');
  const d2Mm = numberValue(values, 'rcb_d2');
  const cellularityPercent = numberValue(values, 'rcb_cellularity');
  const inSituPercent = numberValue(values, 'rcb_in_situ');
  const positiveNodes = numberValue(values, 'rcb_nodes');
  const largestMetMm = numberValue(values, 'rcb_largest_met');
  const missing: string[] = [];
  if (!Number.isFinite(d1Mm) || d1Mm < 0) missing.push('diámetro 1 del lecho');
  if (!Number.isFinite(d2Mm) || d2Mm < 0) missing.push('diámetro 2 del lecho');
  if (!Number.isFinite(cellularityPercent) || cellularityPercent < 0 || cellularityPercent > 100) {
    missing.push('celularidad');
  }
  if (!Number.isFinite(inSituPercent) || inSituPercent < 0 || inSituPercent > 100) {
    missing.push('componente in situ');
  }
  if (inSituPercent > cellularityPercent && cellularityPercent > 0) {
    missing.push('porcentaje in situ no mayor que la celularidad global');
  }
  if (!Number.isFinite(positiveNodes) || positiveNodes < 0 || !Number.isInteger(positiveNodes)) {
    missing.push('ganglios positivos');
  }
  if (!Number.isFinite(largestMetMm) || largestMetMm < 0
    || (positiveNodes > 0 && largestMetMm <= 0)
    || (positiveNodes === 0 && largestMetMm !== 0)) {
    missing.push('diámetro de mayor metástasis ganglionar coherente');
  }
  if (missing.length) return invalid(missing);
  const dPrim = Math.sqrt(d1Mm * d2Mm);
  const fInv = (cellularityPercent / 100) * (1 - inSituPercent / 100);
  const primaryTerm = 1.4 * Math.pow(fInv * dPrim, 0.17);
  const nodeTerm = Math.pow(4 * (1 - Math.pow(0.75, positiveNodes)) * largestMetMm, 0.17);
  const total = primaryTerm + nodeTerm;
  const rcbClass = total === 0 ? 'RCB-0' : total <= 1.36 ? 'RCB-I' : total <= 3.28 ? 'RCB-II' : 'RCB-III';
  return { valid: true, total, rcbClass, dPrim, fInv, primaryTerm, nodeTerm };
}

export const RESIDUAL_CANCER_BURDEN_EXPERIMENTAL_CALCULATOR = defineCalculator({
  id: 'residual-cancer-burden-experimental',
  title: 'Residual Cancer Burden — RCB experimental',
  category: 'mama',
  subtitle: 'Cálculo local experimental de enfermedad residual posneoadyuvancia.',
  source: 'RCB / MD Anderson',
  clinicalUse: 'Integra lecho tumoral, celularidad invasiva y enfermedad ganglionar residual después de tratamiento neoadyuvante.',
  fields: [
    section('rcb_warning', 'IMPLEMENTACIÓN EXPERIMENTAL. Confirmar siempre el valor y la clase con la calculadora oficial de MD Anderson antes de documentarlos o utilizarlos.'),
    numberField('rcb_d1', 'Diámetro 1 del lecho tumoral (mm)', 20, { min: 0, step: 0.1 }),
    numberField('rcb_d2', 'Diámetro 2 del lecho tumoral (mm)', 15, { min: 0, step: 0.1 }),
    numberField('rcb_cellularity', 'Celularidad global del lecho (%)', 10, { min: 0, max: 100, step: 0.1 }),
    numberField('rcb_in_situ', 'Componente in situ dentro de la celularidad (%)', 0, { min: 0, max: 100, step: 0.1 }),
    numberField('rcb_nodes', 'Ganglios positivos', 0, { min: 0, step: 1 }),
    numberField('rcb_largest_met', 'Mayor metástasis ganglionar (mm; 0 si N0)', 0, { min: 0, step: 0.1, wide: true })
  ],
  calculate(values) {
    const calculated = residualCancerBurden(values);
    if (!calculated.valid) return invalidRuleResult('RCB experimental', calculated);
    return result({
      title: `${calculated.rcbClass} · índice experimental ${format(calculated.total, 3)}`,
      detail: 'Resultado local para control técnico; requiere confirmación externa.',
      badge: 'experimental',
      score: 0,
      showScore: false,
      severity: 'warn',
      metrics: [
        { label: 'Clase calculada', value: calculated.rcbClass },
        { label: 'Índice', value: format(calculated.total, 3) },
        { label: 'Diámetro geométrico', value: `${format(calculated.dPrim, 2)} mm` },
        { label: 'Fracción invasiva', value: format(calculated.fInv, 4) }
      ],
      notes: [
        'Confirmar siempre el resultado antes de documentarlo o utilizarlo.',
        externalLink(
          'calculadora oficial de MD Anderson',
          'https://www3.mdanderson.org/app/medcalc/index.cfm?pagename=jsconvert3'
        ),
        'La medición debe provenir de evaluación anatomopatológica estandarizada del lecho posneoadyuvancia.',
        'No usar esta implementación experimental para indicar un tratamiento automático.'
      ]
    });
  }
});

interface PepiFactors {
  readonly pt: 0 | 3;
  readonly nodes: 0 | 3;
  readonly ki67: 0 | 1 | 2 | 3;
  readonly er: 0 | 3;
}

interface PepiValid {
  readonly valid: true;
  readonly total: number;
  readonly factors: PepiFactors;
  readonly group: string;
}

type PepiResult = PepiValid | InvalidRule;

function pepi(values: CalculatorValues): PepiResult {
  const pt = stringValue(values, 'pepi_pt').toLowerCase();
  const nodePositive = stringValue(values, 'pepi_nodes');
  const ki67 = numberValue(values, 'pepi_ki67');
  const erAllred = numberValue(values, 'pepi_er_allred');
  const missing: string[] = [];
  if (!['pt1', 'pt2', 'pt3', 'pt4'].includes(pt)) missing.push('pT posendocrinoterapia');
  if (!['yes', 'no'].includes(nodePositive)) missing.push('estado ganglionar');
  if (!Number.isFinite(ki67) || ki67 < 0 || ki67 > 100) missing.push('Ki-67');
  if (!Number.isFinite(erAllred) || erAllred < 0 || erAllred > 8 || !Number.isInteger(erAllred)) {
    missing.push('ER Allred');
  }
  if (missing.length) return invalid(missing);
  const factors: PepiFactors = {
    pt: ['pt3', 'pt4'].includes(pt) ? 3 : 0,
    nodes: nodePositive === 'yes' ? 3 : 0,
    ki67: ki67 <= 2.7 ? 0 : ki67 <= 19.7 ? 1 : ki67 <= 53.1 ? 2 : 3,
    er: erAllred <= 2 ? 3 : 0
  };
  const total = Object.values(factors).reduce((sum, value) => sum + value, 0);
  const group = total === 0 ? 'PEPI 0' : total <= 3 ? 'PEPI 1–3' : 'PEPI ≥4';
  return { valid: true, total, factors, group };
}

export const PEPI_BREAST_CALCULATOR = defineCalculator({
  id: 'pepi-breast',
  title: 'PEPI — Preoperative Endocrine Prognostic Index',
  category: 'mama',
  subtitle: 'Respuesta anatomopatológica después de endocrinoterapia neoadyuvante.',
  source: 'PEPI',
  clinicalUse: 'Combina pT, ganglios, Ki-67 y ER Allred residuales después de endocrinoterapia neoadyuvante.',
  fields: [
    section('pepi_scope', 'Aplicar a cáncer de mama ER positivo tratado con endocrinoterapia neoadyuvante y con evaluación quirúrgica residual.'),
    selectField('pepi_pt', 'pT posendocrinoterapia', 'pt1', [1, 2, 3, 4].map((value) => option(`pt${value}`, `pT${value}`))),
    selectField('pepi_nodes', 'Ganglios residuales positivos', 'no', YES_NO_OPTIONS),
    numberField('pepi_ki67', 'Ki-67 residual (%)', 2, { min: 0, max: 100, step: 0.1 }),
    numberField('pepi_er_allred', 'ER Allred residual (0–8)', 8, { min: 0, max: 8, step: 1 })
  ],
  calculate(values) {
    const calculated = pepi(values);
    if (!calculated.valid) return invalidRuleResult('PEPI', calculated);
    return result({
      title: `${calculated.group} · ${calculated.total} puntos`,
      detail: 'Puntaje posendocrinoterapia basado en la pieza quirúrgica y biomarcadores residuales.',
      badge: 'endocrino neoadyuvante',
      score: 0,
      showScore: false,
      severity: calculated.total === 0 ? 'good' : calculated.total <= 3 ? 'warn' : 'bad',
      metrics: [
        { label: 'PEPI', value: calculated.total },
        { label: 'Grupo', value: calculated.group },
        { label: 'Puntos pT', value: calculated.factors.pt },
        { label: 'Puntos ganglios', value: calculated.factors.nodes },
        { label: 'Puntos Ki-67', value: calculated.factors.ki67 },
        { label: 'Puntos ER', value: calculated.factors.er }
      ],
      notes: [
        'No aplicar al diagnóstico basal, después de quimioterapia neoadyuvante ni fuera de enfermedad hormonosensible.',
        'Ki-67 requiere una medición anatomopatológica fiable y comparable.',
        'PEPI es pronóstico y no determina por sí solo una conducta adyuvante.'
      ]
    });
  }
});

interface Cts5Valid {
  readonly valid: true;
  readonly total: number;
  readonly nodeCategory: 0 | 1 | 2 | 3 | 4;
  readonly group: 'bajo' | 'intermedio' | 'alto';
  readonly cappedSizeMm: number;
  readonly sizeWasCapped: boolean;
}

type Cts5Result = Cts5Valid | InvalidRule;

function cts5(values: CalculatorValues): Cts5Result {
  const age = numberValue(values, 'cts5_age');
  const sizeMm = numberValue(values, 'cts5_size');
  const grade = numberValue(values, 'cts5_grade');
  const positiveNodes = numberValue(values, 'cts5_nodes');
  const missing: string[] = [];
  if (!Number.isFinite(age) || age <= 0) missing.push('edad al diagnóstico');
  if (!Number.isFinite(sizeMm) || sizeMm <= 0) missing.push('tamaño tumoral');
  if (![1, 2, 3].includes(grade)) missing.push('grado');
  if (!Number.isFinite(positiveNodes) || positiveNodes < 0 || !Number.isInteger(positiveNodes)) {
    missing.push('ganglios positivos');
  }
  if (missing.length) return invalid(missing);
  const nodeCategory = positiveNodes === 0
    ? 0
    : positiveNodes === 1
      ? 1
      : positiveNodes <= 3
        ? 2
        : positiveNodes <= 9
          ? 3
          : 4;
  const cappedSizeMm = Math.min(sizeMm, 30);
  const total = 0.438 * nodeCategory
    + 0.988 * (0.093 * cappedSizeMm - 0.001 * cappedSizeMm * cappedSizeMm + 0.375 * grade + 0.017 * age);
  const group = total < 3.13 ? 'bajo' : total <= 3.86 ? 'intermedio' : 'alto';
  return { valid: true, total, nodeCategory, group, cappedSizeMm, sizeWasCapped: sizeMm > 30 };
}

export const CTS5_BREAST_CALCULATOR = defineCalculator({
  id: 'cts5-breast',
  title: 'CTS5 — recurrencia tardía',
  category: 'mama',
  subtitle: 'Riesgo residual entre los años 5 y 10.',
  source: 'CTS5, ATAC / BIG 1-98',
  clinicalUse: 'Calcula el score clínico post-5 años en cáncer de mama ER positivo libre de recurrencia después de endocrinoterapia.',
  fields: [
    section('cts5_scope', 'Uso principal validado: mujer posmenopáusica con cáncer de mama ER positivo, sin recurrencia después de 5 años de endocrinoterapia.'),
    numberField('cts5_age', 'Edad al diagnóstico (años)', 60, { min: 18, step: 1 }),
    numberField('cts5_size', 'Tamaño tumoral (mm)', 20, { min: 0.1, step: 0.1 }),
    selectField('cts5_grade', 'Grado histológico', '2', GRADE_OPTIONS),
    numberField('cts5_nodes', 'Ganglios positivos', 0, { min: 0, step: 1 })
  ],
  calculate(values) {
    const calculated = cts5(values);
    if (!calculated.valid) return invalidRuleResult('CTS5', calculated);
    const riskBand = calculated.group === 'bajo' ? '<5%' : calculated.group === 'intermedio' ? '5–10%' : '>10%';
    return result({
      title: `CTS5 ${format(calculated.total, 2)} · ${calculated.group}`,
      detail: `Banda publicada de recurrencia distante en años 5–10: ${riskBand}.`,
      badge: 'recurrencia tardía',
      score: 0,
      showScore: false,
      severity: calculated.group === 'alto' ? 'bad' : calculated.group === 'intermedio' ? 'warn' : 'good',
      metrics: [
        { label: 'Score', value: format(calculated.total, 2) },
        { label: 'Grupo', value: calculated.group },
        { label: 'Categoría ganglionar', value: calculated.nodeCategory },
        { label: 'Tamaño usado', value: `${format(calculated.cappedSizeMm, 1)} mm` }
      ],
      notes: [
        calculated.sizeWasCapped
          ? 'El tamaño se limitó a 30 mm, como especifica el modelo.'
          : 'El tamaño ingresado no requirió el tope de 30 mm.',
        'CTS5 es pronóstico; no predice directamente el beneficio de prolongar endocrinoterapia.',
        'Puede requerir recalibración fuera de las poblaciones originales y debe usarse con cautela en premenopausia o HER2 positivo.'
      ]
    });
  }
});

export const LEGACY_CALCULATORS_32_35 = [
  NOTTINGHAM_PROGNOSTIC_INDEX_CALCULATOR,
  RESIDUAL_CANCER_BURDEN_EXPERIMENTAL_CALCULATOR,
  PEPI_BREAST_CALCULATOR,
  CTS5_BREAST_CALCULATOR
] as const;
