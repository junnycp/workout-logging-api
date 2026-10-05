import { Controller, Get, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { HealthCheck, HealthCheckResult, HealthCheckService } from '@nestjs/terminus';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { DatabaseHealthIndicator } from './database.health';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
    @InjectPinoLogger(HealthController.name) private readonly logger: PinoLogger,
  ) {}

  /** Liveness + readiness: 200 when every dependency answers, 503 with the failing ones otherwise. */
  @Get()
  @HealthCheck()
  async check(): Promise<HealthCheckResult> {
    try {
      return await this.health.check([() => this.database.isHealthy('database')]);
    } catch (error) {
      if (!(error instanceof ServiceUnavailableException)) throw error;
      const result = error.getResponse() as HealthCheckResult;
      this.logger.warn({ unhealthy: result.error }, 'Health check failed');
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ErrorCode.SERVICE_UNAVAILABLE,
        'One or more dependencies are unhealthy',
        Object.keys(result.error ?? {}).map((name) => ({
          path: name,
          code: 'DOWN',
          // The raw driver error stays in the logs; clients get a stable message.
          message: `${name} is unavailable`,
        })),
      );
    }
  }
}
