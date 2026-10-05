import {
  canonicalTimeZone,
  isValidTimeZone,
  localDateOf,
  parseWorkoutDate,
  periodRanges,
  resolveDateRange,
} from './time';

const iso = (date: Date | undefined) => date?.toISOString();

describe('isValidTimeZone', () => {
  it.each(['UTC', 'Asia/Ho_Chi_Minh', 'America/New_York'])('accepts %s', (zone) => {
    expect(isValidTimeZone(zone)).toBe(true);
  });

  it.each(['Mars/Base', '', '+07:00', 'local'])('rejects %j', (zone) => {
    expect(isValidTimeZone(zone)).toBe(false);
  });
});

describe('canonicalTimeZone', () => {
  it.each([
    ['UTC', 'UTC'],
    ['utc', 'UTC'],
    ['Etc/UTC', 'UTC'],
    ['Asia/Ho_Chi_Minh', 'Asia/Ho_Chi_Minh'], // not ICU's legacy alias "Asia/Saigon"
    ['America/New_York', 'America/New_York'],
  ])('maps %s to %s', (input, expected) => {
    expect(canonicalTimeZone(input)).toBe(expected);
  });

  it('returns null for an unknown zone', () => {
    expect(canonicalTimeZone('Mars/Base')).toBeNull();
  });
});

describe('parseWorkoutDate (decision D2)', () => {
  it('reads a datetime with an offset as an exact instant and keeps the offset', () => {
    const result = parseWorkoutDate('2026-10-01T18:30:00+07:00');
    expect(result).toEqual({
      ok: true,
      value: { instant: new Date('2026-10-01T11:30:00Z'), utcOffsetMinutes: 420 },
    });
  });

  it('accepts Z and fractional seconds', () => {
    expect(parseWorkoutDate('2026-10-01T11:30:00.123Z')).toEqual({
      ok: true,
      value: { instant: new Date('2026-10-01T11:30:00.123Z'), utcOffsetMinutes: 0 },
    });
  });

  it('rejects a datetime without an offset instead of guessing the server timezone', () => {
    expect(parseWorkoutDate('2026-10-01T18:30:00')).toEqual({ ok: false, error: 'MISSING_OFFSET' });
  });

  it('reads a date-only value as the start of that day in the given timezone', () => {
    expect(parseWorkoutDate('2026-10-01', 'Asia/Ho_Chi_Minh')).toEqual({
      ok: true,
      value: { instant: new Date('2026-09-30T17:00:00Z'), utcOffsetMinutes: 420 },
    });
  });

  it('requires a timezone for a date-only value', () => {
    expect(parseWorkoutDate('2026-10-01')).toEqual({ ok: false, error: 'MISSING_TIMEZONE' });
  });

  it('rejects an unknown timezone', () => {
    expect(parseWorkoutDate('2026-10-01', 'Mars/Base')).toEqual({
      ok: false,
      error: 'INVALID_TIMEZONE',
    });
  });

  it('uses the first existing instant when midnight is skipped by DST (America/Santiago)', () => {
    // Chile moves clocks from 00:00 to 01:00 on 2026-09-06.
    const result = parseWorkoutDate('2026-09-06', 'America/Santiago');
    expect(result).toEqual({
      ok: true,
      value: { instant: new Date('2026-09-06T04:00:00Z'), utcOffsetMinutes: -180 },
    });
  });

  it.each([
    ['impossible calendar date', '2026-02-30'],
    ['impossible time', '2026-10-01T25:00:00Z'],
    ['offset beyond ±14:00', '2026-10-01T10:00:00+15:00'],
    ['free text', 'yesterday'],
    ['ISO week date', '2026-W40-4'],
    ['offset minutes out of range', '2026-10-01T18:30:00+07:99'],
    ['offset hours out of range', '2026-10-01T18:30:00+24:00'],
    ['hour 24', '2026-10-01T24:00:00Z'],
    ['lower-case designators', '2026-10-01t10:00:00z'],
    ['year before 1900', '0000-01-01T00:00:00Z'],
    ['year after 2100', '2101-01-01'],
    ['empty string', ''],
  ])('rejects %s', (_case, input) => {
    expect(parseWorkoutDate(input, 'UTC')).toEqual({ ok: false, error: 'INVALID_DATE' });
  });
});

