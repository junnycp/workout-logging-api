/** Injectable source of "now", so period comparisons are testable without faking global timers. */
export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol('CLOCK');

export const systemClock: Clock = { now: () => new Date() };
