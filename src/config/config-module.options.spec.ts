import { ConfigModule } from '@nestjs/config';
import { CONFIG_MODULE_OPTIONS } from './config-module.options';

describe('ConfigModule wiring', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('accepts a valid environment', async () => {
    process.env.DATABASE_URL = 'postgresql://localhost/db';
    process.env.PORT = '3000';
    await expect(ConfigModule.forRoot(CONFIG_MODULE_OPTIONS)).resolves.toBeDefined();
  });

  // In @nestjs/config 12, forRoot() is async: validation errors surface as a rejected promise.
  it('fails fast when the environment does not satisfy the schema', async () => {
    process.env.DATABASE_URL = 'postgresql://localhost/db';
    process.env.PORT = 'not-a-port';
    await expect(ConfigModule.forRoot(CONFIG_MODULE_OPTIONS)).rejects.toThrow(/PORT/);
  });
});
