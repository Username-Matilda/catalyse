"""
E2E API tests for admin volunteer detail routes — parameterised to run against both FastAPI and Next.js.

Scenarios covered:
  - GET  /api/admin/volunteers/{volunteer_id}              (volunteer detail)
  - GET  /api/admin/volunteers/{volunteer_id}/endorsements (list endorsements)
  - GET  /api/admin/volunteers/{volunteer_id}/notes        (list notes)
  - POST /api/admin/volunteers/{volunteer_id}/endorsements (add/upsert endorsement)
  - POST /api/admin/volunteers/{volunteer_id}/notes        (add note)
  - PUT  /api/admin/notes/{note_id}                        (update note)
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
    """Sign up a fresh volunteer and return {id, token, email}."""
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
    return {"id": data["id"], "token": data["auth_token"], "email": email}


def _get_skill_id(base_url):
    """Return the id of the first available skill, or None."""
    resp = _api("GET", "/api/skills", base_url=base_url)
    categories = resp.json()
    if categories and categories[0].get("skills"):
        return categories[0]["skills"][0]["id"]
    return None


def _make_note(base_url, admin_token, volunteer_id):
    """Create an admin note and return its id."""
    resp = _api("POST", f"/api/admin/volunteers/{volunteer_id}/notes", base_url=base_url,
                json={"content": "Test note content", "category": "general"}, token=admin_token)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


# ── GET /api/admin/volunteers/{volunteer_id} ───────────────────────────────────

class TestAdminVolunteerDetail:
    """GET /api/admin/volunteers/{volunteer_id}"""

    @pytest.mark.local_only
    def test_unauthenticated_is_rejected(self, api_url):
        resp = _api("GET", "/api/admin/volunteers/1", base_url=api_url)
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_requires_admin(self, api_url, new_user):
        resp = _api("GET", f"/api/admin/volunteers/{new_user['id']}",
                    base_url=api_url, token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_unknown_volunteer_returns_404(self, api_url, admin_token):
        resp = _api("GET", "/api/admin/volunteers/999999", base_url=api_url, token=admin_token)
        assert resp.status_code == 404

    @pytest.mark.local_only
    def test_returns_volunteer_profile_fields(self, api_url, admin_token, new_user):
        resp = _api("GET", f"/api/admin/volunteers/{new_user['id']}",
                    base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        data = resp.json()
        for field in ("id", "name", "email"):
            assert field in data, f"Missing field: {field}"

    @pytest.mark.local_only
    def test_returns_admin_sections(self, api_url, admin_token, new_user):
        resp = _api("GET", f"/api/admin/volunteers/{new_user['id']}",
                    base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        data = resp.json()
        for key in ("admin_notes", "endorsements", "starter_tasks", "project_history"):
            assert key in data, f"Missing key: {key}"
            assert isinstance(data[key], list)

    @pytest.mark.local_only
    def test_admin_notes_appear_in_detail(self, api_url, admin_token, new_user):
        _make_note(BASE_URL, admin_token, new_user["id"])
        resp = _api("GET", f"/api/admin/volunteers/{new_user['id']}",
                    base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        assert len(resp.json()["admin_notes"]) >= 1


# ── GET /api/admin/volunteers/{volunteer_id}/endorsements ──────────────────────

class TestAdminListEndorsements:
    """GET /api/admin/volunteers/{volunteer_id}/endorsements"""

    @pytest.mark.local_only
    def test_unauthenticated_is_rejected(self, api_url):
        resp = _api("GET", "/api/admin/volunteers/1/endorsements", base_url=api_url)
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_requires_admin(self, api_url, new_user):
        resp = _api("GET", f"/api/admin/volunteers/{new_user['id']}/endorsements",
                    base_url=api_url, token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_returns_list_for_new_volunteer(self, api_url, admin_token, new_user):
        resp = _api("GET", f"/api/admin/volunteers/{new_user['id']}/endorsements",
                    base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.local_only
    def test_endorsement_has_expected_fields(self, api_url, admin_token, new_user):
        skill_id = _get_skill_id(BASE_URL)
        if skill_id is None:
            pytest.skip("No skills in DB")

        _api("POST", f"/api/admin/volunteers/{new_user['id']}/endorsements", base_url=BASE_URL,
             json={"skill_id": skill_id}, token=admin_token)

        resp = _api("GET", f"/api/admin/volunteers/{new_user['id']}/endorsements",
                    base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        endorsements = resp.json()
        assert len(endorsements) >= 1
        e = endorsements[0]
        for field in ("id", "volunteer_id", "skill_id", "endorsed_by_id", "skill_name",
                      "skill_category", "endorsed_by_name"):
            assert field in e, f"Missing field: {field}"


# ── GET /api/admin/volunteers/{volunteer_id}/notes ─────────────────────────────

class TestAdminListNotes:
    """GET /api/admin/volunteers/{volunteer_id}/notes"""

    @pytest.mark.local_only
    def test_unauthenticated_is_rejected(self, api_url):
        resp = _api("GET", "/api/admin/volunteers/1/notes", base_url=api_url)
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_requires_admin(self, api_url, new_user):
        resp = _api("GET", f"/api/admin/volunteers/{new_user['id']}/notes",
                    base_url=api_url, token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_returns_empty_list_for_new_volunteer(self, api_url, admin_token):
        vol = _make_volunteer(BASE_URL)
        resp = _api("GET", f"/api/admin/volunteers/{vol['id']}/notes",
                    base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.local_only
    def test_note_appears_in_list(self, api_url, admin_token, new_user):
        note_id = _make_note(BASE_URL, admin_token, new_user["id"])
        resp = _api("GET", f"/api/admin/volunteers/{new_user['id']}/notes",
                    base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        ids = [n["id"] for n in resp.json()]
        assert note_id in ids

    @pytest.mark.local_only
    def test_note_has_expected_fields(self, api_url, admin_token, new_user):
        _make_note(BASE_URL, admin_token, new_user["id"])
        resp = _api("GET", f"/api/admin/volunteers/{new_user['id']}/notes",
                    base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        notes = resp.json()
        assert len(notes) >= 1
        note = notes[0]
        for field in ("id", "volunteer_id", "author_id", "content", "category",
                      "created_at", "updated_at", "author_name"):
            assert field in note, f"Missing field: {field}"


# ── POST /api/admin/volunteers/{volunteer_id}/endorsements ─────────────────────

class TestAdminCreateEndorsement:
    """POST /api/admin/volunteers/{volunteer_id}/endorsements"""

    @pytest.mark.local_only
    def test_unauthenticated_is_rejected(self, api_url, new_user):
        resp = _api("POST", f"/api/admin/volunteers/{new_user['id']}/endorsements",
                    base_url=api_url, json={"skill_id": 1})
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_requires_admin(self, api_url, new_user):
        resp = _api("POST", f"/api/admin/volunteers/{new_user['id']}/endorsements",
                    base_url=api_url, json={"skill_id": 1}, token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_missing_skill_id_returns_error(self, api_url, admin_token, new_user):
        resp = _api("POST", f"/api/admin/volunteers/{new_user['id']}/endorsements",
                    base_url=api_url, json={}, token=admin_token)
        assert resp.status_code in (400, 422)

    @pytest.mark.local_only
    def test_creates_endorsement_successfully(self, api_url, admin_token, new_user):
        skill_id = _get_skill_id(BASE_URL)
        if skill_id is None:
            pytest.skip("No skills in DB")

        resp = _api("POST", f"/api/admin/volunteers/{new_user['id']}/endorsements",
                    base_url=api_url, json={"skill_id": skill_id}, token=admin_token)
        assert resp.status_code == 200
        assert "message" in resp.json()

    @pytest.mark.local_only
    def test_endorsement_appears_in_list_after_creation(self, api_url, admin_token, new_user):
        skill_id = _get_skill_id(BASE_URL)
        if skill_id is None:
            pytest.skip("No skills in DB")

        _api("POST", f"/api/admin/volunteers/{new_user['id']}/endorsements",
             base_url=api_url, json={"skill_id": skill_id}, token=admin_token)

        list_resp = _api("GET", f"/api/admin/volunteers/{new_user['id']}/endorsements",
                         base_url=api_url, token=admin_token)
        assert list_resp.status_code == 200
        skill_ids = [e["skill_id"] for e in list_resp.json()]
        assert skill_id in skill_ids

    @pytest.mark.local_only
    def test_upserts_existing_endorsement(self, api_url, admin_token, new_user):
        skill_id = _get_skill_id(BASE_URL)
        if skill_id is None:
            pytest.skip("No skills in DB")

        _api("POST", f"/api/admin/volunteers/{new_user['id']}/endorsements",
             base_url=BASE_URL, json={"skill_id": skill_id, "rating": "verified"},
             token=admin_token)

        resp = _api("POST", f"/api/admin/volunteers/{new_user['id']}/endorsements",
                    base_url=api_url, json={"skill_id": skill_id, "rating": "strong"},
                    token=admin_token)
        assert resp.status_code == 200


# ── POST /api/admin/volunteers/{volunteer_id}/notes ────────────────────────────

class TestAdminCreateNote:
    """POST /api/admin/volunteers/{volunteer_id}/notes"""

    @pytest.mark.local_only
    def test_unauthenticated_is_rejected(self, api_url, new_user):
        resp = _api("POST", f"/api/admin/volunteers/{new_user['id']}/notes",
                    base_url=api_url, json={"content": "Note", "category": "general"})
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_requires_admin(self, api_url, new_user):
        resp = _api("POST", f"/api/admin/volunteers/{new_user['id']}/notes",
                    base_url=api_url, json={"content": "Note", "category": "general"},
                    token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_unknown_volunteer_returns_404(self, api_url, admin_token):
        resp = _api("POST", "/api/admin/volunteers/999999/notes",
                    base_url=api_url, json={"content": "Note", "category": "general"},
                    token=admin_token)
        assert resp.status_code == 404

    @pytest.mark.local_only
    def test_missing_content_returns_error(self, api_url, admin_token, new_user):
        resp = _api("POST", f"/api/admin/volunteers/{new_user['id']}/notes",
                    base_url=api_url, json={"category": "general"}, token=admin_token)
        assert resp.status_code in (400, 422)

    @pytest.mark.local_only
    def test_creates_note_successfully(self, api_url, admin_token, new_user):
        resp = _api("POST", f"/api/admin/volunteers/{new_user['id']}/notes",
                    base_url=api_url,
                    json={"content": "Important note", "category": "general"},
                    token=admin_token)
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data
        assert "message" in data

    @pytest.mark.local_only
    def test_note_appears_in_volunteer_notes_list(self, api_url, admin_token, new_user):
        resp = _api("POST", f"/api/admin/volunteers/{new_user['id']}/notes",
                    base_url=api_url,
                    json={"content": "Appears in list", "category": "reliability"},
                    token=admin_token)
        note_id = resp.json()["id"]

        list_resp = _api("GET", f"/api/admin/volunteers/{new_user['id']}/notes",
                         base_url=api_url, token=admin_token)
        assert list_resp.status_code == 200
        ids = [n["id"] for n in list_resp.json()]
        assert note_id in ids


# ── PUT /api/admin/notes/{note_id} ────────────────────────────────────────────

class TestAdminUpdateNote:
    """PUT /api/admin/notes/{note_id}"""

    @pytest.mark.local_only
    def test_unauthenticated_is_rejected(self, api_url):
        resp = _api("PUT", "/api/admin/notes/1", base_url=api_url,
                    json={"content": "Updated"})
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_requires_admin(self, api_url, new_user):
        resp = _api("PUT", "/api/admin/notes/1", base_url=api_url,
                    json={"content": "Updated"}, token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_unknown_note_returns_404(self, api_url, admin_token):
        resp = _api("PUT", "/api/admin/notes/999999", base_url=api_url,
                    json={"content": "Updated"}, token=admin_token)
        assert resp.status_code == 404

    @pytest.mark.local_only
    def test_updates_content_successfully(self, api_url, admin_token, new_user):
        note_id = _make_note(BASE_URL, admin_token, new_user["id"])
        resp = _api("PUT", f"/api/admin/notes/{note_id}", base_url=api_url,
                    json={"content": "Updated content"}, token=admin_token)
        assert resp.status_code == 200
        assert "message" in resp.json()

    @pytest.mark.local_only
    def test_updates_category_successfully(self, api_url, admin_token, new_user):
        note_id = _make_note(BASE_URL, admin_token, new_user["id"])
        resp = _api("PUT", f"/api/admin/notes/{note_id}", base_url=api_url,
                    json={"category": "reliability"}, token=admin_token)
        assert resp.status_code == 200

    @pytest.mark.local_only
    def test_update_persists_in_notes_list(self, api_url, admin_token, new_user):
        note_id = _make_note(BASE_URL, admin_token, new_user["id"])
        new_content = f"Updated_{uuid.uuid4().hex[:6]}"
        _api("PUT", f"/api/admin/notes/{note_id}", base_url=BASE_URL,
             json={"content": new_content}, token=admin_token)

        list_resp = _api("GET", f"/api/admin/volunteers/{new_user['id']}/notes",
                         base_url=api_url, token=admin_token)
        note = next(n for n in list_resp.json() if n["id"] == note_id)
        assert note["content"] == new_content
