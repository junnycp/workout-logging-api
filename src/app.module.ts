import { Module } from '@nestjs/common';
import { LoggingModule } from './common/logging/logging.module';
import { AppConfigModule } from './config/app-config.module';

@Module({
  imports: [AppConfigModule, LoggingModule],
})
export class AppModule {}
