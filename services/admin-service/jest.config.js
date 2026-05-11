module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@t3ck/shared$': '<rootDir>/../../packages/shared/src',
    '^xlsx$': '<rootDir>/src/test-support/xlsx-shim.ts',
  },
};
