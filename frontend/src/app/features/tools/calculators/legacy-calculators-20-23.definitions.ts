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

interface NephrometryResult {
  readonly total: number;
  readonly complexity: 'baja' | 'moderada' | 'alta';
  readonly suffix: string;
}

function renalNephrometry(values: CalculatorValues): NephrometryResult {
  const size = numberValue(values, 'renalSize');
  const radius = size <= 4 ? 1 : size < 7 ? 2 : 3;
  const total = radius
    + numberValue(values, 'renalExo')
    + numberValue(values, 'renalNear')
    + numberValue(values, 'renalLocation');
  const complexity = total <= 6 ? 'baja' : total <= 9 ? 'moderada' : 'alta';
  const anteriorPosterior = stringValue(values, 'renalAp');
  const descriptor = ['a', 'p', 'x'].includes(anteriorPosterior) ? anteriorPosterior : 'x';
  return {
    total,
    complexity,
    suffix: `${descriptor}${booleanValue(values, 'renalHilar') ? 'h' : ''}`
  };
}

function paduaNephrometry(values: CalculatorValues): NephrometryResult {
  const size = numberValue(values, 'paduaSize');
  const sizePoints = size <= 4 ? 1 : size <= 7 ? 2 : 3;
  const total = numberValue(values, 'paduaLong')
    + numberValue(values, 'paduaExo')
    + numberValue(values, 'paduaRim')
    + numberValue(values, 'paduaSinus')
    + numberValue(values, 'paduaCollecting')
    + sizePoints;
  const complexity = total <= 7 ? 'baja' : total <= 9 ? 'moderada' : 'alta';
  const anteriorPosterior = stringValue(values, 'paduaAp');
  return {
    total,
    complexity,
    suffix: ['a', 'p', 'x'].includes(anteriorPosterior) ? anteriorPosterior : 'x'
  };
}

