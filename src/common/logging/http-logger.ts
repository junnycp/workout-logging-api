import type { IncomingMessage } from 'node:http';
import type { ConfigService } from '@nestjs/config';
import { HttpLogger, pinoHttp } from 'pino-http';
import type { Env } from '../../config/env.schema';
import { REQUEST_ID_HEADER, resolveRequestId } from './request-id';

export const HTTP_LOGGER = Symbol('HTTP_LOGGER');

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
    // Request bodies are never logged; credentials in headers are redacted.
    redact: ['req.headers.authorization', 'req.headers.cookie'],
    autoLogging: { ignore: (req: IncomingMessage) => req.url === '/health' },
    transport:
      config.get('NODE_ENV', { infer: true }) === 'development'
        ? { target: 'pino-pretty', options: { singleLine: true } }
        : undefined,
  });
}
