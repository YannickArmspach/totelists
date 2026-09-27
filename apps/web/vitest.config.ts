import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    // Required for @testing-library/react to auto-register its afterEach
    // cleanup. Without it, rendered DOM leaks between tests in a file.
    globals: true,
  },
  resolve: {
    alias: {
      '#': new URL('./src', import.meta.url).pathname,
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
})
