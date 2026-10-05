import { HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { errorBody } from './error-body';
import { ErrorCode } from './error-codes';

/**
 * Nest only installs its 404 handler under the global prefix, so `/anything-else` would get
 * Express' HTML page. Registered after `app.init()`, this catches every unmatched route.
 */
export function notFoundFallback(req: Request & { id?: unknown }, res: Response): void {
  res
    .status(HttpStatus.NOT_FOUND)
    .json(errorBody(ErrorCode.ROUTE_NOT_FOUND, `Cannot ${req.method} ${req.path}`, [], req.id));
}
