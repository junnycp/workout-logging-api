import Decimal from 'decimal.js';

export interface WeightUnitDefinition {
  /** Code used in requests and stored with each set, e.g. "kg". */
  code: string;
  label: string;
  /** Exact kilograms per one unit, as a decimal string (never a float). */
  toKgFactor: string;
}

/**
 * The single source of truth for weight units: request validation, the OpenAPI enum and conversions all
 * derive from this list. Adding a unit (e.g. stone, 6.35029318 kg) is one entry here.
 */
export const WEIGHT_UNITS: readonly WeightUnitDefinition[] = [
  { code: 'kg', label: 'kilogram', toKgFactor: '1' },
  { code: 'lb', label: 'pound', toKgFactor: '0.45359237' },
];

export interface WeightUnitRegistry {
  codes(): string[];
  isSupported(code: string): boolean;
  toKg(value: Decimal, unit: string): Decimal;
  fromKg(kg: Decimal, unit: string): Decimal;
}

export function createWeightUnitRegistry(
  definitions: readonly WeightUnitDefinition[],
): WeightUnitRegistry {
  const factors = new Map<string, Decimal>();
  for (const { code, toKgFactor } of definitions) {
    if (factors.has(code)) throw new Error(`Duplicate weight unit ${code}`);
    const factor = new Decimal(toKgFactor);
    if (!factor.isFinite() || factor.lte(0))
      throw new Error(`Invalid factor for weight unit ${code}`);
    factors.set(code, factor);
  }

  const factorOf = (unit: string): Decimal => {
    const factor = factors.get(unit);
    if (factor === undefined) throw new Error(`Unsupported weight unit: ${unit}`);
    return factor;
  };

  return {
    codes: () => [...factors.keys()],
    isSupported: (code) => factors.has(code),
    toKg: (value, unit) => value.times(factorOf(unit)),
    fromKg: (kg, unit) => kg.dividedBy(factorOf(unit)),
  };
}

export const weightUnits: WeightUnitRegistry = createWeightUnitRegistry(WEIGHT_UNITS);