export const RENAL_COMPLEXITY_CALCULATOR = defineCalculator({
  id: 'renal-complexity',
  title: 'RENAL / PADUA',
  category: 'renal',
  subtitle: 'Complejidad anatómica, con escalas separadas.',
  source: 'RENAL nephrometry 2009 · PADUA 2009',
  clinicalUse: 'Describe complejidad anatómica de una masa renal. No estima malignidad ni indica por sí sola cirugía, ablación o vigilancia.',
  fields: [
    selectField('scenario', 'Escala', 'renal', [
      option('renal', 'RENAL nephrometry'),
      option('padua', 'PADUA')
    ], {
      initialValue: 'renal',
      required: false,
      wide: true,
      help: 'Las definiciones y los grupos no se mezclan.'
    }),
    section(
      'renal_anatomy',
      'RENAL nephrometry',
      'R + E + N + L, descriptor anterior/posterior y sufijo hiliar.',
      'renal'
    ),
    numberField('renalSize', 'Radio: diámetro máximo (cm)', 3.2, {
      min: 0.1,
      step: 0.1,
      scenario: 'renal'
    }),
    selectField('renalExo', 'Exofítico/endofítico', '1', [
      option('1', '≥50% exofítico'),
      option('2', '<50% exofítico'),
      option('3', 'Completamente endofítico')
    ], { scenario: 'renal' }),
    selectField('renalNear', 'Distancia a seno/sistema colector', '1', [
      option('1', '≥7 mm'),
      option('2', '>4 y <7 mm'),
      option('3', '≤4 mm')
    ], { scenario: 'renal' }),
    selectField('renalAp', 'Cara', 'x', [
      option('a', 'Anterior (a)'),
      option('p', 'Posterior (p)'),
      option('x', 'Indeterminada (x)')
    ], { scenario: 'renal', help: 'Descriptor, sin puntos.' }),
    selectField('renalLocation', 'Relación con líneas polares', '1', [
      option('1', 'Completamente polar'),
      option('2', 'Cruza una línea polar'),
      option('3', 'Central / >50% más allá / cruza línea media')
    ], { scenario: 'renal' }),
    checkbox('renalHilar', 'Toca arteria o vena renal principal (h)', {
      scenario: 'renal',
      help: 'Se informa como sufijo; no suma puntos.'
    }),
    section(
      'padua_anatomy',
      'PADUA',
      'Seis componentes puntuados y descriptor anterior/posterior.',
      'padua'
    ),
    numberField('paduaSize', 'Diámetro máximo (cm)', 3.2, {
      min: 0.1,
      step: 0.1,
      scenario: 'padua'
    }),
    selectField('paduaLong', 'Ubicación longitudinal', '1', [
      option('1', 'Polar o cruza <50% línea sinusal'),
      option('2', 'Central o cruza >50%')
    ], { scenario: 'padua' }),
    selectField('paduaExo', 'Exofítico/endofítico', '1', [
      option('1', '≥50% exofítico'),
      option('2', '<50% exofítico'),
      option('3', 'Completamente endofítico')
    ], { scenario: 'padua' }),
    selectField('paduaRim', 'Borde renal', '1', [
      option('1', 'Lateral'),
      option('2', 'Medial')
    ], { scenario: 'padua' }),
    selectField('paduaSinus', 'Seno renal', '1', [
      option('1', 'No involucrado'),
      option('2', 'Involucrado')
    ], { scenario: 'padua' }),
    selectField('paduaCollecting', 'Sistema colector', '1', [
      option('1', 'No involucrado'),
      option('2', 'Desplazado o infiltrado')
    ], { scenario: 'padua' }),
    selectField('paduaAp', 'Cara', 'x', [
      option('a', 'Anterior (a)'),
      option('p', 'Posterior (p)'),
      option('x', 'Indeterminada (x)')
    ], { scenario: 'padua', help: 'Descriptor, sin puntos.' })
  ],
  calculate(values) {
    const isPadua = stringValue(values, 'scenario') === 'padua';
    const calculated = isPadua ? paduaNephrometry(values) : renalNephrometry(values);
    const name = isPadua ? 'PADUA' : 'RENAL';
    return result({
      title: `${name} ${calculated.total}${calculated.suffix}: complejidad ${calculated.complexity}`,
      detail: 'Resultado anatómico de la escala seleccionada; no es una probabilidad de malignidad ni de complicaciones.',
      badge: name,
      score: 0,
      showScore: false,
      severity: 'info',
      metrics: [
        { label: name, value: `${calculated.total}${calculated.suffix}` },
        { label: 'Complejidad', value: calculated.complexity },
        { label: 'Tamaño', value: `${numberValue(values, isPadua ? 'paduaSize' : 'renalSize')} cm` }
      ],
      notes: [
        isPadua
          ? 'PADUA total 6–14: 6–7 baja, 8–9 moderada, ≥10 alta.'
          : 'RENAL total 4–12: 4–6 baja, 7–9 moderada, 10–12 alta.',
        'Corroborar cada descriptor en imágenes multiplanares con contraste cuando sea posible.'
      ]
    });
  }
});

interface LeibovichResult {
  readonly total: number;
  readonly category: 'bajo' | 'intermedio' | 'alto';
}

function leibovich2003(values: CalculatorValues): LeibovichResult {
  const pt = stringValue(values, 'leibPt').toLowerCase();
  const tPoints = pt === 'pt1a' ? 0
    : pt === 'pt1b' ? 2
      : pt.startsWith('pt2') ? 3
        : pt.startsWith('pt3') || pt.startsWith('pt4') ? 4 : 0;
  const grade = numberValue(values, 'leibGrade');
  const gradePoints = grade >= 4 ? 3 : grade === 3 ? 1 : 0;
  const total = tPoints
    + (booleanValue(values, 'leibPn') ? 2 : 0)
    + (numberValue(values, 'leibSize') >= 10 ? 1 : 0)
    + gradePoints
    + (booleanValue(values, 'leibNecrosis') ? 1 : 0);
  return { total, category: total <= 2 ? 'bajo' : total <= 5 ? 'intermedio' : 'alto' };
}

