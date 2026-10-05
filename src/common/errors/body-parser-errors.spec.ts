import { AppException } from './app-exception';
import { mapBodyParserErrors } from './body-parser-errors';

function run(err: unknown) {
  const next = jest.fn();
  mapBodyParserErrors(err, {} as never, {} as never, next);
  const [[forwarded]] = next.mock.calls as [[unknown]];
  return forwarded;
}

describe('mapBodyParserErrors', () => {
  it('turns invalid JSON into 400 MALFORMED_JSON', () => {
    const forwarded = run(
      Object.assign(new SyntaxError('Unexpected token'), { type: 'entity.parse.failed' }),
    );
    expect(forwarded).toBeInstanceOf(AppException);
    expect(forwarded).toMatchObject({
      code: 'MALFORMED_JSON',
      message: 'Request body is not valid JSON',
    });
    expect((forwarded as AppException).getStatus()).toBe(400);
  });

  it('turns an oversized body into 413 PAYLOAD_TOO_LARGE including the limit', () => {
    const forwarded = run(
      Object.assign(new Error('too large'), { type: 'entity.too.large', limit: 1048576 }),
    );
    expect(forwarded).toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body exceeds 1048576 bytes',
    });
    expect((forwarded as AppException).getStatus()).toBe(413);
  });

  it('forwards unrelated errors unchanged', () => {
    const other = new Error('boom');
    expect(run(other)).toBe(other);
  });
});
