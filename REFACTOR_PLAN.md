# Refactor Plan: FastAPI + Vanilla JS → Next.js + Prisma

## Overview

Catalyse is currently a single FastAPI service (`api.py`, ~4,200 lines) serving both a REST API and static HTML/JS files, backed by SQLite. The goal is to migrate to a Next.js frontend with Next.js API routes and Prisma as the data layer, keeping SQLite for now (Prisma supports it and it's already on Railway).

The migration uses the **strangler fig pattern**: the new Next.js app is built incrementally alongside the existing one. The existing e2e test suite validates each phase before moving on. FastAPI is only retired once everything is replaced.

> **Railway volume constraint:** Railway does not support mounting a single volume to multiple services simultaneously. This means the two services cannot run in production at the same time against the same SQLite file. The approach is therefore: keep the existing FastAPI service running on Railway untouched throughout the migration, do all phase work and validation locally, and only deploy Next.js to Railway at the final cutover in Phase 7 (replacing the FastAPI service entirely).

---

## Current Stack

| Concern  | Current                                               |
| -------- | ----------------------------------------------------- |
| Frontend | 20 static HTML pages + `app.js` (34KB) + `styles.css` |
| Backend  | `api.py` (FastAPI, ~4,200 lines, 75+ endpoints)       |
| Email    | `email_service.py` (Resend API, raw HTTP)             |
| Database | SQLite, 9 migrations, `schema.sql` as source of truth |
| Auth     | Custom token-based + Google OAuth                     |
| Hosting  | Railway (single service, SQLite on mounted volume)    |

## Target Stack

| Concern  | Target                                                              |
| -------- | ------------------------------------------------------------------- |
| Frontend | Next.js (App Router), React components                              |
| Backend  | Next.js API routes                                                  |
| Email    | Resend SDK (`resend` npm package)                                   |
| Database | SQLite (unchanged file), accessed via Prisma ORM                    |
| Auth     | Custom token logic ported to Next.js (or NextAuth for Google OAuth) |
| Hosting  | Railway (single Next.js service, same SQLite volume)                |

---

## Guiding Principles

- **One phase at a time.** Each phase should be fully working locally before moving on.
- **E2e tests gate each phase.** Run the full test suite before closing a phase. Don't move on if tests are failing.
- **Validate locally, deploy once.** During Phases 1–7, the FastAPI service stays live on Railway unchanged. All development and validation happens locally. The Next.js service is only deployed to Railway at the Phase 7 cutover.
- **No client changes until the server route is ready.** When migrating an API route group, update the HTML frontend to call the Next.js endpoint only after the Next.js route is tested locally and e2e tests pass.
- **Keep FastAPI running until all routes are migrated.** Don't remove it piecemeal — retire it in one go at the end of Phase 7.

---

## Phase 1: Scaffold + Prisma Schema

**Goal:** Next.js app boots, Prisma can read the database. No behaviour changes, no frontend changes.

### Steps

1. Create `web/` directory in this repo. Initialise a Next.js 14+ project (App Router, TypeScript) there.
2. Add Prisma: `npm install prisma @prisma/client`. Run `prisma init --datasource-provider sqlite`.
3. Set `DATABASE_URL="file:../../anonymised_prod.db"` in `web/.env` and run `prisma db pull` to introspect the database and generate `schema.prisma` automatically. Review and tidy the output (relation field names, `@map`/`@@map` conventions). The key models are:
   - `Volunteer` (auth tokens, skills, admin flag, privacy settings, GDPR consent)
   - `Skill` + `SkillCategory`
   - `VolunteerSkill` (junction with proficiency level)
   - `Project` (status workflow, owner, skill requirements)
   - `ProjectSkill` (junction with required/nice-to-have)
   - `StarterTask` (assignment, submission, review)
   - `AdminNote` (category: skill_feedback / reliability / fit / general)
   - `Message` + `Notification`
   - `AdminInvite`
   - `BugReport`
4. Run `prisma migrate dev --name baseline` to snapshot the introspected schema as the baseline migration. This will be a no-op against an existing database.
5. Add a health check route: `GET /api/health` returns `{ ok: true }`.
6. Confirm the Next.js app starts locally and the health check responds.

**Done when:** Next.js runs locally, Prisma can query the local DB, e2e tests still pass against the existing FastAPI service.

---

## Phase 2: Auth Routes

**Goal:** Auth is the most self-contained route group. Migrating it first proves the pattern for everything that follows.

### Endpoints to migrate

| Method | Path                         |
| ------ | ---------------------------- |
| POST   | `/api/auth/signup`           |
| POST   | `/api/auth/login`            |
| POST   | `/api/auth/logout`           |
| GET    | `/api/auth/me`               |
| POST   | `/api/auth/forgot-password`  |
| POST   | `/api/auth/reset-password`   |
| POST   | `/api/auth/change-password`  |
| POST   | `/api/auth/change-email`     |
| POST   | `/api/auth/delete-account`   |
| GET    | `/api/auth/google-client-id` |
| POST   | `/api/auth/google`           |

### Steps

1. Install `resend` npm package. Port `email_service.py` to a TypeScript `lib/email.ts` module using the Resend SDK. Email types to support: password reset, admin invite, welcome, relay message, digest, project notification.
2. Implement a `lib/auth.ts` helper that: hashes passwords (use `bcrypt` or port the existing PBKDF2 logic), generates/validates session tokens, and reads the current volunteer from the `Authorization` header. Match the existing token format exactly so existing sessions continue to work.
3. Implement each auth endpoint as a Next.js API route under `app/api/auth/`. Port the logic from `api.py` line-for-line — do not redesign at this stage.
4. Port the friendly validation error format from `api.py` (`_friendly_validation_error`) so error messages match what the frontend expects.
5. Update the HTML frontend to point all auth API calls at the Next.js service URL instead of the FastAPI service. (At this point the FastAPI auth routes can still be left in place — just unused by the frontend.)
6. Run e2e tests.
7. Once tests pass: remove the auth routes from `api.py` (or comment them out and leave removal for Phase 8).

**Done when:** All auth e2e scenarios pass against the Next.js service.

### Notes

- The existing session tokens are stored in the `volunteers` table as `auth_token`. Prisma can read/write these directly — no token migration needed.
- Google OAuth: the existing flow exchanges a Google `code` for a token and upserts the volunteer. Port this logic directly; don't introduce NextAuth yet (that's a larger change and can be done post-migration).

