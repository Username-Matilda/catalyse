# Scenario 03: Volunteer Expresses Interest in a Project

## Purpose
Verify that a logged-in volunteer can express interest in a project, the interest form submits successfully, and the interest is reflected in the volunteer's dashboard.

## Prerequisites

### Accounts needed
| Account | Email | Password | Role |
|---------|-------|----------|------|
| Volunteer | volunteer@test.com | volunteerpass1 | regular user |

### Setup
You need at least one publicly visible project (status `seeking_owner` or `seeking_help`). Run Scenario 02 first to create and approve one, or use an existing project.

```bash
BASE=http://localhost:8001
curl -s -X POST $BASE/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Volunteer","email":"volunteer@test.com","password":"volunteerpass1","consent_profile_visible":true,"consent_contact_by_owners":true}'
```

## Steps

### Step 1: Log in as the volunteer
- **Navigate to:** `http://localhost:8001/static/login.html`
- **Action:** Fill credentials and submit
- **Expected:** Redirected to `/static/dashboard.html`

### Step 2: Browse to a project
- **Navigate to:** `http://localhost:8001/`
- **Action:** Click on any visible project card
- **Expected:** Project detail page loads with title, description, and skills visible

### Step 3: Express interest
- **Action:** Scroll to the "Express Interest" section
- **Expected:** Interest form is visible (radio buttons for contribute vs. own)
- **Action:** Select "I want to help out / contribute", optionally fill a message, click submit
- **Expected:** Success message appears; form is replaced with "You've expressed interest" status display

### Step 4: Verify on dashboard
- **Navigate to:** `http://localhost:8001/static/dashboard.html`
- **Action:** Click the "My Interests" tab
- **Expected:** The project appears with status "Pending"

## Expected Final State
- Interest record exists with status `pending`
- Dashboard "My Interests" tab shows the project
- Project owner (if set) can see the interest in the project's interest management section

## Cleanup
Withdraw interest using the "Withdraw" button on the project page, or leave it for Scenario 04.
