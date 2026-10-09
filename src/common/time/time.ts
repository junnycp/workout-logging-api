import { DateTime, FixedOffsetZone, IANAZone } from 'luxon';
import { DetailCode } from '../errors/error-codes';

export type Result<T, E extends string> = { ok: true; value: T } | { ok: false; error: E };

const ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });
const fail = <E extends string>(error: E): { ok: false; error: E } => ({ ok: false, error });

export type DateInputError =
  | typeof DetailCode.INVALID_DATE
  | typeof DetailCode.MISSING_OFFSET
  | typeof DetailCode.MISSING_TIMEZONE
  | typeof DetailCode.INVALID_TIMEZONE;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
// Strict ISO-8601 extended format: hours 00-23 (no "24:00"), upper-case T/Z, offset hours 00-23 and
// minutes 00-59 (Luxon alone would accept "+07:99" and silently shift the instant).
const DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?<offset>Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/;
/** Plausible workout years; anything else is a typo or a client bug. */
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
/** Same bound as the workout_entries_utc_offset_range CHECK constraint. */
const MAX_OFFSET_MINUTES = 14 * 60;

/**
 * IANA zone names only ("Asia/Ho_Chi_Minh", "UTC"). Node's Intl also accepts raw offsets such as "+07:00";
 * those are rejected on purpose: they carry no DST rules and "+" is decoded as a space in query strings.
 */
export function isValidTimeZone(zone: string): boolean {
  return canonicalTimeZone(zone) !== null;
}

/**
 * The zone name to use and echo back, or null when invalid. UTC spellings ("utc", "Etc/UTC") become "UTC";
 * other valid names are kept as given. ICU's canonical form is not used because it would turn
 * "Asia/Ho_Chi_Minh" into the legacy alias "Asia/Saigon".
 */
export function canonicalTimeZone(zone: string): string | null {
  if (!/^[A-Za-z]/.test(zone) || !IANAZone.isValidZone(zone)) return null;
  return /^(etc\/)?(utc|uct|zulu|universal)$/i.test(zone) ? 'UTC' : zone;
}

const assertZone = (zone: string): void => {
  if (!isValidTimeZone(zone)) throw new Error(`Invalid time zone: ${zone}`);
};

const inYearRange = (instant: DateTime): boolean =>
  instant.year >= MIN_YEAR && instant.year <= MAX_YEAR;

/** Start of the calendar day in `zone`; if midnight does not exist (DST gap), the first instant that does. */
const startOfLocalDay = (date: string, zone: string): DateTime | null => {
  const day = DateTime.fromISO(date, { zone });
  return day.isValid ? day.startOf('day') : null;
};

type Instant = { instant: DateTime } & ({ kind: 'date' } | { kind: 'datetime' });

function parseInstant(input: string, zone: string | undefined): Result<Instant, DateInputError> {
  if (DATE_ONLY.test(input)) {
    if (zone === undefined) return fail(DetailCode.MISSING_TIMEZONE);
    if (!isValidTimeZone(zone)) return fail(DetailCode.INVALID_TIMEZONE);
    const start = startOfLocalDay(input, zone);
    return start && inYearRange(start)
      ? ok({ kind: 'date', instant: start })
      : fail(DetailCode.INVALID_DATE);
  }
  const match = DATE_TIME.exec(input);
  if (!match) return fail(DetailCode.INVALID_DATE);
  if (!match.groups?.offset) return fail(DetailCode.MISSING_OFFSET);
  const instant = DateTime.fromISO(input, { setZone: true });
  if (!instant.isValid || Math.abs(instant.offset) > MAX_OFFSET_MINUTES || !inYearRange(instant)) {
    return fail(DetailCode.INVALID_DATE);
  }
  return ok({ kind: 'datetime', instant });
}

/**
 * Parses the `date` of a logged workout (decision D2). Accepted: an ISO-8601 datetime with an offset
 * ("2026-10-01T18:30:00+07:00", "...Z"), or a date-only value with an IANA timezone, read as the start
 * of that local day. A datetime without an offset is rejected rather than read in the server's zone.
 */
