import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: [
      '.tmp-vitest/components/**/*.test.js',
      '.tmp-vitest/hooks/**/*.test.js',
      '.tmp-vitest/services/**/*.test.js',
      '.tmp-vitest/shared/**/*.test.js',
      '.tmp-vitest/utils/**/*.test.js',
    ],
    pool: 'threads',
    fileParallelism: false,
    setupFiles: ['./vitest.setup.js'],
  },
  resolve: {
    alias: {
      '#react-local': path.resolve(rootDir, 'node_modules/react/index.js'),
      '#react-dom-client-local': path.resolve(rootDir, 'node_modules/react-dom/client.js'),
      '#react-dom-test-utils-local': path.resolve(rootDir, 'node_modules/react-dom/test-utils.js'),
      'react/jsx-runtime': path.resolve(rootDir, 'node_modules/react/jsx-runtime.js'),
      'react/jsx-dev-runtime': path.resolve(rootDir, 'node_modules/react/jsx-dev-runtime.js'),
      react: path.resolve(rootDir, 'node_modules/react/index.js'),
      'react-dom': path.resolve(rootDir, 'node_modules/react-dom/index.js'),
      'react-dom/client': path.resolve(rootDir, 'node_modules/react-dom/client.js'),
    },
    preserveSymlinks: true,
  },
});
