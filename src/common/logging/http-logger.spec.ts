import type { ConfigService } from '@nestjs/config';
import express from 'express';
import request from 'supertest';
import type { Env } from '../../config/env.schema';
import { createHttpLogger, serializeRequest } from './http-logger';

describe('serializeRequest (access log, no PII)', () => {
  it('keeps only the request id, method and URL', () => {
    // The shape pino-http hands to a custom req serializer (pino-std-serializers' wrapped request).
    const wrapped = {
      id: 'req-1',
      method: 'POST',
      url: '/api/v1/users/u1/workouts?unit=lb',
      query: { unit: 'lb' },
      params: {},
      headers: {
        'user-agent': 'curl/8.7.1',
        'x-forwarded-for': '203.0.113.7',
        'idempotency-key': 'secret-key-1',
        authorization: 'Bearer token',
      },
      remoteAddress: '::ffff:172.18.0.1',
      remotePort: 40288,
    };
    expect(serializeRequest(wrapped)).toEqual({
      id: 'req-1',
      method: 'POST',
      url: '/api/v1/users/u1/workouts?unit=lb',
    });
  });
});

describe('createHttpLogger (access log line)', () => {
  it('writes no headers and no client address for a request that carries them', async () => {
    const lines: string[] = [];
    const config = {
      get: (key: string) => ({ LOG_LEVEL: 'info', NODE_ENV: 'test' })[key],
    } as unknown as ConfigService<Env, true>;
    const app = express();
    app.use(createHttpLogger(config, { write: (line: string) => lines.push(line) }));
    app.get('/x', (_req, res) => res.send('ok'));

    await request(app)
      .get('/x')
      .set('User-Agent', 'curl/8.7.1')
      .set('X-Forwarded-For', '203.0.113.7')
      .set('Idempotency-Key', 'secret-key-1')
      .expect(200);

    const entry = JSON.parse(lines[0] ?? '{}') as { req?: Record<string, unknown> };
    expect(Object.keys(entry.req ?? {}).sort()).toEqual(['id', 'method', 'url']);
    expect(lines.join('')).not.toMatch(/203\.0\.113\.7|secret-key-1|curl/);
  });
});