export function parseWorkoutDate(
  input: string,
  timezone?: string,
): Result<{ instant: Date; utcOffsetMinutes: number }, DateInputError> {
  const parsed = parseInstant(input, timezone);
  if (!parsed.ok) return parsed;
  return ok({
    instant: parsed.value.instant.toJSDate(),
    utcOffsetMinutes: parsed.value.instant.offset,
  });
}

/** Half-open UTC interval: gte <= t < lt. Undefined bounds are open. */
export interface InstantRange {
  gte?: Date;
  lt?: Date;
}

/**
 * Converts user-facing range bounds to a UTC interval. Bounds are inclusive for the user: a date-only
 * `to` covers that whole local day (so the interval ends at the start of the next day), a datetime `to`
 * includes that instant. Date-only bounds are read in `timezone`.
 */
export function resolveDateRange(
  range: { from?: string; to?: string },
  timezone: string,
): Result<InstantRange, DateInputError | 'INVALID_DATE_RANGE'> {
  if (!isValidTimeZone(timezone)) return fail(DetailCode.INVALID_TIMEZONE);

  let gte: DateTime | undefined;
  let lt: DateTime | undefined;
  if (range.from !== undefined) {
    const from = parseInstant(range.from, timezone);
    if (!from.ok) return from;
    gte = from.value.instant;
  }
  if (range.to !== undefined) {
    const to = parseInstant(range.to, timezone);
    if (!to.ok) return to;
    lt =
      to.value.kind === 'date'
        ? to.value.instant.setZone(timezone).plus({ days: 1 }).startOf('day')
        : to.value.instant.plus({ milliseconds: 1 });
  }
  if (gte && lt && gte >= lt) return fail('INVALID_DATE_RANGE');
  return ok({ gte: gte?.toJSDate(), lt: lt?.toJSDate() });
}

export type Period = 'week' | 'month' | 'year';

/**
 * "This period vs the previous one" (DESIGN 4.4): the current calendar period up to and including `now`,
 * and the full previous period, in `timezone` (weeks start on Monday). Future-dated logs never count as
 * "this month". Boundaries are local midnights, so DST and month lengths come from the calendar.
 */
export function periodRanges(
  period: Period,
  now: Date,
  timezone: string,
): { current: Required<InstantRange>; previous: Required<InstantRange> } {
  assertZone(timezone);
  const currentStart = DateTime.fromJSDate(now, { zone: timezone }).startOf(period);
  const previousStart = currentStart.minus({ [`${period}s`]: 1 }).startOf(period);
  return {
    current: { gte: currentStart.toJSDate(), lt: new Date(now.getTime() + 1) },
    previous: { gte: previousStart.toJSDate(), lt: currentStart.toJSDate() },
  };
}

/** Local calendar date (YYYY-MM-DD) of an instant, in an IANA zone or at a fixed UTC offset in minutes. */
export function localDateOf(instant: Date, zoneOrOffsetMinutes: string | number): string {
  if (typeof zoneOrOffsetMinutes === 'string') assertZone(zoneOrOffsetMinutes);
  const zone =
    typeof zoneOrOffsetMinutes === 'number'
      ? FixedOffsetZone.instance(zoneOrOffsetMinutes)
      : zoneOrOffsetMinutes;
  return DateTime.fromJSDate(instant, { zone }).toISODate() as string;
}

/**
 * How far ahead of "now" a logged workout may be. Workouts are logged after they happen; 24 hours covers
 * the furthest-ahead zone (UTC+14) and device clock skew while rejecting typos such as 2099 or 2062,
 * which would otherwise become permanent all-time records (there is no edit/delete endpoint).
 */
export const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

export function isTooFarInFuture(instant: Date, now: Date): boolean {
  return instant.getTime() - now.getTime() > FUTURE_TOLERANCE_MS;
}
