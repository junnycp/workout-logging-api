import { serializeRequest } from './http-logger';

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
