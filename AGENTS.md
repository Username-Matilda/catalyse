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