describe('resolveDateRange', () => {
  it('turns inclusive date-only bounds into [start of from, start of the day after to) in the timezone', () => {
    const result = resolveDateRange({ from: '2026-09-01', to: '2026-09-30' }, 'Asia/Ho_Chi_Minh');
    expect(result.ok && [iso(result.value.gte), iso(result.value.lt)]).toEqual([
      '2026-08-31T17:00:00.000Z',
      '2026-09-30T17:00:00.000Z',
    ]);
  });

  it('handles a 23-hour DST day (America/New_York, 2026-03-08)', () => {
    const result = resolveDateRange({ from: '2026-03-08', to: '2026-03-08' }, 'America/New_York');
    expect(result.ok && [iso(result.value.gte), iso(result.value.lt)]).toEqual([
      '2026-03-08T05:00:00.000Z',
      '2026-03-09T04:00:00.000Z',
    ]);
  });

  it('treats a datetime "to" as inclusive', () => {
    const result = resolveDateRange({ to: '2026-10-01T12:00:00Z' }, 'UTC');
    expect(result.ok && [result.value.gte, iso(result.value.lt)]).toEqual([
      undefined,
      '2026-10-01T12:00:00.001Z',
    ]);
  });

  it('allows open-ended ranges', () => {
    expect(resolveDateRange({}, 'UTC')).toEqual({
      ok: true,
      value: { gte: undefined, lt: undefined },
    });
  });

  it('rejects from after to', () => {
    expect(resolveDateRange({ from: '2026-10-02', to: '2026-10-01' }, 'UTC')).toEqual({
      ok: false,
      error: 'INVALID_DATE_RANGE',
    });
  });

  it.each([
    [{ from: 'soon' }, 'UTC', 'INVALID_DATE'],
    [{ from: '2026-10-01T10:00:00' }, 'UTC', 'MISSING_OFFSET'],
    [{ from: '2026-10-01' }, 'Nowhere/City', 'INVALID_TIMEZONE'],
  ])('rejects %j in %s with %s', (range, zone, error) => {
    expect(resolveDateRange(range, zone)).toEqual({ ok: false, error });
  });
});

describe('periodRanges ("this month vs last month")', () => {
  it('compares the current period to date with the full previous period, in the requested timezone', () => {
    // 00:30 on 1 October in Hanoi is still 30 September in UTC.
    const now = new Date('2026-09-30T17:30:00Z');
    const ranges = periodRanges('month', now, 'Asia/Ho_Chi_Minh');
    expect([iso(ranges.current.gte), iso(ranges.current.lt)]).toEqual([
      '2026-09-30T17:00:00.000Z',
      '2026-09-30T17:30:00.001Z', // up to and including now: future-dated logs do not count
    ]);
    expect([iso(ranges.previous.gte), iso(ranges.previous.lt)]).toEqual([
      '2026-08-31T17:00:00.000Z',
      '2026-09-30T17:00:00.000Z',
    ]);
  });

  it('gives February 29 days in a leap year', () => {
    const { previous } = periodRanges('month', new Date('2028-03-10T00:00:00Z'), 'UTC');
    expect([iso(previous.gte), iso(previous.lt)]).toEqual([
      '2028-02-01T00:00:00.000Z',
      '2028-03-01T00:00:00.000Z',
    ]);
  });

  it('starts weeks on Monday (ISO)', () => {
    // 2026-10-04 is a Sunday.
    const ranges = periodRanges('week', new Date('2026-10-04T12:00:00Z'), 'UTC');
    expect(iso(ranges.current.gte)).toBe('2026-09-28T00:00:00.000Z');
    expect(iso(ranges.previous.gte)).toBe('2026-09-21T00:00:00.000Z');
  });

  it('compares calendar years', () => {
    const ranges = periodRanges('year', new Date('2026-06-15T00:00:00Z'), 'UTC');
    expect(iso(ranges.previous.gte)).toBe('2025-01-01T00:00:00.000Z');
    expect(iso(ranges.previous.lt)).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('invalid zones in internal helpers', () => {
  it('throws instead of returning invalid dates', () => {
    expect(() => periodRanges('month', new Date(), 'Nope/Zone')).toThrow(
      'Invalid time zone: Nope/Zone',
    );
    expect(() => localDateOf(new Date(), 'Nope/Zone')).toThrow('Invalid time zone: Nope/Zone');
  });
});

describe('localDateOf', () => {
  it('gives the calendar date of an instant in a timezone', () => {
    expect(localDateOf(new Date('2026-09-30T17:30:00Z'), 'Asia/Ho_Chi_Minh')).toBe('2026-10-01');
    expect(localDateOf(new Date('2026-09-30T17:30:00Z'), 'UTC')).toBe('2026-09-30');
  });

  it('accepts a fixed UTC offset in minutes (the offset stored with an entry)', () => {
    expect(localDateOf(new Date('2026-09-30T17:30:00Z'), 420)).toBe('2026-10-01');
    expect(localDateOf(new Date('2026-10-01T02:00:00Z'), -300)).toBe('2026-09-30');
  });
});