interface UissResult {
  readonly key: 'not_localized' | 'low' | 'intermediate' | 'high';
  readonly label: string;
}

function uissLocalized(values: CalculatorValues): UissResult {
  if (stringValue(values, 'uissN') === 'nplus' || stringValue(values, 'uissM') === 'm1') {
    return { key: 'not_localized', label: 'No corresponde al UISS localizado' };
  }
  const pt = stringValue(values, 'uissPt').toLowerCase();
  const grade = numberValue(values, 'uissGrade');
  const ecog = numberValue(values, 'uissEcog');
  if (pt.startsWith('pt1') && grade <= 2 && ecog === 0) {
    return { key: 'low', label: 'Bajo riesgo' };
  }
  if ((pt.startsWith('pt3') && grade >= 2 && ecog >= 1) || pt.startsWith('pt4')) {
    return { key: 'high', label: 'Alto riesgo' };
  }
  return { key: 'intermediate', label: 'Riesgo intermedio' };
}

export const LEIBOVICH_CALCULATOR = defineCalculator({
  id: 'leibovich',
  title: 'Leibovich 2003 / UISS localizado',
  category: 'renal',
  subtitle: 'Modelos posnefrectomía separados y sin porcentajes locales.',
  source: 'EAU RCC 2026 · Leibovich 2003 · UISS',
  clinicalUse: 'Leibovich 2003 estratifica recurrencia en ccRCC M0 operado. UISS localizado resume estadio, grado y ECOG, especialmente útil como referencia en no-ccRCC. SSIGN se retiró por no ser equivalente con TNM moderno.',
  fields: [
    selectField('scenario', 'Modelo', 'leibovich', [
      option('leibovich', 'Leibovich 2003 — ccRCC M0'),
      option('uiss', 'UISS — enfermedad localizada')
    ], {
      initialValue: 'leibovich',
      required: false,
      wide: true,
      help: 'No combinar las dos escalas.'
    }),
    section(
      'leibovich_path',
      'Leibovich 2003',
      'ccRCC esporádico, unilateral, operado, pT1–4, N0/N+, M0.',
      'leibovich'
    ),
    selectField('leibPt', 'pT', 'pt1a', [
      option('pt1a', 'pT1a'), option('pt1b', 'pT1b'), option('pt2', 'pT2'),
      option('pt3', 'pT3'), option('pt4', 'pT4')
    ], { scenario: 'leibovich' }),
    checkbox('leibPn', 'pN+', { scenario: 'leibovich' }),
    numberField('leibSize', 'Tamaño patológico (cm)', 5, {
      min: 0.1,
      step: 0.1,
      scenario: 'leibovich'
    }),
    selectField('leibGrade', 'Grado', '2', [
      option('1', 'G1'), option('2', 'G2'), option('3', 'G3'), option('4', 'G4')
    ], { scenario: 'leibovich' }),
    checkbox('leibNecrosis', 'Necrosis tumoral', { scenario: 'leibovich' }),
    section(
      'uiss_path',
      'UISS localizado',
      'La versión resumida sólo clasifica N0 M0.',
      'uiss'
    ),
    selectField('uissPt', 'pT', 'pt1a', [
      option('pt1a', 'pT1a'), option('pt1b', 'pT1b'), option('pt2', 'pT2'),
      option('pt3', 'pT3'), option('pt4', 'pT4')
    ], { scenario: 'uiss' }),
    selectField('uissN', 'Ganglios', 'n0', [
      option('n0', 'N0'), option('nplus', 'N+')
    ], { scenario: 'uiss' }),
    selectField('uissM', 'Metástasis', 'm0', [
      option('m0', 'M0'), option('m1', 'M1')
    ], { scenario: 'uiss' }),
    selectField('uissGrade', 'Grado', '2', [
      option('1', 'G1'), option('2', 'G2'), option('3', 'G3'), option('4', 'G4')
    ], { scenario: 'uiss' }),
    selectField('uissEcog', 'ECOG', '0', [0, 1, 2, 3, 4].map((value) =>
      option(String(value), `ECOG ${value}`)), { scenario: 'uiss' })
  ],
  calculate(values) {
    if (stringValue(values, 'scenario') === 'uiss') {
      const classified = uissLocalized(values);
      return result({
        title: `UISS: ${classified.label}`,
        detail: classified.key === 'not_localized'
          ? 'Esta versión resumida no clasifica N+ o M1 como enfermedad localizada.'
          : 'Grupo UISS localizado calculado sin combinarlo con Leibovich.',
        badge: 'UISS',
        score: 0,
        showScore: false,
        severity: 'info',
        metrics: [
          { label: 'Grupo', value: classified.label },
          { label: 'pT', value: stringValue(values, 'uissPt').toUpperCase() },
          { label: 'ECOG', value: stringValue(values, 'uissEcog') }
        ],
        notes: ['No se muestran porcentajes locales no calibrados.']
      });
    }
    const calculated = leibovich2003(values);
    return result({
      title: `Leibovich ${calculated.total}: riesgo ${calculated.category}`,
      detail: 'Puntaje determinístico publicado para ccRCC M0 operado.',
      badge: 'Leibovich 2003',
      score: 0,
      showScore: false,
      severity: calculated.category === 'bajo'
        ? 'good'
        : calculated.category === 'intermedio' ? 'warn' : 'bad',
      metrics: [
        { label: 'Puntaje', value: calculated.total },
        { label: 'Grupo', value: calculated.category }
      ],
      notes: [
        'Aplicar sólo a carcinoma renal de células claras, M0, después de cirugía.',
        'El grupo estratifica recurrencia; no indica por sí solo adyuvancia.'
      ]
    });
  }
});

