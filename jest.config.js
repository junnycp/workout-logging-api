/** Unit tests: fast, no I/O. Integration tests live in test/ and use test/jest-e2e.config.js. */
module.exports = {
  rootDir: 'src',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  // The generated Prisma client (TypeScript) imports siblings with a .js extension.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: { '^.+\\.ts$': ['@swc/jest', require('./swc.jest.json')] },
};
