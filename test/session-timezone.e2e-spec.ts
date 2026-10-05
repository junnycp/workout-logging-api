import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ConfigService } from '@nestjs/config';
import request from 'supertest';
import type { Env } from '../src/config/env.schema';
import { PrismaService } from '../src/database/prisma.service';
import { syncExerciseCatalog } from '../src/exercises/catalog/catalog-sync';
import { loadExerciseCatalog } from '../src/exercises/catalog/load-catalog';
import { createTestApp } from './support/create-app';
import { createIsolatedDatabase, IsolatedDatabase } from './support/isolated-database';

/**
 * The pg adapter sends JS Dates as timestamps without an offset, which Postgres reads in the session
 * time zone. A server or database whose default zone is not UTC must not shift stored instants.
 */
describe('Database session time zone (e2e)', () => {
  let db: IsolatedDatabase;
  let app: NestExpressApplication;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    await syncExerciseCatalog(db.prisma, loadExerciseCatalog());
    const name = new URL(db.url).pathname.slice(1);
    await db.prisma.$executeRawUnsafe(`ALTER DATABASE "${name}" SET timezone = 'Asia/Ho_Chi_Minh'`);
    const config = { get: () => db.url } as unknown as ConfigService<Env, true>;
    app = await createTestApp((builder) =>
      builder.overrideProvider(PrismaService).useValue(new PrismaService(config)),
    );
  });

  afterAll(async () => {
    await app.close();
    await db.drop();
  });

  it('stores and filters the exact instant when the database default zone is not UTC', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/users/tz-user/workouts')
      .send({
        entries: [
          {
            exerciseName: 'Bench Press',
            date: '2026-10-01T10:00:00Z',
            sets: [{ reps: 5, weight: 100, unit: 'kg' }],
          },
        ],
      })
      .expect(201);

    const [stored] = await db.prisma.$queryRaw<{ utc: string }[]>`
      SELECT to_char(performed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') AS utc
      FROM workout_entries WHERE user_id = 'tz-user'`;
    expect(stored?.utc).toBe('2026-10-01T10:00:00');

    const res = await request(app.getHttpServer())
      .get('/api/v1/users/tz-user/workouts')
      .query({ from: '2026-10-01T10:00:00Z', to: '2026-10-01T10:00:00Z' })
      .expect(200);
    expect((res.body as { data: { performedAt: string }[] }).data).toEqual([
      expect.objectContaining({ performedAt: '2026-10-01T10:00:00.000Z' }),
    ]);
  });
});