export const IMDC_CALCULATOR = defineCalculator({
  id: 'imdc',
  title: 'IMDC — carcinoma renal metastásico',
  category: 'renal',
  subtitle: 'Pronóstico en carcinoma renal metastásico.',
  source: 'EAU RCC 2026 · IMDC',
  clinicalUse: 'Clasifica pronóstico en carcinoma renal metastásico con factores clínicos y de laboratorio. Ayuda a estratificar riesgo, conversar pronóstico y contextualizar evidencia de tratamientos sistémicos.',
  fields: [
    section(
      'imdc_factors',
      'Factores IMDC',
      'Marcar cada factor adverso presente al inicio de tratamiento sistémico para carcinoma renal metastásico.'
    ),
    checkbox('kps', 'KPS <80%', { help: 'Performance status disminuido.' }),
    checkbox('time', 'Tiempo diagnóstico-tratamiento <1 año', {
      help: 'Menos de 12 meses desde diagnóstico inicial a inicio de terapia sistémica.'
    }),
    checkbox('hb', 'Hemoglobina baja', {
      help: 'Por debajo del límite inferior normal del laboratorio.'
    }),
    checkbox('calcium', 'Calcio corregido alto', {
      help: 'Por encima del límite superior normal.'
    }),
    checkbox('neut', 'Neutrófilos altos', {
      help: 'Por encima del límite superior normal.'
    }),
    checkbox('platelets', 'Plaquetas altas', {
      help: 'Por encima del límite superior normal.'
    })
  ],
  calculate(values) {
    const total = ['kps', 'time', 'hb', 'calcium', 'neut', 'platelets']
      .reduce((sum, fieldId) => sum + (booleanValue(values, fieldId) ? 1 : 0), 0);
    const category = total === 0 ? 'favorable' : total <= 2 ? 'intermedio' : 'pobre';
    return result({
      title: `IMDC ${category}`,
      detail: `${total} de 6 factores adversos.`,
      badge: 'IMDC',
      score: 0,
      showScore: false,
      severity: category === 'favorable' ? 'good' : category === 'intermedio' ? 'warn' : 'bad',
      metrics: [
        { label: 'Factores', value: `${total} / 6` },
        { label: 'Grupo', value: category }
      ],
      notes: [
        'IMDC estratifica pronóstico, no selecciona por sí solo el régimen.',
        'No se muestran medianas históricas como si fueran supervivencia individual con tratamientos actuales.'
      ]
    });
  }
});

