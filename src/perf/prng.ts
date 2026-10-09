/**
 * Seeded pseudo-random numbers for the performance dataset. Not for anything security related: the only goal is
 * that every run, on every machine, generates the same rows (mulberry32, 32-bit state).
 */
export interface Prng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** True with probability `p`. */
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
}

export function createPrng(seed: number): Prng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    chance: (p) => next() < p,
    pick: <T>(items: readonly T[]): T => items[int(0, items.length - 1)] as T,
  };
}

/** A seed per user (FNV-1a of profile seed + user id), so a user's rows do not depend on the other users. */
export function seedFor(profileSeed: number, userId: string): number {
  let hash = 0x811c9dc5;
  for (const char of `${profileSeed}:${userId}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const hex = (value: number, digits: number): string => value.toString(16).padStart(digits, '0');

/**
 * A UUIDv7 (RFC 9562) for the instant `ms` whose random bits come from the PRNG. Time-ordered like the ids the
 * API generates, but repeatable: `uuidv7()` would change the lowest-id tie-break and cursor order on every run.
 */
export function prngUuidV7(ms: number, rng: Prng): string {
  const time = hex(ms, 12);
  const randA = hex(rng.int(0, 0xfff), 3);
  const variant = hex(0x8000 | rng.int(0, 0x3fff), 4);
  const randB = hex(rng.int(0, 0xffffff), 6) + hex(rng.int(0, 0xffffff), 6);
  return `${time.slice(0, 8)}-${time.slice(8)}-7${randA}-${variant}-${randB}`;
}
