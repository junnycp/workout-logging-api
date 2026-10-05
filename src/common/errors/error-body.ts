import type { ErrorCode, ErrorDetail, ErrorResponseBody } from './error-codes';

/** The one function that shapes the public error envelope. */
export function errorBody(
  code: ErrorCode,
  message: string,
  details: ErrorDetail[],
  requestId: unknown,
): ErrorResponseBody {
  return {
    error: { code, message, details },
    requestId: typeof requestId === 'string' ? requestId : null,
  };
}
