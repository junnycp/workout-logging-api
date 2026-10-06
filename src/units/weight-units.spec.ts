import Decimal from 'decimal.js';
import { createWeightUnitRegistry, WEIGHT_UNITS, weightUnits } from './weight-units';

const d = (value: string | number) => new Decimal(value);

describe('weight unit registry', () => {
  it('supports kg and lb by default', () => {
    expect(weightUnits.codes()).toEqual(['kg', 'lb']);
    expect(weightUnits.isSupported('kg')).toBe(true);
    expect(weightUnits.isSupported('lb')).toBe(true);
  });

  it.each(['stone', 'KG', 'kgs', '', 'toString', '__proto__'])('does not support %j', (code) => {
    expect(weightUnits.isSupported(code)).toBe(false);
  });

  it('converts pounds to kilograms with the exact international pound factor', () => {
    expect(weightUnits.toKg(d(225), 'lb').toString()).toBe('102.05828325');
  });

  it('leaves kilograms unchanged', () => {
    expect(weightUnits.toKg(d('102.5'), 'kg').toString()).toBe('102.5');
  });

  it('converts kilograms back to pounds without float drift', () => {
    expect(weightUnits.fromKg(d('102.05828325'), 'lb').toString()).toBe('225');
  });

  it('round-trips arbitrary values exactly', () => {
    for (const value of ['0', '0.5', '45', '137.5', '999.999']) {
      expect(weightUnits.fromKg(weightUnits.toKg(d(value), 'lb'), 'lb').toString()).toBe(
        d(value).toString(),
      );
    }
  });

  it('throws on an unsupported unit (callers validate first)', () => {
    expect(() => weightUnits.toKg(d(1), 'stone')).toThrow('Unsupported weight unit: stone');
  });

  describe('convert (display a logged weight in another unit)', () => {
    it('returns the original value unchanged when the units match', () => {
      expect(weightUnits.convert(d('185.125'), 'lb', 'lb').toString()).toBe('185.125');
    });

    it('converts exactly from the original value, leaving rounding to the caller', () => {
      // Rounded once this is 14.51; via the stored 4-decimal 14.5150 it would become 14.52 (C16).
      expect(weightUnits.convert(d(32), 'lb', 'kg').toString()).toBe('14.51495584');
      expect(weightUnits.convert(d(100), 'kg', 'lb').toFixed(2)).toBe('220.46');
    });

    it('throws on an unsupported unit on either side', () => {
      expect(() => weightUnits.convert(d(1), 'st', 'kg')).toThrow('Unsupported weight unit: st');
      expect(() => weightUnits.convert(d(1), 'kg', 'st')).toThrow('Unsupported weight unit: st');
    });
  });

  it('accepts a new unit with a single registry entry (extensibility, X1)', () => {
    const withStone = createWeightUnitRegistry([
      ...WEIGHT_UNITS,
      { code: 'st', label: 'stone', toKgFactor: '6.35029318' },
    ]);
    expect(withStone.codes()).toEqual(['kg', 'lb', 'st']);
    expect(withStone.toKg(d(10), 'st').toString()).toBe('63.5029318');
    expect(withStone.fromKg(d('63.5029318'), 'lb').toFixed(4)).toBe('140.0000');
    expect(withStone.convert(d(10), 'st', 'lb').toFixed(4)).toBe('140.0000');
  });

  it('rejects an invalid registry definition at startup', () => {
    expect(() =>
      createWeightUnitRegistry([{ code: 'kg', label: 'kilogram', toKgFactor: '0' }]),
    ).toThrow('Invalid factor for weight unit kg');
    expect(() =>
      createWeightUnitRegistry([
        { code: 'kg', label: 'kilogram', toKgFactor: '1' },
        { code: 'kg', label: 'again', toKgFactor: '1' },
      ]),
    ).toThrow('Duplicate weight unit kg');
  });
});
