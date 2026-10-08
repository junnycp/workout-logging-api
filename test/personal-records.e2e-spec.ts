import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { CLOCK } from '../src/common/time/clock';
import { createTestApp } from './support/create-app';
import { uniqueUserId } from './support/db';
import { errorBodyOf } from './support/types';

interface RecordBody {
  value: number;
  set: { reps: number; weight: number };
  achievedAt: string;
  localDate: string;
  entryId: string;
  setNumber: number;
}
type Records = Record<'maxWeight' | 'maxVolume' | 'bestEstimated1RM', RecordBody | null>;
interface RecordsBody {
  data: Records & {
    exercise: { id: string; name: string };
    unit: string;
    range: { from: string | null; to: string | null; timezone: string };
  };
  meta: { message?: string };
}
type Delta = { absolute: number; percent: number; improved: boolean } | null;
interface CompareBody {
  data: {
    exercise: { name: string };
    unit: string;
    timezone: string;
    current: Records & { from: string; to: string };
    previous: Records & { from: string; to: string };
    delta: Record<'maxWeight' | 'maxVolume' | 'bestEstimated1RM', Delta>;
  };
  meta: { message?: string };
}

type SetInput = [reps: number, weight: number, unit?: string];
const entry = (date: string, sets: SetInput[], exerciseName = 'Bench Press') => ({
  exerciseName,
  date,
  sets: sets.map(([reps, weight, unit = 'kg']) => ({ reps, weight, unit })),
});

const NO_SETS = 'No weighted sets found for this exercise in the given range.';
const ONLY_BODYWEIGHT =
  'Only bodyweight sets were logged in the given range; weighted records need a weight above 0.';
/** Thursday 15 October 2026, 12:00 in Hanoi. */
const NOW = new Date('2026-10-15T05:00:00Z');

