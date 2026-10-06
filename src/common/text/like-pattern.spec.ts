import { escapeLikePattern } from './like-pattern';

describe('escapeLikePattern', () => {
  it('leaves ordinary text unchanged', () => {
    expect(escapeLikePattern('bench press')).toBe('bench press');
  });

  it.each([
    ['%', '\\%'],
    ['_', '\\_'],
    ['50%_off', '50\\%\\_off'],
  ])('escapes the LIKE wildcards in %j', (input, expected) => {
    expect(escapeLikePattern(input)).toBe(expected);
  });

  it('escapes the escape character itself first, so it cannot cancel a later escape', () => {
    expect(escapeLikePattern('a\\%')).toBe('a\\\\\\%');
  });
});
