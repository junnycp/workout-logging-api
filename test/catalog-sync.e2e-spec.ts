import { syncExerciseCatalog } from '../src/exercises/catalog/catalog-sync';
import { ExerciseCatalog, parseExerciseCatalog } from '../src/exercises/catalog/exercise-catalog';
import { loadExerciseCatalog } from '../src/exercises/catalog/load-catalog';
import { createIsolatedDatabase, IsolatedDatabase } from './support/isolated-database';

describe('Exercise catalog sync (integration)', () => {
  let db: IsolatedDatabase;
  const shipped = loadExerciseCatalog();

  beforeAll(async () => {
    db = await createIsolatedDatabase();
  });

  afterAll(async () => {
    await db.drop();
  });

  const exerciseIdFor = async (nameKey: string) =>
    (await db.prisma.exerciseName.findUnique({ where: { nameKey } }))?.exerciseId;

  it('loads the shipped catalog into an empty database', async () => {
    const report = await syncExerciseCatalog(db.prisma, shipped);

    const nameCount = shipped.exercises.reduce((n, e) => n + e.nameKeys.length, 0);
    expect(report).toEqual({
      muscleGroups: shipped.muscleGroups.length,
      exercises: shipped.exercises.length,
      names: nameCount,
      mappings: expect.any(Number) as unknown,
      staleExercises: [],
    });
    expect(await db.prisma.exercise.count()).toBe(shipped.exercises.length);
    expect(await db.prisma.exerciseName.count()).toBe(nameCount);
  });

  it('is idempotent: a second run keeps ids and row counts', async () => {
    const before = await db.prisma.exercise.findMany({ orderBy: { name: 'asc' } });
    const mappingsBefore = await db.prisma.exerciseMuscleGroup.count();

    await syncExerciseCatalog(db.prisma, shipped);

    const after = await db.prisma.exercise.findMany({ orderBy: { name: 'asc' } });
    expect(after.map((e) => [e.name, e.id])).toEqual(before.map((e) => [e.name, e.id]));
    expect(await db.prisma.exerciseMuscleGroup.count()).toBe(mappingsBefore);
  });

  it('resolves aliases to the canonical exercise', async () => {
    const romanian = await db.prisma.exercise.findUniqueOrThrow({
      where: { name: 'Romanian Deadlift' },
    });
    expect(await exerciseIdFor('rdl')).toBe(romanian.id);
    expect(await exerciseIdFor('romanian deadlift')).toBe(romanian.id);
  });

  it('applies mapping changes and alias moves from an edited catalog', async () => {
    const edited: ExerciseCatalog = parseExerciseCatalog({
      version: 1,
      muscleGroups: shipped.muscleGroups,
      exercises: [
        // "flat bench press" moves from Bench Press to a new exercise; Bench Press loses its triceps mapping.
        {
          name: 'Bench Press',
          aliases: ['Barbell Bench Press'],
          primaryMuscles: ['chest'],
          secondaryMuscles: ['front_delts'],
        },
        {
          name: 'Smith Machine Bench Press',
          aliases: ['Flat Bench Press'],
          primaryMuscles: ['chest'],
        },
      ],
    });

    const report = await syncExerciseCatalog(db.prisma, edited);

    const bench = await db.prisma.exercise.findUniqueOrThrow({
      where: { name: 'Bench Press' },
      include: { muscleGroups: true },
    });
    const smith = await db.prisma.exercise.findUniqueOrThrow({
      where: { name: 'Smith Machine Bench Press' },
    });
    expect(await exerciseIdFor('flat bench press')).toBe(smith.id);
    expect(bench.muscleGroups.map((m) => [m.muscleGroupCode, m.role]).sort()).toEqual([
      ['chest', 'primary'],
      ['front_delts', 'secondary'],
    ]);
    // Exercises dropped from the catalog are kept (entries may reference them) and reported.
    expect(report.staleExercises).toContain('Deadlift');
    expect(await db.prisma.exercise.findUnique({ where: { name: 'Deadlift' } })).not.toBeNull();
  });

  it('serves partial name matches from the trigram index', async () => {
    await db.prisma.$executeRawUnsafe('ANALYZE exercise_names');
    const plan = await db.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');
      return tx.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(
        `EXPLAIN SELECT exercise_id FROM exercise_names WHERE name_key ILIKE '%bench%'`,
      );
    });
    expect(plan.map((row) => row['QUERY PLAN']).join('\n')).toContain(
      'exercise_names_name_key_trgm_idx',
    );
  });
});
