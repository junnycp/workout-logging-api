import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './database.health';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule.forRoot({ logger: false })],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator],
})
export class HealthModule {}
