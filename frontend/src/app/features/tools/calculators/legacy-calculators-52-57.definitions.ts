import {
  defineCalculator,
  numberValue,
  result,
  stringValue,
  tableNote
} from './calculator.engine';
import {
  CalculatorField,
  CalculatorOption,
  CalculatorTableNote,
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

const YES_NO_OPTIONS = [option('no', 'No'), option('yes', 'Si')];

interface RuleError {
  readonly field: string;
  readonly message: string;
}

interface InvalidGiRule {
  readonly valid: false;
  readonly errors: readonly RuleError[];
  readonly warnings: readonly string[];
}

function invalidGiOutput(label: string, calculated: InvalidGiRule) {
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
      : category === 'poor' || category === 'high' ? 'bad' : 'info';
}

interface GameValid {
  readonly valid: true;
  readonly total: number;
  readonly category: 'low' | 'intermediate' | 'high';
  readonly tumorBurdenScore: number;
  readonly components: {
    readonly krasPoints: number;
    readonly ceaPoints: number;
    readonly nodePoints: number;
    readonly tumorBurdenPoints: number;
    readonly extrahepaticPoints: number;
  };
  readonly warnings: readonly string[];
}

type GameResult = GameValid | InvalidGiRule;

function game(values: CalculatorValues): GameResult {
  const krasStatus = stringValue(values, 'game_kras');
  const ceaNgMl = numberValue(values, 'game_cea');
  const largestLiverMetastasisCm = numberValue(values, 'game_largest_met');
  const liverMetastasisCount = numberValue(values, 'game_met_count');
  const errors: RuleError[] = [];
  if (!['wild_type', 'mutated'].includes(krasStatus)) {
    errors.push({ field: 'krasStatus', message: 'krasStatus debe ser uno de: mutated, wild_type' });
  }
  if (!Number.isFinite(ceaNgMl) || ceaNgMl < 0) {
    errors.push({ field: 'ceaNgMl', message: 'ceaNgMl no puede ser menor que 0' });
  }
  if (!Number.isFinite(largestLiverMetastasisCm) || largestLiverMetastasisCm <= 0) {
    errors.push({ field: 'largestLiverMetastasisCm', message: 'largestLiverMetastasisCm debe ser mayor que 0' });
  }
  if (!Number.isInteger(liverMetastasisCount) || liverMetastasisCount < 1) {
    errors.push({ field: 'liverMetastasisCount', message: 'liverMetastasisCount debe ser un numero entero' });
  }
  if (errors.length) return { valid: false, errors, warnings: [] };
  const tumorBurdenScore = Math.sqrt(
    largestLiverMetastasisCm * largestLiverMetastasisCm
    + liverMetastasisCount * liverMetastasisCount
  );
  const krasPoints = krasStatus === 'mutated' ? 1 : 0;
  const ceaPoints = ceaNgMl >= 20 ? 1 : 0;
  const nodePoints = isYes(values, 'game_node_positive') ? 1 : 0;
  const tumorBurdenPoints = tumorBurdenScore < 3 ? 0 : tumorBurdenScore < 9 ? 1 : 2;
  const extrahepaticPoints = isYes(values, 'game_extrahepatic') ? 2 : 0;
  const total = krasPoints + ceaPoints + nodePoints + tumorBurdenPoints + extrahepaticPoints;
  return {
    valid: true,
    total,
    category: total <= 1 ? 'low' : total <= 3 ? 'intermediate' : 'high',
    tumorBurdenScore,
    components: { krasPoints, ceaPoints, nodePoints, tumorBurdenPoints, extrahepaticPoints },
    warnings: []
  };
}

export const DIGESTIVE_GAME_CALCULATOR = defineCalculator({
  id: 'digestive_game',
  title: 'GAME — metástasis hepáticas colorrectales',
  category: 'digestivo',
  subtitle: 'Evaluación genética y morfológica preoperatoria.',
  source: 'Margonis, Sasaki et al., British Journal of Surgery 2018',
  clinicalUse: 'Estratifica el pronostico preoperatorio de metastasis hepaticas colorrectales con KRAS, CEA, ganglios del primario, carga hepatica y enfermedad extrahepatica.',
  fields: [
    section('game_biology_section', 'Biologia y tumor primario'),
    selectField('game_kras', 'KRAS', [option('wild_type', 'Wild-type'), option('mutated', 'Mutado')]),
    numberField('game_cea', 'CEA preoperatorio (ng/mL)', 10, { min: 0, step: 0.1 }),
    selectField('game_node_positive', 'Primario con ganglios positivos', YES_NO_OPTIONS),
    section('game_burden_section', 'Carga de metastasis',
      'TBS = raiz cuadrada de diametro maximo al cuadrado mas numero de metastasis al cuadrado.'),
    numberField('game_largest_met', 'Mayor metastasis hepatica (cm)', 2, { min: 0.01, step: 0.1 }),
    numberField('game_met_count', 'Numero de metastasis hepaticas', 1, { min: 1, step: 1 }),
    selectField('game_extrahepatic', 'Enfermedad extrahepatica', YES_NO_OPTIONS)
  ],
  calculate(values) {
    const calculated = game(values);
    if (!calculated.valid) return invalidGiOutput('GAME', calculated);
    const labels = { low: 'bajo', intermediate: 'intermedio', high: 'alto' } as const;
    return result({
      title: `GAME ${calculated.total} - ${labels[calculated.category]}`,
      detail: 'Estrato pronostico preoperatorio del modelo GAME.',
      badge: 'CRLM',
      score: 0,
      showScore: false,
      severity: prognosticSeverity(calculated.category),
      metrics: [
        { label: 'Puntaje', value: calculated.total },
        { label: 'TBS', value: fixed(calculated.tumorBurdenScore, 2) },
        { label: 'KRAS', value: calculated.components.krasPoints },
        { label: 'Extrahepatica', value: calculated.components.extrahepaticPoints }
      ],
      notes: [
        'Grupos publicados: 0-1 bajo, 2-3 intermedio y 4 o mas alto.',
        'El modelo utiliza KRAS especificamente; no sustituirlo automaticamente por un resultado RAS agregado.',
        'El puntaje describe pronostico y no define resecabilidad ni tratamiento.',
        ...calculated.warnings
      ]
    });
  }
});

const PCI_REGION_LABELS = [
  'Central', 'Superior derecha', 'Epigastrio', 'Superior izquierda', 'Flanco izquierdo',
  'Inferior izquierda', 'Pelvis', 'Inferior derecha', 'Flanco derecho', 'Yeyuno superior',
  'Yeyuno inferior', 'Ileon superior', 'Ileon inferior'
] as const;
const PCI_FIELD_LABELS = PCI_REGION_LABELS.map((label, index) => `${index} - ${label}`);
const PCI_OPTIONS = [
  option('0', 'LS0 - sin tumor visible'),
  option('1', 'LS1 - implante de hasta 0,5 cm'),
  option('2', 'LS2 - mayor de 0,5 y hasta 5 cm'),
  option('3', 'LS3 - mayor de 5 cm o confluente')
];

interface PciRegion {
  readonly id: number;
  readonly label: string;
  readonly lesionSizeScore: number;
}

interface PciValid {
  readonly valid: true;
  readonly total: number;
  readonly regions: readonly PciRegion[];
  readonly warnings: readonly string[];
}

type PciResult = PciValid | InvalidGiRule;

function pci(values: CalculatorValues): PciResult {
  const regions: PciRegion[] = [];
  const errors: RuleError[] = [];
  for (let index = 0; index < PCI_REGION_LABELS.length; index += 1) {
    const lesionSizeScore = numberValue(values, `pci_region_${index}`);
    if (!Number.isInteger(lesionSizeScore) || lesionSizeScore < 0 || lesionSizeScore > 3) {
      errors.push({
        field: `regions[${index}].lesionSizeScore`,
        message: 'lesionSizeScore debe ser un entero de 0 a 3'
      });
    }
    regions.push({ id: index, label: PCI_REGION_LABELS[index]!, lesionSizeScore });
  }
  if (errors.length) return { valid: false, errors, warnings: [] };
  return {
    valid: true,
    total: regions.reduce((sum, region) => sum + region.lesionSizeScore, 0),
    regions,
    warnings: []
  };
}

export const DIGESTIVE_PCI_CALCULATOR = defineCalculator({
  id: 'digestive_pci',
  title: 'Índice de cáncer peritoneal (PCI)',
  category: 'digestivo',
  subtitle: 'Carga peritoneal por 13 regiones de Sugarbaker.',
  source: 'Jacquet y Sugarbaker, 1996',
  clinicalUse: 'Cuantifica la distribucion y el tamano de implantes peritoneales en nueve regiones abdominopelvicas y cuatro segmentos de intestino delgado.',
  fields: [
    section('pci_abdominopelvic_section', 'Regiones abdominopelvicas 0-8',
      'Seleccionar el implante mayor de cada region. LS3 tambien incluye enfermedad confluente.'),
    ...PCI_FIELD_LABELS.slice(0, 9).map((label, index) =>
      selectField(`pci_region_${index}`, label, PCI_OPTIONS)),
    section('pci_small_bowel_section', 'Intestino delgado 9-12'),
    ...PCI_FIELD_LABELS.slice(9).map((label, offset) =>
      selectField(`pci_region_${offset + 9}`, label, PCI_OPTIONS))
  ],
  calculate(values) {
    const calculated = pci(values);
    if (!calculated.valid) return invalidGiOutput('PCI', calculated);
    const involved = calculated.regions.filter((item) => item.lesionSizeScore > 0);
    const highBurdenRegions = calculated.regions.filter((item) => item.lesionSizeScore === 3);
    return result({
      title: `PCI ${calculated.total} / 39`,
      detail: 'Suma de los puntajes LS0-LS3 de las 13 regiones.',
      badge: 'Sugarbaker PCI',
      score: 0,
      showScore: false,
      severity: 'info',
      metrics: [
        { label: 'PCI', value: `${calculated.total}/39` },
        { label: 'Regiones comprometidas', value: involved.length },
        { label: 'Regiones LS3', value: highBurdenRegions.length },
        { label: 'Regiones evaluadas', value: calculated.regions.length }
      ],
      notes: [
        involved.length
          ? `Compromiso registrado: ${involved.map((item) =>
            `${item.id} ${item.label} (LS${item.lesionSizeScore})`).join('; ')}.`
          : 'No se registraron implantes visibles en las 13 regiones.',
        'El PCI cuantifica carga peritoneal; no existe un corte universal aplicable a todas las histologias o centros.',
        'La estimacion radiologica puede diferir de la evaluacion laparoscopica o intraoperatoria.'
      ]
    });
  }
});

interface InvalidRtRule {
  readonly valid: false;
  readonly missing: readonly string[];
  readonly message: string;
}

function invalidRt(missing: readonly string[] = [], message = 'Faltan datos válidos para calcular.'): InvalidRtRule {
  return { valid: false, missing, message };
}

function invalidRtResult(label: string, evaluation: InvalidRtRule) {
  return result({
    title: 'Datos incompletos o incompatibles',
    detail: evaluation.missing.length
      ? `Revisar: ${evaluation.missing.join(', ')}.`
      : evaluation.message || 'No fue posible completar el cálculo.',
    badge: label,
    score: 0,
    showScore: false,
    severity: 'warn',
    metrics: [],
    notes: ['Corregí las variables antes de interpretar el resultado.']
  });
}

function rtBaseResult(config: Parameters<typeof result>[0]) {
  return result(config);
}

function fmt(value: number, digits = 2): string {
  return Number(value).toFixed(digits).replace('.', ',');
}

function signed(value: number, digits = 2): string {
  return `${Number(value) >= 0 ? '+' : '−'}${fmt(Math.abs(value), digits)}`;
}

function metricName(targetType: string): string {
  return targetType === 'bed' ? 'BED' : targetType === 'eqd2' ? 'EQD2' : 'dosis física';
}

function gyAlphaBeta(alphaBeta: number): string {
  return `Gy (α/β ${fmt(alphaBeta, 1)})`;
}

function lqLimitations(highDosePerFraction = false): readonly string[] {
  return [
    highDosePerFraction
      ? 'Dosis por fracción >5 Gy: el modelo LQ sigue siendo una estimación y su extrapolación es especialmente incierta en hipofraccionamiento extremo.'
      : 'El modelo LQ es una aproximación; la incertidumbre aumenta al alejarse del fraccionamiento convencional.',
    'No incorpora tiempo total, repoblación, reparación incompleta, heterogeneidad de dosis, recuperación tisular ni reirradiación.',
    'Usar la dosis realmente recibida por el tejido analizado. El resultado no constituye una prescripción ni un límite automático de órgano a riesgo.'
  ];
}

interface ScheduleMetrics {
  readonly fractions: number;
  readonly dosePerFraction: number;
  readonly totalDose: number;
  readonly bed: number;
  readonly eqd2: number;
}

function scheduleMetrics(fractions: number, dosePerFraction: number, alphaBeta: number): ScheduleMetrics {
  const totalDose = fractions * dosePerFraction;
  const bed = totalDose * (1 + dosePerFraction / alphaBeta);
  const eqd2 = bed / (1 + 2 / alphaBeta);
  return { fractions, dosePerFraction, totalDose, bed, eqd2 };
}

function targetMetric(metrics: ScheduleMetrics, targetType: string): number {
  return targetType === 'bed' ? metrics.bed : targetType === 'eqd2' ? metrics.eqd2 : metrics.totalDose;
}

interface DoseTargetValid extends ScheduleMetrics {
  readonly valid: true;
  readonly targetType: 'bed' | 'eqd2';
  readonly targetValue: number;
  readonly alphaBeta: number;
  readonly achievedTarget: number;
  readonly highDosePerFraction: boolean;
}

type DoseTargetResult = DoseTargetValid | InvalidRtRule;

function dosePerFractionForTarget(
  targetType: string,
  targetValue: number,
  fractions: number,
  alphaBeta: number
): DoseTargetResult {
  const missing: string[] = [];
  if (!['bed', 'eqd2'].includes(targetType)) missing.push('magnitud objetivo BED o EQD2');
  if (!Number.isFinite(targetValue) || targetValue <= 0) missing.push('valor objetivo mayor que cero');
  if (!Number.isFinite(alphaBeta) || alphaBeta <= 0) missing.push('relación α/β mayor que cero');
  if (!Number.isFinite(fractions) || fractions <= 0 || !Number.isInteger(fractions)) {
    missing.push('número entero de fracciones');
  }
  if (missing.length) return invalidRt(missing);
  const normalizedTarget = targetType as 'bed' | 'eqd2';
  const discriminant = normalizedTarget === 'bed'
    ? alphaBeta * alphaBeta + (4 * alphaBeta * targetValue) / fractions
    : alphaBeta * alphaBeta + (4 * targetValue * (2 + alphaBeta)) / fractions;
  if (!Number.isFinite(discriminant) || discriminant <= 0) {
    return invalidRt(['combinación con solución positiva'],
      'No existe una solución física positiva para esos datos.');
  }
  const dosePerFraction = (-alphaBeta + Math.sqrt(discriminant)) / 2;
  if (!Number.isFinite(dosePerFraction) || dosePerFraction <= 0) {
    return invalidRt(['combinación con solución positiva'],
      'No existe una dosis por fracción positiva para esos datos.');
  }
  const metrics = scheduleMetrics(fractions, dosePerFraction, alphaBeta);
  return {
    valid: true,
    targetType: normalizedTarget,
    targetValue,
    alphaBeta,
    ...metrics,
    achievedTarget: targetMetric(metrics, normalizedTarget),
    highDosePerFraction: dosePerFraction > 5
  };
}

const TARGET_OPTIONS = [option('eqd2', 'EQD2 objetivo'), option('bed', 'BED objetivo')];

export const RT_DOSE_PER_FRACTION_TARGET_CALCULATOR = defineCalculator({
  id: 'rt-dose-per-fraction-target',
  title: 'Dosis por fracción desde BED o EQD2',
  shortTitle: 'Dosis/fracción · BED o EQD2',
  category: 'radioterapia',
  subtitle: 'Resuelve la dosis por fracción para un efecto biológico objetivo.',
  source: 'Modelo LQ · Pangea',
  clinicalUse: 'Calcula la raíz positiva de la ecuación LQ cuando se conocen BED o EQD2 objetivo, número entero de fracciones y α/β.',
  fields: [
    section('rt_dpf_scope', 'Conversión inversa del modelo LQ',
      'Elegí BED o EQD2; la herramienta informa también dosis física total y la otra magnitud biológica.'),
    selectField('scenario', 'Magnitud objetivo', TARGET_OPTIONS, {
      initialValue: 'eqd2', exampleValue: 'eqd2', wide: true
    }),
    numberField('rt_dpf_target', 'Valor objetivo', 60, { min: 0.01, step: 0.01 }),
    numberField('rt_dpf_fractions', 'Número de fracciones', 30, { min: 1, step: 1 }),
    numberField('rt_dpf_alpha_beta', 'Relación α/β (Gy)', 10, { min: 0.1, step: 0.1 })
  ],
  calculate(values) {
    const calculated = dosePerFractionForTarget(
      stringValue(values, 'scenario'),
      numberValue(values, 'rt_dpf_target'),
      numberValue(values, 'rt_dpf_fractions'),
      numberValue(values, 'rt_dpf_alpha_beta')
    );
    if (!calculated.valid) return invalidRtResult('Conversión LQ', calculated);
    return rtBaseResult({
      title: `${fmt(calculated.dosePerFraction, 3)} Gy por fracción`,
      detail: `${calculated.fractions} fracciones entregan ${fmt(calculated.totalDose)} Gy físicos.`,
      badge: `${metricName(calculated.targetType)} objetivo`,
      score: 0,
      showScore: false,
      severity: calculated.highDosePerFraction ? 'warn' : 'info',
      metrics: [
        { label: 'Dosis por fracción', value: `${fmt(calculated.dosePerFraction, 3)} Gy` },
        { label: 'Dosis total', value: `${fmt(calculated.totalDose)} Gy` },
        { label: 'BED', value: `${fmt(calculated.bed)} ${gyAlphaBeta(calculated.alphaBeta)}` },
        { label: 'EQD2', value: `${fmt(calculated.eqd2)} ${gyAlphaBeta(calculated.alphaBeta)}` }
      ],
      notes: lqLimitations(calculated.highDosePerFraction)
    });
  }
});

interface FractionCandidate extends ScheduleMetrics {
  readonly achievedTarget: number;
  readonly deviation: number;
}

interface FractionsTargetValid {
  readonly valid: true;
  readonly targetType: 'bed' | 'eqd2';
  readonly targetValue: number;
  readonly alphaBeta: number;
  readonly dosePerFraction: number;
  readonly theoreticalFractions: number;
  readonly isInteger: boolean;
  readonly candidates: readonly FractionCandidate[];
  readonly highDosePerFraction: boolean;
}

type FractionsTargetResult = FractionsTargetValid | InvalidRtRule;

function fractionsForTarget(
  targetType: string,
  targetValue: number,
  dosePerFraction: number,
  alphaBeta: number
): FractionsTargetResult {
  const missing: string[] = [];
  if (!['bed', 'eqd2'].includes(targetType)) missing.push('magnitud objetivo BED o EQD2');
  if (!Number.isFinite(targetValue) || targetValue <= 0) missing.push('valor objetivo mayor que cero');
  if (!Number.isFinite(alphaBeta) || alphaBeta <= 0) missing.push('relación α/β mayor que cero');
  if (!Number.isFinite(dosePerFraction) || dosePerFraction <= 0) {
    missing.push('dosis por fracción mayor que cero');
  }
  if (missing.length) return invalidRt(missing);
  const normalizedTarget = targetType as 'bed' | 'eqd2';
  const effectPerFraction = normalizedTarget === 'bed'
    ? dosePerFraction * (1 + dosePerFraction / alphaBeta)
    : dosePerFraction * (dosePerFraction + alphaBeta) / (2 + alphaBeta);
  const theoreticalFractions = targetValue / effectPerFraction;
  if (!Number.isFinite(theoreticalFractions) || theoreticalFractions <= 0) {
    return invalidRt(['combinación con solución positiva'],
      'No existe un número de fracciones positivo para esos datos.');
  }
  const roundedInteger = Math.round(theoreticalFractions);
  const isInteger = Math.abs(theoreticalFractions - roundedInteger) < 1e-9;
  const neighborValues = isInteger
    ? [Math.max(1, roundedInteger)]
    : [Math.floor(theoreticalFractions), Math.ceil(theoreticalFractions)].filter((value) => value >= 1);
  const candidates = [...new Set(neighborValues)].map((fractions) => {
    const metrics = scheduleMetrics(fractions, dosePerFraction, alphaBeta);
    const achievedTarget = targetMetric(metrics, normalizedTarget);
    return { ...metrics, achievedTarget, deviation: achievedTarget - targetValue };
  });
  return {
    valid: true,
    targetType: normalizedTarget,
    targetValue,
    alphaBeta,
    dosePerFraction,
    theoreticalFractions,
    isInteger,
    candidates,
    highDosePerFraction: dosePerFraction > 5
  };
}

function integerCandidateTable(calculated: FractionsTargetValid): CalculatorTableNote {
  const label = metricName(calculated.targetType);
  return tableNote('Comparación de fracciones enteras',
    ['Fracciones', 'Dosis total', 'BED', 'EQD2', `Δ ${label}`],
    calculated.candidates.map((candidate) => [
      candidate.fractions,
      `${fmt(candidate.totalDose)} Gy`,
      `${fmt(candidate.bed)} ${gyAlphaBeta(calculated.alphaBeta)}`,
      `${fmt(candidate.eqd2)} ${gyAlphaBeta(calculated.alphaBeta)}`,
      signed(candidate.deviation)
    ]));
}

export const RT_FRACTIONS_TARGET_CALCULATOR = defineCalculator({
  id: 'rt-fractions-target',
  title: 'Número de fracciones desde BED o EQD2',
  shortTitle: 'N.º de fracciones · BED o EQD2',
  category: 'radioterapia',
  subtitle: 'Muestra el resultado teórico y recalcula los enteros vecinos.',
  source: 'Modelo LQ · Pangea',
  clinicalUse: 'Obtiene el número teórico de fracciones para una dosis por fracción dada. Si no es entero, compara ambos enteros adyacentes sin redondear silenciosamente.',
  fields: [
    section('rt_n_scope', 'Fracciones administrables',
      'Un resultado decimal es sólo algebraico. La tabla recalcula BED y EQD2 para los números enteros inferior y superior.'),
    selectField('scenario', 'Magnitud objetivo', TARGET_OPTIONS, {
      initialValue: 'eqd2', exampleValue: 'eqd2', wide: true
    }),
    numberField('rt_n_target', 'Valor objetivo', 60, { min: 0.01, step: 0.01 }),
    numberField('rt_n_dose', 'Dosis por fracción (Gy)', 3, { min: 0.01, step: 0.01 }),
    numberField('rt_n_alpha_beta', 'Relación α/β (Gy)', 10, { min: 0.1, step: 0.1 })
  ],
  calculate(values) {
    const calculated = fractionsForTarget(
      stringValue(values, 'scenario'),
      numberValue(values, 'rt_n_target'),
      numberValue(values, 'rt_n_dose'),
      numberValue(values, 'rt_n_alpha_beta')
    );
    if (!calculated.valid) return invalidRtResult('Conversión LQ', calculated);
    return rtBaseResult({
      title: calculated.isInteger
        ? `${calculated.candidates[0]!.fractions} fracciones`
        : `${fmt(calculated.theoreticalFractions, 3)} fracciones teóricas`,
      detail: calculated.isInteger
        ? 'El resultado algebraico ya es un número entero.'
        : 'Las fracciones deben ser enteras; compará el efecto de ambos esquemas adyacentes.',
      badge: `${metricName(calculated.targetType)} objetivo`,
      score: 0,
      showScore: false,
      severity: calculated.highDosePerFraction || !calculated.isInteger ? 'warn' : 'info',
      metrics: [
        { label: 'Fracciones teóricas', value: fmt(calculated.theoreticalFractions, 3) },
        { label: 'Dosis por fracción', value: `${fmt(calculated.dosePerFraction)} Gy` },
        { label: 'Objetivo', value: `${fmt(calculated.targetValue)} ${gyAlphaBeta(calculated.alphaBeta)}` },
        { label: 'α/β', value: `${fmt(calculated.alphaBeta, 1)} Gy` }
      ],
      notes: [
        integerCandidateTable(calculated),
        'La tabla compara los enteros matemáticamente adyacentes; no señala uno como preferido.',
        ...lqLimitations(calculated.highDosePerFraction)
      ]
    });
  }
});

const SIMULTANEOUS_TARGET_OPTIONS = [
  option('physical', 'Dosis física total'), option('eqd2', 'EQD2')
];
const RESOLUTION_OPTIONS = [
  option('0.01', '0,01 Gy'), option('0.05', '0,05 Gy'), option('0.1', '0,10 Gy')
];

interface SimultaneousVolume extends ScheduleMetrics {
  readonly index: number;
  readonly target: number;
  readonly tolerance: number;
  readonly idealDosePerFraction: number;
  readonly achieved: number;
  readonly deviation: number;
  readonly absoluteDeviation: number;
}

interface SimultaneousCandidate {
  readonly fractions: number;
  readonly volumes: readonly SimultaneousVolume[];
  readonly score: number;
  readonly maxDeviation: number;
}

interface SimultaneousValid {
  readonly valid: true;
  readonly targetType: 'physical' | 'eqd2';
  readonly alphaBeta: number;
  readonly minDosePerFraction: number;
  readonly maxDosePerFraction: number;
  readonly resolution: number;
  readonly candidates: readonly SimultaneousCandidate[];
  readonly searchedFractions: 200;
  readonly highDoseCandidates: boolean;
}

type SimultaneousResult = SimultaneousValid | InvalidRtRule;

function roundedToResolution(value: number, resolution: number): number {
  return Number((Math.round(value / resolution) * resolution).toFixed(6));
}

function idealDosePerFraction(
  targetType: 'physical' | 'eqd2',
  targetValue: number,
  fractions: number,
  alphaBeta: number
): number {
  if (targetType === 'physical') return targetValue / fractions;
  const solved = dosePerFractionForTarget(targetType, targetValue, fractions, alphaBeta);
  return solved.valid ? solved.dosePerFraction : Number.NaN;
}

function simultaneousFractionation(
  targetType: string,
  targets: readonly number[],
  tolerances: readonly number[],
  alphaBeta: number,
  minDosePerFraction: number,
  maxDosePerFraction: number,
  resolution: number
): SimultaneousResult {
  const missing: string[] = [];
  if (!['physical', 'eqd2'].includes(targetType)) missing.push('tipo de objetivo');
  if (![2, 3].includes(targets.length)) missing.push('dos o tres volúmenes');
  if (tolerances.length !== targets.length) missing.push('tolerancia para cada volumen');
  targets.forEach((value, index) => {
    if (!Number.isFinite(value) || value <= 0) missing.push(`objetivo del volumen ${index + 1}`);
  });
  tolerances.forEach((value, index) => {
    if (!Number.isFinite(value) || value < 0) missing.push(`tolerancia del volumen ${index + 1}`);
  });
  if (!Number.isFinite(alphaBeta) || alphaBeta <= 0) missing.push('relación α/β mayor que cero');
  if (!Number.isFinite(minDosePerFraction) || minDosePerFraction <= 0) {
    missing.push('dosis mínima por fracción');
  }
  if (!Number.isFinite(maxDosePerFraction) || maxDosePerFraction <= 0) {
    missing.push('dosis máxima por fracción');
  }
  if (Number.isFinite(minDosePerFraction) && Number.isFinite(maxDosePerFraction)
    && minDosePerFraction > maxDosePerFraction) {
    missing.push('rango de dosis por fracción ordenado');
  }
  if (![0.01, 0.05, 0.1].includes(resolution)) {
    missing.push('resolución de 0,01, 0,05 o 0,10 Gy');
  }
  if (missing.length) return invalidRt([...new Set(missing)]);
  const normalizedTarget = targetType as 'physical' | 'eqd2';
  const candidates: SimultaneousCandidate[] = [];
  for (let fractions = 1; fractions <= 200; fractions += 1) {
    const volumes = targets.map((target, index): SimultaneousVolume => {
      const idealDose = idealDosePerFraction(normalizedTarget, target, fractions, alphaBeta);
      const dosePerFraction = roundedToResolution(idealDose, resolution);
      const metrics = scheduleMetrics(fractions, dosePerFraction, alphaBeta);
      const achieved = targetMetric(metrics, normalizedTarget);
      return {
        index: index + 1,
        target,
        tolerance: tolerances[index]!,
        idealDosePerFraction: idealDose,
        ...metrics,
        achieved,
        deviation: achieved - target,
        absoluteDeviation: Math.abs(achieved - target)
      };
    });
    const dosesInRange = volumes.every((volume) => Number.isFinite(volume.dosePerFraction)
      && volume.dosePerFraction + 1e-9 >= minDosePerFraction
      && volume.dosePerFraction - 1e-9 <= maxDosePerFraction);
    const withinTolerance = volumes.every((volume) =>
      volume.absoluteDeviation <= volume.tolerance + 1e-9);
    if (!dosesInRange || !withinTolerance) continue;
    const score = volumes.reduce((sum, volume) => {
      const denominator = volume.tolerance > 0 ? volume.tolerance : resolution;
      return sum + volume.absoluteDeviation / denominator;
    }, 0);
    candidates.push({
      fractions,
      volumes,
      score,
      maxDeviation: Math.max(...volumes.map((volume) => volume.absoluteDeviation))
    });
  }
  candidates.sort((left, right) => left.score - right.score
    || left.maxDeviation - right.maxDeviation || left.fractions - right.fractions);
  return {
    valid: true,
    targetType: normalizedTarget,
    alphaBeta,
    minDosePerFraction,
    maxDosePerFraction,
    resolution,
    candidates,
    searchedFractions: 200,
    highDoseCandidates: candidates.some((candidate) =>
      candidate.volumes.some((volume) => volume.dosePerFraction > 5))
  };
}

function simultaneousCandidateTable(
  calculated: SimultaneousValid,
  volumeLabels: readonly string[]
): CalculatorTableNote {
  const visible = calculated.candidates.slice(0, 12);
  const label = calculated.targetType === 'physical' ? 'Dosis física' : 'EQD2';
  return tableNote(
    `${label} objetivo · se muestran ${visible.length} de ${calculated.candidates.length} candidatos.`,
    ['Fracciones', ...volumeLabels],
    visible.map((candidate) => [
      `${candidate.fractions} fracciones comunes`,
      ...candidate.volumes.map((volume) =>
        `${fmt(volume.dosePerFraction)} Gy/fracción · D ${fmt(volume.totalDose)} Gy · EQD2 ${fmt(volume.eqd2)} · Δ ${signed(volume.deviation)}`)
    ])
  );
}

function simultaneousCalculator(volumeCount: 2 | 3) {
  const prefix = `rt_sib${volumeCount}`;
  const volumeLabels = volumeCount === 2
    ? ['Volumen alto', 'Volumen bajo'] as const
    : ['Volumen alto', 'Volumen medio', 'Volumen bajo'] as const;
  const targetExamples = volumeCount === 2 ? [70, 56] : [70, 63, 56];
  const targetFields = volumeLabels.flatMap((label, index) => [
    numberField(`${prefix}_target_${index + 1}`, `Objetivo · ${label}`, targetExamples[index]!, {
      min: 0.01,
      step: 0.01,
      help: 'Se interpreta como Gy físicos o EQD2 según la magnitud seleccionada.'
    }),
    numberField(`${prefix}_tolerance_${index + 1}`, `Tolerancia · ${label} (Gy)`, 0.1, {
      min: 0,
      step: 0.01
    })
  ]);
  return defineCalculator({
    id: `rt-simultaneous-${volumeCount}-volumes`,
    title: `Fraccionamiento simultáneo · ${volumeCount} volúmenes`,
    shortTitle: `SIB · ${volumeCount} volúmenes`,
    category: 'radioterapia',
    subtitle: `Esquemas con un número común de fracciones para ${volumeCount} niveles de dosis.`,
    source: 'Modelo LQ · Pangea',
    clinicalUse: `Explora esquemas matemáticos de boost simultáneo para ${volumeCount} volúmenes, con objetivos en dosis física o EQD2. Reemplaza la búsqueda por fuerza bruta original por una enumeración reproducible de fracciones enteras.`,
    fields: [
      section(`${prefix}_scope`, 'Definí la magnitud y los límites',
        'Cada fila candidata usa el mismo número de fracciones en todos los volúmenes. La tabla se ordena por menor desviación numérica, no por preferencia clínica.'),
      selectField('scenario', 'Magnitud de los objetivos', SIMULTANEOUS_TARGET_OPTIONS, {
        initialValue: 'physical',
        exampleValue: 'physical',
        wide: true,
        help: 'Dosis física reproduce el planificador directo; EQD2 reproduce su variante radiobiológica.'
      }),
      ...targetFields,
      section(`${prefix}_delivery`, 'Resolución y rango de entrega',
        'La resolución redondea cada dosis por fracción antes de comprobar la tolerancia.'),
      numberField(`${prefix}_alpha_beta`, 'Relación α/β (Gy)', 10, { min: 0.1, step: 0.1 }),
      numberField(`${prefix}_min_dose`, 'Dosis mínima por fracción (Gy)', 1.5, { min: 0.01, step: 0.01 }),
      numberField(`${prefix}_max_dose`, 'Dosis máxima por fracción (Gy)', 3, { min: 0.01, step: 0.01 }),
      selectField(`${prefix}_resolution`, 'Resolución de dosis por fracción', RESOLUTION_OPTIONS, {
        initialValue: '0.01', exampleValue: '0.01'
      })
    ],
    calculate(values) {
      const calculated = simultaneousFractionation(
        stringValue(values, 'scenario'),
        volumeLabels.map((_, index) => numberValue(values, `${prefix}_target_${index + 1}`)),
        volumeLabels.map((_, index) => numberValue(values, `${prefix}_tolerance_${index + 1}`)),
        numberValue(values, `${prefix}_alpha_beta`),
        numberValue(values, `${prefix}_min_dose`),
        numberValue(values, `${prefix}_max_dose`),
        numberValue(values, `${prefix}_resolution`)
      );
      if (!calculated.valid) return invalidRtResult(`SIB ${volumeCount} volúmenes`, calculated);
      if (!calculated.candidates.length) {
        return rtBaseResult({
          title: 'No hay esquemas dentro de esos límites',
          detail: 'La combinación de objetivos, tolerancias, resolución y rango de dosis por fracción no produjo candidatos.',
          badge: `SIB ${volumeCount} volúmenes`,
          score: 0,
          showScore: false,
          severity: 'warn',
          metrics: [
            { label: 'Fracciones exploradas', value: `1–${calculated.searchedFractions}` },
            { label: 'Resolución', value: `${fmt(calculated.resolution)} Gy` },
            { label: 'α/β', value: `${fmt(calculated.alphaBeta, 1)} Gy` }
          ],
          notes: [
            'Revisá que los objetivos correspondan a la magnitud seleccionada y que la dosis mínima no supere la máxima.',
            'Si corresponde clínicamente, podés ampliar la tolerancia o el rango de dosis por fracción y volver a calcular.',
            ...lqLimitations(false)
          ]
        });
      }
      const fractionValues = calculated.candidates.map((candidate) => candidate.fractions);
      return rtBaseResult({
        title: calculated.candidates.length === 1
          ? '1 esquema matemático compatible'
          : `${calculated.candidates.length} esquemas matemáticos compatibles`,
        detail: `${metricName(calculated.targetType).replace(/^./, (letter) => letter.toUpperCase())} como objetivo, resolución ${fmt(calculated.resolution)} Gy y α/β ${fmt(calculated.alphaBeta, 1)} Gy.`,
        badge: `SIB ${volumeCount} volúmenes`,
        score: 0,
        showScore: false,
        severity: calculated.highDoseCandidates ? 'warn' : 'info',
        metrics: [
          { label: 'Candidatos', value: calculated.candidates.length },
          { label: 'Rango de fracciones', value: `${Math.min(...fractionValues)}–${Math.max(...fractionValues)}` },
          { label: 'Resolución', value: `${fmt(calculated.resolution)} Gy` },
          { label: 'α/β', value: `${fmt(calculated.alphaBeta, 1)} Gy` }
        ],
        notes: [
          simultaneousCandidateTable(calculated, volumeLabels),
          'Los candidatos están ordenados por precisión matemática. La selección final requiere objetivos clínicos, DVH, restricciones de órganos a riesgo, técnica y control de calidad.',
          ...lqLimitations(calculated.highDoseCandidates)
        ]
      });
    }
  });
}

export const RT_SIMULTANEOUS_2_VOLUMES_CALCULATOR = simultaneousCalculator(2);
export const RT_SIMULTANEOUS_3_VOLUMES_CALCULATOR = simultaneousCalculator(3);

export const LEGACY_CALCULATORS_52_57 = [
  DIGESTIVE_GAME_CALCULATOR,
  DIGESTIVE_PCI_CALCULATOR,
  RT_DOSE_PER_FRACTION_TARGET_CALCULATOR,
  RT_FRACTIONS_TARGET_CALCULATOR,
  RT_SIMULTANEOUS_2_VOLUMES_CALCULATOR,
  RT_SIMULTANEOUS_3_VOLUMES_CALCULATOR
] as const;
