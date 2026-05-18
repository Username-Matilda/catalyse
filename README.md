# Catalyse

**Volunteer & Project Matching Platform for PauseAI UK**

Catalyse connects volunteers with projects, matching skills to needs and enabling effective coordination across PauseAI UK initiatives.

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
- **Database**: SQLite via Prisma ORM
- **Email**: Resend SDK
- **Auth**: Custom token-based + Google OAuth
- **Hosting**: Railway

## Getting Started

### Prerequisites

- Node.js 22+
- npm

### Installation

```bash
npm run local-setup
```

This installs dependencies, Playwright browsers, downloads the anonymised prod database, and runs migrations.

### Environment

Copy `.env.local.example` to `.env.local` and fill in the values:

```bash
cp .env.local.example .env.local
```

Key variables:

- `DATABASE_URL` — path to SQLite file (e.g. `file:../catalyse.db`)
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

The local dev database (`db/anonymised_prod.db`) is a fresh copy of prod with PII anonymised. Refresh it with:

```bash
npm run fetch-prod-db && npm run migrate
```

`fetch-prod-db` downloads the latest prod backup and anonymises it. `migrate` runs `prisma migrate deploy`, which applies any unapplied migration files in order without drift-checking.

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

## Testing

### Running tests

```bash
npm test               # Run all e2e tests headlessly
npm run test:headed    # Run with a visible browser (single worker, slowed)
npm run test:ui        # Open Playwright UI mode
```

Tests spin up an isolated Next.js server with a fresh database — your dev server doesn't need to be running.

The `test:dev` variants skip the build and use a dev server instead. These are for interactive development only — do not use them to verify correctness, as they skip type checking and build validation.

## Scripts Reference

| Script             | Description                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `local-setup`      | One-time local setup: install deps, browsers, fetch prod DB, run migrations                                                                     |
| `issue <number>`   | Launch a sandboxed Claude session to work on a GitHub issue (creates branch, fetches issue, restricts CLI access). Usage: `npm run issue -- 84` |
| `check-all`        | Run typecheck, lint, format check, and tests — use before committing                                                                            |
| `dev`              | Start local dev server with Turbopack                                                                                                           |
| `build`            | Generate Prisma client and run Next.js production build                                                                                         |
| `start`            | Start production server (requires prior `build`)                                                                                                |
| `typecheck`        | Run TypeScript type checking without emitting files                                                                                             |
| `lint`             | Run ESLint                                                                                                                                      |
| `lint:fix`         | Run ESLint with auto-fix                                                                                                                        |
| `format`           | Format all files with Prettier                                                                                                                  |
| `format:check`     | Check formatting without writing                                                                                                                |
| `generate`         | Regenerate Prisma client and run post-generation script                                                                                         |
| `build:railway`    | Production build entrypoint used by Railway CI                                                                                                  |
| `new-migration`    | Create a new migration SQL file from schema diff                                                                                                |
| `migrate`          | Apply pending migration files to the local database                                                                                             |
| `fetch-prod-db`    | Download latest prod backup and anonymise PII for local use                                                                                     |
| `install:browsers` | Install Playwright's Chromium browser                                                                                                           |
| `test`             | Run all e2e tests (builds first, then spins up isolated servers)                                                                                |
| `test:dev`         | Run e2e tests against a dev server — skips build, for interactive development only                                                              |
| `test:log`         | Run tests and save full output to `test-output.txt`                                                                                             |
| `test:headed`      | Run tests with a visible browser, single worker                                                                                                 |
| `test:ui`          | Open Playwright UI mode for interactive test debugging                                                                                          |
| `cron:backup`      | Run the database backup cron job                                                                                                                |
| `demo`             | Run the demo data seeding script                                                                                                                |
| `demo:snapshot`    | Take a snapshot of the current demo state                                                                                                       |
| `demo:compare`     | Compare current demo state against snapshot                                                                                                     |

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

MIT - Built for PauseAI UK
