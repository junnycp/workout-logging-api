import { HttpStatus } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AppException } from './app-exception';
import { codeForStatus, ErrorCode } from './error-codes';

interface BodyParserError {
  type?: unknown;
  limit?: unknown;
  status?: unknown;
  expose?: unknown;
  message?: unknown;
}

/**
 * Express error middleware registered right after the JSON body parser.
 * Nest's Express adapter would otherwise turn every body-parser SyntaxError into a plain
 * BadRequestException and lose the reason; mapping here keeps the public error codes precise.
 */
export function mapBodyParserErrors(
  err: unknown,
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const type = (err as BodyParserError | null)?.type;
  if (type === 'entity.parse.failed') {
    return next(
      new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.MALFORMED_JSON,
        'Request body is not valid JSON',
      ),
    );
  }
  if (type === 'entity.too.large') {
    const limit = (err as BodyParserError).limit;
    return next(
      new AppException(
        HttpStatus.PAYLOAD_TOO_LARGE,
        ErrorCode.PAYLOAD_TOO_LARGE,
        `Request body exceeds ${typeof limit === 'number' ? limit : 'the allowed'} bytes`,
      ),
    );
  }
  // Any other body-parser rejection (unsupported encoding/charset, aborted request, ...) is a client
  // error: keep its 4xx status instead of letting it surface as a 500.
  const { status, expose, message } = (err ?? {}) as BodyParserError;
  if (typeof type === 'string' && typeof status === 'number' && status >= 400 && status < 500) {
    return next(
      new AppException(
        status,
        codeForStatus(status),
        expose === true && typeof message === 'string' ? message : 'Request could not be processed',
      ),
    );
  }
  next(err);
}

/**
 * Only JSON bodies are parsed. Any other body (text, form data) would leave the parsed body empty and come back as a
 * list of missing fields; answer 415 instead. A request without a body is left to validation.
 */
export function requireJsonBody(req: Request, _res: Response, next: NextFunction): void {
  // An empty body (Content-Length: 0) counts as no body, unlike in req.is().
  const hasBody =
    req.headers['transfer-encoding'] !== undefined ||
    Number(req.headers['content-length'] ?? 0) > 0;
  if (hasBody && !req.is('application/json')) {
    return next(
      new AppException(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        ErrorCode.UNSUPPORTED_MEDIA_TYPE,
        'Request body must be application/json',
      ),
    );
  }
  next();
}
