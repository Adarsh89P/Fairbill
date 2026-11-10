/** Unit tests for the pure TypeScript engines (no React Native needed). */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: { strict: true, esModuleInterop: true, isolatedModules: true, rootDir: './src', types: ['jest'] } }] },
};
