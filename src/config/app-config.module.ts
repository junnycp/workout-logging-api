import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envSchema } from './env.schema';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, cache: true, validationSchema: envSchema })],
})
export class AppConfigModule {}