describe('Personal records (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(CLOCK).useValue({ now: () => NOW }),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  const log = async (userId: string, entries: object[]) => {
    await request(app.getHttpServer())
      .post(`/api/v1/users/${userId}/workouts`)
      .send({ entries })
      .expect(201);
  };
  const records = (userId: string, query: Record<string, string>) =>
    request(app.getHttpServer()).get(`/api/v1/users/${userId}/personal-records`).query(query);
  const recordsBody = async (userId: string, query: Record<string, string>) =>
    (await records(userId, query).expect(200)).body as RecordsBody;
  const compare = (userId: string, query: Record<string, string>) =>
    request(app.getHttpServer())
      .get(`/api/v1/users/${userId}/personal-records/compare`)
      .query(query);
  const compareBody = async (userId: string, query: Record<string, string>) =>
    (await compare(userId, query).expect(200)).body as CompareBody;
  const winner = (record: RecordBody | null) =>
    record && [record.value, record.set.reps, record.set.weight, record.localDate];

  describe('GET /personal-records', () => {
    let userId: string;

    beforeAll(async () => {
      userId = uniqueUserId();
      await log(userId, [
        entry('2026-09-01T23:30:00+07:00', [[1, 100]]),
        entry('2026-09-05T10:00:00Z', [
          [10, 80],
          [2, 96],
        ]),
      ]);
      // Another user's heavier set must not leak in.
      await log(uniqueUserId(), [entry('2026-09-02T10:00:00Z', [[1, 200]])]);
    });

    it('returns each record with the set and the date it was achieved', async () => {
      const body = await recordsBody(userId, { exercise: 'Bench Press' });
      expect(body.data.exercise.name).toBe('Bench Press');
      expect(body.data.unit).toBe('kg');
      expect(body.data.range).toEqual({ from: null, to: null, timezone: 'UTC' });
      expect(body.meta).toEqual({});
      expect(body.data.maxWeight).toMatchObject({
        value: 100,
        set: { reps: 1, weight: 100 },
        achievedAt: '2026-09-01T16:30:00.000Z',
        localDate: '2026-09-01', // at the offset it was logged with
        setNumber: 1,
      });
      expect(winner(body.data.maxVolume)).toEqual([800, 10, 80, '2026-09-05']);
      // Epley: 80 × 10 → 106.67 beats 100 × 1 → 103.33, and 100 × 1 beats 96 × 2 → 102.40 (D3a).
      expect(winner(body.data.bestEstimated1RM)).toEqual([106.67, 10, 80, '2026-09-05']);
    });

    it('accepts aliases and any case, and converts to the requested unit', async () => {
      const body = await recordsBody(userId, { exercise: 'BB BENCH', unit: 'lb' });
      expect(body.data.unit).toBe('lb');
      expect(winner(body.data.maxWeight)).toEqual([220.46, 1, 220.46, '2026-09-01']);
      expect(body.data.maxVolume?.value).toBe(1763.7);
    });

    it('limits records to a date range in the requested time zone', async () => {
      const body = await recordsBody(userId, {
        exercise: 'Bench Press',
        from: '2026-09-02',
        tz: 'Asia/Ho_Chi_Minh',
      });
      expect(body.data.range).toEqual({
        from: '2026-09-01T17:00:00.000Z',
        to: null,
        timezone: 'Asia/Ho_Chi_Minh',
      });
      expect(winner(body.data.maxWeight)).toEqual([96, 2, 96, '2026-09-05']);
      // The 100 kg single (23:30 on 1 September in Hanoi = 16:30 UTC) is inside a range starting 1 September UTC.
      const utc = await recordsBody(userId, { exercise: 'Bench Press', from: '2026-09-01' });
      expect(utc.data.maxWeight?.value).toBe(100);
    });

    it('returns null records with a message when the range has no sets', async () => {
      const body = await recordsBody(userId, { exercise: 'Bench Press', from: '2026-10-01' });
      expect([body.data.maxWeight, body.data.maxVolume, body.data.bestEstimated1RM]).toEqual([
        null,
        null,
        null,
      ]);
      expect(body.meta.message).toBe(NO_SETS);
    });

    it('rejects an unknown exercise with suggestions', async () => {
      const res = await records(userId, { exercise: 'Bench Prss' }).expect(400);
      const { error } = errorBodyOf(res);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details[0]).toMatchObject({
        path: 'exercise',
        code: 'UNKNOWN_EXERCISE',
        suggestions: expect.arrayContaining(['Bench Press']) as unknown,
      });
    });

    it('requires the exercise', async () => {
      const res = await records(userId, {}).expect(400);
      expect(errorBodyOf(res).error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'exercise' })]),
      );
    });

    it('rejects an inverted range', async () => {
      const res = await records(userId, {
        exercise: 'Bench Press',
        from: '2026-09-10',
        to: '2026-09-01',
      }).expect(400);
      expect(errorBodyOf(res).error.code).toBe('INVALID_DATE_RANGE');
    });
  });

  describe('ranking and tie-breaking (decision D4)', () => {
    it('ranks mixed units by their kg value', async () => {
      const userId = uniqueUserId();
      await log(userId, [
        entry('2026-09-01T10:00:00Z', [
          [1, 100],
          [1, 225, 'lb'],
        ]),
      ]);
      const body = await recordsBody(userId, { exercise: 'Bench Press' });
      expect(body.data.maxWeight).toMatchObject({ value: 102.06, setNumber: 2 });
      const inLb = await recordsBody(userId, { exercise: 'Bench Press', unit: 'lb' });
      expect(inLb.data.maxWeight?.set).toEqual({ reps: 1, weight: 225 }); // as logged, not re-rounded
    });

    it('ranks by the exact value, not by the 4-decimal stored kg', async () => {
      // 20.051 lb = 9.09498061… kg and 9.095 kg are both stored as 9.0950; the heavier one must win
      // although the lighter one has more reps.
      const userId = uniqueUserId();
      await log(userId, [
        entry('2026-09-01T10:00:00Z', [
          [10, 20.051, 'lb'],
          [5, 9.095],
        ]),
      ]);
      const body = await recordsBody(userId, { exercise: 'Bench Press' });
      expect(body.data.maxWeight).toMatchObject({ value: 9.1, setNumber: 2 });
    });

    it('still finds the exact winner when more than 50 sets tie on the stored value', async () => {
      // 50 × (20.051 lb × 10) rank before 9.095 kg × 5 in the database (same stored kg, more reps).
      const userId = uniqueUserId();
      const lighter: SetInput[] = Array.from({ length: 50 }, () => [10, 20.051, 'lb']);
      await log(userId, [
        entry('2026-09-01T10:00:00Z', lighter),
        entry('2026-09-02T10:00:00Z', [[5, 9.095]]),
      ]);
      const body = await recordsBody(userId, { exercise: 'Bench Press' });
      expect(winner(body.data.maxWeight)).toEqual([9.1, 5, 9.095, '2026-09-02']); // value rounded, set as logged
    });

    it('prefers more reps when the value ties', async () => {
      const userId = uniqueUserId();
      await log(userId, [
        entry('2026-09-01T10:00:00Z', [[3, 100]]),
        entry('2026-09-08T10:00:00Z', [[5, 100]]),
      ]);
      const body = await recordsBody(userId, { exercise: 'Bench Press' });
      expect(winner(body.data.maxWeight)).toEqual([100, 5, 100, '2026-09-08']);
    });

    it('prefers the earliest date when value and reps tie', async () => {
      const userId = uniqueUserId();
      await log(userId, [
        entry('2026-09-08T10:00:00Z', [[5, 100]]),
        entry('2026-09-01T10:00:00Z', [[5, 100]]),
      ]);
      const body = await recordsBody(userId, { exercise: 'Bench Press' });
      expect(body.data.maxWeight?.localDate).toBe('2026-09-01');
      expect(body.data.maxVolume?.localDate).toBe('2026-09-01');
    });

    it('prefers the first set logged when everything else ties', async () => {
      const userId = uniqueUserId();
      await log(userId, [
        entry('2026-09-01T10:00:00Z', [
          [5, 100],
          [5, 100],
        ]),
      ]);
      const body = await recordsBody(userId, { exercise: 'Bench Press' });
      expect(body.data.maxWeight?.setNumber).toBe(1);
    });
  });

  describe('bodyweight sets', () => {
    it('never count as records; only bodyweight sets give null records and a message', async () => {
      const userId = uniqueUserId();
      await log(userId, [entry('2026-09-01T10:00:00Z', [[10, 0]], 'Pull-Up')]);
      const body = await recordsBody(userId, { exercise: 'Pull-Up' });
      expect(body.data.maxWeight).toBeNull();
      expect(body.data.maxVolume).toBeNull();
      expect(body.data.bestEstimated1RM).toBeNull();
      expect(body.meta.message).toBe(ONLY_BODYWEIGHT);
    });

    it('are ignored next to weighted sets', async () => {
      const userId = uniqueUserId();
      await log(userId, [
        entry(
          '2026-09-01T10:00:00Z',
          [
            [20, 0],
            [5, 10],
          ],
          'Pull-Up',
        ),
      ]);
      const body = await recordsBody(userId, { exercise: 'Pull-Up' });
      expect(winner(body.data.maxVolume)).toEqual([50, 5, 10, '2026-09-01']);
      expect(body.meta).toEqual({});
    });
  });

  describe('GET /personal-records/compare', () => {
    let userId: string;

    beforeAll(async () => {
      userId = uniqueUserId();
      await log(userId, [
        entry('2026-09-10T10:00:00Z', [[5, 95]]), // September
        entry('2026-09-30T18:00:00Z', [[1, 101]]), // 01:00 on 1 October in Hanoi, still 30 September in UTC
        entry('2026-10-05T10:00:00Z', [[3, 100]]), // October
        entry('2026-10-15T15:00:00Z', [[1, 120]]), // 10 h after "now" (allowed): not in this month to date
      ]);
    });

    it('compares this month to date with last month, in the requested time zone', async () => {
      const body = await compareBody(userId, {
        exercise: 'Bench Press',
        period: 'month',
        tz: 'Asia/Ho_Chi_Minh',
      });
      const { current, previous, delta } = body.data;
      expect([current.from, current.to]).toEqual([
        '2026-09-30T17:00:00.000Z',
        '2026-10-15T05:00:00.000Z',
      ]);
      expect([previous.from, previous.to]).toEqual([
        '2026-08-31T17:00:00.000Z',
        '2026-09-30T16:59:59.999Z',
      ]);
      expect(current.maxWeight?.value).toBe(101);
      expect(previous.maxWeight?.value).toBe(95);
      expect(delta.maxWeight).toEqual({ absolute: 6, percent: 6.32, improved: true });
      expect([current.maxVolume?.value, previous.maxVolume?.value]).toEqual([300, 475]);
      expect(delta.maxVolume).toEqual({ absolute: -175, percent: -36.84, improved: false });
      expect([current.bestEstimated1RM?.value, previous.bestEstimated1RM?.value]).toEqual([
        110, 110.83,
      ]);
      expect(delta.bestEstimated1RM).toEqual({ absolute: -0.83, percent: -0.75, improved: false });
    });

    it('puts the boundary set in the other month when compared in UTC', async () => {
      const body = await compareBody(userId, { exercise: 'Bench Press', period: 'month' });
      expect(body.data.timezone).toBe('UTC');
      expect(body.data.current.maxWeight?.value).toBe(100);
      expect(body.data.previous.maxWeight?.value).toBe(101);
    });

    it('compares two explicit ranges, which may include future-dated sets', async () => {
      const body = await compareBody(userId, {
        exercise: 'Bench Press',
        tz: 'Asia/Ho_Chi_Minh',
        currentFrom: '2026-10-01',
        currentTo: '2026-10-31',
        previousFrom: '2026-09-01',
        previousTo: '2026-09-30',
      });
      expect(body.data.current.maxWeight?.value).toBe(120);
      expect(body.data.previous.maxWeight?.value).toBe(95);
      expect(body.data.current.to).toBe('2026-10-31T16:59:59.999Z');
    });

    it('returns a null side and null deltas when a period has no sets', async () => {
      const body = await compareBody(userId, {
        exercise: 'Bench Press',
        period: 'week',
        tz: 'Asia/Ho_Chi_Minh',
      });
      // Week of Monday 12 October has no sets; the previous week has 100 × 3 on 5 October.
      expect(body.data.current.maxWeight).toBeNull();
      expect(body.data.previous.maxWeight?.value).toBe(100);
      expect(body.data.delta).toEqual({ maxWeight: null, maxVolume: null, bestEstimated1RM: null });
      expect(body.meta).toEqual({});
    });

    it('adds a message when neither period has sets', async () => {
      const body = await compareBody(uniqueUserId(), { exercise: 'Bench Press', period: 'year' });
      expect(body.data.current.maxWeight).toBeNull();
      expect(body.data.previous.maxWeight).toBeNull();
      expect(body.meta.message).toBe('No weighted sets found for this exercise in either period.');
    });

    it.each([
      ['neither period nor ranges', {}, 'period'],
      ['both period and ranges', { period: 'month', currentFrom: '2026-10-01' }, 'period'],
      [
        'an incomplete set of ranges',
        { currentFrom: '2026-10-01', currentTo: '2026-10-31', previousFrom: '2026-09-01' },
        'previousTo',
      ],
      ['an unknown period', { period: 'day' }, 'period'],
    ])('rejects %s', async (_case, query, path) => {
      const res = await compare(userId, { exercise: 'Bench Press', ...query }).expect(400);
      const { error } = errorBodyOf(res);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details).toEqual(expect.arrayContaining([expect.objectContaining({ path })]));
    });

    it('rejects an inverted explicit range', async () => {
      const res = await compare(userId, {
        exercise: 'Bench Press',
        currentFrom: '2026-10-31',
        currentTo: '2026-10-01',
        previousFrom: '2026-09-01',
        previousTo: '2026-09-30',
      }).expect(400);
      expect(errorBodyOf(res).error.code).toBe('INVALID_DATE_RANGE');
    });
  });
});