interface IgcccgResult {
  readonly valid: boolean;
  readonly markerGroup?: 'S1' | 'S2' | 'S3';
  readonly category?: 'bueno' | 'intermedio' | 'desfavorable';
  readonly label: string;
  readonly ldhWarning?: boolean;
  readonly pfs5y?: number;
  readonly os5y?: number;
}

function igcccg(values: CalculatorValues): IgcccgResult {
  const histology = stringValue(values, 'histology');
  const afp = numberValue(values, 'afp');
  const afpUpperLimit = numberValue(values, 'afpUpperLimit', 10);
  const hcg = numberValue(values, 'hcg');
  const ldh = numberValue(values, 'ldhRatio');
  const primary = stringValue(values, 'primary') || 'testis';
  if (histology === 'seminoma' && afp > afpUpperLimit) {
    return { valid: false, label: 'No clasificable como seminoma puro: AFP elevada' };
  }
  const markerGroup = afp > 10000 || hcg > 50000 || ldh > 10
    ? 'S3'
    : afp >= 1000 || hcg >= 5000 || ldh >= 1.5 ? 'S2' : 'S1';
  if (histology === 'seminoma') {
    const category = booleanValue(values, 'nonPulmonary') ? 'intermedio' : 'bueno';
    return {
      valid: true,
      markerGroup,
      category,
      label: category === 'bueno' ? 'buen pronóstico' : 'pronóstico intermedio',
      ldhWarning: !booleanValue(values, 'nonPulmonary') && ldh > 2.5,
      pfs5y: category === 'bueno' ? 89 : 79,
      os5y: category === 'bueno' ? 95 : 88
    };
  }
  const favorablePrimary = primary === 'testis' || primary === 'retroperitoneal';
  const poor = primary === 'mediastinal'
    || booleanValue(values, 'nonPulmonary')
    || markerGroup === 'S3';
  if (!poor && !favorablePrimary) {
    return {
      valid: false,
      markerGroup,
      label: 'Sitio primario fuera de la clasificación clásica IGCCCG'
    };
  }
  const category = poor ? 'desfavorable' : markerGroup === 'S2' ? 'intermedio' : 'bueno';
  const outcomes = category === 'bueno' ? [90, 96]
    : category === 'intermedio' ? [78, 89] : [54, 67];
  return {
    valid: true,
    markerGroup,
    category,
    label: category === 'bueno'
      ? 'buen pronóstico'
      : category === 'intermedio' ? 'pronóstico intermedio' : 'pronóstico desfavorable',
    pfs5y: outcomes[0],
    os5y: outcomes[1]
  };
}

