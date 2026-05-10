"""
E2E API tests for project operation routes — parameterised to run against both FastAPI and Next.js.

Scenarios covered:
  - POST /api/projects/{project_id}/assign   (assign a volunteer to a project)
  - POST /api/projects/{project_id}/updates  (add a project update)
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


def _make_project(base_url, admin_token):
    """Create an org project via admin and return its id."""
    resp = _api("POST", "/api/admin/projects", base_url=base_url, json={
        "title": f"Op Project {uuid.uuid4().hex[:8]}",
        "description": "A project for operation testing.",
        "urgency": "medium",
    }, token=admin_token)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]



# ── POST /api/projects/{project_id}/assign ────────────────────────────────────

class TestProjectAssign:
    """POST /api/projects/{project_id}/assign"""

    @pytest.mark.local_only
    def test_unauthenticated_is_rejected(self, api_url, published_project):
        resp = _api("POST", f"/api/projects/{published_project}/assign",
                    base_url=api_url, json={"volunteer_id": 1})
        assert resp.status_code == 401

    @pytest.mark.local_only
    def test_non_owner_non_admin_is_rejected(self, api_url, published_project, new_user):
        vol = _make_volunteer(BASE_URL)
        resp = _api("POST", f"/api/projects/{published_project}/assign",
                    base_url=api_url, json={"volunteer_id": vol["id"]},
                    token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_unknown_project_returns_404(self, api_url, admin_token, new_user):
        resp = _api("POST", "/api/projects/999999/assign",
                    base_url=api_url, json={"volunteer_id": new_user["id"]},
                    token=admin_token)
        assert resp.status_code == 404

    @pytest.mark.local_only
    def test_missing_volunteer_id_returns_error(self, api_url, admin_token, published_project):
        resp = _api("POST", f"/api/projects/{published_project}/assign",
                    base_url=api_url, json={}, token=admin_token)
        assert resp.status_code in (400, 422)

    @pytest.mark.local_only
    def test_admin_can_assign_volunteer(self, api_url, admin_token, published_project):
        vol = _make_volunteer(BASE_URL)
        resp = _api("POST", f"/api/projects/{published_project}/assign",
                    base_url=api_url, json={"volunteer_id": vol["id"]},
                    token=admin_token)
        assert resp.status_code == 200
        assert "message" in resp.json()

    @pytest.mark.local_only
    def test_assigned_volunteer_has_accepted_interest(self, api_url, admin_token, published_project):
        vol = _make_volunteer(BASE_URL)
        _api("POST", f"/api/projects/{published_project}/assign",
             base_url=BASE_URL, json={"volunteer_id": vol["id"]}, token=admin_token)

        detail = _api("GET", f"/api/projects/{published_project}",
                      base_url=api_url, token=admin_token)
        assert detail.status_code == 200
        interests = detail.json().get("interests", [])
        assigned = [i for i in interests if i["volunteer_id"] == vol["id"]]
        assert assigned
        assert assigned[0]["status"] == "accepted"

    @pytest.mark.local_only
    def test_assigning_again_is_idempotent(self, api_url, admin_token, published_project):
        vol = _make_volunteer(BASE_URL)
        _api("POST", f"/api/projects/{published_project}/assign",
             base_url=BASE_URL, json={"volunteer_id": vol["id"]}, token=admin_token)

        resp = _api("POST", f"/api/projects/{published_project}/assign",
                    base_url=api_url, json={"volunteer_id": vol["id"]}, token=admin_token)
        assert resp.status_code == 200

    @pytest.mark.local_only
    def test_pending_interest_accepted_on_assign(self, api_url, admin_token, published_project):
        vol = _make_volunteer(BASE_URL)
        _api("POST", f"/api/projects/{published_project}/interest", base_url=BASE_URL,
             json={"interest_type": "want_to_contribute", "message": "I want to help!"},
             token=vol["token"])

        resp = _api("POST", f"/api/projects/{published_project}/assign",
                    base_url=api_url, json={"volunteer_id": vol["id"]}, token=admin_token)
        assert resp.status_code == 200

        detail = _api("GET", f"/api/projects/{published_project}",
                      base_url=api_url, token=admin_token)
        interests = detail.json().get("interests", [])
        mine = [i for i in interests if i["volunteer_id"] == vol["id"]]
        assert mine
        assert mine[0]["status"] == "accepted"


# ── POST /api/projects/{project_id}/updates ───────────────────────────────────

class TestProjectUpdates:
    """POST /api/projects/{project_id}/updates"""

    @pytest.mark.local_only
    def test_unauthenticated_is_rejected(self, api_url, published_project):
        resp = _api("POST", f"/api/projects/{published_project}/updates",
                    base_url=api_url, json={"content": "An update."})
        assert resp.status_code == 401

    @pytest.mark.local_only
    def test_non_owner_non_admin_is_rejected(self, api_url, published_project, new_user):
        resp = _api("POST", f"/api/projects/{published_project}/updates",
                    base_url=api_url, json={"content": "Sneaky update."},
                    token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_unknown_project_returns_404(self, api_url, admin_token):
        resp = _api("POST", "/api/projects/999999/updates",
                    base_url=api_url, json={"content": "An update."},
                    token=admin_token)
        assert resp.status_code == 404

    @pytest.mark.local_only
    def test_missing_content_returns_error(self, api_url, admin_token, published_project):
        resp = _api("POST", f"/api/projects/{published_project}/updates",
                    base_url=api_url, json={}, token=admin_token)
        assert resp.status_code in (400, 422)

    @pytest.mark.local_only
    def test_whitespace_only_content_is_accepted(self, api_url, admin_token, published_project):
        resp = _api("POST", f"/api/projects/{published_project}/updates",
                    base_url=api_url, json={"content": "   "}, token=admin_token)
        assert resp.status_code == 200

    @pytest.mark.local_only
    def test_admin_can_add_update(self, api_url, admin_token, published_project):
        resp = _api("POST", f"/api/projects/{published_project}/updates",
                    base_url=api_url, json={"content": "Progress update from admin."},
                    token=admin_token)
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data
        assert "message" in data

    @pytest.mark.local_only
    def test_update_appears_in_project_detail(self, api_url, admin_token, published_project):
        content = f"Update {uuid.uuid4().hex[:8]}"
        post_resp = _api("POST", f"/api/projects/{published_project}/updates",
                         base_url=BASE_URL, json={"content": content}, token=admin_token)
        update_id = post_resp.json()["id"]

        detail = _api("GET", f"/api/projects/{published_project}",
                      base_url=api_url, token=admin_token)
        assert detail.status_code == 200
        update_ids = [u["id"] for u in detail.json().get("updates", [])]
        assert update_id in update_ids

    @pytest.mark.local_only
    def test_update_content_persists(self, api_url, admin_token, published_project):
        content = f"Persist_{uuid.uuid4().hex[:8]}"
        post_resp = _api("POST", f"/api/projects/{published_project}/updates",
                         base_url=BASE_URL, json={"content": content}, token=admin_token)
        update_id = post_resp.json()["id"]

        detail = _api("GET", f"/api/projects/{published_project}",
                      base_url=api_url, token=admin_token)
        updates = {u["id"]: u for u in detail.json().get("updates", [])}
        assert update_id in updates
        assert updates[update_id]["content"] == content
