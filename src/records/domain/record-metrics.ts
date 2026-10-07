import Decimal from 'decimal.js';
import { weightUnits, WeightUnitRegistry } from '../../units/weight-units';
import { epleyOneRepMaxKg, roundForResponse, volumeKg } from '../../workouts/domain/set-metrics';

export const RECORD_METRICS = ['maxWeight', 'maxVolume', 'bestEstimated1RM'] as const;
export type RecordMetric = (typeof RECORD_METRICS)[number];

export interface LoggedSet {
  reps: number;
  /** As entered, in `unit`. */
  weight: Decimal;
  unit: string;
}

/**
 * The value of a record in `targetUnit`, recomputed from the set as logged (rule C16): the stored 4-decimal
 * kg columns only pick the winning set. Volume and Epley are linear in the weight, so converting first and
 * applying the same domain formulas gives the exact value in any unit. Exact; callers round once.
 */
export function recordValue(
  metric: RecordMetric,
  set: LoggedSet,
  targetUnit: string,
  units: WeightUnitRegistry = weightUnits,
): Decimal {
  const weight = units.convert(set.weight, set.unit, targetUnit);
  switch (metric) {
    case 'maxWeight':
      return weight;
    case 'maxVolume':
      return volumeKg(set.reps, weight);
    case 'bestEstimated1RM':
      return epleyOneRepMaxKg(set.reps, weight);
  }
}

export interface RecordDelta {
  absolute: number;
  percent: number;
  /** Strictly better than the previous period; an equal record is not an improvement. */
  improved: boolean;
}

/**
 * Change of one record from the previous period to the current one, from exact values, rounded once.
 * Null when either period has no record. Weighted records are always > 0, so the percentage is defined.
 */
export function compareRecords(
  current: Decimal | null,
  previous: Decimal | null,
): RecordDelta | null {
  if (current === null || previous === null) return null;
  const change = current.minus(previous);
  return {
    absolute: roundForResponse(change),
    percent: roundForResponse(change.dividedBy(previous).times(100)),
    improved: change.gt(0),
  };
}
