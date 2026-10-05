import type { NextFunction, Request, Response } from 'express';
import { REQUEST_ID_HEADER, resolveRequestId } from './request-id';

/**
 * Assigns `req.id` before anything else runs (including the body parser), so even requests rejected
 * by the parser carry a request id in the error body, the response header and the logs.
 */
export function requestIdMiddleware(
  req: Request & { id?: string },
  res: Response,
  next: NextFunction,
): void {
  req.id = resolveRequestId(req.headers[REQUEST_ID_HEADER]);
  res.setHeader(REQUEST_ID_HEADER, req.id);
  next();
}