export const IGCCCG_CALCULATOR = defineCalculator({
  id: 'igcccg',
  title: 'IGCCCG testículo',
  category: 'testiculo',
  subtitle: 'Riesgo en tumores germinales metastásicos.',
  source: 'EAU Testicular Cancer 2026 · IGCCCG Update',
  clinicalUse: 'Clasifica pronóstico en tumores germinales metastásicos según histología, marcadores, sitio primario y metástasis viscerales. Guía intensidad de quimioterapia, seguimiento y comunicación pronóstica.',
  fields: [
    section(
      'igcccg_context',
      'Clasificación pronóstica inicial',
      'Usar antes de quimioterapia de primera línea en enfermedad metastásica, con marcadores séricos pretratamiento.'
    ),
    selectField('histology', 'Histología', 'nonseminoma', [
      option('seminoma', 'Seminoma'), option('nonseminoma', 'No seminoma')
    ], { help: 'Separar seminoma de no seminoma cambia la clasificación.' }),
    selectField('primary', 'Sitio primario', 'testis', [
      option('testis', 'Testicular'),
      option('retroperitoneal', 'Retroperitoneal'),
      option('mediastinal', 'Mediastinal'),
      option('other', 'Otro / no clasificable')
    ], { help: 'El primario mediastinal es desfavorable en no seminoma.' }),
    checkbox('nonPulmonary', 'Metástasis visceral no pulmonar', {
      help: 'Hígado, cerebro, hueso u otra visceral no pulmonar.'
    }),
    numberField('afp', 'AFP ng/ml', 120, {
      min: 0,
      step: 1,
      help: 'Usar marcador pretratamiento.'
    }),
    numberField('afpUpperLimit', 'Límite superior normal de AFP', 10, {
      min: 0.1,
      step: 0.1,
      help: 'En seminoma la AFP debe permanecer normal.'
    }),
    numberField('hcg', 'hCG IU/L', 800, {
      min: 0,
      step: 1,
      help: 'Usar hCG pretratamiento. Si el laboratorio informa otra unidad, normalizar antes.'
    }),
    numberField('ldhRatio', 'LDH x límite superior normal', 1.1, {
      min: 0,
      step: 0.1,
      help: 'Ejemplo: LDH 2 veces el LSN = 2.'
    })
  ],
  calculate(values) {
    const classified = igcccg(values);
    if (!classified.valid) {
      return result({
        title: classified.label,
        detail: stringValue(values, 'histology') === 'seminoma'
          && numberValue(values, 'afp') > numberValue(values, 'afpUpperLimit')
          ? 'Revisar histología, componente no seminomatoso y otras causas de AFP elevada.'
          : 'El perfil no entra en una categoría clásica sin aclarar el sitio primario.',
        badge: 'no clasificable',
        score: 0,
        showScore: false,
        severity: 'warn',
        metrics: [
          { label: 'AFP', value: numberValue(values, 'afp') },
          { label: 'LSN AFP', value: numberValue(values, 'afpUpperLimit') }
        ],
        notes: []
      });
    }
    return result({
      title: `IGCCCG: ${classified.label}`,
      detail: `${stringValue(values, 'histology') === 'seminoma' ? 'Seminoma' : 'No seminoma'}, grupo clásico ${classified.markerGroup}.`,
      badge: 'IGCCCG',
      score: 0,
      showScore: false,
      severity: classified.category === 'bueno'
        ? 'good'
        : classified.category === 'intermedio' ? 'warn' : 'bad',
      metrics: [
        { label: 'S', value: classified.markerGroup ?? '' },
        { label: 'PFS 5 años', value: `${classified.pfs5y}% poblacional` },
        { label: 'Supervivencia 5 años', value: `${classified.os5y}% poblacional` },
        { label: 'Sitio primario', value: stringValue(values, 'primary') }
      ],
      notes: [
        'Clasificar antes de iniciar quimioterapia.',
        classified.ldhWarning
          ? 'Seminoma de buen grupo clásico con LDH >2,5× LSN: la actualización IGCCCG señala peor PFS, sin cambiar el grupo clásico.'
          : 'Los porcentajes son resultados de grupos poblacionales contemporáneos, no una predicción individual.',
        'Confirmar LDH, AFP, hCG, sitio primario y metástasis viscerales inmediatamente antes de primera línea.'
      ]
    });
  }
});

export const LEGACY_CALCULATORS_20_23 = [
  RENAL_COMPLEXITY_CALCULATOR,
  LEIBOVICH_CALCULATOR,
  IMDC_CALCULATOR,
  IGCCCG_CALCULATOR
] as const;
