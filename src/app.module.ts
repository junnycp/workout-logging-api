import { Module } from '@nestjs/common';
import { ErrorsModule } from './common/errors/errors.module';
import { LoggingModule } from './common/logging/logging.module';
import { AppConfigModule } from './config/app-config.module';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [AppConfigModule, LoggingModule, ErrorsModule, DatabaseModule],
})
export class AppModule {}
