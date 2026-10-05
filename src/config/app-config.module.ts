import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CONFIG_MODULE_OPTIONS } from './config-module.options';

@Module({
  imports: [ConfigModule.forRoot(CONFIG_MODULE_OPTIONS)],
})
export class AppConfigModule {}
