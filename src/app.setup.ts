import type { NestExpressApplication } from '@nestjs/platform-express';
import { mapBodyParserErrors } from './common/errors/body-parser-errors';
import { notFoundFallback } from './common/errors/not-found.fallback';
import { requestIdMiddleware } from './common/logging/request-id.middleware';
import { setupSwagger } from './common/openapi/swagger';

export const API_PREFIX = 'api/v1';
export const MAX_JSON_BODY = '1mb';

/**
 * HTTP-level setup shared by `main.ts` and the e2e tests, so tests exercise the same app.
 * The app must be created with `{ bodyParser: false }` for the body limit to apply.
 */
export async function setupApp(app: NestExpressApplication): Promise<NestExpressApplication> {
  // Order matters: request id first, then the parser, then the parser-error mapper.
  app.use(requestIdMiddleware);
  app.useBodyParser('json', { limit: MAX_JSON_BODY });
  app.use(mapBodyParserErrors);
  app.setGlobalPrefix(API_PREFIX, { exclude: ['health'] });
  app.enableShutdownHooks();
  setupSwagger(app);
  await app.init();
  // Must come after init(): Nest's own routes and prefixed 404 handler are registered there.
  app.use(notFoundFallback);
  return app;
}
