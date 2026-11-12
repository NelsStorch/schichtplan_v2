import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit-Tests für reine Logik in src/lib (ohne Browser und ohne Backend)
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: { TZ: 'UTC' },
  },
});
