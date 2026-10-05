/** Stable, machine-readable error codes returned in `error.code`. Clients may branch on these. */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  MALFORMED_JSON: 'MALFORMED_JSON',
  BAD_REQUEST: 'BAD_REQUEST',
  INVALID_DATE_RANGE: 'INVALID_DATE_RANGE',
  INVALID_CURSOR: 'INVALID_CURSOR',
  UNKNOWN_MUSCLE_GROUP: 'UNKNOWN_MUSCLE_GROUP',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const STATUS_CODES: Partial<Record<number, ErrorCode>> = {
  400: ErrorCode.BAD_REQUEST,
  404: ErrorCode.ROUTE_NOT_FOUND,
  405: ErrorCode.METHOD_NOT_ALLOWED,
  413: ErrorCode.PAYLOAD_TOO_LARGE,
  415: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
  503: ErrorCode.SERVICE_UNAVAILABLE,
};

/** Fallback code for errors that are not AppExceptions (framework or middleware errors). */
export function codeForStatus(status: number): ErrorCode {
  return STATUS_CODES[status] ?? (status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST);
}

/** One problem with the request, located by a JSON-style path such as `entries[0].sets[1].unit`. */
export interface ErrorDetail {
  path: string;
  code: string;
  message: string;
  [extra: string]: unknown;
}

export interface ErrorResponseBody {
  error: { code: ErrorCode; message: string; details: ErrorDetail[] };
  requestId: string | null;
}
