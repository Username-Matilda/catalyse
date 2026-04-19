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

- **Backend**: FastAPI (Python)
- **Database**: SQLite
- **Frontend**: Vanilla JavaScript, HTML, CSS
- **Auth**: Token-based (lightweight, no passwords)

## Getting Started

### Prerequisites

- Python 3.9+
- pip

### Installation

```bash
# Clone or navigate to the project
cd catalyse

# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### Running

```bash
# Start the server
python api.py
```

The app will be available at `http://localhost:8001`

### First-Time Setup

1. The database is created automatically on first run
2. Skills are pre-populated from `seed_skills.sql`
3. To make yourself an admin, update the database:

```sql
UPDATE volunteers SET is_admin = 1 WHERE email = 'your@email.com';
```

## Testing

### Setup

Install test dependencies (once):

```bash
make install
```

### Running tests

```bash
make test          # Run all tests headlessly — fast, no browser window
make test-headed   # Run with a visible browser, slowed down so you can follow along
make test-debug    # Open Playwright Inspector — step through each action with a GUI debugger
```

Tests start their own server on port 8002 with a fresh isolated database — your dev server doesn't need to be running.

### Smoke testing against production

Runs a read-only subset of tests against the live site using your real account. No data is created.

You can provide credentials either:
1. As command arguments:
```bash
make test-smoke SMOKE_TEST_EMAIL=you@example.com SMOKE_TEST_PASSWORD=yourpassword
```

2. Or via a `.env` file (create `.env` in the project root):
```
SMOKE_TEST_EMAIL=you@example.com
SMOKE_TEST_PASSWORD=yourpassword
```
Then run: `make test-smoke`

The `.env` file is automatically loaded if present, keeping credentials out of your shell history.

### Claude scenario walkthroughs

For more complex flows (project proposals, admin triage, expressing interest), there are step-by-step scenario files in `tests/scenarios/`. These require the dev server to be running first:

```bash
make dev  # in one terminal

make scenario NAME=01-volunteer-propose-project  # in another
make scenarios                                   # or run all of them
```

Both commands will error immediately if the dev server isn't running. See `tests/scenarios/README.md` for the full list of scenarios.

## Project Structure

```
catalyse/
├── api.py              # FastAPI backend (all endpoints)
├── schema.sql          # Database schema
├── seed_skills.sql     # Pre-populated skills taxonomy
├── catalyse.db         # SQLite database (created on run)
├── requirements.txt    # Python dependencies
├── Makefile            # Common commands (make dev, make test, etc.)
├── README.md
├── tests/
│   ├── e2e/            # Playwright tests for critical flows (signup, login, projects)
│   └── scenarios/      # Step-by-step flows for Claude to walk through manually
└── static/
    ├── styles.css      # Shared styles
    ├── app.js          # Shared JavaScript utilities
    ├── index.html      # Project listing (home)
    ├── project.html    # Project detail
    ├── suggest.html    # Propose a project
    ├── volunteers.html # Volunteer directory
    ├── volunteer.html  # Volunteer profile
    ├── signup.html     # Registration
    ├── login.html      # Login
    ├── dashboard.html  # Personal dashboard
    ├── profile.html    # Edit profile
    ├── privacy.html    # Data/privacy management
    └── admin/
        ├── triage.html         # Review proposed projects
        ├── create-project.html # Create org project
        └── stats.html          # Platform statistics
```

## API Endpoints

### Auth
- `POST /api/auth/signup` - Register
- `POST /api/auth/login` - Login (returns token)
- `POST /api/auth/logout` - Invalidate token
- `GET /api/auth/me` - Current user profile

### Skills
- `GET /api/skills` - Skills grouped by category
- `GET /api/skills/flat` - All skills flat list

### Volunteers
- `GET /api/volunteers` - List volunteers (with filters)
- `GET /api/volunteers/{id}` - Volunteer profile
- `PUT /api/volunteers/me` - Update own profile

### Projects
- `GET /api/projects` - List projects (with filters)
- `GET /api/projects/{id}` - Project detail
- `POST /api/projects` - Propose a project
- `PUT /api/projects/{id}` - Update project
- `POST /api/projects/{id}/updates` - Add progress update

### Interest
- `POST /api/projects/{id}/interest` - Express interest
- `PUT /api/projects/{id}/interest/{interest_id}` - Respond to interest
- `DELETE /api/projects/{id}/interest` - Withdraw interest

### Contact
- `POST /api/contact/{volunteer_id}` - Send message
- `GET /api/messages` - Get messages
- `PUT /api/messages/{id}/read` - Mark as read

### Dashboard
- `GET /api/dashboard` - Personal dashboard data
- `GET /api/notifications` - Get notifications

### Admin
- `GET /api/admin/triage` - Projects pending review
- `POST /api/admin/projects/{id}/review` - Review a project
- `POST /api/admin/projects` - Create org project
- `GET /api/admin/stats` - Platform statistics

### Privacy (GDPR)
- `GET /api/privacy/export` - Export all your data
- `DELETE /api/privacy/delete-account` - Delete account

## Skills Taxonomy

Pre-populated categories:
- **Communications** - Writing, Social Media, Design, Video, Speaking
- **Organizing** - Events, Protests, Community Building
- **Advocacy & Policy** - Lobbying, Policy Research, Government Relations
- **Legal** - Compliance, Contracts, GDPR
- **Governance** - Strategy, Board Experience, Process Design
- **Technical** - Web Dev, Software, Data, UX
- **Research** - AI Safety, Fact-Checking, Academic Writing
- **Operations** - Project Management, Admin, Fundraising

## Integration Notes

### Embedding in Notion

The platform can be embedded in your Notion workspace:
1. Deploy the app to a hosting service
2. Use Notion's embed block with the app URL
3. Volunteers access through your Notion hub

### Authentication

Currently uses simple email-based login with tokens. For production:
- Consider integrating with your existing auth system
- Add email verification / magic links
- Set token expiration

## License

MIT - Built for PauseAI UK
