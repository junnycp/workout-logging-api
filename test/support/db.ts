import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';

/** Direct database access for assertions about what was (or was not) stored. */
export const createTestPrisma = (): PrismaClient =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL as string }),
  });

/** Each test uses its own user, so suites share the database without interfering. */
export const uniqueUserId = (): string => `u_${randomBytes(6).toString('hex')}`;
