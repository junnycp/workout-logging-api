import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { configureDockerForColima } from './docker-env';

declare global {
  var __POSTGRES__: StartedPostgreSqlContainer | undefined;
}

/** One Postgres 16 container for the whole run, migrated with the real migrations. */
export default async function globalSetup(): Promise<void> {
  configureDockerForColima();
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  globalThis.__POSTGRES__ = container;

  process.env.DATABASE_URL = container.getConnectionUri();
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'fatal';

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], { env: process.env, stdio: 'pipe' });
}
