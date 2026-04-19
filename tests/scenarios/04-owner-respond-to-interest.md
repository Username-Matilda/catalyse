# Scenario 04: Project Owner Responds to Interest

## Purpose

Verify that a project owner can see pending interest expressions on their project and accept or decline them, and that the status updates correctly for the interested volunteer.

## Prerequisites

### Accounts needed

| Account   | Email              | Password       | Role                              |
| --------- | ------------------ | -------------- | --------------------------------- |
| Owner     | owner@test.com     | ownerpass1     | regular user (owns a project)     |
| Volunteer | volunteer@test.com | volunteerpass1 | regular user (expressed interest) |

### Setup

Run Scenarios 01–03 first (creates a project and an interest expression), or:

```bash
BASE=http://localhost:8001

# Create owner
curl -s -X POST $BASE/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Project Owner","email":"owner@test.com","password":"ownerpass1","consent_profile_visible":true,"consent_contact_by_owners":true}'

# Create volunteer
curl -s -X POST $BASE/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Volunteer","email":"volunteer@test.com","password":"volunteerpass1","consent_profile_visible":true,"consent_contact_by_owners":true}'
```

You also need a project owned by `owner@test.com` with a pending interest from `volunteer@test.com`.

## Steps

### Step 1: Log in as the project owner

- **Navigate to:** `http://localhost:8001/static/login.html`
- **Action:** Fill owner credentials and submit
- **Expected:** Redirected to `/static/dashboard.html`; "My Projects" tab shows owned projects

### Step 2: Open the project detail page

- **Navigate to:** The project page (`http://localhost:8001/static/project.html?id={project_id}`)
- **Expected:** Project detail visible; "Manage Interests" section visible (owner only)

### Step 3: Review the pending interest

- **Action:** Scroll to the "Expressions of Interest" / "Manage Interests" section
- **Expected:** Volunteer's interest card is visible with status "Pending" and their message

### Step 4: Accept the interest

- **Action:** Click "Accept" on the volunteer's interest card
- **Expected:** Interest status changes to "Accepted"; volunteer card updates

### Step 5: Verify from the volunteer's perspective

- Log in as `volunteer@test.com` (open incognito or a different browser)
- **Navigate to:** Dashboard → "My Interests" tab
- **Expected:** Interest shows status "Accepted"

## Expected Final State

- Interest record status is `accepted`
- Volunteer's dashboard shows updated status
- (If email configured) Volunteer receives an email notification

## Cleanup

No cleanup required unless you want to remove the test data entirely.
