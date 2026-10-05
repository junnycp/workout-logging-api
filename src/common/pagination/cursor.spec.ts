import { decodeCursor, encodeCursor } from './cursor';

const position = {
  performedAt: new Date('2026-10-01T11:30:00.123Z'),
  id: '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
};
const encodeRaw = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

describe('pagination cursor', () => {
  it('round-trips the keyset position', () => {
    expect(decodeCursor(encodeCursor(position))).toEqual(position);
  });

  it('is URL-safe and opaque', () => {
    expect(encodeCursor(position)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ['empty', ''],
    ['not base64url', '!!!'],
    ['not JSON', Buffer.from('hello').toString('base64url')],
    ['JSON but not an object', encodeRaw([1, 2])],
    ['missing id', encodeRaw({ p: '2026-10-01T11:30:00.123Z' })],
    ['id not a UUID', encodeRaw({ p: '2026-10-01T11:30:00.123Z', i: "1' OR '1'='1" })],
    ['date not ISO', encodeRaw({ p: 'yesterday', i: position.id })],
    ['date impossible', encodeRaw({ p: '2026-02-30T00:00:00.000Z', i: position.id })],
    ['too long', 'a'.repeat(300)],
  ])('rejects a cursor that is %s', (_case, cursor) => {
    expect(decodeCursor(cursor)).toBeNull();
  });
});
