import { REQUEST_ID_HEADER, resolveRequestId } from './request-id';

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('resolveRequestId', () => {
  it('uses the lower-case x-request-id header name', () => {
    expect(REQUEST_ID_HEADER).toBe('x-request-id');
  });

  it('reuses a well-formed incoming request id', () => {
    expect(resolveRequestId('abc-123_DEF.4')).toBe('abc-123_DEF.4');
  });

  it('generates a UUID when the header is missing', () => {
    expect(resolveRequestId(undefined)).toMatch(uuidV4);
  });

  it.each([
    ['empty', ''],
    ['too long', 'a'.repeat(129)],
    ['log-injection characters', 'id\nlevel=fatal'],
    ['spaces', 'two words'],
  ])('replaces a %s header with a generated UUID', (_case, value) => {
    expect(resolveRequestId(value)).toMatch(uuidV4);
  });

  it('uses the first value when the header is repeated', () => {
    expect(resolveRequestId(['first-id', 'second-id'])).toBe('first-id');
  });
});
