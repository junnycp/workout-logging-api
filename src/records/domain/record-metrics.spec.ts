import Decimal from 'decimal.js';
import { createWeightUnitRegistry, WEIGHT_UNITS } from '../../units/weight-units';
import { compareRecords, recordValue } from './record-metrics';

const d = (value: string | number) => new Decimal(value);
const set = (reps: number, weight: number | string, unit = 'kg') => ({
  reps,
  weight: d(weight),
  unit,
});

describe('recordValue (a record recomputed from the set as logged, exact; callers round once)', () => {
  it('is the weight for maxWeight', () => {
    expect(recordValue('maxWeight', set(3, 110), 'kg').toString()).toBe('110');
  });

  it('is reps × weight for maxVolume', () => {
    expect(recordValue('maxVolume', set(10, 80), 'kg').toString()).toBe('800');
  });

  it('applies Epley literally, also at 1 rep (decision D3a)', () => {
    expect(recordValue('bestEstimated1RM', set(1, 100), 'kg').toFixed(2)).toBe('103.33');
    expect(recordValue('bestEstimated1RM', set(10, 80), 'kg').toFixed(2)).toBe('106.67');
  });

  it('converts from the logged unit, not from the stored 4-decimal kg (rule C16)', () => {
    expect(recordValue('maxWeight', set(1, 32, 'lb'), 'kg').toFixed(2)).toBe('14.51');
    expect(recordValue('maxWeight', set(1, 185, 'lb'), 'lb').toString()).toBe('185');
    expect(recordValue('maxVolume', set(10, 100), 'lb').toFixed(2)).toBe('2204.62');
  });

  it('works for a unit added to the registry (X1)', () => {
    const units = createWeightUnitRegistry([
      ...WEIGHT_UNITS,
      { code: 'st', label: 'stone', toKgFactor: '6.35029318' },
    ]);
    expect(recordValue('maxWeight', set(1, 140, 'lb'), 'st', units).toFixed(4)).toBe('10.0000');
  });
});

describe('compareRecords (current period against the previous one)', () => {
  it('reports an improvement with the absolute and percentage change', () => {
    expect(compareRecords(d(100), d(95))).toEqual({ absolute: 5, percent: 5.26, improved: true });
  });

  it('reports a decline as negative and not improved', () => {
    expect(compareRecords(d(90), d(100))).toEqual({ absolute: -10, percent: -10, improved: false });
  });

  it('does not call an equal record an improvement', () => {
    expect(compareRecords(d(100), d(100))).toEqual({ absolute: 0, percent: 0, improved: false });
  });

  it('compares exact values and rounds the change to 2 decimals', () => {
    // The D3a example: 100 kg × 1 (e1RM 103.333…) against 96 kg × 2 (e1RM 102.4).
    expect(compareRecords(d(100).times(31).dividedBy(30), d('102.4'))).toEqual({
      absolute: 0.93,
      percent: 0.91,
      improved: true,
    });
  });

  it.each([
    ['the current period', null, d(100)],
    ['the previous period', d(100), null],
    ['both periods', null, null],
  ])('is null when %s has no record', (_case, current, previous) => {
    expect(compareRecords(current, previous)).toBeNull();
  });
});
