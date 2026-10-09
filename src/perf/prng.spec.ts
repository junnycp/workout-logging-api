import { createPrng, prngUuidV7, seedFor } from './prng';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('createPrng', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = createPrng(42);
    const b = createPrng(42);
    const first = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(first);
  });

  it('produces a different sequence for a different seed', () => {
    expect(createPrng(1).next()).not.toBe(createPrng(2).next());
  });

  it('returns floats in [0, 1) and integers within inclusive bounds', () => {
    const rng = createPrng(7);
    for (let i = 0; i < 10_000; i++) {
      const x = rng.next();
      expect(x >= 0 && x < 1).toBe(true);
      const n = rng.int(3, 6);
      expect(Number.isInteger(n) && n >= 3 && n <= 6).toBe(true);
    }
  });

  it('reaches both integer bounds', () => {
    const rng = createPrng(9);
    const seen = new Set(Array.from({ length: 1_000 }, () => rng.int(1, 3)));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });
});

describe('seedFor', () => {
  it('derives a stable seed per user, independent of other users', () => {
    expect(seedFor(20261009, 'perf-heavy')).toBe(seedFor(20261009, 'perf-heavy'));
    expect(seedFor(20261009, 'perf-heavy')).not.toBe(seedFor(20261009, 'perf-bg-001'));
    expect(seedFor(1, 'perf-heavy')).not.toBe(seedFor(2, 'perf-heavy'));
  });
});

describe('prngUuidV7', () => {
  it('is a valid UUIDv7 whose timestamp is the given instant', () => {
    const ms = Date.parse('2025-03-04T05:06:07.890Z');
    const id = prngUuidV7(ms, createPrng(1));
    expect(id).toMatch(UUID_V7);
    expect(parseInt(id.replace(/-/g, '').slice(0, 12), 16)).toBe(ms);
  });

  it('is deterministic for the same seed and differs between draws', () => {
    const ms = Date.parse('2025-03-04T05:06:07.890Z');
    const a = createPrng(5);
    const b = createPrng(5);
    const first = prngUuidV7(ms, a);
    expect(prngUuidV7(ms, b)).toBe(first);
    expect(prngUuidV7(ms, a)).not.toBe(first);
  });
});
