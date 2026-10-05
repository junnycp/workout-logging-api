import Decimal from 'decimal.js';
import { weightUnits, WeightUnitRegistry } from '../../units/weight-units';

/** Scale of the NUMERIC columns weight_kg, volume_kg and e1rm_kg. */
export const STORAGE_DECIMALS = 4;
/** Values returned by the API are rounded to this many decimals, and only there. */
export const RESPONSE_DECIMALS = 2;

export function volumeKg(reps: number, weightKg: Decimal): Decimal {
  return weightKg.times(reps);
}

/**
 * Epley estimated one-rep max: weight × (1 + reps / 30), computed as weight × (30 + reps) / 30 to avoid
 * an early rounding of reps / 30. Applied to every rep count, including 1 (decision D3a: the brief's
 * formula is used literally, so a single at 100 kg estimates 103.33 kg).
 */
export function epleyOneRepMaxKg(reps: number, weightKg: Decimal): Decimal {
  return weightKg.times(30 + reps).dividedBy(30);
}

export interface SetInput {
  reps: number;
  weight: Decimal;
  unit: string;
}

/** Normalized values as decimal strings at storage scale, ready for the NUMERIC columns. */
export interface SetMetrics {
  weightKg: string;
  volumeKg: string;
  e1rmKg: string;
}

const toStorage = (value: Decimal): string =>
  value.toDecimalPlaces(STORAGE_DECIMALS, Decimal.ROUND_HALF_UP).toFixed(STORAGE_DECIMALS);

/** Derived metrics come from the exact kg value; rounding happens once, at storage scale. */
export function computeSetMetrics(
  set: SetInput,
  units: WeightUnitRegistry = weightUnits,
): SetMetrics {
  const exactKg = units.toKg(set.weight, set.unit);
  return {
    weightKg: toStorage(exactKg),
    volumeKg: toStorage(volumeKg(set.reps, exactKg)),
    e1rmKg: toStorage(epleyOneRepMaxKg(set.reps, exactKg)),
  };
}

export function roundForResponse(value: Decimal): number {
  return value.toDecimalPlaces(RESPONSE_DECIMALS, Decimal.ROUND_HALF_UP).toNumber();
}
