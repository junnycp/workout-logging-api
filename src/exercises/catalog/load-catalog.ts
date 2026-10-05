import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ExerciseCatalog, parseExerciseCatalog } from './exercise-catalog';

export const DEFAULT_CATALOG_PATH = 'prisma/seed/exercise-catalog.json';

/** Reads and validates the catalog file (path relative to the working directory). */
export function loadExerciseCatalog(path = DEFAULT_CATALOG_PATH): ExerciseCatalog {
  return parseExerciseCatalog(JSON.parse(readFileSync(resolve(path), 'utf8')) as unknown);
}