---

## Phase 3: Skills Routes

**Goal:** Small, mostly read-only route group. Good second migration to validate Prisma queries.

### Endpoints to migrate

| Method | Path                               | Auth  |
| ------ | ---------------------------------- | ----- |
| GET    | `/api/skills`                      | —     |
| GET    | `/api/skills/flat`                 | —     |
| GET    | `/api/admin/skill-categories`      | Admin |
| POST   | `/api/admin/skill-categories`      | Admin |
| PUT    | `/api/admin/skill-categories/{id}` | Admin |
| DELETE | `/api/admin/skill-categories/{id}` | Admin |
| POST   | `/api/admin/skills`                | Admin |
| PUT    | `/api/admin/skills/{id}`           | Admin |
| DELETE | `/api/admin/skills/{id}`           | Admin |

### Steps

1. Implement the skill routes in `app/api/skills/` and `app/api/admin/skill-categories/`.
2. The `GET /api/skills` response is a nested tree (categories → skills). Build this with a Prisma `include` rather than raw SQL joins.
3. Port admin auth guard (reuse the `lib/auth.ts` helper from Phase 2, adding an `isAdmin` check).
4. Update the frontend, run e2e tests.

**Done when:** Skills e2e scenarios pass.

---

## Phase 4: Volunteers Routes

### Endpoints to migrate

| Method | Path                   | Auth                       |
| ------ | ---------------------- | -------------------------- |
| GET    | `/api/volunteers`      | Authenticated              |
| GET    | `/api/volunteers/{id}` | Authenticated              |
| PUT    | `/api/volunteers/me`   | Authenticated (own record) |
| GET    | `/api/dashboard`       | Authenticated              |

### Steps

1. Implement volunteer routes. The `GET /api/volunteers` list endpoint applies skill-based filtering and match scoring — port the scoring logic to TypeScript in `lib/matching.ts`.
2. The `PUT /api/volunteers/me` endpoint updates skills, availability, and contact preferences atomically (several nested upserts). Use a Prisma transaction.
3. The `GET /api/dashboard` aggregates projects the volunteer owns, is interested in, and starter tasks. Compose this from multiple Prisma queries inside the route handler.
4. Update the frontend, run e2e tests.

**Done when:** Volunteer and dashboard e2e scenarios pass.

---

