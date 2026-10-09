import type { PrismaClient } from '../generated/prisma/client';
import { generateUserDataset } from './perf-dataset';
import { expandUsers, PerfProfile } from './perf-profile';

/** Rows per createMany; both stay below Postgres' 65,535 bind parameters (5 and 12 columns). */
const ENTRY_BATCH = 2_000;
const SET_BATCH = 5_000;

export interface SeedPerfReport {
  users: string[];
  entries: number;
  sets: number;
}

const chunks = <T>(rows: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, i) =>
    rows.slice(i * size, (i + 1) * size),
  );

/**
 * Replaces the rows of the profile's users with freshly generated (deterministic) ones, then VACUUM ANALYZE so
 * the visibility map and planner statistics are current, as autovacuum would leave them in production.
 * Sets are deleted before entries: through the covering index that leads with user_id, instead of one
 * cascade per entry. Rows of other users are never touched.
 */
export async function seedPerfDataset(
  prisma: PrismaClient,
  profile: PerfProfile,
  options: { includeOptional: boolean },
): Promise<SeedPerfReport> {
  const users = expandUsers(profile, options);
  const userIds = users.map((user) => user.id);
  const exercises = await prisma.exercise.findMany({ select: { id: true, name: true } });
  const exerciseIds = new Map(exercises.map((exercise) => [exercise.name, exercise.id]));

  await prisma.workoutSet.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.workoutEntry.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.idempotencyKey.deleteMany({ where: { userId: { in: userIds } } });

  const report: SeedPerfReport = { users: userIds, entries: 0, sets: 0 };
  for (const user of users) {
    const { entries, sets } = generateUserDataset(profile, user, exerciseIds);
    for (const batch of chunks(entries, ENTRY_BATCH))
      await prisma.workoutEntry.createMany({ data: batch });
    for (const batch of chunks(sets, SET_BATCH))
      await prisma.workoutSet.createMany({ data: batch });
    report.entries += entries.length;
    report.sets += sets.length;
  }

  // Not inside a transaction: VACUUM cannot run in one.
  await prisma.$executeRawUnsafe('VACUUM (ANALYZE) workout_entries, workout_sets');
  return report;
}
