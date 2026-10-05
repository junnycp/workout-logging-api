import { z } from 'zod';

/**
 * Environment contract. Validated once at startup: the app refuses to boot with an invalid environment.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// or postgresql:// connection string'),
});

export type Env = z.infer<typeof envSchema>;
