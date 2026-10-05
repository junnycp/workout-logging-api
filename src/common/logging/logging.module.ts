import type { IncomingMessage } from 'node:http';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { Env } from '../../config/env.schema';
import { REQUEST_ID_HEADER, resolveRequestId } from './request-id';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          // requestIdMiddleware has already assigned req.id; this is only a fallback.
          genReqId: (req: IncomingMessage & { id?: string }) =>
            req.id ?? resolveRequestId(req.headers[REQUEST_ID_HEADER]),
          // Request bodies are never logged; credentials in headers are redacted.
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          autoLogging: { ignore: (req: IncomingMessage) => req.url === '/health' },
          transport:
            config.get('NODE_ENV', { infer: true }) === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
  ],
})
export class LoggingModule {}
