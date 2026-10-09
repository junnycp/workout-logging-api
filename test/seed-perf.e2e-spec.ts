import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaClient } from '../src/generated/prisma/client';
import { generateUserDataset } from '../src/perf/perf-dataset';
import { expandUsers, parsePerfProfile, PerfProfile } from '../src/perf/perf-profile';
import { seedPerfDataset } from '../src/perf/seed-perf-dataset';
import { createTestApp } from './support/create-app';
import { createTestPrisma, uniqueUserId } from './support/db';

const EXERCISES = ['Bench Press', 'Back Squat', 'Deadlift'];

describe('Performance dataset seed (integration)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let profile: PerfProfile;
  let heavy: string;
  let bg: string;
  let single: string;

  const idsOf = async (userId: string) =>
    (await prisma.workoutEntry.findMany({ where: { userId }, select: { id: true } }))
      .map((row) => row.id)
      .sort();
  const setCount = (userId: string) => prisma.workoutSet.count({ where: { userId } });

  beforeAll(async () => {
    app = await createTestApp();
    await app.init();
    prisma = createTestPrisma();
    heavy = uniqueUserId();
    bg = uniqueUserId();
    single = uniqueUserId();
    profile = parsePerfProfile({
      version: 1,
      seed: 7,
      anchor: '2026-09-01T00:00:00Z',
      spanDays: 365,
      setsPerEntry: { min: 3, max: 6 },
      reps: { min: 1, max: 12 },
      lbShare: 0.15,
      bodyweightShare: 0.05,
      utcOffsetsMinutes: [420, 0],
      users: [
        {
          id: heavy,
          entries: 300,
          exercises: EXERCISES,
          scenarios: {
            bodyweightOnly: { exercise: 'Pull-Up', entries: 10 },
            plateau: { exercise: 'Barbell Row', entries: 20, weight: 100, unit: 'kg', reps: 5 },
            sameInstant: { exercise: 'Bench Press', entries: 25 },
          },
        },
        { id: bg, count: 2, entries: 50, exercises: EXERCISES },
        { id: single, entries: 40, exercises: ['Bench Press'], optional: true },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('stores exactly the rows the generator produces for every non-optional user', async () => {
    const report = await seedPerfDataset(prisma, profile, { includeOptional: false });

    const exercises = await prisma.exercise.findMany({ select: { id: true, name: true } });
    const exerciseIds = new Map(exercises.map((e) => [e.name, e.id]));
    const users = expandUsers(profile, { includeOptional: false });
    expect(report.users).toEqual([heavy, `${bg}-001`, `${bg}-002`]);
    for (const user of users) {
      const expected = generateUserDataset(profile, user, exerciseIds);
      expect(await idsOf(user.id)).toEqual(expected.entries.map((e) => e.id).sort());
      expect(await setCount(user.id)).toBe(expected.sets.length);
    }
    expect(await prisma.workoutEntry.count({ where: { userId: single } })).toBe(0);
  });

  it('is idempotent and leaves other users alone', async () => {
    const other = uniqueUserId();
    await request(app.getHttpServer())
      .post(`/api/v1/users/${other}/workouts`)
      .send({
        entries: [
          {
            exerciseName: 'Bench Press',
            date: '2026-08-01T10:00:00Z',
            sets: [{ reps: 5, weight: 80, unit: 'kg' }],
          },
        ],
      })
      .expect(201);
    const before = { ids: await idsOf(heavy), sets: await setCount(heavy) };

    await seedPerfDataset(prisma, profile, { includeOptional: false });

    expect(await idsOf(heavy)).toEqual(before.ids);
    expect(await setCount(heavy)).toBe(before.sets);
    expect(await prisma.workoutEntry.count({ where: { userId: other } })).toBe(1);
  });

  it('seeds optional users only when asked', async () => {
    const report = await seedPerfDataset(prisma, profile, { includeOptional: true });
    expect(report.users).toContain(single);
    expect(await prisma.workoutEntry.count({ where: { userId: single } })).toBe(40);
  });

  it('produces data the API reads: history pages, plateau records and bodyweight-only messages', async () => {
    const server = app.getHttpServer();
    const page = await request(server).get(`/api/v1/users/${heavy}/workouts`).expect(200);
    expect((page.body as { data: unknown[] }).data).toHaveLength(20);

    const plateau = await request(server)
      .get(`/api/v1/users/${heavy}/personal-records`)
      .query({ exercise: 'Barbell Row' })
      .expect(200);
    expect(plateau.body).toMatchObject({
      data: { maxWeight: { value: 100, set: { reps: 5, weight: 100 } } },
    });

    const bodyweight = await request(server)
      .get(`/api/v1/users/${heavy}/personal-records`)
      .query({ exercise: 'Pull-Up' })
      .expect(200);
    expect(bodyweight.body).toMatchObject({
      data: { maxWeight: null },
      meta: { message: expect.stringMatching(/bodyweight/) as unknown },
    });
  });
});
