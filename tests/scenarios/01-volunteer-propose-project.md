# Scenario 01: Volunteer Proposes a Project

## Purpose
Verify that a logged-in volunteer can submit a project proposal, see a confirmation, and that the project appears in the admin triage queue.

## Prerequisites

### Accounts needed
| Account | Email | Password | Role |
|---------|-------|----------|------|
| Volunteer | volunteer@test.com | volunteerpass1 | regular user |

### Setup
```bash
BASE=http://localhost:8001
curl -s -X POST $BASE/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Volunteer","email":"volunteer@test.com","password":"volunteerpass1","consent_profile_visible":true,"consent_contact_by_owners":true}'
```

## Steps

### Step 1: Log in as the volunteer
- **Navigate to:** `http://localhost:8001/static/login.html`
- **Action:** Fill email `volunteer@test.com` and password `volunteerpass1`, submit
- **Expected:** Redirected to `/static/dashboard.html`

### Step 2: Navigate to the project suggestion form
- **Navigate to:** `http://localhost:8001/static/suggest.html`
- **Expected:** Form with title "Suggest a Project" is visible

### Step 3: Fill in the project form
- **Action:** Fill in:
  - Title: "Test Proposal [today's date]"
  - Description: "This is a test project proposal to verify the suggestion flow works correctly."
  - Urgency: Medium
  - Time commitment: 5 hours/week
- **Expected:** Form accepts input without errors

### Step 4: Submit the form
- **Action:** Click the submit button
- **Expected:** Success message appears (e.g. "Project submitted for review") or redirect occurs

### Step 5: Verify in admin triage
- **Navigate to:** `http://localhost:8001/static/admin/triage.html` (requires admin login — if not admin, skip this step)
- **Expected:** The proposed project appears in the "Pending Review" tab with the title used in Step 3

## Expected Final State
- Volunteer sees a confirmation that the project was submitted
- Project exists in the database with status `pending_review`
- Project appears in the admin triage queue

## Cleanup
To remove the test project, an admin can reject it in the triage view, or delete it via the API:
```bash
# Get project id from triage, then:
curl -X DELETE http://localhost:8001/api/projects/{id} -H "Authorization: Bearer {admin_token}"
```
