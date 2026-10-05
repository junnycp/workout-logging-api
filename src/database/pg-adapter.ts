import { PrismaPg } from '@prisma/adapter-pg';

/**
 * The only way this app creates a pg adapter. @prisma/adapter-pg sends JS Dates as timestamps without
 * an offset ("2026-10-01 10:00:00"), and Postgres reads those in the session time zone; a server or
 * database default other than UTC would shift every stored instant and query bound. Pinning the
 * session to UTC makes the adapter's UTC wall-clock values exact.
 */
export function createPgAdapter(connectionString: string): PrismaPg {
  return new PrismaPg({ connectionString, options: '-c TimeZone=UTC' });
}
