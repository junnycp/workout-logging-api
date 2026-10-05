import { HttpStatus } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AppException } from './app-exception';
import { ErrorCode } from './error-codes';

interface BodyParserError {
  type?: unknown;
  limit?: unknown;
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
  next(err);
}