## Phase 5: Projects, Interests, and Tasks

This is the largest route group. Break the PR into sub-groups if needed.

### Endpoints to migrate

**Projects (core)**

| Method | Path                 |
| ------ | -------------------- |
| GET    | `/api/projects`      |
| GET    | `/api/projects/{id}` |
| POST   | `/api/projects`      |
| PUT    | `/api/projects/{id}` |
| DELETE | `/api/projects/{id}` |

**Interest**

| Method | Path                                        |
| ------ | ------------------------------------------- |
| POST   | `/api/projects/{id}/interest`               |
| PUT    | `/api/projects/{id}/interest/{interest_id}` |
| DELETE | `/api/projects/{id}/interest`               |

**Assignment + updates**

| Method | Path                         |
| ------ | ---------------------------- |
| POST   | `/api/projects/{id}/assign`  |
| POST   | `/api/projects/{id}/updates` |

**Tasks**

| Method | Path                                 |
| ------ | ------------------------------------ |
| GET    | `/api/projects/{id}/tasks`           |
| POST   | `/api/projects/{id}/tasks`           |
| PUT    | `/api/projects/{id}/tasks/{task_id}` |
| DELETE | `/api/projects/{id}/tasks/{task_id}` |

**Starter tasks**

| Method | Path                             |
| ------ | -------------------------------- |
| GET    | `/api/starter-tasks/available`   |
| GET    | `/api/starter-tasks`             |
| GET    | `/api/my/starter-tasks`          |
| POST   | `/api/starter-tasks`             |
| POST   | `/api/starter-tasks/{id}/assign` |
| PUT    | `/api/starter-tasks/{id}/submit` |
| POST   | `/api/starter-tasks/{id}/review` |

### Steps

1. Port the project status workflow. Projects flow through: `pending_review → seeking_owner → seeking_help → in_progress → completed` (plus review gates). Encode valid transitions as a map in `lib/project-status.ts` and validate in the PUT route.
2. The `POST /api/projects/{id}/interest` route sends a notification email — reuse `lib/email.ts` from Phase 2.
3. The `POST /api/projects/{id}/assign` route also triggers email notifications.
4. Update the frontend, run e2e tests.

**Done when:** All project/interest/task e2e scenarios pass.

---

## Phase 6: Messaging and Notifications

### Endpoints to migrate

| Method | Path                          |
| ------ | ----------------------------- |
| POST   | `/api/contact/{volunteer_id}` |
| GET    | `/api/messages`               |
| PUT    | `/api/messages/{id}/read`     |
| GET    | `/api/notifications`          |
| PUT    | `/api/notifications/read-all` |

### Steps

1. The contact relay (`POST /api/contact/{volunteer_id}`) sends an email via `lib/email.ts`. Port rate-limiting logic if any exists in `api.py`.
2. Update the frontend, run e2e tests.

**Done when:** Messaging e2e scenarios pass.

---

## Phase 7: Admin Routes

Admin routes are the most complex group and have the most endpoints. Migrate as a single phase but review carefully.

### Endpoints to migrate

| Method | Path                                      |
| ------ | ----------------------------------------- |
| GET    | `/api/admin/triage`                       |
| POST   | `/api/admin/projects/{id}/review`         |
| POST   | `/api/admin/projects`                     |
| PUT    | `/api/admin/projects/{id}/outcome`        |
| GET    | `/api/admin/stats`                        |
| GET    | `/api/admin/interests`                    |
| GET    | `/api/admin/volunteers/{id}`              |
| GET    | `/api/admin/volunteers/{id}/notes`        |
| POST   | `/api/admin/volunteers/{id}/notes`        |
| PUT    | `/api/admin/notes/{id}`                   |
| DELETE | `/api/admin/notes/{id}`                   |
| GET    | `/api/admin/volunteers/{id}/endorsements` |
| POST   | `/api/admin/volunteers/{id}/endorsements` |
| GET    | `/api/admin/admins`                       |
| POST   | `/api/admin/admins/invite`                |
| POST   | `/api/admin/admins/accept-invite`         |
| DELETE | `/api/admin/admins/{id}`                  |
| GET    | `/api/admin/invites`                      |
| DELETE | `/api/admin/invites/{id}`                 |
| GET    | `/api/admin/backup`                       |
| POST   | `/api/admin/backup/run`                   |
| GET    | `/api/admin/bug-reports`                  |
| PUT    | `/api/admin/bug-reports/{id}`             |
| POST   | `/api/bug-reports`                        |
| GET    | `/api/privacy/export`                     |

