/**
 * Canonical lookup key for exercise names: Unicode NFKC (full-width -> ASCII), trimmed, inner
 * whitespace collapsed to one space, lower-cased. "Bench Press", " bench  press" and "BENCH PRESS"
 * all resolve to "bench press". Spelling variants ("pullup" vs "pull-up") are handled by catalog
 * aliases, not by this function.
 */
export function normalizeExerciseName(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}
