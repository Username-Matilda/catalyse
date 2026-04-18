# Scenario 02: Admin Triages a Pending Project

## Purpose
Verify that an admin can review a pending project, approve it, and that the project status changes to `seeking_owner` and becomes visible in the public listing.

## Prerequisites

### Accounts needed
| Account | Email | Password | Role |
|---------|-------|----------|------|
| Admin | admin@test.com | adminpass1 | admin |

### Setup
Start the server with `ADMIN_EMAILS=admin@test.com python api.py`, then create the admin account:
```bash
BASE=http://localhost:8001
curl -s -X POST $BASE/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Admin","email":"admin@test.com","password":"adminpass1","consent_profile_visible":true,"consent_contact_by_owners":true}'
```

You also need a pending project to review. Either run Scenario 01 first, or create one via API:
```bash
# Get admin token from login response
TOKEN=$(curl -s -X POST $BASE/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"adminpass1"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['auth_token'])")

# Create a pending project as a volunteer (proposed projects start pending)
curl -s -X POST $BASE/api/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Pending Test Project","description":"A project awaiting admin review."}'
```

## Steps

### Step 1: Log in as admin
- **Navigate to:** `http://localhost:8001/static/login.html`
- **Action:** Fill email `admin@test.com` and password `adminpass1`, submit
- **Expected:** Redirected to `/static/dashboard.html`; nav shows admin links

### Step 2: Open the triage page
- **Navigate to:** `http://localhost:8001/static/admin/triage.html`
- **Expected:** "Pending Review" tab is active; pending project card is visible

### Step 3: Open the review modal
- **Action:** Click the "Review" button on the pending project
- **Expected:** A modal opens showing the project title, description, and proposer

### Step 4: Approve the project
- **Action:** Select "Approve" and optionally add a note, then confirm
- **Expected:** Modal closes; success message appears; project card moves out of the pending list

### Step 5: Verify the project is now public
- **Navigate to:** `http://localhost:8001/` (projects listing)
- **Expected:** The approved project appears in the list with status "Seeking Owner"

## Expected Final State
- Project status is `seeking_owner`
- Project is visible on the public projects listing
- (If email configured) Proposer receives an approval notification

## Cleanup
Delete the test project from the edit project page or via API.
