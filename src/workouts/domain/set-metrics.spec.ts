import Decimal from 'decimal.js';
import { computeSetMetrics, epleyOneRepMaxKg, roundForResponse, volumeKg } from './set-metrics';

const kg = (value: string | number) => new Decimal(value);

describe('volumeKg', () => {
  it('is reps × weight', () => {
    expect(volumeKg(5, kg(100)).toString()).toBe('500');
  });
});

describe('epleyOneRepMaxKg (weight × (1 + reps / 30))', () => {
  it.each([
    [5, 100, '116.66666666666666667'],
    [10, 60, '80'],
    [30, 50, '100'],
  ])('%i reps at %i kg', (reps, weight, expected) => {
    expect(epleyOneRepMaxKg(reps, kg(weight)).toString()).toBe(expected);
  });

  it('applies the formula literally at 1 rep, as the brief specifies (decision D3a)', () => {
    expect(epleyOneRepMaxKg(1, kg(100)).toFixed(4)).toBe('103.3333');
  });

  it('is zero for bodyweight sets (weight 0)', () => {
    expect(epleyOneRepMaxKg(12, kg(0)).isZero()).toBe(true);
  });
});

describe('computeSetMetrics', () => {
  it('normalizes to kg and derives metrics from the exact value, rounded to 4 dp for storage', () => {
    expect(computeSetMetrics({ reps: 5, weight: kg(225), unit: 'lb' })).toEqual({
      weightKg: '102.0583',
      volumeKg: '510.2914', // 5 × 102.05828325, not 5 × the rounded 102.0583 (510.2915)
      e1rmKg: '119.0680',
    });
  });

  it('keeps kilogram input as entered', () => {
    expect(computeSetMetrics({ reps: 3, weight: kg('102.5'), unit: 'kg' })).toEqual({
      weightKg: '102.5000',
      volumeKg: '307.5000',
      e1rmKg: '112.7500',
    });
  });

  it('rounds half up', () => {
    // 0.00005 kg rounds up to 0.0001
    expect(computeSetMetrics({ reps: 1, weight: kg('0.00005'), unit: 'kg' }).weightKg).toBe(
      '0.0001',
    );
  });
});

describe('roundForResponse', () => {
  it.each([
    ['116.66666667', 116.67],
    ['102.005', 102.01],
    ['80', 80],
    ['0', 0],
  ])('rounds %s to %d with 2 decimals (half up)', (value, expected) => {
    expect(roundForResponse(new Decimal(value))).toBe(expected);
  });
});
