import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    globals: true,
    include: ['tests/**/*.test.ts'],
    testTimeout: 15000,
  },
});
