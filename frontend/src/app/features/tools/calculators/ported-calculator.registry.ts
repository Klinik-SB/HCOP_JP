import { CalculatorDefinition } from './calculator.models';
import { CORE_CALCULATORS } from './core-calculator.definitions';
import { LEGACY_CALCULATORS_04_07 } from './legacy-calculators-04-07.definitions';

export const PORTED_CALCULATORS = [...CORE_CALCULATORS, ...LEGACY_CALCULATORS_04_07] as const;
export type PortedCalculatorId = (typeof PORTED_CALCULATORS)[number]['id'];

export function findPortedCalculator(id: string): CalculatorDefinition<PortedCalculatorId> | undefined {
  return PORTED_CALCULATORS.find((definition) => definition.id === id) as
    CalculatorDefinition<PortedCalculatorId> | undefined;
}
