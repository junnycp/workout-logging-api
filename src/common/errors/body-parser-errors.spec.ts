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

  it.each([
    ['encoding.unsupported', 415, 'UNSUPPORTED_MEDIA_TYPE'],
    ['charset.unsupported', 415, 'UNSUPPORTED_MEDIA_TYPE'],
    ['request.aborted', 400, 'BAD_REQUEST'],
    ['request.size.invalid', 400, 'BAD_REQUEST'],
  ])('keeps the 4xx status of other body-parser errors (%s)', (type, status, code) => {
    const forwarded = run(
      Object.assign(new Error('parser said no'), { type, status, expose: true }),
    );
    expect(forwarded).toMatchObject({ code, message: 'parser said no' });
    expect((forwarded as AppException).getStatus()).toBe(status);
  });

  it('does not echo a parser message that is not marked as exposable', () => {
    const forwarded = run(
      Object.assign(new Error('internal detail'), { type: 'x', status: 400, expose: false }),
    );
    expect(forwarded).toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Request could not be processed',
    });
  });

  it('forwards unrelated errors unchanged', () => {
    const other = new Error('boom');
    expect(run(other)).toBe(other);
  });
});
