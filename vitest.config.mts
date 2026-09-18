import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * The unit tier, run with `npm run test:unit`. It covers everything the app is built from —
 * pure logic, oRPC routers against a throwaway SQLite database, and React components/pages
 * rendered in jsdom — and CI fails unless every line and statement of the covered tree is
 * executed. Anything that needs a real browser (layout, navigation between pages, a full
 * production build) still belongs in the Playwright suite under `e2e/`.
 *
 * Two projects share one config: `.test.ts` files run in plain node, `.test.tsx` files get a
 * jsdom window. The shared harness lives in `test/`; each file there explains its part.
 */
const alias = { '@': fileURLToPath(new URL('.', import.meta.url)) }
// Playwright owns `e2e/**/*.spec.ts`; vitest only ever collects `*.test.ts(x)`.
const exclude = ['node_modules/**', 'e2e/**', '.next/**', 'generated/**', 'tmp/**', '.claude/**']

export default defineConfig({
  resolve: { alias },
  test: {
    globalSetup: ['./test/global-setup.ts'],
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'node',
          include: ['**/*.test.ts'],
          exclude,
          environment: 'node',
          setupFiles: ['./test/setup-db.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'dom',
          include: ['**/*.test.tsx'],
          exclude,
          environment: 'jsdom',
          setupFiles: ['./test/setup-db.ts', './test/setup-dom.ts'],
          // Page tests walk whole flows through real RPC calls; on a busy CI runner that
          // takes a few times longer than locally.
          testTimeout: 60_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['app/**', 'components/**', 'lib/**', 'server/**'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts'],
      reporter: ['text', 'html', 'lcov', 'json', 'json-summary'],
      // CI reads the summary even from a failed run, to show what was missed alongside the failure.
      reportOnFailure: true,
      reportsDirectory: './coverage',
      thresholds: { lines: 100, statements: 100 },
    },
  },
})
