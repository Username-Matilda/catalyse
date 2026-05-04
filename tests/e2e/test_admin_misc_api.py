"""
E2E API tests for miscellaneous admin routes — parameterised to run against both FastAPI and Next.js.

Scenarios covered:
  - PUT /api/admin/projects/{id}/outcome  (record project outcome)
  - GET /api/admin/stats                  (platform statistics)
  - GET /api/admin/interests              (all interests, with status filter)
  - GET /api/admin/backup                 (download database file)
  - POST /api/admin/backup/run            (trigger backup)
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
    """Create an org project via admin and return its id."""
    payload = {
        "title": f"Test Project {uuid.uuid4().hex[:8]}",
        "description": "A project for testing.",
        "urgency": "medium",
    }
    payload.update(kwargs)
    resp = _api("POST", "/api/admin/projects", base_url=base_url, json=payload, token=token)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def _make_volunteer(base_url):
    """Sign up a fresh volunteer and return {id, token}."""
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


# ── Admin: Project Outcome ────────────────────────────────────────────────────

class TestAdminProjectOutcome:
    """PUT /api/admin/projects/{id}/outcome"""

    @pytest.mark.local_only
    def test_requires_admin(self, api_url, new_user):
        pid = _make_project(BASE_URL, new_user["token"] if False else None, **{}) if False else None
        # Use a placeholder project id — auth should fail before the id is checked
        resp = _api("PUT", "/api/admin/projects/1/outcome", base_url=api_url,
                    json={"outcome": "successful"}, token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_unauthenticated_is_rejected(self, api_url):
        resp = _api("PUT", "/api/admin/projects/1/outcome", base_url=api_url,
                    json={"outcome": "successful"})
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_unknown_project_returns_404(self, api_url, admin_token):
        resp = _api("PUT", "/api/admin/projects/999999/outcome", base_url=api_url,
                    json={"outcome": "successful"}, token=admin_token)
        assert resp.status_code == 404

    @pytest.mark.local_only
    def test_invalid_outcome_returns_400(self, api_url, admin_token):
        pid = _make_project(BASE_URL, admin_token)
        resp = _api("PUT", f"/api/admin/projects/{pid}/outcome", base_url=api_url,
                    json={"outcome": "invalid_value"}, token=admin_token)
        assert resp.status_code == 400

    @pytest.mark.local_only
    def test_successful_outcome(self, api_url, admin_token):
        pid = _make_project(BASE_URL, admin_token)
        resp = _api("PUT", f"/api/admin/projects/{pid}/outcome", base_url=api_url,
                    json={"outcome": "successful"}, token=admin_token)
        assert resp.status_code == 200
        assert "message" in resp.json()

    @pytest.mark.local_only
    def test_partial_outcome(self, api_url, admin_token):
        pid = _make_project(BASE_URL, admin_token)
        resp = _api("PUT", f"/api/admin/projects/{pid}/outcome", base_url=api_url,
                    json={"outcome": "partial"}, token=admin_token)
        assert resp.status_code == 200

    @pytest.mark.local_only
    def test_not_completed_outcome(self, api_url, admin_token):
        pid = _make_project(BASE_URL, admin_token)
        resp = _api("PUT", f"/api/admin/projects/{pid}/outcome", base_url=api_url,
                    json={"outcome": "not_completed"}, token=admin_token)
        assert resp.status_code == 200

    @pytest.mark.local_only
    def test_ongoing_outcome(self, api_url, admin_token):
        pid = _make_project(BASE_URL, admin_token)
        resp = _api("PUT", f"/api/admin/projects/{pid}/outcome", base_url=api_url,
                    json={"outcome": "ongoing"}, token=admin_token)
        assert resp.status_code == 200

    @pytest.mark.local_only
    def test_outcome_with_notes(self, api_url, admin_token):
        pid = _make_project(BASE_URL, admin_token)
        resp = _api("PUT", f"/api/admin/projects/{pid}/outcome", base_url=api_url,
                    json={"outcome": "successful", "outcome_notes": "Great project, delivered on time."},
                    token=admin_token)
        assert resp.status_code == 200

    @pytest.mark.local_only
    def test_completed_outcomes_mark_project_completed(self, api_url, admin_token):
        pid = _make_project(BASE_URL, admin_token)
        _api("PUT", f"/api/admin/projects/{pid}/outcome", base_url=api_url,
             json={"outcome": "successful"}, token=admin_token)

        detail = _api("GET", f"/api/projects/{pid}", base_url=api_url, token=admin_token)
        assert detail.status_code == 200
        assert detail.json()["status"] == "completed"

    @pytest.mark.local_only
    def test_ongoing_outcome_does_not_mark_project_completed(self, api_url, admin_token):
        pid = _make_project(BASE_URL, admin_token,
                            tasks=[{"title": "A task", "description": "Do this."}])
        _api("PUT", f"/api/admin/projects/{pid}/outcome", base_url=api_url,
             json={"outcome": "ongoing"}, token=admin_token)

        detail = _api("GET", f"/api/projects/{pid}", base_url=api_url, token=admin_token)
        assert detail.status_code == 200
        assert detail.json()["status"] != "completed"


# ── Admin: Stats ──────────────────────────────────────────────────────────────

class TestAdminStats:
    """GET /api/admin/stats"""

    @pytest.mark.local_only
    def test_requires_admin(self, api_url, new_user):
        resp = _api("GET", "/api/admin/stats", base_url=api_url, token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_unauthenticated_is_rejected(self, api_url):
        resp = _api("GET", "/api/admin/stats", base_url=api_url)
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_returns_volunteers_section(self, api_url, admin_token):
        resp = _api("GET", "/api/admin/stats", base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        data = resp.json()
        assert "volunteers" in data
        volunteers = data["volunteers"]
        assert "total" in volunteers
        assert "this_month" in volunteers
        assert isinstance(volunteers["total"], int)
        assert isinstance(volunteers["this_month"], int)

    @pytest.mark.local_only
    def test_returns_projects_section(self, api_url, admin_token):
        resp = _api("GET", "/api/admin/stats", base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        projects = resp.json()["projects"]
        for field in ("total", "pending_review", "seeking_help", "in_progress", "completed"):
            assert field in projects, f"Missing projects.{field}"
            assert isinstance(projects[field], int)

    @pytest.mark.local_only
    def test_returns_interests_section(self, api_url, admin_token):
        resp = _api("GET", "/api/admin/stats", base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        interests = resp.json()["interests"]
        assert "total" in interests
        assert "pending" in interests
        assert isinstance(interests["total"], int)
        assert isinstance(interests["pending"], int)

    @pytest.mark.local_only
    def test_counts_are_non_negative(self, api_url, admin_token, published_project):
        resp = _api("GET", "/api/admin/stats", base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        data = resp.json()
        assert data["volunteers"]["total"] >= 1
        assert data["projects"]["total"] >= 1


# ── Admin: Interests ──────────────────────────────────────────────────────────

class TestAdminInterests:
    """GET /api/admin/interests"""

    @pytest.mark.local_only
    def test_requires_admin(self, api_url, new_user):
        resp = _api("GET", "/api/admin/interests", base_url=api_url, token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_unauthenticated_is_rejected(self, api_url):
        resp = _api("GET", "/api/admin/interests", base_url=api_url)
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_returns_list(self, api_url, admin_token):
        resp = _api("GET", "/api/admin/interests", base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.local_only
    def test_interest_has_expected_fields(self, api_url, admin_token, published_project):
        # Express interest so there is at least one record
        vol = _make_volunteer(BASE_URL)
        _api("POST", f"/api/projects/{published_project}/interest", base_url=BASE_URL,
             json={"interest_type": "want_to_contribute", "message": "I want to help."}, token=vol["token"])

        resp = _api("GET", "/api/admin/interests", base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        interests = resp.json()
        assert len(interests) >= 1
        interest = interests[0]
        for field in ("id", "volunteer_id", "project_id", "status", "interest_type",
                      "volunteer_name", "project_title"):
            assert field in interest, f"Missing field: {field}"

    @pytest.mark.local_only
    def test_status_filter_pending(self, api_url, admin_token, published_project):
        # Ensure there is at least one pending interest
        vol = _make_volunteer(BASE_URL)
        _api("POST", f"/api/projects/{published_project}/interest", base_url=BASE_URL,
             json={"interest_type": "want_to_contribute", "message": "Pending interest."}, token=vol["token"])

        resp = _api("GET", "/api/admin/interests", base_url=api_url, token=admin_token,
                    params={"status": "pending"})
        assert resp.status_code == 200
        for interest in resp.json():
            assert interest["status"] == "pending"

    @pytest.mark.local_only
    def test_status_filter_returns_only_matching(self, api_url, admin_token):
        resp = _api("GET", "/api/admin/interests", base_url=api_url, token=admin_token,
                    params={"status": "accepted"})
        assert resp.status_code == 200
        for interest in resp.json():
            assert interest["status"] == "accepted"


# ── Admin: Backup (download) ──────────────────────────────────────────────────

class TestAdminBackupDownload:
    """GET /api/admin/backup"""

    @pytest.mark.local_only
    def test_requires_admin(self, api_url, new_user):
        resp = _api("GET", "/api/admin/backup", base_url=api_url, token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_unauthenticated_is_rejected(self, api_url):
        resp = _api("GET", "/api/admin/backup", base_url=api_url)
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_returns_binary_file(self, api_url, admin_token):
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{api_url}/api/admin/backup", headers=headers, timeout=15)
        assert resp.status_code == 200
        content_type = resp.headers.get("Content-Type", "")
        assert "octet-stream" in content_type
        assert len(resp.content) > 0

    @pytest.mark.local_only
    def test_response_has_attachment_header(self, api_url, admin_token):
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{api_url}/api/admin/backup", headers=headers, timeout=15)
        assert resp.status_code == 200
        disposition = resp.headers.get("Content-Disposition", "")
        assert "attachment" in disposition
        assert ".db" in disposition

    @pytest.mark.local_only
    def test_file_is_valid_sqlite(self, api_url, admin_token):
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{api_url}/api/admin/backup", headers=headers, timeout=15)
        assert resp.status_code == 200
        # SQLite databases start with the magic header string
        assert resp.content[:6] == b"SQLite"


# ── Admin: Backup (trigger) ───────────────────────────────────────────────────

class TestAdminBackupRun:
    """POST /api/admin/backup/run"""

    @pytest.mark.local_only
    def test_requires_admin(self, api_url, new_user):
        resp = _api("POST", "/api/admin/backup/run", base_url=api_url, token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_unauthenticated_is_rejected(self, api_url):
        resp = _api("POST", "/api/admin/backup/run", base_url=api_url)
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_returns_success_message(self, api_url, admin_token):
        resp = _api("POST", "/api/admin/backup/run", base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        data = resp.json()
        assert "message" in data
        assert isinstance(data["message"], str)
        assert len(data["message"]) > 0

    @pytest.mark.local_only
    def test_message_mentions_backup(self, api_url, admin_token):
        resp = _api("POST", "/api/admin/backup/run", base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        message = resp.json()["message"].lower()
        assert "backup" in message
