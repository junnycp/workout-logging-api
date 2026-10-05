import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './support/create-app';
import { uniqueUserId } from './support/db';
import { errorBodyOf } from './support/types';

interface HistorySet {
  setNumber: number;
  reps: number;
  weight: number;
  unit: string;
}
interface HistoryEntry {
  id: string;
  performedAt: string;
  localDate: string;
  utcOffsetMinutes: number;
  exercise: { id: string; name: string; muscleGroups: { code: string; role: string }[] };
  sets: HistorySet[];
}
interface HistoryBody {
  data: HistoryEntry[];
  meta: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
    unit: string | null;
    timezone: string;
    message?: string;
  };
}

const EMPTY_MESSAGE = 'No workouts found for the given filters.';

type EntryInput = { exerciseName: string; date: string; sets: object[] };
const entry = (exerciseName: string, date: string, weight = 100, unit = 'kg'): EntryInput => ({
  exerciseName,
  date,
  sets: [{ reps: 5, weight, unit }],
});

describe('GET /api/v1/users/:userId/workouts (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const log = async (userId: string, entries: EntryInput[]) => {
    await request(app.getHttpServer())
      .post(`/api/v1/users/${userId}/workouts`)
      .send({ entries })
      .expect(201);
  };
  const history = (userId: string, query: Record<string, string | number> = {}) =>
    request(app.getHttpServer()).get(`/api/v1/users/${userId}/workouts`).query(query);
  const historyBody = async (userId: string, query: Record<string, string | number> = {}) =>
    (await history(userId, query).expect(200)).body as HistoryBody;

  /** Follows nextCursor until the end and returns every entry id in the order served. */
  const walkPages = async (userId: string, query: Record<string, string | number>) => {
    const ids: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const body: HistoryBody = await historyBody(userId, cursor ? { ...query, cursor } : query);
      ids.push(...body.data.map((e) => e.id));
      expect(body.meta.hasMore).toBe(body.meta.nextCursor !== null);
      cursor = body.meta.nextCursor;
      pages += 1;
    } while (cursor !== null && pages < 50);
    return { ids, pages };
  };

  describe('listing', () => {
    it('returns entries newest first with their sets, muscle groups and the logged local date', async () => {
      const userId = uniqueUserId();
      await log(userId, [
        {
          exerciseName: 'bench press',
          date: '2026-10-01T23:30:00+07:00',
          sets: [
            { reps: 5, weight: 100, unit: 'kg' },
            { reps: 8, weight: 185, unit: 'lb' },
          ],
        },
        entry('RDL', '2026-09-30T08:00:00Z'),
      ]);

      const body = await historyBody(userId);
      expect(body.meta).toEqual({
        limit: 20,
        hasMore: false,
        nextCursor: null,
        unit: null,
        timezone: 'UTC',
      });
      expect(body.data.map((e) => e.exercise.name)).toEqual(['Bench Press', 'Romanian Deadlift']);
      expect(body.data[0]).toMatchObject({
        performedAt: '2026-10-01T16:30:00.000Z',
        localDate: '2026-10-01',
        utcOffsetMinutes: 420,
        exercise: {
          muscleGroups: [
            { code: 'chest', role: 'primary' },
            { code: 'front_delts', role: 'secondary' },
            { code: 'triceps', role: 'secondary' },
          ],
        },
        // Without `unit`, each set is returned as it was logged.
        sets: [
          { setNumber: 1, reps: 5, weight: 100, unit: 'kg' },
          { setNumber: 2, reps: 8, weight: 185, unit: 'lb' },
        ],
      });
    });

    it('never returns another user’s entries', async () => {
      const userId = uniqueUserId();
      await log(uniqueUserId(), [entry('Bench Press', '2026-10-01T10:00:00Z')]);
      const body = await historyBody(userId);
      expect(body.data).toEqual([]);
      expect(body.meta.message).toBe(EMPTY_MESSAGE);
    });
  });

  describe('unit output', () => {
    it('converts every set from its original value and rounds once', async () => {
      const userId = uniqueUserId();
      await log(userId, [
        {
          exerciseName: 'Bench Press',
          date: '2026-10-01T10:00:00Z',
          sets: [
            { reps: 5, weight: 100, unit: 'kg' },
            { reps: 5, weight: 32, unit: 'lb' },
          ],
        },
      ]);

      const inLb = await historyBody(userId, { unit: 'lb' });
      expect(inLb.meta.unit).toBe('lb');
      expect(inLb.data[0]?.sets.map((s) => [s.weight, s.unit])).toEqual([
        [220.46, 'lb'],
        [32, 'lb'],
      ]);

      // 32 lb = 14.51495584 kg: 14.51 as POST answers, not 14.52 from the stored 14.5150 (C16).
      const inKg = await historyBody(userId, { unit: 'kg' });
      expect(inKg.data[0]?.sets.map((s) => [s.weight, s.unit])).toEqual([
        [100, 'kg'],
        [14.51, 'kg'],
      ]);
    });
  });

  describe('cursor pagination', () => {
    it('serves every entry exactly once across pages, even when many share one instant', async () => {
      const userId = uniqueUserId();
      const sameInstant = Array.from({ length: 25 }, () =>
        entry('Bench Press', '2026-10-01T10:00:00Z'),
      );
      const others = [1, 2, 3, 4, 5].map((day) => entry('Deadlift', `2026-09-0${day}T10:00:00Z`));
      await log(userId, [...sameInstant, ...others]);

      const { ids, pages } = await walkPages(userId, { limit: 10 });
      expect(pages).toBe(3);
      expect(ids).toHaveLength(30);
      expect(new Set(ids).size).toBe(30);

      const all = await historyBody(userId, { limit: 100 });
      expect(ids).toEqual(all.data.map((e) => e.id));
    });

    it('serves every matching entry exactly once when filtering by several exercises', async () => {
      const userId = uniqueUserId();
      await log(userId, [
        ...Array.from({ length: 12 }, () => entry('Bench Press', '2026-10-01T10:00:00Z')),
        ...Array.from({ length: 12 }, () => entry('Incline Bench Press', '2026-10-01T10:00:00Z')),
        ...Array.from({ length: 6 }, () => entry('Back Squat', '2026-10-01T10:00:00Z')),
        entry('Incline Bench Press', '2026-09-01T10:00:00Z'),
      ]);

      const { ids } = await walkPages(userId, { muscleGroup: 'chest', limit: 5 });
      expect(ids).toHaveLength(25);
      expect(new Set(ids).size).toBe(25);
      const all = await historyBody(userId, { muscleGroup: 'chest', limit: 100 });
      expect(ids).toEqual(all.data.map((e) => e.id));
      expect(all.data.every((e) => e.exercise.name !== 'Back Squat')).toBe(true);
    });

    it('rejects a cursor it did not issue', async () => {
      const res = await history(uniqueUserId(), { cursor: 'not-a-cursor' }).expect(400);
      expect(errorBodyOf(res).error.code).toBe('INVALID_CURSOR');
    });
  });

  describe('filters', () => {
    let userId: string;

    beforeAll(async () => {
      userId = uniqueUserId();
      await log(userId, [
        entry('Bench Press', '2026-10-01T10:00:00Z'),
        entry('Incline Bench Press', '2026-10-02T10:00:00Z'),
        entry('Romanian Deadlift', '2026-10-03T10:00:00Z'),
        entry('Back Squat', '2026-10-04T10:00:00Z'),
      ]);
    });

    const names = async (query: Record<string, string | number>) =>
      (await historyBody(userId, query)).data.map((e) => e.exercise.name);

    it('matches part of a name, case-insensitively', async () => {
      expect(await names({ exercise: '  BENCH ' })).toEqual(['Incline Bench Press', 'Bench Press']);
    });

    it('matches aliases', async () => {
      expect(await names({ exercise: 'rdl' })).toEqual(['Romanian Deadlift']);
    });

    it.each(['%', '_', 'zzz'])(
      'returns an empty page with a message when %j matches no exercise literally',
      async (term) => {
        const body = await historyBody(userId, { exercise: term });
        expect(body.data).toEqual([]);
        expect(body.meta).toMatchObject({
          hasMore: false,
          nextCursor: null,
          message: EMPTY_MESSAGE,
        });
      },
    );

    it('filters by muscle group, including secondary muscles', async () => {
      expect(await names({ muscleGroup: 'hamstrings' })).toEqual([
        'Back Squat',
        'Romanian Deadlift',
      ]);
      expect(await names({ muscleGroup: 'triceps' })).toEqual([
        'Incline Bench Press',
        'Bench Press',
      ]);
    });

    it('combines the name and muscle-group filters', async () => {
      expect(await names({ exercise: 'squat', muscleGroup: 'quads' })).toEqual(['Back Squat']);
      expect(await names({ exercise: 'bench', muscleGroup: 'quads' })).toEqual([]);
    });

    it('rejects an unknown muscle group and lists the valid ones', async () => {
      const res = await history(userId, { muscleGroup: 'wings' }).expect(400);
      const { error } = errorBodyOf(res);
      expect(error.code).toBe('UNKNOWN_MUSCLE_GROUP');
      expect(error.message).toContain('chest');
    });
  });

  describe('date range', () => {
    let userId: string;

    beforeAll(async () => {
      userId = uniqueUserId();
      // 06:30 on Oct 2 in Hanoi is 23:30 on Oct 1 in UTC.
      await log(userId, [entry('Bench Press', '2026-10-02T06:30:00+07:00')]);
    });

    it('reads date-only bounds as whole days in the requested time zone', async () => {
      const hanoi = await historyBody(userId, {
        from: '2026-10-02',
        to: '2026-10-02',
        tz: 'Asia/Ho_Chi_Minh',
      });
      expect(hanoi.data).toHaveLength(1);
      expect(hanoi.meta.timezone).toBe('Asia/Ho_Chi_Minh');
      // localDate stays the date the workout was logged at (decision M5-C).
      expect(hanoi.data[0]?.localDate).toBe('2026-10-02');

      const utc = await historyBody(userId, { from: '2026-10-02', to: '2026-10-02' });
      expect(utc.data).toEqual([]);
      expect(utc.meta.message).toBe(EMPTY_MESSAGE);
      expect((await historyBody(userId, { to: '2026-10-01' })).data).toHaveLength(1);
    });

    it('treats a datetime bound as inclusive', async () => {
      expect((await historyBody(userId, { to: '2026-10-01T23:30:00Z' })).data).toHaveLength(1);
      expect((await historyBody(userId, { from: '2026-10-01T23:30:00.001Z' })).data).toEqual([]);
    });

    it('rejects a range that ends before it starts', async () => {
      const res = await history(userId, { from: '2026-10-05', to: '2026-10-01' }).expect(400);
      expect(errorBodyOf(res).error.code).toBe('INVALID_DATE_RANGE');
    });
  });

  describe('validation', () => {
    const cases: [string, Record<string, string | number>, { path: string; code: string }][] = [
      [
        'a datetime without offset',
        { from: '2026-10-01T10:00:00' },
        { path: 'from', code: 'MISSING_OFFSET' },
      ],
      ['a malformed date', { to: '2026-13-01' }, { path: 'to', code: 'INVALID_DATE' }],
      ['an unknown time zone', { tz: 'Mars/Olympus' }, { path: 'tz', code: 'INVALID_TIMEZONE' }],
      ['an unsupported unit', { unit: 'stone' }, { path: 'unit', code: 'UNSUPPORTED_UNIT' }],
      ['limit 0', { limit: 0 }, { path: 'limit', code: 'MIN' }],
      ['limit 101', { limit: 101 }, { path: 'limit', code: 'MAX' }],
      ['a non-numeric limit', { limit: 'abc' }, { path: 'limit', code: 'IS_INT' }],
      ['a blank exercise', { exercise: '   ' }, { path: 'exercise', code: 'BLANK' }],
      [
        'an unknown parameter',
        { exerciseName: 'bench' },
        { path: 'exerciseName', code: 'UNKNOWN_FIELD' },
      ],
    ];

    it.each(cases)('rejects %s', async (_case, query, expected) => {
      const res = await history(uniqueUserId(), query).expect(400);
      const { error } = errorBodyOf(res);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details).toEqual(expect.arrayContaining([expect.objectContaining(expected)]));
    });

    it('rejects a malformed userId in the path', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users/bad%20id/workouts')
        .expect(400);
      expect(errorBodyOf(res).error.details[0]).toMatchObject({ path: 'userId' });
    });
  });
});
