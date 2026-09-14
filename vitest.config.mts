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
 * jsdom window. `test/` holds the shared harness — `setup-db.ts` gives each test file its
 * own copy of a freshly migrated database, and `setup-dom.ts` wires Testing Library plus an
 * in-process bridge from the browser oRPC client to the real router.
 */
const alias = { '@': fileURLToPath(new URL('.', import.meta.url)) }
// Playwright owns `e2e/**/*.spec.ts`; vitest only ever collects `*.test.ts(x)`.
const exclude = ['node_modules/**', 'e2e/**', '.next/**', 'generated/**']

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
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['app/**', 'components/**', 'lib/**', 'server/**'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts'],
      reporter: ['text', 'html', 'lcov', 'json', 'json-summary'],
      reportsDirectory: './coverage',
      thresholds: { lines: 100, statements: 100 },
    },
  },
})
