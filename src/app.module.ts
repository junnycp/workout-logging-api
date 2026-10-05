import { Module } from '@nestjs/common';
import { ErrorsModule } from './common/errors/errors.module';
import { LoggingModule } from './common/logging/logging.module';
import { AppConfigModule } from './config/app-config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { WorkoutsModule } from './workouts/workouts.module';

@Module({
  imports: [
    AppConfigModule,
    LoggingModule,
    ErrorsModule,
    DatabaseModule,
    HealthModule,
    WorkoutsModule,
  ],
})
export class AppModule {}
