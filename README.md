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
npm ci                   # install all dependencies
npm run install:browsers # install Playwright browser
```

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

## Testing

### Running tests

```bash
npm test               # Run all e2e tests headlessly
npm run test:headed    # Run with a visible browser (single worker, slowed)
npm run test:ui        # Open Playwright UI mode
```

Tests spin up an isolated Next.js server with a fresh database — your dev server doesn't need to be running.

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
