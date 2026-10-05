import type { ErrorResponseBody } from '../../src/common/errors/error-codes';

/** Supertest bodies are `any`; tests narrow them explicitly instead of disabling lint rules. */
export const errorBodyOf = (res: { body: unknown }): ErrorResponseBody =>
  res.body as ErrorResponseBody;
