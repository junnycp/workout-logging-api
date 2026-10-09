import { envSchema } from '../config/env.schema';
import { createPgAdapter } from '../database/pg-adapter';
import { PrismaClient } from '../generated/prisma/client';
import { DEFAULT_PERF_PROFILE_PATH, loadPerfProfile } from '../perf/perf-profile';
import { seedPerfDataset } from '../perf/seed-perf-dataset';

/**
 * Loads the performance dataset described by prisma/seed/perf-profile.json (`PERF_PROFILE` overrides the path).
 * `--include-optional` also seeds optional users (the single-exercise worst case). Idempotent: the profile's
 * users are replaced, nobody else is touched. Needs the exercise catalog (`npm run seed`) first.
 * Runs with dev dependencies (`npm run seed:perf`, or the compose `seed-perf` service), not in the runtime image.
 */
async function main(): Promise<void> {
  const { DATABASE_URL } = envSchema.pick({ DATABASE_URL: true }).parse(process.env);
  const profilePath = process.env.PERF_PROFILE ?? DEFAULT_PERF_PROFILE_PATH;
  const includeOptional = process.argv.includes('--include-optional');
  const prisma = new PrismaClient({ adapter: createPgAdapter(DATABASE_URL) });
  const started = Date.now();
  try {
    const report = await seedPerfDataset(prisma, loadPerfProfile(profilePath), { includeOptional });
    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'Performance dataset seeded',
        profilePath,
        users: report.users.length,
        entries: report.entries,
        sets: report.sets,
        durationMs: Date.now() - started,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'Performance dataset seed failed',
      error: String(error),
    }),
  );
  process.exitCode = 1;
});
