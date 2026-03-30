module.exports = {
  testMatch: ['**/tests/persistence/**/*.test.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { useESM: false }] },
  testEnvironment: 'node',
  extensionsToTreatAsEsm: [],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  }
};
