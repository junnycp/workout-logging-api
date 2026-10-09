import type { IncomingMessage } from 'node:http';
import type { ConfigService } from '@nestjs/config';
import { HttpLogger, pinoHttp } from 'pino-http';
import type { Env } from '../../config/env.schema';
import { REQUEST_ID_HEADER, resolveRequestId } from './request-id';

export const HTTP_LOGGER = Symbol('HTTP_LOGGER');

/**
 * Access-log view of a request: id, method and URL only. pino-http's default also logs every header and the client
 * address (IP, user agent, X-Forwarded-For, Idempotency-Key), which is personal data the logs must not hold.
 */
export function serializeRequest(req: { id?: unknown; method?: unknown; url?: unknown }): {
  id: unknown;
  method: unknown;
  url: unknown;
} {
  return { id: req.id, method: req.method, url: req.url };
}

/**
 * The application's single pino-http instance. It is mounted by `setupApp()` before the body parser
 * (so requests rejected by the parser or by the 404 fallback still get an access-log line), and
 * nestjs-pino reuses its logger via `useExisting`, so there is one pino logger and one transport.
 */
export function createHttpLogger(config: ConfigService<Env, true>): HttpLogger {
  return pinoHttp({
    level: config.get('LOG_LEVEL', { infer: true }),
    // requestIdMiddleware runs first and has already assigned req.id; this is only a fallback.
    genReqId: (req: IncomingMessage & { id?: unknown }) =>
      typeof req.id === 'string' ? req.id : resolveRequestId(req.headers[REQUEST_ID_HEADER]),
    // Request bodies, headers and client addresses are never logged.
    serializers: { req: serializeRequest },
    autoLogging: { ignore: (req: IncomingMessage) => req.url === '/health' },
    transport:
      config.get('NODE_ENV', { infer: true }) === 'development'
        ? { target: 'pino-pretty', options: { singleLine: true } }
        : undefined,
  });
}
