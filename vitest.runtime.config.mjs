import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['.tmp-vitest/hooks/**/*.test.js', '.tmp-vitest/services/**/*.test.js', '.tmp-vitest/utils/**/*.test.js'],
    pool: 'threads',
    fileParallelism: false,
    setupFiles: ['./vitest.setup.js'],
  },
  resolve: {
    alias: {
      '@testing-library/react': path.resolve(rootDir, '.tmp-vitest/test-support/testing-library-react.js'),
      '#react-local': path.resolve(rootDir, 'node_modules/react/index.js'),
      '#react-dom-client-local': path.resolve(rootDir, 'node_modules/react-dom/client.js'),
      '#react-dom-test-utils-local': path.resolve(rootDir, 'node_modules/react-dom/test-utils.js'),
      react: path.resolve(rootDir, 'node_modules/react/index.js'),
      'react/jsx-runtime': path.resolve(rootDir, 'node_modules/react/jsx-runtime.js'),
      'react-dom': path.resolve(rootDir, 'node_modules/react-dom/index.js'),
      'react-dom/client': path.resolve(rootDir, 'node_modules/react-dom/client.js'),
    },
    preserveSymlinks: true,
  },
});
