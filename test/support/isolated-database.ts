import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';

const clientFor = (url: string): PrismaClient =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

export interface IsolatedDatabase {
  url: string;
  prisma: PrismaClient;
  drop(): Promise<void>;
}

/**
 * A freshly migrated database in the shared test container, for tests that change catalog data and
 * must not affect other suites.
 */
export async function createIsolatedDatabase(): Promise<IsolatedDatabase> {
  const baseUrl = process.env.DATABASE_URL as string;
  const name = `test_${randomBytes(6).toString('hex')}`;
  const admin = clientFor(baseUrl);
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);

  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: 'pipe',
  });
  const prisma = clientFor(url.toString());

  return {
    url: url.toString(),
    prisma,
    drop: async () => {
      await prisma.$disconnect();
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.$disconnect();
    },
  };
}
