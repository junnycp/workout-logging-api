import Decimal from 'decimal.js';
import { computeSetMetrics } from '../workouts/domain/set-metrics';
import { generateUserDataset, PerfUserDataset } from './perf-dataset';
import { expandUsers, parsePerfProfile, PerfProfile, PerfProfileError } from './perf-profile';

const EXERCISES = ['Bench Press', 'Back Squat', 'Deadlift', 'Overhead Press', 'Barbell Curl'];

const rawProfile = {
  version: 1,
  seed: 20261009,
  anchor: '2026-10-01T00:00:00Z',
  spanDays: 1095,
  setsPerEntry: { min: 3, max: 6 },
  reps: { min: 1, max: 12 },
  lbShare: 0.15,
  bodyweightShare: 0.05,
  utcOffsetsMinutes: [420, 0, -300],
  users: [
    {
      id: 'perf-heavy',
      entries: 3_000,
      exercises: EXERCISES,
      scenarios: {
        oldOnly: { exercise: 'Sumo Deadlift', entries: 40, withinFirstDays: 180 },
        bodyweightOnly: { exercise: 'Pull-Up', entries: 50 },
        plateau: { exercise: 'Barbell Row', entries: 20, weight: 100, unit: 'kg', reps: 5 },
        sameInstant: { exercise: 'Bench Press', entries: 25 },
      },
    },
    { id: 'perf-bg', count: 3, entries: 200, exercises: EXERCISES },
    { id: 'perf-single', entries: 300, exercises: ['Bench Press'], optional: true },
  ],
};

const profile: PerfProfile = parsePerfProfile(rawProfile);
const exerciseIds = new Map(
  [...EXERCISES, 'Sumo Deadlift', 'Pull-Up', 'Barbell Row'].map((name, i) => [
    name,
    `00000000-0000-7000-8000-${String(i).padStart(12, '0')}`,
  ]),
);
const nameOf = new Map([...exerciseIds].map(([name, id]) => [id, name]));

const heavySpec = () => expandUsers(profile, { includeOptional: false })[0]!;
const heavy: PerfUserDataset = generateUserDataset(profile, heavySpec(), exerciseIds);
const entriesOf = (data: PerfUserDataset, exercise: string) =>
  data.entries.filter((e) => nameOf.get(e.exerciseId) === exercise);
const setsOf = (data: PerfUserDataset, exercise: string) =>
  data.sets.filter((s) => nameOf.get(s.exerciseId) === exercise);

describe('parsePerfProfile', () => {
  const problemsOf = (raw: unknown): string[] => {
    try {
      parsePerfProfile(raw);
    } catch (error) {
      if (error instanceof PerfProfileError) return error.problems;
      throw error;
    }
    return [];
  };

  it('accepts the shipped profile', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(problemsOf(require('../../prisma/seed/perf-profile.json'))).toEqual([]);
  });

  it('rejects an anchor without an offset and unknown units', () => {
    const problems = problemsOf({
      ...rawProfile,
      anchor: '2026-10-01T00:00:00',
      users: [
        {
          ...rawProfile.users[0],
          scenarios: {
            plateau: { exercise: 'Barbell Row', entries: 1, weight: 1, unit: 'stone', reps: 1 },
          },
        },
      ],
    });
    expect(problems.join('\n')).toMatch(/anchor/);
    expect(problems.join('\n')).toMatch(/unit/);
  });

  it('rejects scenario entries that leave no room for regular entries', () => {
    const problems = problemsOf({
      ...rawProfile,
      users: [{ ...rawProfile.users[0], entries: 100 }],
    });
    expect(problems.join('\n')).toMatch(/perf-heavy/);
  });

  it('rejects a dedicated scenario exercise that also appears among the regular exercises', () => {
    const problems = problemsOf({
      ...rawProfile,
      users: [{ ...rawProfile.users[0], exercises: [...EXERCISES, 'Pull-Up'] }],
    });
    expect(problems.join('\n')).toMatch(/Pull-Up/);
  });
});

describe('expandUsers', () => {
  it('numbers repeated users and leaves optional users out unless asked', () => {
    expect(expandUsers(profile, { includeOptional: false }).map((u) => u.id)).toEqual([
      'perf-heavy',
      'perf-bg-001',
      'perf-bg-002',
      'perf-bg-003',
    ]);
    expect(expandUsers(profile, { includeOptional: true }).map((u) => u.id)).toContain(
      'perf-single',
    );
  });
});

