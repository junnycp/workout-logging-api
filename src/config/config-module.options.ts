import type { ConfigModuleOptions } from '@nestjs/config';
import { envSchema } from './env.schema';

/** Kept apart from the module so tests can exercise the wiring without triggering import-time validation. */
export const CONFIG_MODULE_OPTIONS: ConfigModuleOptions = {
  isGlobal: true,
  cache: true,
  validationSchema: envSchema,
};
