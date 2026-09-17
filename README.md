# Catalyse

**Volunteer & Project Matching Platform for PauseAI**

Catalyse connects volunteers with projects, matching skills to needs and enabling effective coordination across PauseAI initiatives.

## Features

### For Volunteers

- **Browse Projects** - Filter by skills, status, urgency
- **Skill Matching** - See how well your skills match each project
- **Express Interest** - Apply to contribute or lead projects
- **Personal Dashboard** - Track your projects and interests
- **Privacy Controls** - Choose what info to share and how

### For Project Owners

- **Post Projects** - Describe needs, required skills, time commitment
- **Find Volunteers** - See interested volunteers and their skills
- **Team Communication** - Contact volunteers through the platform

### For Admins

- **Project Triage** - Review and approve volunteer proposals
- **Create Org Projects** - Post official PauseAI initiatives
- **Platform Stats** - Monitor volunteer and project activity

## Tech Stack

- **Frontend**: Next.js (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Next.js API routes
- **Database**: PostgreSQL via Prisma ORM
- **Email**: Resend SDK
- **Auth**: Custom token-based + Google OAuth
- **Hosting**: Railway

## Getting Started

### Prerequisites

- Node.js 22+
- npm
- A PostgreSQL 18 server. `docker compose up -d` starts one matching CI and production; a
  native install (Homebrew, apt, Postgres.app) works too — set `DATABASE_URL` accordingly.
  `pg_dump`/`pg_restore` are needed for `fetch-anonymised-db` and the backup job.

### Installation

```bash
npm run local-setup
```

This installs dependencies and Playwright browsers, restores an anonymised copy of production into your database, and runs migrations. Postgres must be running first.

### Environment

Copy `.env.local.example` to `.env.local` and fill in the values:

```bash
cp .env.local.example .env.local
```

Key variables:

- `DATABASE_URL` — Postgres connection URL (e.g. `postgresql://postgres:postgres@localhost:5432/catalyse`)
- `RESEND_API_KEY` — for email sending
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — for Google OAuth
- `STUB_EMAIL=true` — suppress real emails in development

### Running

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

### First-Time Setup

To make yourself an admin, add your email to `.env.local`:

```env
ADMIN_EMAILS=your@email.com
```

On next login, the app will automatically grant admin access. Multiple emails can be comma-separated.

## Database & Migrations

### Local dev database

The local dev database is a copy of prod with PII anonymised, restored into whatever `DATABASE_URL` points at. Refresh it with:

```bash
npm run fetch-anonymised-db && npm run migrate
```

`fetch-anonymised-db` downloads the anonymised copy of production from B2 and **drops and recreates the `public` schema** of the target database before restoring into it. It refuses to run when `RAILWAY_ENVIRONMENT_NAME=production`. `migrate` runs `prisma migrate deploy`, which applies any unapplied migration files in order without drift-checking.

The copy is already anonymised (fake names and contact details, redacted free text, dev accounts `volunteer@example.com` / `admin@example.com` / `superadmin@example.com` with password `password1`), so it needs only the read-only `B2_ANON_*` credentials — put them in `.env.b2` (gitignored). Ask a maintainer for them.

Unit tests create a throwaway schema per test file (`vitest_*`) in the same database, and e2e workers use `e2e_<n>`; neither touches `public`.

### Adding a migration

Do **not** use `prisma migrate dev` — it checks for schema drift against the live DB and will fail. The correct workflow:

1. Edit `prisma/schema.prisma`
2. Generate the migration file:
   ```bash
   npm run new-migration your_migration_name
   ```
   This creates `prisma/migrations/YYYYMMDDHHMMSS_your_migration_name/migration.sql` with the diff SQL.
3. **Review the generated SQL** — the diff may include unrelated pending changes from other branches. Remove any statements not relevant to your change.
4. Apply it:
   ```bash
   npm run migrate
   ```
5. Regenerate the Prisma client:
   ```bash
   npx prisma generate
   ```

### Backups and the anonymised copy

Two Backblaze B2 buckets, two kinds of key:

| Bucket                | Contents                                                          | Who holds a key                                                                                            |
| --------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `B2_BUCKET_NAME`      | Raw nightly `pg_dump`s under `backups/`, pruned after 30 days     | Production only (`B2_KEY_ID` / `B2_APP_KEY`, read+write+delete)                                            |
| `B2_ANON_BUCKET_NAME` | One file, `latest.dump`: yesterday's production with PII stripped | Production writes it (`B2_ANON_*` write key); PR environments, staging and developers hold a read-only key |

The nightly backup job (`jobs/backup.ts`) dumps production, uploads the raw dump, then restores it into the scratch database `catalyse_anon` on the same Postgres server, runs the anonymiser (`jobs/anonymise.ts`), dumps that and overwrites `latest.dump`. Raw personal data therefore never leaves the production environment; nothing else ever needs the raw-bucket key. Set the anonymised bucket's lifecycle rule to keep only the latest version of each file.

On Railway, `B2_*` must be environment-specific variables on the production environment, never shared, and `B2_ANON_*` on PR environments must be the read-only key. Preview containers seed themselves from `latest.dump` on first start when their database is empty (`scripts/seed-preview.ts`); set `SEED_PREVIEW_FORCE=1` to reseed.

## Testing

### Running tests

```bash
npm run test:unit       # Run unit tests only (vitest)
npm run test:e2e        # Run e2e tests only (Playwright)
npm run test:e2e:headed # Run with a visible browser (single worker, slowed)
npm run test:e2e:ui     # Open Playwright UI mode
```

Tests spin up an isolated Next.js server with a fresh database — your dev server doesn't need to be running.

The `test:e2e:dev` variants skip the build and use a dev server instead. These are for interactive development only — do not use them to verify correctness, as they skip type checking and build validation.

## Scripts Reference

| Script                | Description                                                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `local-setup`         | One-time local setup: install deps, browsers, fetch anonymised DB, run migrations                                                               |
| `issue <number>`      | Launch a sandboxed Claude session to work on a GitHub issue (creates branch, fetches issue, restricts CLI access). Usage: `npm run issue -- 84` |
| `check-all`           | Run typecheck, lint, format check, and tests — use before committing                                                                            |
| `dev`                 | Start local dev server with Turbopack                                                                                                           |
| `build`               | Generate Prisma client and run Next.js production build                                                                                         |
| `start`               | Start production server (requires prior `build`)                                                                                                |
| `typecheck`           | Run TypeScript type checking without emitting files                                                                                             |
| `lint`                | Run ESLint                                                                                                                                      |
| `lint:fix`            | Run ESLint with auto-fix                                                                                                                        |
| `format`              | Format all files with Prettier                                                                                                                  |
| `format:check`        | Check formatting without writing                                                                                                                |
| `generate`            | Regenerate Prisma client and run post-generation script                                                                                         |
| `build:railway`       | Production build entrypoint used by Railway CI                                                                                                  |
| `new-migration`       | Create a new migration SQL file from schema diff                                                                                                |
| `migrate`             | Apply pending migration files to the local database                                                                                             |
| `fetch-anonymised-db` | Restore the anonymised copy of production into DATABASE_URL                                                                                     |
| `install:browsers`    | Install Playwright's Chromium browser                                                                                                           |
| `test:unit`           | Run unit tests with vitest                                                                                                                      |
| `test:unit:watch`     | Run vitest in watch mode                                                                                                                        |
| `test:e2e`            | Run all e2e tests (builds first, then spins up isolated servers)                                                                                |
| `test:e2e:dev`        | Run e2e tests against a dev server — skips build, for interactive development only                                                              |
| `test:e2e:log`        | Run e2e tests and save full output to `test-output.txt`                                                                                         |
| `test:e2e:headed`     | Run e2e tests with a visible browser, single worker                                                                                             |
| `test:e2e:ui`         | Open Playwright UI mode for interactive test debugging                                                                                          |
| `cron:backup`         | Run the database backup cron job                                                                                                                |
| `demo`                | Run the demo data seeding script                                                                                                                |
| `demo:snapshot`       | Take a snapshot of the current demo state                                                                                                       |
| `demo:compare`        | Compare current demo state against snapshot                                                                                                     |

## Project Structure

```text
catalyse/
├── app/                    # App Router pages and API routes
├── components/             # Shared React components
├── lib/                    # Auth, email, Prisma, utilities
├── prisma/                 # Prisma schema and migrations
├── public/                 # Static assets
├── scripts/                # Build and utility scripts
└── e2e/                    # Playwright end-to-end tests
```

## License

MIT - Built for PauseAI
