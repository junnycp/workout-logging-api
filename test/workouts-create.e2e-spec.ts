import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaClient } from '../src/generated/prisma/client';
import { createTestApp } from './support/create-app';
import { createTestPrisma, uniqueUserId } from './support/db';
import { errorBodyOf } from './support/types';

interface CreatedSet {
  setNumber: number;
  reps: number;
  weight: number;
  unit: string;
  weightKg: number;
}
interface CreatedEntry {
  id: string;
  exercise: { id: string; name: string };
  performedAt: string;
  localDate: string;
  utcOffsetMinutes: number;
  sets: CreatedSet[];
}
interface CreatedBody {
  data: { entries: CreatedEntry[] };
  meta: { created: number };
}

/** ISO datetime (UTC) this many hours from the real clock: the POST rule compares with the server's now. */
const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

const bench = (overrides: Record<string, unknown> = {}) => ({
  exerciseName: 'Bench Press',
  date: '2026-10-01T18:30:00+07:00',
  sets: [{ reps: 5, weight: 100, unit: 'kg' }],
  ...overrides,
});

describe('POST /api/v1/users/:userId/workouts (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = createTestPrisma();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const post = (userId: string, body: unknown, idempotencyKey?: string) => {
    const req = request(app.getHttpServer()).post(`/api/v1/users/${userId}/workouts`);
    if (idempotencyKey !== undefined) req.set('Idempotency-Key', idempotencyKey);
    return req.send(body as object);
  };
  const storedEntries = (userId: string) => prisma.workoutEntry.count({ where: { userId } });

  describe('logging workouts', () => {
    it('stores several exercises in one request, keeping the original weight and the kg value', async () => {
      const userId = uniqueUserId();
      const res = await post(userId, {
        timezone: 'Asia/Ho_Chi_Minh',
        entries: [
          bench({
            sets: [
              { reps: 5, weight: 100, unit: 'kg' },
              { reps: 8, weight: 185, unit: 'lb' },
            ],
          }),
          { exerciseName: 'rdl', date: '2026-10-01', sets: [{ reps: 8, weight: 140, unit: 'kg' }] },
        ],
      }).expect(201);

      const body = res.body as CreatedBody;
      expect(body.meta).toEqual({ created: 2 });
      const [benchEntry, rdlEntry] = body.data.entries;
      expect(benchEntry).toMatchObject({
        exercise: { name: 'Bench Press' },
        performedAt: '2026-10-01T11:30:00.000Z',
        localDate: '2026-10-01',
        utcOffsetMinutes: 420,
        sets: [
          { setNumber: 1, reps: 5, weight: 100, unit: 'kg', weightKg: 100 },
          { setNumber: 2, reps: 8, weight: 185, unit: 'lb', weightKg: 83.91 },
        ],
      });
      // Aliases resolve to the canonical exercise; date-only means local midnight in the request timezone.
      expect(rdlEntry).toMatchObject({
        exercise: { name: 'Romanian Deadlift' },
        performedAt: '2026-09-30T17:00:00.000Z',
        localDate: '2026-10-01',
      });

      const sets = await prisma.workoutSet.findMany({
        where: { userId },
        orderBy: [{ performedAt: 'asc' }, { setNumber: 'asc' }],
        include: { entry: true },
      });
      expect(sets).toHaveLength(3);
      const lb = sets.find((s) => s.unit === 'lb');
      expect([
        lb?.weight.toString(),
        lb?.weightKg.toString(),
        lb?.volumeKg.toString(),
        lb?.e1rmKg.toString(),
      ]).toEqual(['185', '83.9146', '671.3167', '106.2918']);
      // The denormalized columns on each set must equal their entry's (carried from the M2 review).
      for (const set of sets) {
        expect([set.userId, set.exerciseId, set.performedAt.toISOString()]).toEqual([
          set.entry.userId,
          set.entry.exerciseId,
          set.entry.performedAt.toISOString(),
        ]);
      }
    });

    it('rounds the response kg from the exact conversion, not from the 4-decimal stored value', async () => {
      // 32 lb = 14.51495584 kg: stored as 14.5150, but rounding that again would answer 14.52.
      const userId = uniqueUserId();
      const res = await post(userId, {
        entries: [bench({ sets: [{ reps: 1, weight: 32, unit: 'lb' }] })],
      }).expect(201);

      expect((res.body as CreatedBody).data.entries[0]?.sets[0]?.weightKg).toBe(14.51);
      const stored = await prisma.workoutSet.findFirstOrThrow({ where: { userId } });
      expect(stored.weightKg.toString()).toBe('14.515');
    });

    it('accepts a workout up to 24 hours ahead of the server clock (time zones, device skew)', async () => {
      await post(uniqueUserId(), { entries: [bench({ date: hoursFromNow(23) })] }).expect(201);
      const res = await post(uniqueUserId(), { entries: [bench({ date: hoursFromNow(25) })] });
      expect(res.status).toBe(400);
      expect(errorBodyOf(res).error.details[0]).toMatchObject({
        path: 'entries[0].date',
        code: 'DATE_IN_FUTURE',
      });
    });

    it('accepts bodyweight sets (weight 0)', async () => {
      await post(uniqueUserId(), {
        entries: [bench({ exerciseName: 'Pull-Up', sets: [{ reps: 10, weight: 0, unit: 'kg' }] })],
      }).expect(201);
    });

    it('accepts the maximum payload: 100 entries of 50 sets', async () => {
      const userId = uniqueUserId();
      const sets = Array.from({ length: 50 }, (_, i) => ({ reps: 5, weight: 60 + i, unit: 'kg' }));
      const entries = Array.from({ length: 100 }, () => bench({ sets }));
      await post(userId, { entries }).expect(201);
      expect(await prisma.workoutSet.count({ where: { userId } })).toBe(5000);
    });
  });

  describe('validation (nothing is stored on any error)', () => {
    const cases: [string, unknown, { path: string; code: string }][] = [
      [
        'unsupported unit',
        { entries: [bench({ sets: [{ reps: 5, weight: 10, unit: 'stone' }] })] },
        { path: 'entries[0].sets[0].unit', code: 'UNSUPPORTED_UNIT' },
      ],
      [
        'null date',
        { entries: [bench({ date: null })] },
        { path: 'entries[0].date', code: 'IS_DEFINED' },
      ],
      [
        'missing date',
        {
          entries: [{ exerciseName: 'Bench Press', sets: [{ reps: 5, weight: 100, unit: 'kg' }] }],
        },
        { path: 'entries[0].date', code: 'IS_DEFINED' },
      ],
      [
        'negative weight',
        { entries: [bench({ sets: [{ reps: 5, weight: -1, unit: 'kg' }] })] },
        { path: 'entries[0].sets[0].weight', code: 'MIN' },
      ],
      [
        'negative reps',
        { entries: [bench({ sets: [{ reps: -3, weight: 100, unit: 'kg' }] })] },
        { path: 'entries[0].sets[0].reps', code: 'MIN' },
      ],
      [
        'zero reps',
        { entries: [bench({ sets: [{ reps: 0, weight: 100, unit: 'kg' }] })] },
        { path: 'entries[0].sets[0].reps', code: 'MIN' },
      ],
      [
        'fractional reps',
        { entries: [bench({ sets: [{ reps: 2.5, weight: 100, unit: 'kg' }] })] },
        { path: 'entries[0].sets[0].reps', code: 'IS_INT' },
      ],
      [
        'weight with 4 decimals',
        { entries: [bench({ sets: [{ reps: 5, weight: 100.1234, unit: 'kg' }] })] },
        { path: 'entries[0].sets[0].weight', code: 'MAX_DECIMAL_PLACES' },
      ],
      // Review finding: exponent-form numbers made class-validator's maxDecimalPlaces throw (500).
      [
        'tiny weight in exponent form',
        { entries: [bench({ sets: [{ reps: 5, weight: 1e-7, unit: 'kg' }] })] },
        { path: 'entries[0].sets[0].weight', code: 'MAX_DECIMAL_PLACES' },
      ],
      [
        'tiny negative weight',
        { entries: [bench({ sets: [{ reps: 5, weight: -1e-7, unit: 'kg' }] })] },
        { path: 'entries[0].sets[0].weight', code: 'MIN' },
      ],
      [
        'weight 1.0005',
        { entries: [bench({ sets: [{ reps: 5, weight: 1.0005, unit: 'kg' }] })] },
        { path: 'entries[0].sets[0].weight', code: 'MAX_DECIMAL_PLACES' },
      ],
      [
        'weight as a string',
        { entries: [bench({ sets: [{ reps: 5, weight: '100', unit: 'kg' }] })] },
        { path: 'entries[0].sets[0].weight', code: 'IS_NUMBER' },
      ],
      [
        'weight above 2000',
        { entries: [bench({ sets: [{ reps: 1, weight: 2000.5, unit: 'kg' }] })] },
        { path: 'entries[0].sets[0].weight', code: 'MAX' },
      ],
      [
        'empty sets array',
        { entries: [bench({ sets: [] })] },
        { path: 'entries[0].sets', code: 'ARRAY_MIN_SIZE' },
      ],
      [
        'more than 50 sets',
        {
          entries: [
            bench({ sets: Array.from({ length: 51 }, () => ({ reps: 1, weight: 1, unit: 'kg' })) }),
          ],
        },
        { path: 'entries[0].sets', code: 'ARRAY_MAX_SIZE' },
      ],
      ['no entries', { entries: [] }, { path: 'entries', code: 'ARRAY_MIN_SIZE' }],
      [
        'more than 100 entries',
        { entries: Array.from({ length: 101 }, () => bench()) },
        { path: 'entries', code: 'ARRAY_MAX_SIZE' },
      ],
      ['entries not an array', { entries: 'bench' }, { path: 'entries', code: 'IS_ARRAY' }],
      [
        'blank exercise name',
        { entries: [bench({ exerciseName: '   ' })] },
        { path: 'entries[0].exerciseName', code: 'BLANK' },
      ],
      [
        'unknown field',
        { entries: [bench()], coach: 'x' },
        { path: 'coach', code: 'UNKNOWN_FIELD' },
      ],
      [
        'datetime without offset',
        { entries: [bench({ date: '2026-10-01T18:30:00' })] },
        { path: 'entries[0].date', code: 'MISSING_OFFSET' },
      ],
      [
        'date-only without timezone',
        { entries: [bench({ date: '2026-10-01' })] },
        { path: 'entries[0].date', code: 'MISSING_TIMEZONE' },
      ],
      [
        'impossible date',
        { entries: [bench({ date: '2026-02-30T10:00:00Z' })] },
        { path: 'entries[0].date', code: 'INVALID_DATE' },
      ],
      [
        'a typo in the year that puts the workout in the future',
        { entries: [bench({ date: '2099-10-01T18:30:00+07:00' })] },
        { path: 'entries[0].date', code: 'DATE_IN_FUTURE' },
      ],
      [
        'a date-only value more than 24 hours ahead',
        { timezone: 'UTC', entries: [bench({ date: hoursFromNow(48).slice(0, 10) })] },
        { path: 'entries[0].date', code: 'DATE_IN_FUTURE' },
      ],
      [
        'unknown timezone',
        { timezone: 'Mars/Base', entries: [bench()] },
        { path: 'timezone', code: 'INVALID_TIMEZONE' },
      ],
      [
        'unknown exercise',
        { entries: [bench({ exerciseName: 'Underwater Basket Weaving' })] },
        { path: 'entries[0].exerciseName', code: 'UNKNOWN_EXERCISE' },
      ],
    ];

    it.each(cases)('rejects %s', async (_case, body, expected) => {
      const userId = uniqueUserId();
      const res = await post(userId, body).expect(400);
      const { error } = errorBodyOf(res);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details).toEqual(expect.arrayContaining([expect.objectContaining(expected)]));
      expect(await storedEntries(userId)).toBe(0);
    });

    it('explains unsupported units and lists the supported ones', async () => {
      const res = await post(uniqueUserId(), {
        entries: [bench({ sets: [{ reps: 5, weight: 10, unit: 'stone' }] })],
      }).expect(400);
      expect(errorBodyOf(res).error.details).toContainEqual(
        expect.objectContaining({ message: "Unit 'stone' is not supported. Supported: kg, lb" }),
      );
    });

    it('suggests close catalog names for an unknown exercise', async () => {
      const res = await post(uniqueUserId(), {
        entries: [bench({ exerciseName: 'bench pres' })],
      }).expect(400);
      expect(errorBodyOf(res).error.details).toContainEqual(
        expect.objectContaining({
          path: 'entries[0].exerciseName',
          code: 'UNKNOWN_EXERCISE',
          suggestions: expect.arrayContaining(['Bench Press']) as unknown,
        }),
      );
    });

    it('reports problems in several entries at once and stores none of the valid ones', async () => {
      const userId = uniqueUserId();
      const res = await post(userId, {
        entries: [
          bench(),
          bench({ exerciseName: 'Telekinesis' }),
          bench({ date: '2026-10-01T18:30:00' }),
        ],
      }).expect(400);
      expect(errorBodyOf(res).error.details.map((d) => [d.path, d.code])).toEqual([
        ['entries[1].exerciseName', 'UNKNOWN_EXERCISE'],
        ['entries[2].date', 'MISSING_OFFSET'],
      ]);
      expect(await storedEntries(userId)).toBe(0);
    });

    it('rejects a malformed userId in the path', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/users/not%20valid!/workouts')
        .send({ entries: [bench()] })
        .expect(400);
      expect(errorBodyOf(res).error.details).toContainEqual(
        expect.objectContaining({ path: 'userId' }),
      );
    });
  });

  describe('Idempotency-Key', () => {
    it('replays the stored response for a retry with the same key and body', async () => {
      const userId = uniqueUserId();
      const body = { entries: [bench()] };
      const first = await post(userId, body, 'retry-1').expect(201);
      const second = await post(userId, body, 'retry-1').expect(200);

      expect(second.headers['idempotent-replayed']).toBe('true');
      expect(second.body).toEqual(first.body);
      expect(await storedEntries(userId)).toBe(1);
    });

    it('treats a body with the same content in another key order as the same request', async () => {
      const userId = uniqueUserId();
      await post(userId, { entries: [bench()] }, 'order-1').expect(201);
      await post(
        userId,
        {
          entries: [
            {
              sets: [{ unit: 'kg', weight: 100, reps: 5 }],
              date: '2026-10-01T18:30:00+07:00',
              exerciseName: 'Bench Press',
            },
          ],
        },
        'order-1',
      ).expect(200);
    });

    it('rejects the same key with a different body (409)', async () => {
      const userId = uniqueUserId();
      await post(userId, { entries: [bench()] }, 'reused').expect(201);
      const res = await post(
        userId,
        { entries: [bench({ sets: [{ reps: 6, weight: 100, unit: 'kg' }] })] },
        'reused',
      ).expect(409);
      expect(errorBodyOf(res).error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(await storedEntries(userId)).toBe(1);
    });

    it('scopes keys per user', async () => {
      const body = { entries: [bench()] };
      await post(uniqueUserId(), body, 'shared-key').expect(201);
      await post(uniqueUserId(), body, 'shared-key').expect(201);
    });

    it('does not store failed requests, so a corrected retry with the same key succeeds', async () => {
      const userId = uniqueUserId();
      await post(userId, { entries: [bench({ exerciseName: 'Telekinesis' })] }, 'fix-me').expect(
        400,
      );
      await post(userId, { entries: [bench()] }, 'fix-me').expect(201);
    });

    it('rejects a malformed key', async () => {
      const res = await post(uniqueUserId(), { entries: [bench()] }, 'has spaces in it').expect(
        400,
      );
      expect(errorBodyOf(res).error.details).toContainEqual(
        expect.objectContaining({ path: 'Idempotency-Key' }),
      );
    });
  });
});
