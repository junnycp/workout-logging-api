import { Injectable } from '@nestjs/common';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly indicator: HealthIndicatorService,
    private readonly prisma: PrismaService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    return await this.indicator
      .check(key)
      .attempt(async () => {
        await this.prisma.$queryRaw`SELECT 1`;
      })
      .withTimeout(1000);
  }
}
