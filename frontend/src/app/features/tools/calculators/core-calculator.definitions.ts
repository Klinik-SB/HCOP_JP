import { booleanValue, defineCalculator, numberValue, result, stringValue } from './calculator.engine';
import { CalculatorDefinition, CalculatorResult } from './calculator.models';

export const BSA_CALCULATOR = defineCalculator({
  id: 'bsa',
  title: 'Superficie corporal — Mosteller',
  category: 'general',
  subtitle: 'Formula de Mosteller.',
  source: 'Mosteller',
  clinicalUse: 'Calcula la superficie corporal a partir del peso y la altura. Es una referencia habitual para dosificacion y documentacion oncologica.',
  fields: [
    {
      id: 'bsa_weight', kind: 'number', label: 'Peso (kg)', unit: 'kg', required: true,
      initialValue: 70, exampleValue: 70, min: 1, step: 0.1
    },
    {
      id: 'bsa_height', kind: 'number', label: 'Altura (cm)', unit: 'cm', required: true,
      initialValue: 170, exampleValue: 170, min: 30, step: 0.1
    }
  ],
  calculate(values) {
    const bsa = bodySurfaceArea(numberValue(values, 'bsa_weight'), numberValue(values, 'bsa_height'));
    return result({
      title: bsa ? `${bsa.toFixed(2)} m²` : 'Complete peso y altura',
      detail: bsa
        ? 'Superficie corporal estimada mediante la formula de Mosteller.'
        : 'Ambos valores deben ser mayores que cero.',
      badge: 'Mosteller',
      score: 0,
      showScore: false,
      metrics: bsa ? [{ label: 'SC', value: `${bsa.toFixed(2)} m²` }] : [],
      severity: 'info',
      notes: ['Verificar peso y altura actuales. La superficie corporal no define por sí sola una dosis ni un tope de dosificación.']
    });
  }
});

export const BMI_CALCULATOR = defineCalculator({
  id: 'bmi',
  title: 'Índice de masa corporal',
  category: 'general',
  subtitle: 'Relacion entre peso y altura.',
  source: 'IMC',
  clinicalUse: 'Calcula el indice de masa corporal y muestra su categoria descriptiva como dato general del paciente.',
  fields: [
    {
      id: 'bmi_weight', kind: 'number', label: 'Peso (kg)', unit: 'kg', required: true,
      initialValue: 70, exampleValue: 70, min: 1, step: 0.1
    },
    {
      id: 'bmi_height', kind: 'number', label: 'Altura (cm)', unit: 'cm', required: true,
      initialValue: 170, exampleValue: 170, min: 30, step: 0.1
    }
  ],
  calculate(values) {
    const calculated = bodyMassIndex(numberValue(values, 'bmi_weight'), numberValue(values, 'bmi_height'));
    const bmi = calculated?.value ?? 0;
    const category = calculated?.category ?? '';
    return result({
      title: bmi ? `${bmi.toFixed(1)} kg/m²` : 'Complete peso y altura',
      detail: category || 'Ambos valores deben ser mayores que cero.',
      badge: 'IMC adulto',
      score: 0,
      showScore: false,
      severity: 'info',
      metrics: bmi
        ? [{ label: 'IMC', value: bmi.toFixed(1) }, { label: 'Categoria', value: category }]
        : [],
      notes: ['Interpretar junto con composicion corporal, estado nutricional y contexto clinico.']
    });
  }
});

