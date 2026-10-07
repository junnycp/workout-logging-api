import Decimal from 'decimal.js';
import { createWeightUnitRegistry, WEIGHT_UNITS } from '../../units/weight-units';
import { compareRecords, pickRecord, recordValue } from './record-metrics';

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

  it('does not call a change that rounds to 0 an improvement', () => {
    // 100 lb = 45.359237 kg against 45.359 kg: the client sees +0 kg, so it is not "improved".
    expect(compareRecords(d('45.359237'), d('45.359'))).toEqual({
      absolute: 0,
      percent: 0,
      improved: false,
    });
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

describe('pickRecord (the winner among candidates tied on the stored 4-decimal value)', () => {
  const candidate = (id: string, reps: number, weight: string, unit: string, at: string) => ({
    id,
    reps,
    weight: d(weight),
    unit,
    performedAt: new Date(at),
  });

  it('prefers the higher exact value over more reps', () => {
    // 20.051 lb = 9.09498061… kg and 9.095 kg are both stored as 9.0950.
    const lighter = candidate('a', 10, '20.051', 'lb', '2026-09-01T10:00:00Z');
    const heavier = candidate('b', 5, '9.095', 'kg', '2026-09-01T10:00:00Z');
    expect(pickRecord('maxWeight', [lighter, heavier])?.id).toBe('b');
  });

  it('then prefers more reps, then the earliest date, then the lowest id (decision D4)', () => {
    const base = (id: string, reps: number, at: string) => candidate(id, reps, '100', 'kg', at);
    expect(
      pickRecord('maxWeight', [base('a', 3, '2026-09-01'), base('b', 5, '2026-09-08')])?.id,
    ).toBe('b');
    expect(
      pickRecord('maxWeight', [base('b', 5, '2026-09-08'), base('a', 5, '2026-09-01')])?.id,
    ).toBe('a');
    expect(
      pickRecord('maxWeight', [base('b', 5, '2026-09-01'), base('a', 5, '2026-09-01')])?.id,
    ).toBe('a');
  });

  it('ranks volume and Epley by their exact values too', () => {
    const a = candidate('a', 10, '20.051', 'lb', '2026-09-01T10:00:00Z');
    const b = candidate('b', 10, '9.095', 'kg', '2026-09-02T10:00:00Z');
    expect(pickRecord('maxVolume', [a, b])?.id).toBe('b');
    expect(pickRecord('bestEstimated1RM', [a, b])?.id).toBe('b');
  });

  it('returns null without candidates', () => {
    expect(pickRecord('maxWeight', [])).toBeNull();
  });
});
