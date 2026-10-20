import { defineConfig } from 'vitest/config';

// Unit-Tests (src/**/*.test.ts) laufen ohne Datenbank. Die API-Tests (test/**/*.test.ts) brauchen
// TEST_DATABASE_URL (eine leere, migrierte Test-DB) und werden sonst übersprungen. Sie teilen sich
// die DB und laufen deshalb nacheinander.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
