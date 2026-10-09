import { Controller, Get, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { HealthCheck, HealthCheckResult, HealthCheckService } from '@nestjs/terminus';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { PinoLogger } from 'nestjs-pino';
import { ErrorResponseDto } from '../common/openapi/error-response.dto';
import { AppException } from '../common/errors/app-exception';
import { DetailCode, ErrorCode } from '../common/errors/error-codes';
import { DatabaseHealthIndicator } from './database.health';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
    private readonly logger: PinoLogger,
  ) {
    logger.setContext(HealthController.name);
  }

  /** Liveness + readiness: 200 when every dependency answers, 503 with the failing ones otherwise. */
  @Get()
  @HealthCheck()
  @ApiOkResponse({ description: 'All dependencies are reachable' })
  @ApiServiceUnavailableResponse({ description: 'A dependency is down', type: ErrorResponseDto })
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
          code: DetailCode.DOWN,
          // The raw driver error stays in the logs; clients get a stable message.
          message: `${name} is unavailable`,
        })),
      );
    }
  }
}
