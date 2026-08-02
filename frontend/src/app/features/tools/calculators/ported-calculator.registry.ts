import { CalculatorDefinition } from './calculator.models';
import { CORE_CALCULATORS } from './core-calculator.definitions';
import { LEGACY_CALCULATORS_04_07 } from './legacy-calculators-04-07.definitions';
import { LEGACY_CALCULATORS_08_11 } from './legacy-calculators-08-11.definitions';
import { LEGACY_CALCULATORS_12_15 } from './legacy-calculators-12-15.definitions';
import { LEGACY_CALCULATORS_16_19 } from './legacy-calculators-16-19.definitions';
import { LEGACY_CALCULATORS_20_23 } from './legacy-calculators-20-23.definitions';
import { LEGACY_CALCULATORS_24_27 } from './legacy-calculators-24-27.definitions';
import { LEGACY_CALCULATORS_28_31 } from './legacy-calculators-28-31.definitions';
import { LEGACY_CALCULATORS_32_35 } from './legacy-calculators-32-35.definitions';

export const PORTED_CALCULATORS = [
  ...CORE_CALCULATORS,
  ...LEGACY_CALCULATORS_04_07,
  ...LEGACY_CALCULATORS_08_11,
  ...LEGACY_CALCULATORS_12_15,
  ...LEGACY_CALCULATORS_16_19,
  ...LEGACY_CALCULATORS_20_23,
  ...LEGACY_CALCULATORS_24_27,
  ...LEGACY_CALCULATORS_28_31,
  ...LEGACY_CALCULATORS_32_35
] as const;
export type PortedCalculatorId = (typeof PORTED_CALCULATORS)[number]['id'];

export function findPortedCalculator(id: string): CalculatorDefinition<PortedCalculatorId> | undefined {
  return PORTED_CALCULATORS.find((definition) => definition.id === id) as
    CalculatorDefinition<PortedCalculatorId> | undefined;
}
