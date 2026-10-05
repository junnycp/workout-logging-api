import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { HttpLogger } from 'pino-http';
import { createHttpLogger, HTTP_LOGGER } from './http-logger';

@Global()
@Module({
  providers: [{ provide: HTTP_LOGGER, inject: [ConfigService], useFactory: createHttpLogger }],
  exports: [HTTP_LOGGER],
})
class HttpLoggerModule {}

@Module({
  imports: [
    HttpLoggerModule,
    LoggerModule.forRootAsync({
      inject: [HTTP_LOGGER],
      // useExisting: setupApp() mounts the pino-http middleware itself; nestjs-pino only binds req.log.
      useFactory: (httpLogger: HttpLogger) => ({
        pinoHttp: { logger: httpLogger.logger },
        useExisting: true,
      }),
    }),
  ],
})
export class LoggingModule {}
