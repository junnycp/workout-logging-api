import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CatalogValidationError, parseExerciseCatalog } from './exercise-catalog';

const base = {
  version: 1,
  muscleGroups: [
    { code: 'chest', name: 'Chest' },
    { code: 'triceps', name: 'Triceps' },
  ],
  exercises: [
    {
      name: 'Bench Press',
      aliases: ['Barbell Bench Press', 'flat bench'],
      primaryMuscles: ['chest'],
      secondaryMuscles: ['triceps'],
    },
  ],
};

const problemsOf = (raw: unknown): string[] => {
  try {
    parseExerciseCatalog(raw);
  } catch (error) {
    if (error instanceof CatalogValidationError) return error.problems;
    throw error;
  }
  return [];
};

describe('parseExerciseCatalog', () => {
  it('returns exercises with normalized lookup keys for the name and every alias', () => {
    const catalog = parseExerciseCatalog(base);
    expect(catalog.exercises[0]).toEqual({
      name: 'Bench Press',
      nameKeys: ['bench press', 'barbell bench press', 'flat bench'],
      primaryMuscles: ['chest'],
      secondaryMuscles: ['triceps'],
    });
  });

  it('defaults aliases and secondary muscles to empty lists', () => {
    const catalog = parseExerciseCatalog({
      ...base,
      exercises: [{ name: 'Dips', primaryMuscles: ['triceps'] }],
    });
    expect(catalog.exercises[0]).toMatchObject({ nameKeys: ['dips'], secondaryMuscles: [] });
  });

  it('rejects a name or alias that normalizes to another exercise name', () => {
    const problems = problemsOf({
      ...base,
      exercises: [...base.exercises, { name: 'Flat  Bench', primaryMuscles: ['chest'] }],
    });
    expect(problems).toEqual([
      '"Flat  Bench" uses the name "flat bench", already used by "Bench Press"',
    ]);
  });

  it('rejects two exercises with the same name, including after trimming', () => {
    const problems = problemsOf({
      ...base,
      exercises: [
        { name: 'Squat', primaryMuscles: ['chest'] },
        { name: 'Squat ', primaryMuscles: ['chest'] },
      ],
    });
    expect(problems).toEqual(['Exercise "Squat" is defined more than once']);
  });

  it('rejects names whose normalized key exceeds 100 characters', () => {
    // NFKC expands the ligature U+FB03 to "ffi": 98 + 1 characters become a 101-character key.
    const name = `${'a'.repeat(98)}\uFB03`;
    const problems = problemsOf({ ...base, exercises: [{ name, primaryMuscles: ['chest'] }] });
    expect(problems).toEqual([`"${name}" normalizes to a key longer than 100 characters`]);
  });

  it('rejects unknown muscle group codes', () => {
    const problems = problemsOf({
      ...base,
      exercises: [{ name: 'Squat', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'] }],
    });
    expect(problems).toEqual([
      '"Squat" references unknown muscle group "quads"',
      '"Squat" references unknown muscle group "glutes"',
    ]);
  });

  it('rejects a muscle listed as both primary and secondary', () => {
    const problems = problemsOf({
      ...base,
      exercises: [{ name: 'Dips', primaryMuscles: ['triceps'], secondaryMuscles: ['triceps'] }],
    });
    expect(problems).toEqual(['"Dips" lists "triceps" as both primary and secondary']);
  });

  it('rejects duplicate muscle group codes', () => {
    const problems = problemsOf({
      ...base,
      muscleGroups: [...base.muscleGroups, { code: 'chest', name: 'Pecs' }],
    });
    expect(problems).toEqual(['Muscle group "chest" is defined more than once']);
  });

  it('rejects structurally invalid files with the path of the problem', () => {
    const problems = problemsOf({ ...base, exercises: [{ name: '', primaryMuscles: [] }] });
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('exercises.0.name'),
        expect.stringContaining('exercises.0.primaryMuscles'),
      ]),
    );
  });

  it('accepts the catalog shipped with the application', () => {
    const shipped: unknown = JSON.parse(
      readFileSync(join(__dirname, '../../../prisma/seed/exercise-catalog.json'), 'utf8'),
    );
    const catalog = parseExerciseCatalog(shipped);
    expect(catalog.exercises.length).toBeGreaterThanOrEqual(40);
  });
});
