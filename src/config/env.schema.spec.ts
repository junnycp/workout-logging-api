import { envSchema } from './env.schema';

const valid = { DATABASE_URL: 'postgresql://user:pass@localhost:5432/workouts' };

describe('envSchema', () => {
  it('applies defaults when only DATABASE_URL is provided', () => {
    expect(envSchema.parse(valid)).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      DATABASE_URL: valid.DATABASE_URL,
    });
  });

  it('coerces PORT from the string environment value', () => {
    expect(envSchema.parse({ ...valid, PORT: '8080' }).PORT).toBe(8080);
  });

  it.each([
    ['missing DATABASE_URL', {}],
    ['non-postgres DATABASE_URL', { DATABASE_URL: 'mysql://localhost/db' }],
    ['PORT out of range', { ...valid, PORT: '70000' }],
    ['PORT not a number', { ...valid, PORT: 'abc' }],
    ['unknown NODE_ENV', { ...valid, NODE_ENV: 'staging' }],
    ['unknown LOG_LEVEL', { ...valid, LOG_LEVEL: 'verbose' }],
  ])('rejects %s', (_case, env) => {
    expect(envSchema.safeParse(env).success).toBe(false);
  });
});
