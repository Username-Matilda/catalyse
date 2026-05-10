"""
E2E API tests for Project, Task, and Interest routes — parameterised to run against both FastAPI and Next.js.

Scenarios covered:
  - GET  /api/projects                            (list, filters)
  - GET  /api/projects/{id}                       (detail, access control)
  - POST /api/projects                            (volunteer proposal, requires tasks)
  - PUT  /api/projects/{id}                       (update, owner/admin permissions)
  - POST /api/admin/projects                      (org-created, skips review)
  - GET  /api/admin/triage                        (pending queue)
  - POST /api/admin/projects/{id}/review          (approve / needs_discussion)
  - GET  /api/projects/{id}/tasks                 (task list)
  - POST /api/projects/{id}/tasks                 (create, owner/admin only, auto-promote)
  - PUT  /api/projects/{id}/tasks/{task_id}       (claim, mark done)
  - DELETE /api/projects/{id}/tasks/{task_id}     (owner/admin delete)
  - POST /api/projects/{id}/interest              (express interest)
  - DELETE /api/projects/{id}/interest            (withdraw)
  - PUT  /api/projects/{id}/interest/{id}         (accept / decline)
"""

import uuid
import pytest
import requests

from tests.e2e.helpers import BASE_URL


def _api(method, path, base_url, json=None, token=None, params=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.request(
        method, f"{base_url}{path}",
        json=json, headers=headers, params=params, timeout=10,
    )


def _make_project(base_url, token, **kwargs):
    """Helper: create an org project via admin and return its id."""
    payload = {"title": f"Test Project {uuid.uuid4().hex[:8]}", "description": "A project for testing.", "urgency": "medium"}
    payload.update(kwargs)
    resp = _api("POST", "/api/admin/projects", base_url=base_url, json=payload, token=token)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def _make_volunteer(base_url):
    """Helper: sign up a fresh volunteer and return {id, token}."""
    email = f"vol_{uuid.uuid4().hex[:8]}@test.com"
    resp = _api("POST", "/api/auth/signup", base_url=base_url, json={
        "name": "Test Vol",
        "email": email,
        "password": "testpassword1",
        "consent_profile_visible": True,
        "consent_contact_by_owners": True,
    })
    assert resp.status_code == 200, resp.text
    data = resp.json()
    return {"id": data["id"], "token": data["auth_token"]}


# ── Project List ──────────────────────────────────────────────────────────────

class TestProjectList:
    """GET /api/projects"""

    @pytest.mark.local_only
    def test_returns_paginated_structure(self, api_url, published_project):
        resp = _api("GET", "/api/projects", base_url=api_url)
        assert resp.status_code == 200
        data = resp.json()
        assert "projects" in data
        assert "total" in data
        assert isinstance(data["projects"], list)
        assert isinstance(data["total"], int)

    @pytest.mark.local_only
    def test_published_project_in_list(self, api_url, published_project):
        resp = _api("GET", "/api/projects", base_url=api_url)
        assert resp.status_code == 200
        ids = [p["id"] for p in resp.json()["projects"]]
        assert published_project in ids

    @pytest.mark.local_only
    def test_project_has_expected_fields(self, api_url, published_project):
        resp = _api("GET", "/api/projects", base_url=api_url)
        assert resp.status_code == 200
        projects = resp.json()["projects"]
        proj = next((p for p in projects if p["id"] == published_project), None)
        assert proj is not None
        for field in ("id", "title", "description", "status", "urgency", "skills"):
            assert field in proj, f"Missing field: {field}"

    @pytest.mark.local_only
    def test_search_filter(self, api_url, admin_token):
        unique = f"UniqueSearch_{uuid.uuid4().hex[:8]}"
        pid = _make_project(BASE_URL, admin_token, title=unique)
        resp = _api("GET", "/api/projects", base_url=api_url, params={"search": unique})
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert any(p["id"] == pid for p in data["projects"])

    @pytest.mark.local_only
    def test_status_filter_excludes_others(self, api_url, admin_token):
        # Create two projects; filter to needs_tasks — only that status returned
        _make_project(BASE_URL, admin_token)
        resp = _api("GET", "/api/projects", base_url=api_url, params={"status": "needs_tasks"})
        assert resp.status_code == 200
        for p in resp.json()["projects"]:
            assert p["status"] == "needs_tasks"

    @pytest.mark.local_only
    def test_limit_and_offset(self, api_url, published_project):
        resp = _api("GET", "/api/projects", base_url=api_url, params={"limit": 1, "offset": 0})
        assert resp.status_code == 200
        assert len(resp.json()["projects"]) <= 1


# ── Project Detail ────────────────────────────────────────────────────────────

class TestProjectDetail:
    """GET /api/projects/{id}"""

    @pytest.mark.local_only
    def test_returns_expected_fields(self, api_url, published_project, new_user):
        resp = _api("GET", f"/api/projects/{published_project}", base_url=api_url, token=new_user["token"])
        assert resp.status_code == 200
        data = resp.json()
        for field in ("id", "title", "description", "status", "skills", "tasks", "updates"):
            assert field in data, f"Missing field: {field}"

    @pytest.mark.local_only
    def test_unknown_project_returns_404(self, api_url):
        resp = _api("GET", "/api/projects/999999", base_url=api_url)
        assert resp.status_code == 404

    @pytest.mark.local_only
    def test_pending_project_hidden_from_other_volunteers(self, api_url, new_user):
        # Create a volunteer-proposed project (status=pending_review) via FastAPI
        proposer = _make_volunteer(BASE_URL)
        resp = _api("POST", "/api/projects", base_url=BASE_URL, json={
            "title": "Pending project",
            "description": "This should not be visible.",
            "tasks": [{"title": "A task", "description": None}],
        }, token=proposer["token"])
        assert resp.status_code == 200
        pid = resp.json()["id"]

        # A different volunteer should get 404
        resp2 = _api("GET", f"/api/projects/{pid}", base_url=api_url, token=new_user["token"])
        assert resp2.status_code == 404

    @pytest.mark.local_only
    def test_proposer_can_see_own_pending_project(self, api_url):
        proposer = _make_volunteer(api_url)
        resp = _api("POST", "/api/projects", base_url=api_url, json={
            "title": "My pending project",
            "description": "I should be able to see this.",
            "tasks": [{"title": "A task", "description": None}],
        }, token=proposer["token"])
        assert resp.status_code == 200
        pid = resp.json()["id"]

        resp2 = _api("GET", f"/api/projects/{pid}", base_url=api_url, token=proposer["token"])
        assert resp2.status_code == 200
        assert resp2.json()["id"] == pid


# ── Project Create (volunteer proposal) ──────────────────────────────────────

class TestProjectCreate:
    """POST /api/projects"""

    @pytest.mark.local_only
    def test_requires_auth(self, api_url):
        resp = _api("POST", "/api/projects", base_url=api_url, json={
            "title": "No auth project",
            "description": "Should not work.",
            "tasks": [{"title": "Task", "description": None}],
        })
        assert resp.status_code == 401

    @pytest.mark.local_only
    def test_requires_at_least_one_task(self, api_url, new_user):
        resp = _api("POST", "/api/projects", base_url=api_url, json={
            "title": "Taskless project",
            "description": "This needs a task to submit.",
            "tasks": [],
        }, token=new_user["token"])
        assert resp.status_code == 400

    @pytest.mark.local_only
    def test_creates_project_in_pending_review(self, api_url, new_user):
        resp = _api("POST", "/api/projects", base_url=api_url, json={
            "title": f"Proposal {uuid.uuid4().hex[:8]}",
            "description": "A valid volunteer proposal.",
            "tasks": [{"title": "Do something", "description": "Detail."}],
        }, token=new_user["token"])
        assert resp.status_code == 200
        pid = resp.json()["id"]

        # Proposer can see their own pending project
        detail = _api("GET", f"/api/projects/{pid}", base_url=api_url, token=new_user["token"])
        assert detail.status_code == 200
        assert detail.json()["status"] == "pending_review"

    @pytest.mark.local_only
    def test_want_to_own_sets_proposer_as_owner(self, api_url, new_user):
        resp = _api("POST", "/api/projects", base_url=api_url, json={
            "title": f"Owned proposal {uuid.uuid4().hex[:8]}",
            "description": "I want to own this project.",
            "want_to_own": True,
            "tasks": [{"title": "First task", "description": None}],
        }, token=new_user["token"])
        assert resp.status_code == 200
        pid = resp.json()["id"]

        detail = _api("GET", f"/api/projects/{pid}", base_url=api_url, token=new_user["token"])
        assert detail.status_code == 200
        assert detail.json()["owner_id"] == new_user["id"]


# ── Project Update ────────────────────────────────────────────────────────────

class TestProjectUpdate:
    """PUT /api/projects/{id}"""

    @pytest.mark.local_only
    def test_requires_auth(self, api_url, published_project):
        resp = _api("PUT", f"/api/projects/{published_project}", base_url=api_url, json={"title": "Hijacked"})
        assert resp.status_code == 401

    @pytest.mark.local_only
    def test_non_owner_cannot_update(self, api_url, new_user, published_project):
        resp = _api("PUT", f"/api/projects/{published_project}", base_url=api_url,
                    json={"title": "Hijacked"}, token=new_user["token"])
        assert resp.status_code == 403

    @pytest.mark.local_only
    def test_admin_can_update_title(self, api_url, admin_token):
        pid = _make_project(BASE_URL, admin_token)
        new_title = f"Updated {uuid.uuid4().hex[:6]}"
        resp = _api("PUT", f"/api/projects/{pid}", base_url=api_url,
                    json={"title": new_title}, token=admin_token)
        assert resp.status_code == 200
        assert resp.json()["title"] == new_title

    @pytest.mark.local_only
    def test_admin_can_archive_project(self, api_url, admin_token):
        pid = _make_project(BASE_URL, admin_token)
        resp = _api("PUT", f"/api/projects/{pid}", base_url=api_url,
                    json={"status": "archived"}, token=admin_token)
        assert resp.status_code == 200
        assert resp.json()["status"] == "archived"

    @pytest.mark.local_only
    def test_owner_cannot_set_admin_only_status(self, api_url):
        # A volunteer owns their proposed project but cannot set 'archived' (admin-only)
        vol = _make_volunteer(api_url)
        resp = _api("POST", "/api/projects", base_url=api_url, json={
            "title": "Status test project",
            "description": "Testing status restrictions.",
            "want_to_own": True,
            "tasks": [{"title": "A task", "description": None}],
        }, token=vol["token"])
        pid = resp.json()["id"]

        resp2 = _api("PUT", f"/api/projects/{pid}", base_url=api_url,
                     json={"status": "archived"}, token=vol["token"])
        # Status change should be silently ignored (returns 200 but status won't be archived)
        if resp2.status_code == 200:
            assert resp2.json()["status"] != "archived"
        else:
            assert resp2.status_code in (400, 403)


# ── Admin: Create Org Project ─────────────────────────────────────────────────

class TestAdminCreateProject:
    """POST /api/admin/projects"""

    @pytest.mark.local_only
    def test_requires_admin(self, api_url, new_user):
        resp = _api("POST", "/api/admin/projects", base_url=api_url,
                    json={"title": "Should fail", "description": "Non-admin."}, token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_creates_project_in_needs_tasks(self, api_url, admin_token):
        resp = _api("POST", "/api/admin/projects", base_url=api_url, json={
            "title": f"Org project {uuid.uuid4().hex[:8]}",
            "description": "An org-created project.",
            "urgency": "medium",
        }, token=admin_token)
        assert resp.status_code == 200
        pid = resp.json()["id"]

        detail = _api("GET", f"/api/projects/{pid}", base_url=api_url, token=admin_token)
        assert detail.status_code == 200
        assert detail.json()["status"] == "needs_tasks"

    @pytest.mark.local_only
    def test_with_tasks_creates_in_progress(self, api_url, admin_token):
        resp = _api("POST", "/api/admin/projects", base_url=api_url, json={
            "title": f"Org project with tasks {uuid.uuid4().hex[:8]}",
            "description": "Org project that starts in_progress.",
            "urgency": "low",
            "tasks": [{"title": "Initial task", "description": "Get started."}],
        }, token=admin_token)
        assert resp.status_code == 200
        pid = resp.json()["id"]

        detail = _api("GET", f"/api/projects/{pid}", base_url=api_url, token=admin_token)
        assert detail.status_code == 200
        assert detail.json()["status"] == "in_progress"

    @pytest.mark.local_only
    def test_skips_triage_queue(self, api_url, admin_token):
        title = f"Skip triage {uuid.uuid4().hex[:8]}"
        resp = _api("POST", "/api/admin/projects", base_url=api_url, json={
            "title": title, "description": "Should skip triage.", "urgency": "medium",
        }, token=admin_token)
        assert resp.status_code == 200

        triage = _api("GET", "/api/admin/triage", base_url=api_url, token=admin_token)
        assert triage.status_code == 200
        triage_titles = [p["title"] for p in triage.json()]
        assert title not in triage_titles


# ── Admin: Triage ─────────────────────────────────────────────────────────────

class TestAdminTriage:
    """GET /api/admin/triage and POST /api/admin/projects/{id}/review"""

    @pytest.mark.local_only
    def test_requires_admin(self, api_url, new_user):
        resp = _api("GET", "/api/admin/triage", base_url=api_url, token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_pending_project_appears_in_queue(self, api_url, admin_token):
        # Create via volunteer proposal (goes to pending_review)
        vol = _make_volunteer(BASE_URL)
        resp = _api("POST", "/api/projects", base_url=BASE_URL, json={
            "title": f"Pending {uuid.uuid4().hex[:8]}",
            "description": "Needs triage review.",
            "tasks": [{"title": "Task", "description": None}],
        }, token=vol["token"])
        pid = resp.json()["id"]

        triage = _api("GET", "/api/admin/triage", base_url=api_url, token=admin_token)
        assert triage.status_code == 200
        ids = [p["id"] for p in triage.json()]
        assert pid in ids

    @pytest.mark.local_only
    def test_approve_moves_project_out_of_queue(self, api_url, admin_token):
        vol = _make_volunteer(BASE_URL)
        resp = _api("POST", "/api/projects", base_url=BASE_URL, json={
            "title": f"To approve {uuid.uuid4().hex[:8]}",
            "description": "Will be approved.",
            "tasks": [{"title": "Initial task", "description": None}],
        }, token=vol["token"])
        pid = resp.json()["id"]

        review = _api("POST", f"/api/admin/projects/{pid}/review", base_url=api_url,
                      json={"status": "approved"}, token=admin_token)
        assert review.status_code == 200

        detail = _api("GET", f"/api/projects/{pid}", base_url=api_url, token=admin_token)
        assert detail.json()["status"] not in ("pending_review", "needs_discussion")

    @pytest.mark.local_only
    def test_approve_with_tasks_sets_in_progress(self, api_url, admin_token):
        vol = _make_volunteer(BASE_URL)
        resp = _api("POST", "/api/projects", base_url=BASE_URL, json={
            "title": f"Approve in_progress {uuid.uuid4().hex[:8]}",
            "description": "Has tasks so should be in_progress.",
            "tasks": [{"title": "Task", "description": None}],
        }, token=vol["token"])
        pid = resp.json()["id"]

        _api("POST", f"/api/admin/projects/{pid}/review", base_url=api_url,
             json={"status": "approved"}, token=admin_token)

        detail = _api("GET", f"/api/projects/{pid}", base_url=api_url, token=admin_token)
        assert detail.json()["status"] == "in_progress"

    @pytest.mark.local_only
    def test_needs_discussion_keeps_in_queue(self, api_url, admin_token):
        vol = _make_volunteer(BASE_URL)
        resp = _api("POST", "/api/projects", base_url=BASE_URL, json={
            "title": f"To discuss {uuid.uuid4().hex[:8]}",
            "description": "Will go to needs_discussion.",
            "tasks": [{"title": "Task", "description": None}],
        }, token=vol["token"])
        pid = resp.json()["id"]

        review = _api("POST", f"/api/admin/projects/{pid}/review", base_url=api_url,
                      json={"status": "needs_discussion", "feedback_to_proposer": "Let's chat."}, token=admin_token)
        assert review.status_code == 200

        detail = _api("GET", f"/api/projects/{pid}", base_url=api_url, token=admin_token)
        assert detail.json()["status"] == "needs_discussion"


# ── Project Tasks ─────────────────────────────────────────────────────────────

class TestProjectTasks:
    """GET/POST/PUT/DELETE /api/projects/{id}/tasks"""

    @pytest.mark.local_only
    def test_list_tasks_returns_list(self, api_url, published_project, new_user):
        resp = _api("GET", f"/api/projects/{published_project}/tasks", base_url=api_url, token=new_user["token"])
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.local_only
    def test_create_task_requires_auth(self, api_url, published_project):
        resp = _api("POST", f"/api/projects/{published_project}/tasks", base_url=api_url,
                    json={"title": "Sneaky task"})
        assert resp.status_code == 401

    @pytest.mark.local_only
    def test_non_owner_cannot_create_task(self, api_url, new_user, published_project):
        resp = _api("POST", f"/api/projects/{published_project}/tasks", base_url=api_url,
                    json={"title": "Sneaky task"}, token=new_user["token"])
        assert resp.status_code == 403

    @pytest.mark.local_only
    def test_admin_can_create_task(self, api_url, admin_token):
        pid = _make_project(BASE_URL, admin_token)
        resp = _api("POST", f"/api/projects/{pid}/tasks", base_url=api_url,
                    json={"title": "Admin task", "description": "Description."}, token=admin_token)
        assert resp.status_code == 200
        assert "id" in resp.json()

    @pytest.mark.local_only
    def test_adding_task_to_needs_tasks_promotes_to_in_progress(self, api_url, admin_token):
        pid = _make_project(BASE_URL, admin_token)

        # Confirm starts as needs_tasks
        detail = _api("GET", f"/api/projects/{pid}", base_url=api_url, token=admin_token)
        assert detail.json()["status"] == "needs_tasks"

        # Add a task via the API under test
        _api("POST", f"/api/projects/{pid}/tasks", base_url=api_url,
             json={"title": "First task"}, token=admin_token)

        detail2 = _api("GET", f"/api/projects/{pid}", base_url=api_url, token=admin_token)
        assert detail2.json()["status"] == "in_progress"

    @pytest.mark.local_only
    def test_volunteer_can_claim_open_task(self, api_url, admin_token, new_user):
        pid = _make_project(BASE_URL, admin_token)
        task_resp = _api("POST", f"/api/projects/{pid}/tasks", base_url=BASE_URL,
                         json={"title": "Claimable task"}, token=admin_token)
        task_id = task_resp.json()["id"]

        resp = _api("PUT", f"/api/projects/{pid}/tasks/{task_id}", base_url=api_url,
                    json={"status": "assigned", "assigned_to_id": new_user["id"]}, token=new_user["token"])
        assert resp.status_code == 200

        tasks = _api("GET", f"/api/projects/{pid}/tasks", base_url=api_url, token=new_user["token"])
        task = next(t for t in tasks.json() if t["id"] == task_id)
        assert task["status"] == "assigned"
        assert task["assigned_to_id"] == new_user["id"]

    @pytest.mark.local_only
    def test_volunteer_can_mark_their_task_done(self, api_url, admin_token, new_user):
        pid = _make_project(BASE_URL, admin_token)
        task_resp = _api("POST", f"/api/projects/{pid}/tasks", base_url=BASE_URL,
                         json={"title": "Task to complete"}, token=admin_token)
        task_id = task_resp.json()["id"]

        # Claim via FastAPI (setup)
        _api("PUT", f"/api/projects/{pid}/tasks/{task_id}", base_url=BASE_URL,
             json={"status": "assigned", "assigned_to_id": new_user["id"]}, token=new_user["token"])

        # Mark done via API under test
        resp = _api("PUT", f"/api/projects/{pid}/tasks/{task_id}", base_url=api_url,
                    json={"status": "done"}, token=new_user["token"])
        assert resp.status_code == 200

        tasks = _api("GET", f"/api/projects/{pid}/tasks", base_url=api_url, token=new_user["token"])
        task = next(t for t in tasks.json() if t["id"] == task_id)
        assert task["status"] == "done"

    @pytest.mark.local_only
    def test_owner_can_delete_task(self, api_url, admin_token):
        pid = _make_project(BASE_URL, admin_token)
        task_resp = _api("POST", f"/api/projects/{pid}/tasks", base_url=BASE_URL,
                         json={"title": "Task to delete"}, token=admin_token)
        task_id = task_resp.json()["id"]

        resp = _api("DELETE", f"/api/projects/{pid}/tasks/{task_id}", base_url=api_url, token=admin_token)
        assert resp.status_code == 200

        tasks = _api("GET", f"/api/projects/{pid}/tasks", base_url=api_url, token=admin_token)
        assert not any(t["id"] == task_id for t in tasks.json())

    @pytest.mark.local_only
    def test_non_owner_cannot_delete_task(self, api_url, admin_token, new_user):
        pid = _make_project(BASE_URL, admin_token)
        task_resp = _api("POST", f"/api/projects/{pid}/tasks", base_url=BASE_URL,
                         json={"title": "Protected task"}, token=admin_token)
        task_id = task_resp.json()["id"]

        resp = _api("DELETE", f"/api/projects/{pid}/tasks/{task_id}", base_url=api_url, token=new_user["token"])
        assert resp.status_code == 403


# ── Project Interests ─────────────────────────────────────────────────────────

class TestProjectInterests:
    """POST/DELETE /api/projects/{id}/interest and PUT /api/projects/{id}/interest/{id}"""

    @pytest.mark.local_only
    def test_express_interest_requires_auth(self, api_url, published_project):
        resp = _api("POST", f"/api/projects/{published_project}/interest", base_url=api_url,
                    json={"interest_type": "want_to_contribute"})
        assert resp.status_code == 401

    @pytest.mark.local_only
    def test_express_interest_in_seeking_project(self, api_url, published_project, new_user):
        resp = _api("POST", f"/api/projects/{published_project}/interest", base_url=api_url,
                    json={"interest_type": "want_to_contribute", "message": "I'd love to help!"},
                    token=new_user["token"])
        assert resp.status_code == 200

    @pytest.mark.local_only
    def test_cannot_express_interest_twice(self, api_url, published_project, new_user):
        # First expression
        _api("POST", f"/api/projects/{published_project}/interest", base_url=BASE_URL,
             json={"interest_type": "want_to_contribute"}, token=new_user["token"])

        # Second via API under test
        resp = _api("POST", f"/api/projects/{published_project}/interest", base_url=api_url,
                    json={"interest_type": "want_to_contribute"}, token=new_user["token"])
        assert resp.status_code == 400

    @pytest.mark.local_only
    def test_withdraw_pending_interest(self, api_url, published_project, new_user):
        _api("POST", f"/api/projects/{published_project}/interest", base_url=BASE_URL,
             json={"interest_type": "want_to_contribute"}, token=new_user["token"])

        resp = _api("DELETE", f"/api/projects/{published_project}/interest", base_url=api_url,
                    token=new_user["token"])
        assert resp.status_code == 200

    @pytest.mark.local_only
    def test_owner_can_accept_interest(self, api_url, admin_token, new_user):
        pid = _make_project(BASE_URL, admin_token, is_seeking_help=True, want_to_own=True)

        interest_resp = _api("POST", f"/api/projects/{pid}/interest", base_url=BASE_URL,
                             json={"interest_type": "want_to_contribute"}, token=new_user["token"])
        assert interest_resp.status_code == 200

        # Fetch interest id via admin detail
        detail = _api("GET", f"/api/projects/{pid}", base_url=BASE_URL, token=admin_token)
        interest_id = detail.json()["interests"][0]["id"]

        resp = _api("PUT", f"/api/projects/{pid}/interest/{interest_id}", base_url=api_url,
                    json={"status": "accepted"}, token=admin_token)
        assert resp.status_code == 200

    @pytest.mark.local_only
    def test_owner_can_decline_interest(self, api_url, admin_token, new_user):
        pid = _make_project(BASE_URL, admin_token, is_seeking_help=True, want_to_own=True)

        interest_resp = _api("POST", f"/api/projects/{pid}/interest", base_url=BASE_URL,
                             json={"interest_type": "want_to_contribute"}, token=new_user["token"])
        assert interest_resp.status_code == 200

        detail = _api("GET", f"/api/projects/{pid}", base_url=BASE_URL, token=admin_token)
        interest_id = detail.json()["interests"][0]["id"]

        resp = _api("PUT", f"/api/projects/{pid}/interest/{interest_id}", base_url=api_url,
                    json={"status": "declined", "response_message": "Not a good fit right now."}, token=admin_token)
        assert resp.status_code == 200

    @pytest.mark.local_only
    def test_accepting_want_to_own_assigns_owner(self, api_url, admin_token, new_user):
        # Create a project without an owner
        pid = _make_project(BASE_URL, admin_token, is_seeking_owner=True, want_to_own=False)

        interest_resp = _api("POST", f"/api/projects/{pid}/interest", base_url=BASE_URL,
                             json={"interest_type": "want_to_own"}, token=new_user["token"])
        assert interest_resp.status_code == 200

        detail = _api("GET", f"/api/projects/{pid}", base_url=BASE_URL, token=admin_token)
        interest_id = detail.json()["interests"][0]["id"]

        _api("PUT", f"/api/projects/{pid}/interest/{interest_id}", base_url=api_url,
             json={"status": "accepted"}, token=admin_token)

        updated = _api("GET", f"/api/projects/{pid}", base_url=api_url, token=admin_token)
        assert updated.json()["owner_id"] == new_user["id"]

    @pytest.mark.local_only
    def test_non_owner_cannot_respond_to_interest(self, api_url, admin_token, new_user):
        pid = _make_project(BASE_URL, admin_token, is_seeking_help=True, want_to_own=True)
        other = _make_volunteer(BASE_URL)

        _api("POST", f"/api/projects/{pid}/interest", base_url=BASE_URL,
             json={"interest_type": "want_to_contribute"}, token=other["token"])

        detail = _api("GET", f"/api/projects/{pid}", base_url=BASE_URL, token=admin_token)
        interest_id = detail.json()["interests"][0]["id"]

        resp = _api("PUT", f"/api/projects/{pid}/interest/{interest_id}", base_url=api_url,
                    json={"status": "accepted"}, token=new_user["token"])
        assert resp.status_code == 403
