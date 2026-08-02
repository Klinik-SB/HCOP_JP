import { CalculatorDefinition } from './calculator.models';
import { CORE_CALCULATORS } from './core-calculator.definitions';
import { LEGACY_CALCULATORS_04_07 } from './legacy-calculators-04-07.definitions';
import { LEGACY_CALCULATORS_08_11 } from './legacy-calculators-08-11.definitions';

export const PORTED_CALCULATORS = [
  ...CORE_CALCULATORS,
  ...LEGACY_CALCULATORS_04_07,
  ...LEGACY_CALCULATORS_08_11
] as const;
export type PortedCalculatorId = (typeof PORTED_CALCULATORS)[number]['id'];

export function findPortedCalculator(id: string): CalculatorDefinition<PortedCalculatorId> | undefined {
  return PORTED_CALCULATORS.find((definition) => definition.id === id) as
    CalculatorDefinition<PortedCalculatorId> | undefined;
}
