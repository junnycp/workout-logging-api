import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaClient } from '../src/generated/prisma/client';
import { canonicalJson } from '../src/common/idempotency/request-hash';
import { createTestApp } from './support/create-app';
import { createTestPrisma, uniqueUserId } from './support/db';

const PARALLEL = 20;
const entry = (reps: number) => ({
  exerciseName: 'Back Squat',
  date: '2026-10-01T07:00:00Z',
  sets: [{ reps, weight: 120, unit: 'kg' }],
});

/** Concurrent writes for the same user and exercise (E5), against real Postgres. */
describe('Concurrent POST /workouts (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let baseUrl: string;

  beforeAll(async () => {
    app = await createTestApp();
    // A real port: supertest would otherwise attach listeners to one server per parallel request.
    await app.listen(0);
    baseUrl = await app.getUrl();
    prisma = createTestPrisma();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const fire = (userId: string, bodies: unknown[], key?: string) =>
    Promise.all(
      bodies.map((body) => {
        const req = request(baseUrl).post(`/api/v1/users/${userId}/workouts`);
        if (key) req.set('Idempotency-Key', key);
        return req.send(body as object);
      }),
    );

  it('commits every request when the same user logs the same exercise at the same instant', async () => {
    const userId = uniqueUserId();
    const responses = await fire(
      userId,
      Array.from({ length: PARALLEL }, () => ({ entries: [entry(5)] })),
    );
    expect(responses.map((r) => r.status)).toEqual(Array(PARALLEL).fill(201));
    expect(await prisma.workoutEntry.count({ where: { userId } })).toBe(PARALLEL);
  });

  it('writes once when the same key and body arrive concurrently; the others replay', async () => {
    const userId = uniqueUserId();
    const responses = await fire(
      userId,
      Array.from({ length: PARALLEL }, () => ({ entries: [entry(5)] })),
      'double-tap',
    );
    const statuses = responses.map((r) => r.status).sort();
    expect(statuses).toEqual([...(Array(PARALLEL - 1).fill(200) as number[]), 201]);
    // Same content; key order may differ because the stored copy comes back from JSONB.
    const bodies = new Set(responses.map((r) => canonicalJson(r.body)));
    expect(bodies.size).toBe(1);
    expect(await prisma.workoutEntry.count({ where: { userId } })).toBe(1);
  });

  it('writes once when the same key arrives concurrently with different bodies; the others get 409', async () => {
    const userId = uniqueUserId();
    const bodies = Array.from({ length: PARALLEL }, (_, i) => ({ entries: [entry(i + 1)] }));
    const responses = await fire(userId, bodies, 'contested');
    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(PARALLEL - 1);
    expect(await prisma.workoutEntry.count({ where: { userId } })).toBe(1);
  });
});
