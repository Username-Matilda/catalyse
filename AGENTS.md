<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## Database migrations

Do **not** run `prisma migrate dev` — it checks for schema drift and will fail. To add a migration:

1. Edit `prisma/schema.prisma`
2. `npm run new-migration your_migration_name` — generates the SQL diff file
3. Review the generated SQL and remove any unrelated statements
   - Adding a `NOT NULL` column: if existing rows need a value other than the column default, backfill them in the same migration. SQLite's table-rebuild (`INSERT INTO "new_x" (...) SELECT ... FROM "x"`) silently applies the column default to every existing row — it does not run any backfill logic for you.
4. `npm run migrate` — applies it
5. `npm run generate` — regenerates the client and zod schema

## Verifying changes

Run `npm run check-all` when work is complete and before raising a PR, to verify typecheck, lint, formatting, and tests all pass. This takes several minutes — lint is ~3s cached (~70s cold), tests are ~2.5–3 min. Do not abort early.

If `format:check` fails, run `npm run format` to fix all files at once — do not run `prettier --write` on individual files.

## Comments

Comments say why, not what; if the code needs a comment to say what it does, change the code.

- Never add a comment to justify removing a guard or a check — keep the guard, or make the state impossible through types.
- Attach comments to what they describe: a function's comment sits directly above it, never between a doc block and the function.
- Don't restate the line below it, and don't narrate test steps that the assertions already make obvious.
- A comment that names a caller, a component or an invariant elsewhere must stay true when that code changes — prefer a type or a test over a promise in prose.

## Testing and coverage

`npm run test:unit` runs vitest with coverage; CI fails below 100% line and statement coverage for `app/**`, `components/**`, `lib/**` and `server/**` (branch coverage will follow). Coverage is a floor on what is exercised, not a licence to reshape code:

- **Never** use `/* v8 ignore */`, `/* istanbul ignore */` or any coverage-exclusion comment.
- Don't remove a defensive guard, or replace it with a `!` non-null assertion, to make an unreachable line disappear. Reach it with a test (a form submits on Enter even when the button is disabled; a database row can hold what the API refuses; an evicted cache entry is a real state), or narrow the type at the call site so the guard is unnecessary. If a line genuinely cannot execute, say so in the PR so a reviewer can decide.
- Router tests run against a real per-file SQLite database (`test/setup-db.ts`); component tests render in jsdom with `fetch` routed into the real oRPC handler (`test/setup-dom.ts`). Prefer these over mocking modules; mock only the network edge (email, Google, rate limiting).
- Modules that read `process.env` at import time are configured in `test/setup-db.ts`; a test needing a different value must `vi.resetModules()` and re-import, so prefer reading env at call time in new code.
