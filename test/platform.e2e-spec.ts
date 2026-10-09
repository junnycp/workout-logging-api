import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { weightUnits } from '../src/units/weight-units';
import { createTestApp } from './support/create-app';
import { errorBodyOf } from './support/types';

describe('Platform behaviour (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('reports the database as up', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expect(res.body).toMatchObject({ status: 'ok', info: { database: { status: 'up' } } });
    });
  });

  describe('error envelope', () => {
    it('returns ROUTE_NOT_FOUND for an unknown API route, with the request id from the header', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/does-not-exist')
        .set('x-request-id', 'e2e-trace-1')
        .expect(404);
      expect(res.headers['x-request-id']).toBe('e2e-trace-1');
      expect(res.body).toEqual({
        error: {
          code: 'ROUTE_NOT_FOUND',
          message: 'Cannot GET /api/v1/does-not-exist',
          details: [],
        },
        requestId: 'e2e-trace-1',
      });
    });

    it('returns the envelope (not HTML) for unknown routes outside the API prefix', async () => {
      const res = await request(app.getHttpServer()).get('/not-an-api').expect(404);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.body).toMatchObject({ error: { code: 'ROUTE_NOT_FOUND' } });
    });

    it('generates a request id when the incoming one is unsafe to log', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/x')
        .set('x-request-id', 'bad id with spaces')
        .expect(404);
      const { requestId } = errorBodyOf(res);
      expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
      expect(res.headers['x-request-id']).toBe(requestId);
    });

    it('rejects malformed JSON with MALFORMED_JSON and still returns a request id', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/anything')
        .set('content-type', 'application/json')
        .send('{"entries": [')
        .expect(400);
      const body = errorBodyOf(res);
      expect(body.error).toEqual({
        code: 'MALFORMED_JSON',
        message: 'Request body is not valid JSON',
        details: [],
      });
      expect(typeof body.requestId).toBe('string');
    });

    it('rejects bodies over 1 MB with PAYLOAD_TOO_LARGE', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/anything')
        .set('content-type', 'application/json')
        .send(JSON.stringify({ padding: 'x'.repeat(1024 * 1024) }))
        .expect(413);
      expect(res.body).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
    });
  });

  describe('other body-parser rejections', () => {
    it('returns 415 UNSUPPORTED_MEDIA_TYPE (not 500) for an unsupported content encoding', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/anything')
        .set('content-type', 'application/json')
        .set('content-encoding', 'foo')
        .send('{}')
        .expect(415);
      expect(errorBodyOf(res).error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });
  });

  describe('OpenAPI', () => {
    it('serves the document with the shared error envelope schema', async () => {
      const res = await request(app.getHttpServer()).get('/docs-json').expect(200);
      const document = res.body as {
        paths: Record<string, Record<string, unknown>>;
        components: { schemas: Record<string, unknown> };
      };
      expect(Object.keys(document.paths['/api/v1/users/{userId}/workouts'] ?? {})).toContain(
        'post',
      );
      expect(Object.keys(document.components.schemas)).toEqual(
        expect.arrayContaining(['ErrorResponseDto', 'ErrorDto', 'ErrorDetailDto']),
      );
    });

    it('documents Idempotency-Key once, as an optional header', async () => {
      const res = await request(app.getHttpServer()).get('/docs-json').expect(200);
      const document = res.body as {
        paths: Record<
          string,
          { post: { parameters: { name: string; in: string; required?: boolean }[] } }
        >;
      };
      const headers = (document.paths['/api/v1/users/{userId}/workouts']?.post.parameters ?? [])
        .filter((p) => p.in === 'header' && p.name.toLowerCase() === 'idempotency-key')
        .map((p) => p.required ?? false);
      expect(headers).toEqual([false]);
    });

    it('lists the weight-unit registry as the unit enum everywhere (adding a unit is one entry, X1)', async () => {
      const res = await request(app.getHttpServer()).get('/docs-json').expect(200);
      const document = res.body as {
        paths: Record<
          string,
          Record<string, { parameters?: { name: string; schema?: { enum?: string[] } }[] }>
        >;
        components: {
          schemas: Record<string, { properties?: Record<string, { enum?: string[] }> }>;
        };
      };
      const queryEnums = Object.values(document.paths)
        .flatMap((operations) => Object.values(operations))
        .flatMap((operation) => operation.parameters ?? [])
        .filter((parameter) => parameter.name === 'unit')
        .map((parameter) => parameter.schema?.enum);
      const bodyEnum = document.components.schemas.WorkoutSetInputDto?.properties?.unit?.enum;

      expect(queryEnums).toHaveLength(3); // history, records, compare
      expect([...queryEnums, bodyEnum]).toEqual(Array(4).fill(weightUnits.codes()));
    });
  });
});
