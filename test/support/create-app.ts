import { Test, TestingModuleBuilder } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../../src/app.module';
import { setupApp } from '../../src/app.setup';

/**
 * Boots the same application as main.ts (same middleware order, prefix, filters and pipes).
 * `customize` can override providers, e.g. to simulate an unreachable database.
 */
export async function createTestApp(
  customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
): Promise<NestExpressApplication> {
  const moduleRef = await customize(Test.createTestingModule({ imports: [AppModule] })).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  return setupApp(app);
}
