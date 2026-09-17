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

Comments describe the code as it stands — never the edit, never a measurement, never twice. The reader holds none of your context: not what the code looked like before, not what you rejected, not what a run reported last week. Check every comment against these four failures before committing:

- **Describing the edit.** "now", "no longer", "as before"; "rather than X" where X is what the code used to do; "without a tiebreak of its own"; "the one test covers both". If the previous version of the file is needed for the comment to make sense, the comment fails.
- **A number that will rot.** "a fifth of the platform's mutants", "1790 of 1880 tests", "roughly thirty survivors". True once, wrong soon. Write the durable version — "the map is large and stands apart" — and put the measurement in the commit message, which carries its own date.
- **Saying it seven times.** One explanation copied to every call site is seven things that must stay true. Say it once where you define the thing; at the other sites one line naming it is enough.
- **Excessive length.** Don't spread over three lines what one says. Every line costs the reader time, and they skip a long comment whole, including the part that mattered. Cut until only what they could not have worked out remains.

## Testing and coverage

`npm run test:unit` runs vitest with coverage; CI fails below 100% line and statement coverage for `app/**`, `components/**`, `lib/**` and `server/**` (branch coverage will follow). Coverage is a floor on what is exercised, not a licence to reshape code:

- **Never** use `/* v8 ignore */`, `/* istanbul ignore */` or any coverage-exclusion comment.
- Don't remove a defensive guard, or replace it with a `!` non-null assertion, to make an unreachable line disappear. Reach it with a test (a form submits on Enter even when the button is disabled; a database row can hold what the API refuses; an evicted cache entry is a real state), or narrow the type at the call site so the guard is unnecessary. If a line genuinely cannot execute, say so in the PR so a reviewer can decide.
- Router tests run against a real per-file SQLite database (`test/setup-db.ts`); component tests render in jsdom with `fetch` routed into the real oRPC handler (`test/setup-dom.ts`). Prefer these over mocking modules; mock only the network edge (email, Google, rate limiting).
- Modules that read `process.env` at import time are configured in `test/setup-db.ts`; a test needing a different value must `vi.resetModules()` and re-import, so prefer reading env at call time in new code.
