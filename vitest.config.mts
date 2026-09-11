import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * The unit tier. It covers the pure logic the timeline is built on — date arithmetic, window
 * selection, pixel geometry — where the interesting cases are edge cases (a scope entirely in
 * the past, a bar straddling the window edge, a zero-day milestone) and driving a browser to
 * reach them would be slow and indirect. Anything that needs a database, a request or a rendered
 * page belongs in the Playwright suite instead.
 */
export default defineConfig({
  test: {
    // Playwright owns `e2e/**/*.spec.ts`; vitest only ever collects `*.test.ts`.
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', 'e2e/**', '.next/**', 'generated/**'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
})
