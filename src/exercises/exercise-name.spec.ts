import { normalizeExerciseName } from './exercise-name';

describe('normalizeExerciseName', () => {
  it.each([
    ['Bench Press', 'bench press'],
    ['  bench press ', 'bench press'],
    ['BENCH   PRESS', 'bench press'],
    ['Bench\tPress\n', 'bench press'],
    ['Ｂｅｎｃｈ　Ｐｒｅｓｓ', 'bench press'], // full-width letters and ideographic space (NFKC)
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeExerciseName(input)).toBe(expected);
  });

  it('keeps meaningful punctuation such as hyphens', () => {
    expect(normalizeExerciseName('Pull-Up')).toBe('pull-up');
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizeExerciseName('   ')).toBe('');
  });
});