describe('generateUserDataset', () => {
  it('generates the same rows, ids included, on every run', () => {
    expect(generateUserDataset(profile, heavySpec(), exerciseIds)).toEqual(heavy);
  });

  it('gives a user the same rows whatever other users the profile lists', () => {
    const bgOnly = parsePerfProfile({ ...rawProfile, users: [rawProfile.users[1]] });
    const fromFull = expandUsers(profile, { includeOptional: true }).find(
      (u) => u.id === 'perf-bg-002',
    )!;
    const fromBgOnly = expandUsers(bgOnly, { includeOptional: false }).find(
      (u) => u.id === 'perf-bg-002',
    )!;
    expect(generateUserDataset(bgOnly, fromBgOnly, exerciseIds)).toEqual(
      generateUserDataset(profile, fromFull, exerciseIds),
    );
  });

  it('gives each user different rows', () => {
    const [, first, second] = expandUsers(profile, { includeOptional: false });
    const a = generateUserDataset(profile, first!, exerciseIds);
    const b = generateUserDataset(profile, second!, exerciseIds);
    expect(a.entries.map((e) => e.performedAt)).not.toEqual(b.entries.map((e) => e.performedAt));
    expect(a.sets.map((s) => s.weight)).not.toEqual(b.sets.map((s) => s.weight));
  });

  it('orders set ids by set number within an entry, like ids the API generates', () => {
    const byEntry = new Map<string, string[]>();
    for (const set of heavy.sets)
      byEntry.set(set.entryId, [...(byEntry.get(set.entryId) ?? []), set.id]);
    for (const ids of byEntry.values()) expect(ids).toEqual([...ids].sort());
  });

  it('creates the profiled number of entries with 3 to 6 numbered sets each', () => {
    expect(heavy.entries).toHaveLength(3_000);
    const byEntry = new Map<string, number[]>();
    for (const set of heavy.sets)
      byEntry.set(set.entryId, [...(byEntry.get(set.entryId) ?? []), set.setNumber]);
    expect(byEntry.size).toBe(3_000);
    for (const numbers of byEntry.values()) {
      expect(numbers.length).toBeGreaterThanOrEqual(3);
      expect(numbers.length).toBeLessThanOrEqual(6);
      expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    }
  });

  it('dates every entry within the span before the fixed anchor, so none is in the future (D12)', () => {
    const anchor = Date.parse('2026-10-01T00:00:00Z');
    const start = anchor - 1095 * 86_400_000;
    for (const entry of heavy.entries) {
      expect(entry.performedAt.getTime()).toBeGreaterThanOrEqual(start);
      expect(entry.performedAt.getTime()).toBeLessThan(anchor);
      expect([420, 0, -300]).toContain(entry.utcOffsetMinutes);
    }
  });

  it('stores derived values exactly as the API would (computeSetMetrics)', () => {
    for (const set of heavy.sets) {
      expect({ weightKg: set.weightKg, volumeKg: set.volumeKg, e1rmKg: set.e1rmKg }).toEqual(
        computeSetMetrics({ reps: set.reps, weight: new Decimal(set.weight), unit: set.unit }),
      );
    }
  });

  it('only produces values the API accepts', () => {
    for (const set of heavy.sets) {
      const weight = new Decimal(set.weight);
      expect(['kg', 'lb']).toContain(set.unit);
      expect(weight.gte(0) && weight.lte(2000)).toBe(true);
      expect(weight.decimalPlaces()).toBeLessThanOrEqual(3);
      expect(Number.isInteger(set.reps) && set.reps >= 1 && set.reps <= 1000).toBe(true);
    }
  });

  it('copies user, exercise and instant of the entry onto each set', () => {
    const entries = new Map(heavy.entries.map((e) => [e.id, e]));
    for (const set of heavy.sets) {
      const entry = entries.get(set.entryId)!;
      expect(set.userId).toBe('perf-heavy');
      expect(set.exerciseId).toBe(entry.exerciseId);
      expect(set.performedAt).toEqual(entry.performedAt);
    }
  });

  it('logs about 15 % of entries in lb and about 5 % as bodyweight', () => {
    const regular = heavy.entries.filter((e) => EXERCISES.includes(nameOf.get(e.exerciseId)!));
    const firstSet = new Map(
      heavy.sets.filter((s) => s.setNumber === 1).map((s) => [s.entryId, s]),
    );
    const share = (predicate: (s: { unit: string; weight: string }) => boolean) =>
      regular.filter((e) => predicate(firstSet.get(e.id)!)).length / regular.length;
    expect(share((s) => s.unit === 'lb')).toBeCloseTo(0.15, 1);
    expect(share((s) => new Decimal(s.weight).isZero())).toBeCloseTo(0.05, 1);
  });

  it('spreads regular entries unevenly across exercises (skewed frequency)', () => {
    const counts = EXERCISES.map((name) => entriesOf(heavy, name).length);
    expect(Math.max(...counts)).toBeGreaterThan(2 * Math.min(...counts));
  });

  it('logs the old-only exercise only in the first days of the span', () => {
    const anchor = Date.parse('2026-10-01T00:00:00Z');
    const cutoff = anchor - (1095 - 180) * 86_400_000;
    const old = entriesOf(heavy, 'Sumo Deadlift');
    expect(old).toHaveLength(40);
    for (const entry of old) expect(entry.performedAt.getTime()).toBeLessThan(cutoff);
  });

  it('logs the bodyweight-only exercise with weight 0 in every set', () => {
    expect(entriesOf(heavy, 'Pull-Up')).toHaveLength(50);
    for (const set of setsOf(heavy, 'Pull-Up')) expect(set.weight).toBe('0');
  });

  it('repeats the plateau weight and reps in every set, so the top value is tied many times', () => {
    const sets = setsOf(heavy, 'Barbell Row');
    expect(entriesOf(heavy, 'Barbell Row')).toHaveLength(20);
    expect(sets.length).toBeGreaterThanOrEqual(60);
    for (const set of sets) expect([set.weight, set.unit, set.reps]).toEqual(['100', 'kg', 5]);
  });

  it('puts the same-instant entries at one identical instant and offset', () => {
    const counts = new Map<string, number>();
    for (const e of entriesOf(heavy, 'Bench Press')) {
      const key = `${e.performedAt.toISOString()}|${e.utcOffsetMinutes}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(Math.max(...counts.values())).toBeGreaterThanOrEqual(25);
  });

  it('orders entries by time, as they would arrive in production', () => {
    const times = heavy.entries.map((e) => e.performedAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('fails clearly when an exercise is not in the database', () => {
    expect(() => generateUserDataset(profile, heavySpec(), new Map())).toThrow(/Bench Press/);
  });
});
