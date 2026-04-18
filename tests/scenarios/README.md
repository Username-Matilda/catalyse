# Claude Scenario Walkthroughs

These scenario files describe flows for Claude to execute using the Playwright MCP browser tools. Unlike the automated Playwright tests, scenarios cover complex multi-user flows and admin operations.

## When to use

Run a scenario when you want to verify a flow works end-to-end — for example, after a related code change, before a release, or when investigating a reported bug.

## How to run a scenario

1. Make sure the app is running locally (`python api.py`) or identify the production URL.
2. Ask Claude to run a specific scenario, e.g.:
   > "Please run the scenario in `tests/scenarios/01-volunteer-propose-project.md` against http://localhost:8001"
3. Claude will open a browser, follow each step, and report pass/fail with observations.

## Setup accounts

Most scenarios need test accounts. The easiest way to create them:

```bash
BASE=http://localhost:8001

# Create volunteer
curl -s -X POST $BASE/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Volunteer","email":"volunteer@test.com","password":"volunteerpass1","consent_profile_visible":true,"consent_contact_by_owners":true}'

# Create admin (requires ADMIN_EMAILS=admin@test.com set when starting the server)
curl -s -X POST $BASE/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Admin","email":"admin@test.com","password":"adminpass1","consent_profile_visible":true,"consent_contact_by_owners":true}'
```

Or restart the server with `ADMIN_EMAILS=admin@test.com python api.py` to auto-promote that email.

## Scenarios

| File | Flow |
|------|------|
| [01-volunteer-propose-project.md](01-volunteer-propose-project.md) | Volunteer proposes a new project |
| [02-admin-triage-project.md](02-admin-triage-project.md) | Admin reviews and approves a pending project |
| [03-volunteer-express-interest.md](03-volunteer-express-interest.md) | Volunteer expresses interest in a project |
| [04-owner-respond-to-interest.md](04-owner-respond-to-interest.md) | Project owner accepts or declines interest |
| [05-admin-create-project.md](05-admin-create-project.md) | Admin creates an org project directly |
| [06-user-edit-profile.md](06-user-edit-profile.md) | User updates their profile |
