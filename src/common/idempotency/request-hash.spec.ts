import { canonicalJson, requestHash } from './request-hash';

describe('canonicalJson', () => {
  it('sorts object keys recursively but keeps array order', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, 1], c: null } })).toBe(
      '{"a":{"c":null,"d":[3,1]},"b":1}',
    );
  });
});

describe('requestHash', () => {
  it('is the same for bodies that differ only in key order', () => {
    expect(requestHash({ a: 1, b: [{ y: 2, x: 1 }] })).toBe(
      requestHash({ b: [{ x: 1, y: 2 }], a: 1 }),
    );
  });

  it('differs when a value differs', () => {
    expect(requestHash({ reps: 5 })).not.toBe(requestHash({ reps: 6 }));
  });

  it('differs when array order differs (set order is meaningful)', () => {
    expect(requestHash([1, 2])).not.toBe(requestHash([2, 1]));
  });

  it('is a 64-character hex SHA-256', () => {
    expect(requestHash({})).toMatch(/^[0-9a-f]{64}$/);
  });
});
