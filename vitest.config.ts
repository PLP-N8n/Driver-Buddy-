import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    preserveSymlinks: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: [
      'hooks/**/*.test.ts',
      'services/**/*.test.ts',
      'shared/**/*.test.ts',
      'utils/**/*.test.ts',
    ],
    exclude: ['e2e/**', '.tmp-unit/**', '.tmp-unit-run/**', '.tmp-unit-run2/**', '.tmp-unit-run3/**'],
    pool: 'threads',
    fileParallelism: false,
    setupFiles: ['./vitest.setup.ts'],
  },
});
