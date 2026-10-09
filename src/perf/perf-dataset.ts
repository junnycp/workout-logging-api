import Decimal from 'decimal.js';
import { weightUnits } from '../units/weight-units';
import { computeSetMetrics } from '../workouts/domain/set-metrics';
import type { NewEntry, NewSet } from '../workouts/workouts.repository';
import type { PerfProfile, PerfUserSpec } from './perf-profile';
import { createPrng, prngUuidV7, seedFor } from './prng';

export interface PerfUserDataset {
  userId: string;
  /** Ordered by (performedAt, id), the order in which a real client would have logged them. */
  entries: NewEntry[];
  /** Grouped by entry in entry order, set numbers 1..n. */
  sets: NewSet[];
}

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
/** Share of entries logged at a UTC offset other than the user's usual one (travel). */
const TRAVEL_SHARE = 0.1;

interface SetDraft {
  reps: number;
  weight: string;
  unit: string;
}

interface EntryDraft {
  exercise: string;
  ms: number;
  utcOffsetMinutes: number;
  sets: SetDraft[];
}

/**
 * Generates one user's entries and sets from the profile, deterministically (seeded per user). Weights grow over
 * the span with noise, are rounded to plates (2.5 kg / 5 lb) as a person would type them, and every derived
 * column comes from `computeSetMetrics`, the function the API uses.
 */
export function generateUserDataset(
  profile: PerfProfile,
  user: PerfUserSpec,
  exerciseIds: ReadonlyMap<string, string>,
): PerfUserDataset {
  const { oldOnly, bodyweightOnly, plateau, sameInstant } = user.scenarios;
  const needed = [
    ...user.exercises,
    ...[oldOnly, bodyweightOnly, plateau, sameInstant].flatMap((s) => (s ? [s.exercise] : [])),
  ];
  const missing = [...new Set(needed)].filter((name) => !exerciseIds.has(name));
  if (missing.length > 0) {
    throw new Error(
      `Exercises not in the database: ${missing.join(', ')}. Run "npm run seed" first.`,
    );
  }

  const lookup = <V>(map: ReadonlyMap<string, V>, key: string): V => {
    const value = map.get(key);
    if (value === undefined) throw new Error(`No value for ${key}`);
    return value;
  };

  const rng = createPrng(seedFor(profile.seed, user.id));
  const end = Date.parse(profile.anchor);
  const start = end - profile.spanDays * DAY_MS;
  const usualOffset = rng.pick(profile.utcOffsetsMinutes);
  const baseKg = new Map(needed.map((name) => [name, 20 + rng.next() * 100]));

  const instantBetween = (from: number, to: number): number =>
    Math.floor((from + rng.next() * (to - from)) / MINUTE_MS) * MINUTE_MS;
  const offset = (): number =>
    rng.chance(TRAVEL_SHARE) ? rng.pick(profile.utcOffsetsMinutes) : usualOffset;
  const setCount = (): number => rng.int(profile.setsPerEntry.min, profile.setsPerEntry.max);

  /** Progressive overload over the span, lighter for higher reps, ±5 % day-to-day noise. */
  const workingSets = (exercise: string, ms: number, unit: string, bodyweight: boolean) =>
    Array.from({ length: setCount() }, (): SetDraft => {
      const reps = rng.int(profile.reps.min, profile.reps.max);
      const progress = 0.75 + (0.35 * (ms - start)) / (end - start);
      const kg =
        lookup(baseKg, exercise) * progress * (1.1 - 0.02 * reps) * (0.95 + 0.1 * rng.next());
      let weight = 0;
      if (!bodyweight)
        weight =
          unit === 'lb'
            ? Math.max(5, Math.round(weightUnits.fromKg(new Decimal(kg), 'lb').toNumber() / 5) * 5)
            : Math.max(2.5, Math.round(kg / 2.5) * 2.5);
      return { reps, weight: String(weight), unit };
    });

  const drafts: EntryDraft[] = [];
  const regularEntry = (exercise: string, ms: number, utcOffsetMinutes = offset()): EntryDraft => {
    const unit = rng.chance(profile.lbShare) ? 'lb' : 'kg';
    const bodyweight = rng.chance(profile.bodyweightShare);
    return { exercise, ms, utcOffsetMinutes, sets: workingSets(exercise, ms, unit, bodyweight) };
  };

  // Skewed (Zipf-like) exercise frequency: the i-th exercise is picked with weight 1 / (i + 1).
  const total = user.exercises.reduce((sum, _, i) => sum + 1 / (i + 1), 0);
  const pickExercise = (): string => {
    let x = rng.next() * total;
    for (const [i, exercise] of user.exercises.entries()) {
      x -= 1 / (i + 1);
      if (x < 0) return exercise;
    }
    return rng.pick(user.exercises); // only reachable through float rounding at the very end
  };

  const scenarioEntries = [oldOnly, bodyweightOnly, plateau, sameInstant].reduce(
    (sum, s) => sum + (s?.entries ?? 0),
    0,
  );
  for (let i = 0; i < user.entries - scenarioEntries; i++)
    drafts.push(regularEntry(pickExercise(), instantBetween(start, end)));

  if (oldOnly) {
    const cutoff = start + oldOnly.withinFirstDays * DAY_MS;
    for (let i = 0; i < oldOnly.entries; i++)
      drafts.push(regularEntry(oldOnly.exercise, instantBetween(start, cutoff)));
  }
  if (bodyweightOnly) {
    for (let i = 0; i < bodyweightOnly.entries; i++) {
      const ms = instantBetween(start, end);
      drafts.push({
        exercise: bodyweightOnly.exercise,
        ms,
        utcOffsetMinutes: offset(),
        sets: workingSets(bodyweightOnly.exercise, ms, 'kg', true),
      });
    }
  }
  if (plateau) {
    const { reps, unit } = plateau;
    for (let i = 0; i < plateau.entries; i++) {
      drafts.push({
        exercise: plateau.exercise,
        ms: instantBetween(start, end),
        utcOffsetMinutes: offset(),
        sets: Array.from({ length: setCount() }, () => ({
          reps,
          weight: String(plateau.weight),
          unit,
        })),
      });
    }
  }
  if (sameInstant) {
    const ms = instantBetween(start, end);
    for (let i = 0; i < sameInstant.entries; i++)
      drafts.push(regularEntry(sameInstant.exercise, ms, usualOffset));
  }

  const identified = drafts.map((draft) => ({ id: prngUuidV7(draft.ms, rng), draft }));
  identified.sort((a, b) => a.draft.ms - b.draft.ms || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const entries: NewEntry[] = [];
  const sets: NewSet[] = [];
  for (const { id, draft } of identified) {
    const performedAt = new Date(draft.ms);
    const exerciseId = lookup(exerciseIds, draft.exercise);
    entries.push({
      id,
      userId: user.id,
      exerciseId,
      performedAt,
      utcOffsetMinutes: draft.utcOffsetMinutes,
    });
    // Ascending ids in set order, as uuidv7() gives the API's sets (the lowest-id tie-break relies on it).
    const setIds = draft.sets.map(() => prngUuidV7(draft.ms, rng)).sort();
    draft.sets.forEach((set, i) => {
      sets.push({
        id: setIds[i] ?? '',
        entryId: id,
        setNumber: i + 1,
        reps: set.reps,
        weight: set.weight,
        unit: set.unit,
        ...computeSetMetrics({ reps: set.reps, weight: new Decimal(set.weight), unit: set.unit }),
        userId: user.id,
        exerciseId,
        performedAt,
      });
    });
  }

  return { userId: user.id, entries, sets };
}
