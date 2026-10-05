import type { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { Env } from '../src/config/env.schema';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp } from './support/create-app';
import { errorBodyOf } from './support/types';

// Nothing listens on port 1: the app boots (the pool connects lazily) but every query fails.
const UNREACHABLE_DB = 'postgresql://nobody:nothing@127.0.0.1:1/none';

describe('GET /health when the database is unreachable (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(PrismaService).useFactory({
        factory: () =>
          new PrismaService({ get: () => UNREACHABLE_DB } as unknown as ConfigService<Env, true>),
      }),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 503 SERVICE_UNAVAILABLE with a stable per-dependency message', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(503);
    expect(errorBodyOf(res)).toMatchObject({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        details: [{ path: 'database', code: 'DOWN', message: 'database is unavailable' }],
      },
    });
  });
});
