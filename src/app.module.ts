import { Module } from '@nestjs/common';
import { ErrorsModule } from './common/errors/errors.module';
import { LoggingModule } from './common/logging/logging.module';
import { AppConfigModule } from './config/app-config.module';

@Module({
  imports: [AppConfigModule, LoggingModule, ErrorsModule],
})
export class AppModule {}
