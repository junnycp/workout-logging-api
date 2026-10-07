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

export interface RecordCandidate extends LoggedSet {
  id: string;
  performedAt: Date;
}

/**
 * The record among candidates, by decision D4 on exact values: higher value, more reps, earliest
 * performed_at, lowest set id. The database ranks on 4-decimal stored kg, which can tie sets whose exact
 * values differ (20.051 lb and 9.095 kg are both 9.0950 kg); rounding is monotonic, so the true record is
 * always among the sets tied on the highest stored value, and this settles them exactly.
 */
export function pickRecord<T extends RecordCandidate>(
  metric: RecordMetric,
  candidates: readonly T[],
): T | null {
  const ranked = candidates.map((set) => ({ set, value: recordValue(metric, set, 'kg') }));
  ranked.sort(
    (a, b) =>
      b.value.comparedTo(a.value) ||
      b.set.reps - a.set.reps ||
      a.set.performedAt.getTime() - b.set.performedAt.getTime() ||
      (a.set.id < b.set.id ? -1 : a.set.id > b.set.id ? 1 : 0),
  );
  return ranked[0]?.set ?? null;
}

export interface RecordDelta {
  absolute: number;
  percent: number;
  /** `absolute` > 0: better by at least what the client can see (0.01); equal or less is not improved. */
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
  const absolute = roundForResponse(change);
  return {
    absolute,
    percent: roundForResponse(change.dividedBy(previous).times(100)),
    // From the rounded change, so `improved` never contradicts the `absolute` the client sees.
    improved: absolute > 0,
  };
}
