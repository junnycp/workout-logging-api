import { envSchema } from '../config/env.schema';
import { createPgAdapter } from '../database/pg-adapter';
import { syncExerciseCatalog } from '../exercises/catalog/catalog-sync';
import { DEFAULT_CATALOG_PATH, loadExerciseCatalog } from '../exercises/catalog/load-catalog';
import { PrismaClient } from '../generated/prisma/client';

/**
 * Syncs prisma/seed/exercise-catalog.json into the database. Idempotent; run by the docker compose
 * `migrate` service after `prisma migrate deploy`, and locally with `npm run seed`.
 * Prints one JSON line (also on failure) so it reads well in container logs.
 */
async function main(): Promise<void> {
  const { DATABASE_URL } = envSchema.pick({ DATABASE_URL: true }).parse(process.env);
  const catalogPath = process.env.CATALOG_PATH ?? DEFAULT_CATALOG_PATH;
  const prisma = new PrismaClient({ adapter: createPgAdapter(DATABASE_URL) });
  try {
    const report = await syncExerciseCatalog(prisma, loadExerciseCatalog(catalogPath));
    console.log(
      JSON.stringify({ level: 'info', msg: 'Exercise catalog synced', catalogPath, ...report }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({ level: 'error', msg: 'Exercise catalog sync failed', error: String(error) }),
  );
  process.exitCode = 1;
});
