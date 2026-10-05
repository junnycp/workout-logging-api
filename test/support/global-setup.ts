import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createPgAdapter } from '../../src/database/pg-adapter';
import { syncExerciseCatalog } from '../../src/exercises/catalog/catalog-sync';
import { loadExerciseCatalog } from '../../src/exercises/catalog/load-catalog';
import { PrismaClient } from '../../src/generated/prisma/client';
import { configureDockerForColima } from './docker-env';

declare global {
  var __POSTGRES__: StartedPostgreSqlContainer | undefined;
}

/** One Postgres 16 container for the whole run, migrated and seeded with the real catalog. */
export default async function globalSetup(): Promise<void> {
  configureDockerForColima();
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  globalThis.__POSTGRES__ = container;

  process.env.DATABASE_URL = container.getConnectionUri();
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'fatal';

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], { env: process.env, stdio: 'pipe' });

  const prisma = new PrismaClient({
    adapter: createPgAdapter(process.env.DATABASE_URL),
  });
  try {
    await syncExerciseCatalog(prisma, loadExerciseCatalog());
  } finally {
    await prisma.$disconnect();
  }
}
