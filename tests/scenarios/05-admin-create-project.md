# Scenario 05: Admin Creates a Project Directly

## Purpose

Verify that an admin can create an org-proposed project via the admin form, and that it appears immediately in the public project listing without requiring triage.

## Prerequisites

### Accounts needed

| Account | Email          | Password   | Role  |
| ------- | -------------- | ---------- | ----- |
| Admin   | admin@test.com | adminpass1 | admin |

### Setup

Start the server with `ADMIN_EMAILS=admin@test.com python api.py`, then create the admin account:

```bash
BASE=http://localhost:8001
curl -s -X POST $BASE/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Admin","email":"admin@test.com","password":"adminpass1","consent_profile_visible":true,"consent_contact_by_owners":true}'
```

## Steps

### Step 1: Log in as admin

- **Navigate to:** `http://localhost:8001/static/login.html`
- **Action:** Fill admin credentials and submit
- **Expected:** Redirected to `/static/dashboard.html`; admin nav links visible

### Step 2: Navigate to admin project creation

- **Navigate to:** `http://localhost:8001/static/admin/create-project.html`
- **Expected:** Project creation form is visible

### Step 3: Fill in the project details

- **Action:** Fill in:
  - Title: "Admin Test Project [today's date]"
  - Description: "An org project created directly by an admin to test the admin creation flow."
  - Urgency: High
  - Time commitment: 3 hours/week
  - Add one or more skills if desired
- **Expected:** Form accepts all input

### Step 4: Submit the form

- **Action:** Click the submit/create button
- **Expected:** Success message or redirect to the new project page

### Step 5: Verify it appears in the public listing

- **Navigate to:** `http://localhost:8001/`
- **Expected:** The new project appears in the list immediately, without needing admin approval (admin-created projects bypass triage)

### Step 6: Verify the project status

- **Action:** Click the project card
- **Expected:** Project detail page shows status "Seeking Owner" (not "Pending Review")

## Expected Final State

- Project exists with status `seeking_owner`
- Project is visible on the public homepage
- No triage step was required

## Cleanup

Delete the test project from the edit project page or via the project detail page (admin delete option).
