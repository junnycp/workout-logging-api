/** Integration tests: real Postgres via Testcontainers, the real Nest app via Supertest. */
module.exports = {
  rootDir: '..',
  testEnvironment: 'node',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  // The generated Prisma client (TypeScript) imports siblings with a .js extension.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: { '^.+\\.ts$': ['@swc/jest', require('../swc.jest.json')] },
  globalSetup: '<rootDir>/test/support/global-setup.ts',
  globalTeardown: '<rootDir>/test/support/global-teardown.ts',
  testTimeout: 30000,
  maxWorkers: 1,
};