### Steps

1. All admin routes must verify `is_admin = true` on the volunteer. Use the auth guard from Phase 2.
2. The `POST /api/admin/admins/invite` route generates an invite token and sends an email.
3. The backup endpoints stream the SQLite file directly. In Next.js, read the file from `DATABASE_URL` path and return it as a `Response` with appropriate headers.
4. The `GET /api/privacy/export` route aggregates all data for the requesting volunteer across all tables — use a Prisma transaction with multiple `findMany` calls.
5. Update the admin HTML pages, run e2e tests.
6. **Once tests pass:** retire `api.py` and `email_service.py`. Remove the FastAPI Railway service. The Next.js service now handles all traffic.

**Done when:** All admin e2e scenarios pass, FastAPI service is shut down, only one Railway service remains.

---

## Phase 8: Frontend Migration (HTML → React)

With the API fully in Next.js, replace the static HTML pages with React components. Work page-by-page in logical groups:

**Group A — Auth pages** (login, signup, forgot-password, reset-password, accept-invite)
**Group B — Volunteer-facing pages** (dashboard, profile, volunteers directory, project detail, suggest project, starter tasks, settings, contact preferences)
**Group C — Public pages** (index, privacy)
**Group D — Admin pages** (team, skills, stats, create-project)

### Steps for each group

1. Create Next.js page components in `app/` that replicate the HTML structure and behaviour.
2. Replace raw `fetch` calls with a thin data-fetching layer (React hooks or Server Components depending on the page).
3. Port CSS: `styles.css` can initially be imported globally; refactor to CSS Modules or Tailwind later as a separate concern.
4. Port `app.js` shared utilities (auth header injection, toast notifications, form helpers) to shared React hooks/components.
5. Remove the corresponding `.html` file from `static/`.
6. Run e2e tests after each group.

**Done when:** All 20 HTML pages are replaced, the `static/` directory is empty, and the full e2e suite passes.

---

## Phase 9: Clean Up

Once Phase 8 is complete:

- Delete `api.py`, `email_service.py`, all `.sql` migration files (Prisma migrations are now the source of truth), `schema.sql`, `seed_skills.sql`.
- Remove the Python Railway service configuration.
- Remove Python-related files: `requirements.txt`, `Procfile` / `nixpacks.toml` if Python-specific.
- Remove the `static/` directory.
- Archive or delete `web/` nesting if the Next.js app was moved to root.
- Update `README.md`.

---

## Railway Deployment Notes

Railway volumes cannot be shared between services, so the two services cannot run in production simultaneously against the same SQLite file.

**During Phases 1–7:** The existing FastAPI service stays live on Railway unchanged. Do not deploy the Next.js service to Railway yet. All validation is done locally.

**Phase 7 cutover:** Once all routes are migrated and e2e tests pass locally:
1. Deploy the Next.js service to Railway, pointing at `web/` as the root directory.
2. Mount the existing SQLite volume to the Next.js service.
3. The Next.js service constructs `DATABASE_URL` from `RAILWAY_VOLUME_MOUNT_PATH` automatically (see `web/lib/prisma.ts`).
4. Verify the health check and run a production smoke test.
5. Update the Railway custom domain to point at the Next.js service.
6. Shut down the FastAPI service and detach/delete it.

**Post-migration (Phase 9+):** Migrate from SQLite to Railway's managed PostgreSQL. Both Prisma and the hosting setup make this straightforward once Next.js is fully in control.

## Environment Variables to Port

| Variable                                    | Used for                     |
| ------------------------------------------- | ---------------------------- |
| `RESEND_API_KEY`                            | Email sending                |
| `FROM_EMAIL`                                | Sender address               |
| `APP_URL`                                   | Links in emails              |
| `STUB_EMAIL`                                | Suppress real email in tests |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth                 |
| `RAILWAY_VOLUME_MOUNT_PATH`                 | SQLite file location         |

---

## Testing Strategy

- The existing pytest-playwright e2e suite is the primary gate for each phase.
- Do not move to the next phase if any e2e test is failing.
- Consider running the test suite in CI (GitHub Actions) pointing at the Railway staging environment after each phase merges.
- Unit tests for pure logic (match scoring, status transitions, validation) can be added in TypeScript using Vitest as each module is ported.
