import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ErrorResponseDto } from './error-response.dto';

export const DOCS_PATH = 'docs';

/** Serves Swagger UI at /docs and the raw OpenAPI document at /docs-json. */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Workout Logging API')
    .setDescription(
      'Log client workouts and query history and personal records. No authentication by design: ' +
        '`userId` is a path parameter. Every error uses the `ErrorResponse` envelope.',
    )
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config, { extraModels: [ErrorResponseDto] });
  SwaggerModule.setup(DOCS_PATH, app, document, { jsonDocumentUrl: `${DOCS_PATH}-json` });
}
