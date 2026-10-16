import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    // Starting an in-memory MongoDB can be slow on the first run.
    hookTimeout: 60_000,
  },
});