export const CALVERT_CALCULATOR = defineCalculator({
  id: 'calvert',
  title: 'Carboplatino - formula de Calvert',
  category: 'general',
  subtitle: 'Dosis total por AUC y filtrado glomerular.',
  source: 'Formula de Calvert',
  clinicalUse: 'Estima la dosis total de carboplatino mediante AUC objetivo por filtrado glomerular mas 25.',
  fields: [
    {
      id: 'calvert_method', kind: 'select', label: 'Método de función renal', required: true,
      initialValue: 'measured', exampleValue: 'measured', wide: true,
      help: 'La fórmula original utiliza GFR absoluta en ml/min. Identificar siempre el método.',
      options: [
        { value: 'measured', label: 'GFR medida / absoluta' },
        { value: 'crcl', label: 'Clearance de creatinina medido o calculado' },
        { value: 'indexed', label: 'eGFR indexado a 1,73 m²' }
      ]
    },
    {
      id: 'calvert_auc', kind: 'number', label: 'AUC objetivo', required: true,
      initialValue: 5, exampleValue: 5, min: 0.1, step: 0.1
    },
    {
      id: 'calvert_gfr', kind: 'number', label: 'Función renal informada',
      unit: 'ml/min o ml/min/1,73 m²', required: true, initialValue: 80, exampleValue: 80,
      min: 0.1, step: 0.1, help: 'ml/min, salvo eGFR indexado: ml/min/1,73 m².'
    },
    {
      id: 'calvert_bsa', kind: 'number', label: 'Superficie corporal (m²)', unit: 'm²',
      required: false, initialValue: 1.8, exampleValue: 1.8, min: 0.5, max: 3.5, step: 0.01,
      help: 'Obligatoria sólo para desindexar eGFR.'
    },
    {
      id: 'calvert_cap', kind: 'checkbox', label: 'Aplicar tope de 125 ml/min', required: false,
      initialValue: false, help: 'Sólo si el protocolo vigente lo indica; nunca se aplica en silencio.'
    }
  ],
  calculate(values) {
    const auc = numberValue(values, 'calvert_auc');
    const reported = numberValue(values, 'calvert_gfr');
    const method = stringValue(values, 'calvert_method');
    const indexed = method === 'indexed';
    const bsa = numberValue(values, 'calvert_bsa');
    if (indexed && bsa <= 0) return missingIndexedBsaResult();
    const absolute = indexed ? reported * bsa / 1.73 : reported;
    const applyCap = booleanValue(values, 'calvert_cap');
    const filtration = applyCap ? Math.min(absolute, 125) : absolute;
    const dose = calvertDose(auc, filtration);
    return result({
      title: dose ? `${Math.round(dose)} mg` : 'Complete AUC y función renal',
      detail: dose ? `Dosis calculada sin redondear: ${dose.toFixed(2)} mg.` : 'AUC y función renal deben ser mayores que cero.',
      badge: 'formula de Calvert',
      score: 0,
      showScore: false,
      severity: 'info',
      metrics: dose ? [
        { label: 'Dosis redondeada', value: `${Math.round(dose)} mg` },
        { label: 'GFR absoluta usada', value: `${filtration.toFixed(2)} ml/min` },
        { label: 'AUC', value: auc },
        { label: 'Método', value: indexed ? 'eGFR desindexado' : method === 'crcl' ? 'CrCl aproximado' : 'GFR medida' }
      ] : [],
      notes: [
        indexed
          ? `eGFR ${reported} × SC ${bsa.toFixed(2)} / 1,73 = ${absolute.toFixed(2)} ml/min.`
          : 'La función renal ingresada se utilizó como valor absoluto.',
        absolute > 125 && !applyCap
          ? 'El valor supera 125 ml/min. Revisar el protocolo antes de decidir si corresponde un tope.'
          : applyCap && absolute > 125
            ? 'Se aplicó el tope de 125 ml/min solicitado.'
            : 'No se aplicó un tope adicional.',
        'La diálisis y situaciones de función renal inestable requieren un planteo específico.'
      ]
    });
  }
});

export const PORTED_CALCULATORS = [BSA_CALCULATOR, BMI_CALCULATOR, CALVERT_CALCULATOR] as const;
export type PortedCalculatorId = (typeof PORTED_CALCULATORS)[number]['id'];

export function findPortedCalculator(id: string): CalculatorDefinition<PortedCalculatorId> | undefined {
  return PORTED_CALCULATORS.find((definition) => definition.id === id) as
    CalculatorDefinition<PortedCalculatorId> | undefined;
}

function bodySurfaceArea(weightKg: number, heightCm: number): number | null {
  return weightKg > 0 && heightCm > 0 ? Math.sqrt(weightKg * heightCm / 3600) : null;
}

function bodyMassIndex(weightKg: number, heightCm: number): { readonly value: number; readonly category: string } | null {
  const heightM = heightCm / 100;
  if (weightKg <= 0 || heightM <= 0) return null;
  const value = weightKg / (heightM * heightM);
  const category = value < 18.5 ? 'Bajo peso'
    : value < 25 ? 'Rango saludable'
      : value < 30 ? 'Sobrepeso'
        : value < 35 ? 'Obesidad clase I'
          : value < 40 ? 'Obesidad clase II'
            : 'Obesidad clase III';
  return { value, category };
}

function calvertDose(auc: number, gfr: number): number | null {
  return auc > 0 && gfr > 0 ? auc * (gfr + 25) : null;
}

function missingIndexedBsaResult(): CalculatorResult {
  return result({
    title: 'Falta la superficie corporal',
    detail: 'Para eGFR indexado se necesita desindexar: eGFR × SC / 1,73.',
    badge: 'no calculable',
    score: 0,
    showScore: false,
    severity: 'warn',
    metrics: [],
    notes: []
  });
}
