import { HttpStatus } from '@nestjs/common';
import { AppException } from '../errors/app-exception';
import { ErrorCode, ErrorDetail } from '../errors/error-codes';
import { canonicalTimeZone, InstantRange, resolveDateRange } from './time';

const BOUND_MESSAGES = {
  INVALID_DATE: 'must be YYYY-MM-DD or an ISO-8601 datetime with an offset',
  MISSING_OFFSET: 'has a time but no UTC offset; add Z or ±hh:mm',
} as const;

/** One inclusive range from query parameters; the paths name the parameters in error details. */
export interface RangeQuery {
  from?: string;
  to?: string;
  fromPath: string;
  toPath: string;
}

/**
 * Validates `tz` (IANA, default UTC) and turns each user range into a half-open UTC interval. Every bad
 * zone or bound is reported in one 400 VALIDATION_ERROR; an inverted range is a 400 INVALID_DATE_RANGE.
 */
export function parseRangeQuery(
  tz: string | undefined,
  ranges: RangeQuery[],
): { timezone: string; ranges: InstantRange[] } {
  const timezone = canonicalTimeZone(tz ?? 'UTC');
  if (timezone === null) {
    throw validationError([
      { path: 'tz', code: 'INVALID_TIMEZONE', message: 'tz is not a valid IANA time zone' },
    ]);
  }

  const details: ErrorDetail[] = [];
  for (const range of ranges) {
    for (const [value, path] of [
      [range.from, range.fromPath],
      [range.to, range.toPath],
    ] as const) {
      if (value === undefined) continue;
      const parsed = resolveDateRange({ from: value }, timezone);
      if (!parsed.ok && (parsed.error === 'INVALID_DATE' || parsed.error === 'MISSING_OFFSET')) {
        details.push({
          path,
          code: parsed.error,
          message: `${path} ${BOUND_MESSAGES[parsed.error]}`,
        });
      }
    }
  }
  if (details.length > 0) throw validationError(details);

  return {
    timezone,
    ranges: ranges.map((range) => {
      const resolved = resolveDateRange({ from: range.from, to: range.to }, timezone);
      if (!resolved.ok) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.INVALID_DATE_RANGE,
          `\`${range.fromPath}\` must not be after \`${range.toPath}\``,
        );
      }
      return resolved.value;
    }),
  };
}

const validationError = (details: ErrorDetail[]) =>
  new AppException(
    HttpStatus.BAD_REQUEST,
    ErrorCode.VALIDATION_ERROR,
    'Request validation failed',
    details,
  );
