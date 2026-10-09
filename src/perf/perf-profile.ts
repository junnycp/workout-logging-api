import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { weightUnits } from '../units/weight-units';

export const DEFAULT_PERF_PROFILE_PATH = 'prisma/seed/perf-profile.json';

const count = z.number().int().positive();
const exerciseName = z.string().trim().min(1).max(100);

const scenariosSchema = z
  .object({
    /** An exercise logged only at the start of the span: its newest entries are deep in the user's history. */
    oldOnly: z
      .object({ exercise: exerciseName, entries: count, withinFirstDays: count })
      .optional(),
    /** Every set at weight 0: no weighted record exists. */
    bodyweightOnly: z.object({ exercise: exerciseName, entries: count }).optional(),
    /** Every set at the same weight and reps: the top stored value is tied by every set. */
    plateau: z
      .object({
        exercise: exerciseName,
        entries: count,
        weight: z.number().positive().max(2000),
        unit: z.string().refine((unit) => weightUnits.isSupported(unit), 'unsupported unit'),
        reps: z.number().int().min(1).max(1000),
      })
      .optional(),
    /** Extra entries of a regular exercise at one identical instant: cursor ties across page boundaries. */
    sameInstant: z.object({ exercise: exerciseName, entries: count }).optional(),
  })
  .default({});

const userSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,60}$/),
  /** More than 1: users `<id>-001` … `<id>-<count>`. */
  count: count.default(1),
  entries: count,
  exercises: z.array(exerciseName).min(1),
  /** Seeded only on request (the single-exercise worst case). */
  optional: z.boolean().default(false),
  scenarios: scenariosSchema,
});

const range = z
  .object({ min: count, max: count })
  .refine((r) => r.min <= r.max, 'min must not exceed max');

const profileSchema = z.object({
  version: z.literal(1),
  seed: z.number().int().nonnegative(),
  /** Fixed end of the generated span, in the past: data is the same on every run and valid under D12. */
  anchor: z.iso.datetime({ offset: true }),
  spanDays: count,
  setsPerEntry: range,
  reps: range,
  lbShare: z.number().min(0).max(1),
  bodyweightShare: z.number().min(0).max(1),
  utcOffsetsMinutes: z.array(z.number().int().min(-840).max(840)).min(1),
  users: z.array(userSchema).min(1),
});

export type PerfProfile = z.infer<typeof profileSchema>;
type UserDefinition = PerfProfile['users'][number];
export type PerfScenarios = UserDefinition['scenarios'];

export interface PerfUserSpec {
  id: string;
  entries: number;
  exercises: string[];
  scenarios: PerfScenarios;
}

export class PerfProfileError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid performance profile:\n- ${problems.join('\n- ')}`);
  }
}

/** Validates the profile and its cross-field rules; collects every problem. */
export function parsePerfProfile(raw: unknown): PerfProfile {
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new PerfProfileError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  const problems: string[] = [];
  for (const user of parsed.data.users) {
    const { oldOnly, bodyweightOnly, plateau, sameInstant } = user.scenarios;
    const scenarioEntries = [oldOnly, bodyweightOnly, plateau, sameInstant].reduce(
      (sum, scenario) => sum + (scenario?.entries ?? 0),
      0,
    );
    if (scenarioEntries >= user.entries)
      problems.push(`${user.id}: scenarios use ${scenarioEntries} of ${user.entries} entries`);
    for (const dedicated of [oldOnly, bodyweightOnly, plateau]) {
      if (dedicated && user.exercises.includes(dedicated.exercise))
        problems.push(`${user.id}: ${dedicated.exercise} is a scenario exercise and a regular one`);
    }
    if (oldOnly && oldOnly.withinFirstDays > parsed.data.spanDays)
      problems.push(`${user.id}: oldOnly.withinFirstDays exceeds spanDays`);
  }
  if (problems.length > 0) throw new PerfProfileError(problems);
  return parsed.data;
}

export function loadPerfProfile(path = DEFAULT_PERF_PROFILE_PATH): PerfProfile {
  return parsePerfProfile(JSON.parse(readFileSync(resolve(path), 'utf8')) as unknown);
}

/** One spec per seeded user, in profile order; optional users only when asked for. */
export function expandUsers(
  profile: PerfProfile,
  options: { includeOptional: boolean },
): PerfUserSpec[] {
  return profile.users
    .filter((user) => options.includeOptional || !user.optional)
    .flatMap((user) =>
      Array.from({ length: user.count }, (_, i) => ({
        id: user.count === 1 ? user.id : `${user.id}-${String(i + 1).padStart(3, '0')}`,
        entries: user.entries,
        exercises: user.exercises,
        scenarios: user.scenarios,
      })),
    );
}
