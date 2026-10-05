import type { PrismaClient } from '../../generated/prisma/client';
import type { ExerciseCatalog } from './exercise-catalog';

export interface CatalogSyncReport {
  muscleGroups: number;
  exercises: number;
  names: number;
  mappings: number;
  /** Exercises still in the database but no longer in the catalog (kept: entries may reference them). */
  staleExercises: string[];
}

/**
 * Makes the database match the catalog. Idempotent: running it twice changes nothing and keeps
 * exercise ids stable. Exercises are matched by canonical name; renaming one in the catalog creates a
 * new exercise and reports the old one as stale. Runs in one transaction under an advisory lock so two
 * deploys syncing at the same time cannot interleave.
 */
export async function syncExerciseCatalog(
  prisma: PrismaClient,
  catalog: ExerciseCatalog,
): Promise<CatalogSyncReport> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('exercise_catalog_sync'))`;

      for (const group of catalog.muscleGroups) {
        await tx.muscleGroup.upsert({
          where: { code: group.code },
          create: group,
          update: { name: group.name },
        });
      }

      const idByName = new Map<string, string>();
      for (const exercise of catalog.exercises) {
        const row = await tx.exercise.upsert({
          where: { name: exercise.name },
          create: { name: exercise.name },
          update: {},
          select: { id: true },
        });
        idByName.set(exercise.name, row.id);
      }
      const exerciseIds = [...idByName.values()];
      const idOf = (name: string): string => idByName.get(name) as string;

      // Replace names and mappings wholesale. Names are also cleared by key, so an alias that moved from
      // a stale exercise to a catalog exercise does not hit the primary key.
      const names = catalog.exercises.flatMap((exercise) =>
        exercise.nameKeys.map((nameKey, index) => ({
          nameKey,
          exerciseId: idOf(exercise.name),
          isPrimary: index === 0,
        })),
      );
      await tx.exerciseName.deleteMany({
        where: {
          OR: [
            { exerciseId: { in: exerciseIds } },
            { nameKey: { in: names.map((n) => n.nameKey) } },
          ],
        },
      });
      await tx.exerciseName.createMany({ data: names });

      const mappings = catalog.exercises.flatMap((exercise) => [
        ...exercise.primaryMuscles.map((code) => ({
          exerciseId: idOf(exercise.name),
          muscleGroupCode: code,
          role: 'primary' as const,
        })),
        ...exercise.secondaryMuscles.map((code) => ({
          exerciseId: idOf(exercise.name),
          muscleGroupCode: code,
          role: 'secondary' as const,
        })),
      ]);
      await tx.exerciseMuscleGroup.deleteMany({ where: { exerciseId: { in: exerciseIds } } });
      await tx.exerciseMuscleGroup.createMany({ data: mappings });

      const stale = await tx.exercise.findMany({
        where: { id: { notIn: exerciseIds } },
        select: { name: true },
        orderBy: { name: 'asc' },
      });

      return {
        muscleGroups: catalog.muscleGroups.length,
        exercises: exerciseIds.length,
        names: names.length,
        mappings: mappings.length,
        staleExercises: stale.map((exercise) => exercise.name),
      };
    },
    { timeout: 30_000 },
  );
}
