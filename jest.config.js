module.exports = {
  projects: [
    '<rootDir>/packages/sdk',
    '<rootDir>/packages/shared',
    '<rootDir>/services/auth-service',
    '<rootDir>/services/webhook-service',
    '<rootDir>/services/tenant-service',
  ],
  coverageDirectory: '<rootDir>/coverage',
  collectCoverageFrom: [
    'packages/**/*.ts',
    'services/**/*.ts',
    '!**/*.d.ts',
    '!**/*.test.ts',
    '!**/*.spec.ts',
    '!**/node_modules/**',
    '!**/dist/**',
  ],
};
