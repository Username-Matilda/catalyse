# Scenario 06: User Edits Their Profile

## Purpose
Verify that a logged-in user can update their profile (bio, contact details, skills), save successfully, and that the changes persist after navigating away and back.

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
- **Action:** Fill credentials and submit
- **Expected:** Redirected to `/static/dashboard.html`

### Step 2: Navigate to the profile page
- **Navigate to:** `http://localhost:8001/static/profile.html`
- **Expected:** Profile form loads with existing values pre-filled

### Step 3: Update profile fields
- **Action:** Update the following:
  - Bio: "Updated bio text for e2e test [timestamp]"
  - Discord handle: "testuser#9999"
  - Availability hours: 8
- **Expected:** Form accepts the new values

### Step 4: Save the profile
- **Action:** Click the "Save Profile" / submit button
- **Expected:** Success message appears (e.g. "Profile updated")

### Step 5: Navigate away and back
- **Navigate to:** `http://localhost:8001/static/dashboard.html`
- **Navigate to:** `http://localhost:8001/static/profile.html`
- **Expected:** Bio field contains the updated text; Discord handle shows "testuser#9999"

## Expected Final State
- Profile changes are persisted in the database
- Navigating back to the profile page shows the updated values
- No data reverted to previous values

## Cleanup
No cleanup required — this is non-destructive (just profile data changes).
