import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode, ErrorDetail } from './error-codes';

/** The only exception type application code should throw for expected failures. */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: ErrorCode,
    message: string,
    readonly details: ErrorDetail[] = [],
  ) {
    super(message, status);
  }
}
