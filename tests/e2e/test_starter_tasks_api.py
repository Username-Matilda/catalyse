"""
E2E API tests for Starter Task routes — parameterised to run against both FastAPI and Next.js.

Scenarios covered:
  - GET  /api/starter-tasks/available          (public list of open tasks)
  - GET  /api/starter-tasks                    (admin list with filters)
  - POST /api/starter-tasks                    (admin create)
  - GET  /api/my/starter-tasks                 (tasks assigned to current volunteer)
  - POST /api/starter-tasks/{id}/assign        (admin assigns to volunteer)
  - PUT  /api/starter-tasks/{id}/submit        (volunteer submits)
  - POST /api/starter-tasks/{id}/review        (admin reviews; good/excellent → completed + skill endorsed)
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


def _make_volunteer(base_url):
    email = f"vol_{uuid.uuid4().hex[:8]}@test.com"
    resp = _api("POST", "/api/auth/signup", base_url=base_url, json={
        "name": "Test Volunteer",
        "email": email,
        "password": "testpassword1",
        "consent_profile_visible": True,
        "consent_contact_by_owners": True,
    })
    assert resp.status_code == 200, resp.text
    data = resp.json()
    return {"id": data["id"], "token": data["auth_token"]}


def _make_starter_task(base_url, token, **kwargs):
    """Helper: create a starter task via admin and return its id."""
    payload = {
        "title": f"Starter task {uuid.uuid4().hex[:8]}",
        "description": "A test starter task.",
    }
    payload.update(kwargs)
    resp = _api("POST", "/api/starter-tasks", base_url=base_url, json=payload, token=token)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


# ── Available Starter Tasks ───────────────────────────────────────────────────

class TestStarterTasksAvailable:
    """GET /api/starter-tasks/available"""

    @pytest.mark.local_only
    def test_returns_list(self, api_url):
        resp = _api("GET", "/api/starter-tasks/available", base_url=api_url)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.local_only
    def test_open_task_appears_in_list(self, api_url, admin_token):
        title = f"Visible task {uuid.uuid4().hex[:8]}"
        _make_starter_task(BASE_URL, admin_token, title=title)

        resp = _api("GET", "/api/starter-tasks/available", base_url=api_url)
        assert resp.status_code == 200
        titles = [t["title"] for t in resp.json()]
        assert title in titles

    @pytest.mark.local_only
    def test_assigned_task_not_in_available_list(self, api_url, admin_token):
        vol = _make_volunteer(BASE_URL)
        title = f"Assigned task {uuid.uuid4().hex[:8]}"
        task_id = _make_starter_task(BASE_URL, admin_token, title=title)

        _api("POST", f"/api/starter-tasks/{task_id}/assign", base_url=BASE_URL,
             json={"volunteer_id": vol["id"]}, token=admin_token)

        resp = _api("GET", "/api/starter-tasks/available", base_url=api_url)
        titles = [t["title"] for t in resp.json()]
        assert title not in titles

    @pytest.mark.local_only
    def test_returns_expected_fields(self, api_url, admin_token):
        _make_starter_task(BASE_URL, admin_token)
        resp = _api("GET", "/api/starter-tasks/available", base_url=api_url)
        assert resp.status_code == 200
        tasks = resp.json()
        if tasks:
            for field in ("id", "title", "description"):
                assert field in tasks[0], f"Missing field: {field}"


# ── Admin: List Starter Tasks ─────────────────────────────────────────────────

class TestAdminStarterTasksList:
    """GET /api/starter-tasks (admin)"""

    @pytest.mark.local_only
    def test_requires_admin(self, api_url, new_user):
        resp = _api("GET", "/api/starter-tasks", base_url=api_url, token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_returns_list(self, api_url, admin_token):
        resp = _api("GET", "/api/starter-tasks", base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.local_only
    def test_created_task_in_admin_list(self, api_url, admin_token):
        title = f"Admin listed {uuid.uuid4().hex[:8]}"
        task_id = _make_starter_task(BASE_URL, admin_token, title=title)

        resp = _api("GET", "/api/starter-tasks", base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        ids = [t["id"] for t in resp.json()]
        assert task_id in ids

    @pytest.mark.local_only
    def test_status_filter(self, api_url, admin_token):
        # Create an open task; filter to open — all results should be open
        _make_starter_task(BASE_URL, admin_token)

        resp = _api("GET", "/api/starter-tasks", base_url=api_url,
                    params={"status": "open"}, token=admin_token)
        assert resp.status_code == 200
        for task in resp.json():
            assert task["status"] == "open"


# ── Admin: Create Starter Task ────────────────────────────────────────────────

class TestAdminCreateStarterTask:
    """POST /api/starter-tasks"""

    @pytest.mark.local_only
    def test_requires_admin(self, api_url, new_user):
        resp = _api("POST", "/api/starter-tasks", base_url=api_url,
                    json={"title": "Forbidden task", "description": "Not allowed."},
                    token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_admin_creates_task(self, api_url, admin_token):
        resp = _api("POST", "/api/starter-tasks", base_url=api_url, json={
            "title": f"New task {uuid.uuid4().hex[:8]}",
            "description": "Do this small thing.",
        }, token=admin_token)
        assert resp.status_code == 200
        assert "id" in resp.json()

    @pytest.mark.local_only
    def test_created_task_starts_as_open(self, api_url, admin_token):
        title = f"Open task {uuid.uuid4().hex[:8]}"
        resp = _api("POST", "/api/starter-tasks", base_url=api_url,
                    json={"title": title, "description": "Check status."}, token=admin_token)
        task_id = resp.json()["id"]

        tasks = _api("GET", "/api/starter-tasks", base_url=api_url, token=admin_token)
        task = next((t for t in tasks.json() if t["id"] == task_id), None)
        assert task is not None
        assert task["status"] == "open"

    @pytest.mark.local_only
    def test_with_optional_fields(self, api_url, admin_token):
        resp = _api("POST", "/api/starter-tasks", base_url=api_url, json={
            "title": f"Detailed task {uuid.uuid4().hex[:8]}",
            "description": "Has optional fields.",
            "estimated_hours": 3.5,
        }, token=admin_token)
        assert resp.status_code == 200


# ── My Starter Tasks ──────────────────────────────────────────────────────────

class TestMyStarterTasks:
    """GET /api/my/starter-tasks"""

    @pytest.mark.local_only
    def test_requires_auth(self, api_url):
        resp = _api("GET", "/api/my/starter-tasks", base_url=api_url)
        assert resp.status_code == 401

    @pytest.mark.local_only
    def test_returns_list(self, api_url, new_user):
        resp = _api("GET", "/api/my/starter-tasks", base_url=api_url, token=new_user["token"])
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.local_only
    def test_assigned_task_appears(self, api_url, admin_token, new_user):
        task_id = _make_starter_task(BASE_URL, admin_token)
        _api("POST", f"/api/starter-tasks/{task_id}/assign", base_url=BASE_URL,
             json={"volunteer_id": new_user["id"]}, token=admin_token)

        resp = _api("GET", "/api/my/starter-tasks", base_url=api_url, token=new_user["token"])
        assert resp.status_code == 200
        ids = [t["id"] for t in resp.json()]
        assert task_id in ids

    @pytest.mark.local_only
    def test_other_users_tasks_not_visible(self, api_url, admin_token, new_user):
        other = _make_volunteer(BASE_URL)
        task_id = _make_starter_task(BASE_URL, admin_token)
        _api("POST", f"/api/starter-tasks/{task_id}/assign", base_url=BASE_URL,
             json={"volunteer_id": other["id"]}, token=admin_token)

        resp = _api("GET", "/api/my/starter-tasks", base_url=api_url, token=new_user["token"])
        assert resp.status_code == 200
        ids = [t["id"] for t in resp.json()]
        assert task_id not in ids


# ── Assign Starter Task ───────────────────────────────────────────────────────

class TestAssignStarterTask:
    """POST /api/starter-tasks/{id}/assign"""

    @pytest.mark.local_only
    def test_requires_admin(self, api_url, new_user, admin_token):
        task_id = _make_starter_task(BASE_URL, admin_token)
        resp = _api("POST", f"/api/starter-tasks/{task_id}/assign", base_url=api_url,
                    json={"volunteer_id": new_user["id"]}, token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_admin_can_assign(self, api_url, admin_token, new_user):
        task_id = _make_starter_task(BASE_URL, admin_token)
        resp = _api("POST", f"/api/starter-tasks/{task_id}/assign", base_url=api_url,
                    json={"volunteer_id": new_user["id"]}, token=admin_token)
        assert resp.status_code == 200

    @pytest.mark.local_only
    def test_assigned_task_status_is_assigned(self, api_url, admin_token, new_user):
        task_id = _make_starter_task(BASE_URL, admin_token)
        _api("POST", f"/api/starter-tasks/{task_id}/assign", base_url=api_url,
             json={"volunteer_id": new_user["id"]}, token=admin_token)

        tasks = _api("GET", "/api/starter-tasks", base_url=api_url, token=admin_token)
        task = next((t for t in tasks.json() if t["id"] == task_id), None)
        assert task is not None
        assert task["status"] == "assigned"
        assert task["assigned_to_id"] == new_user["id"]

    @pytest.mark.local_only
    def test_unknown_task_returns_404(self, api_url, admin_token, new_user):
        resp = _api("POST", "/api/starter-tasks/999999/assign", base_url=api_url,
                    json={"volunteer_id": new_user["id"]}, token=admin_token)
        assert resp.status_code == 404


# ── Submit Starter Task ───────────────────────────────────────────────────────

class TestSubmitStarterTask:
    """PUT /api/starter-tasks/{id}/submit"""

    @pytest.mark.local_only
    def test_requires_auth(self, api_url, admin_token):
        task_id = _make_starter_task(BASE_URL, admin_token)
        resp = _api("PUT", f"/api/starter-tasks/{task_id}/submit", base_url=api_url)
        assert resp.status_code == 401

    @pytest.mark.local_only
    def test_volunteer_can_submit_assigned_task(self, api_url, admin_token, new_user):
        task_id = _make_starter_task(BASE_URL, admin_token)
        _api("POST", f"/api/starter-tasks/{task_id}/assign", base_url=BASE_URL,
             json={"volunteer_id": new_user["id"]}, token=admin_token)

        resp = _api("PUT", f"/api/starter-tasks/{task_id}/submit", base_url=api_url,
                    token=new_user["token"])
        assert resp.status_code == 200

    @pytest.mark.local_only
    def test_submitted_task_status_changes(self, api_url, admin_token, new_user):
        task_id = _make_starter_task(BASE_URL, admin_token)
        _api("POST", f"/api/starter-tasks/{task_id}/assign", base_url=BASE_URL,
             json={"volunteer_id": new_user["id"]}, token=admin_token)

        _api("PUT", f"/api/starter-tasks/{task_id}/submit", base_url=api_url, token=new_user["token"])

        tasks = _api("GET", "/api/starter-tasks", base_url=api_url, token=admin_token)
        task = next((t for t in tasks.json() if t["id"] == task_id), None)
        assert task["status"] == "submitted"

    @pytest.mark.local_only
    def test_non_assignee_cannot_submit(self, api_url, admin_token, new_user):
        other = _make_volunteer(BASE_URL)
        task_id = _make_starter_task(BASE_URL, admin_token)
        _api("POST", f"/api/starter-tasks/{task_id}/assign", base_url=BASE_URL,
             json={"volunteer_id": other["id"]}, token=admin_token)

        resp = _api("PUT", f"/api/starter-tasks/{task_id}/submit", base_url=api_url,
                    token=new_user["token"])
        assert resp.status_code == 404


# ── Review Starter Task ───────────────────────────────────────────────────────

class TestReviewStarterTask:
    """POST /api/starter-tasks/{id}/review"""

    @pytest.mark.local_only
    def test_requires_admin(self, api_url, new_user, admin_token):
        task_id = _make_starter_task(BASE_URL, admin_token)
        resp = _api("POST", f"/api/starter-tasks/{task_id}/review", base_url=api_url,
                    json={"review_rating": "good"}, token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_good_rating_sets_completed(self, api_url, admin_token, new_user):
        task_id = _make_starter_task(BASE_URL, admin_token)
        _api("POST", f"/api/starter-tasks/{task_id}/assign", base_url=BASE_URL,
             json={"volunteer_id": new_user["id"]}, token=admin_token)
        _api("PUT", f"/api/starter-tasks/{task_id}/submit", base_url=BASE_URL,
             token=new_user["token"])

        resp = _api("POST", f"/api/starter-tasks/{task_id}/review", base_url=api_url,
                    json={"review_rating": "good"}, token=admin_token)
        assert resp.status_code == 200

        tasks = _api("GET", "/api/starter-tasks", base_url=api_url, token=admin_token)
        task = next(t for t in tasks.json() if t["id"] == task_id)
        assert task["status"] == "completed"
        assert task["review_rating"] == "good"

    @pytest.mark.local_only
    def test_excellent_rating_sets_completed(self, api_url, admin_token, new_user):
        task_id = _make_starter_task(BASE_URL, admin_token)
        _api("POST", f"/api/starter-tasks/{task_id}/assign", base_url=BASE_URL,
             json={"volunteer_id": new_user["id"]}, token=admin_token)
        _api("PUT", f"/api/starter-tasks/{task_id}/submit", base_url=BASE_URL,
             token=new_user["token"])

        resp = _api("POST", f"/api/starter-tasks/{task_id}/review", base_url=api_url,
                    json={"review_rating": "excellent", "review_notes": "Outstanding work!"}, token=admin_token)
        assert resp.status_code == 200

        tasks = _api("GET", "/api/starter-tasks", base_url=api_url, token=admin_token)
        task = next(t for t in tasks.json() if t["id"] == task_id)
        assert task["status"] == "completed"

    @pytest.mark.local_only
    def test_needs_improvement_sets_reviewed_not_completed(self, api_url, admin_token, new_user):
        task_id = _make_starter_task(BASE_URL, admin_token)
        _api("POST", f"/api/starter-tasks/{task_id}/assign", base_url=BASE_URL,
             json={"volunteer_id": new_user["id"]}, token=admin_token)
        _api("PUT", f"/api/starter-tasks/{task_id}/submit", base_url=BASE_URL,
             token=new_user["token"])

        resp = _api("POST", f"/api/starter-tasks/{task_id}/review", base_url=api_url,
                    json={"review_rating": "needs_improvement", "feedback_to_volunteer": "Please redo this part."},
                    token=admin_token)
        assert resp.status_code == 200

        tasks = _api("GET", "/api/starter-tasks", base_url=api_url, token=admin_token)
        task = next(t for t in tasks.json() if t["id"] == task_id)
        assert task["status"] == "reviewed"
        assert task["review_rating"] == "needs_improvement"

    @pytest.mark.local_only
    def test_cannot_review_non_submitted_task(self, api_url, admin_token, new_user):
        task_id = _make_starter_task(BASE_URL, admin_token)
        _api("POST", f"/api/starter-tasks/{task_id}/assign", base_url=BASE_URL,
             json={"volunteer_id": new_user["id"]}, token=admin_token)
        # Not submitted — still 'assigned'

        resp = _api("POST", f"/api/starter-tasks/{task_id}/review", base_url=api_url,
                    json={"review_rating": "good"}, token=admin_token)
        assert resp.status_code == 400

    @pytest.mark.local_only
    def test_review_with_skill_endorses_on_good(self, api_url, admin_token, new_user):
        # Get any skill id
        skills_resp = _api("GET", "/api/skills", base_url=BASE_URL)
        categories = skills_resp.json()
        if not categories or not categories[0]["skills"]:
            pytest.skip("No skills in DB")
        skill_id = categories[0]["skills"][0]["id"]

        task_id = _make_starter_task(BASE_URL, admin_token, skill_id=skill_id)
        _api("POST", f"/api/starter-tasks/{task_id}/assign", base_url=BASE_URL,
             json={"volunteer_id": new_user["id"]}, token=admin_token)
        _api("PUT", f"/api/starter-tasks/{task_id}/submit", base_url=BASE_URL,
             token=new_user["token"])

        resp = _api("POST", f"/api/starter-tasks/{task_id}/review", base_url=api_url,
                    json={"review_rating": "good"}, token=admin_token)
        assert resp.status_code == 200

        # The volunteer's profile should now have an endorsement for this skill
        profile = _api("GET", f"/api/volunteers/{new_user['id']}", base_url=api_url,
                       token=new_user["token"])
        assert profile.status_code == 200
        endorsed_skill_ids = [e["skill_id"] for e in profile.json().get("endorsements", [])]
        assert skill_id in endorsed_skill_ids
