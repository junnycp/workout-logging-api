import { z } from 'zod';
import { normalizeExerciseName } from '../exercise-name';

/** Column size of exercise_names.name_key; checked after NFKC, which can lengthen a name. */
const MAX_NAME_KEY_LENGTH = 100;

const code = z.string().regex(/^[a-z][a-z_]{1,31}$/, 'must be a lower_snake_case code');
const displayName = z.string().trim().min(1).max(100);

const catalogFileSchema = z.object({
  version: z.literal(1),
  muscleGroups: z.array(z.object({ code, name: z.string().trim().min(1).max(64) })).min(1),
  exercises: z
    .array(
      z.object({
        name: displayName,
        aliases: z.array(displayName).default([]),
        primaryMuscles: z.array(code).min(1),
        secondaryMuscles: z.array(code).default([]),
      }),
    )
    .min(1),
});

export interface CatalogExercise {
  name: string;
  /** Normalized canonical name first, then normalized aliases (deduplicated). */
  nameKeys: string[];
  primaryMuscles: string[];
  secondaryMuscles: string[];
}

export interface ExerciseCatalog {
  muscleGroups: { code: string; name: string }[];
  exercises: CatalogExercise[];
}

export class CatalogValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid exercise catalog:\n- ${problems.join('\n- ')}`);
  }
}

/**
 * Validates the exercise catalog (structure and cross-references) and returns it with normalized
 * lookup keys. Collects every problem instead of stopping at the first, so a bad edit is fixed in one go.
 */
export function parseExerciseCatalog(raw: unknown): ExerciseCatalog {
  const parsed = catalogFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CatalogValidationError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }

  const problems: string[] = [];
  const knownCodes = new Set<string>();
  for (const group of parsed.data.muscleGroups) {
    if (knownCodes.has(group.code))
      problems.push(`Muscle group "${group.code}" is defined more than once`);
    knownCodes.add(group.code);
  }

  // Owners are tracked by position, not by display name, so two entries with the same name collide too.
  const ownerByKey = new Map<string, number>();
  const seenNames = new Set<string>();
  const exercises = parsed.data.exercises.map((exercise, index): CatalogExercise => {
    if (seenNames.has(exercise.name)) {
      problems.push(`Exercise "${exercise.name}" is defined more than once`);
    }
    seenNames.add(exercise.name);
    const nameKeys = [...new Set([exercise.name, ...exercise.aliases].map(normalizeExerciseName))];
    for (const key of nameKeys) {
      if (key.length > MAX_NAME_KEY_LENGTH) {
        problems.push(
          `"${exercise.name}" normalizes to a key longer than ${MAX_NAME_KEY_LENGTH} characters`,
        );
        continue;
      }
      const owner = ownerByKey.get(key);
      if (owner === undefined) {
        ownerByKey.set(key, index);
      } else if (parsed.data.exercises[owner]?.name !== exercise.name) {
        const ownerName = parsed.data.exercises[owner]?.name ?? '';
        problems.push(`"${exercise.name}" uses the name "${key}", already used by "${ownerName}"`);
      }
    }
    for (const muscle of [...exercise.primaryMuscles, ...exercise.secondaryMuscles]) {
      if (!knownCodes.has(muscle)) {
        problems.push(`"${exercise.name}" references unknown muscle group "${muscle}"`);
      }
    }
    for (const muscle of exercise.secondaryMuscles) {
      if (exercise.primaryMuscles.includes(muscle)) {
        problems.push(`"${exercise.name}" lists "${muscle}" as both primary and secondary`);
      }
    }
    return {
      name: exercise.name,
      nameKeys,
      primaryMuscles: [...new Set(exercise.primaryMuscles)],
      secondaryMuscles: [...new Set(exercise.secondaryMuscles)],
    };
  });

  if (problems.length > 0) throw new CatalogValidationError(problems);
  return { muscleGroups: parsed.data.muscleGroups, exercises };
}
