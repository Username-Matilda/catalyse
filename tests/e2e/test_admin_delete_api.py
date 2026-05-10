"""
E2E API tests for admin and project DELETE endpoints — parameterised to run against both FastAPI and Next.js.

Scenarios covered:
  - DELETE /api/admin/admins/{volunteer_id}           (revoke admin)
  - DELETE /api/admin/invites/{invite_id}             (revoke invite)
  - DELETE /api/admin/notes/{note_id}                 (delete admin note)
  - DELETE /api/admin/skill-categories/{category_id} (delete skill category)
  - DELETE /api/admin/skills/{skill_id}               (delete skill)
  - DELETE /api/projects/{project_id}                 (delete project, admin only)
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


def _make_second_admin(base_url, admin_token):
    """Create a fresh volunteer, promote via invite flow, and return {id, token}."""
    vol = _make_volunteer(base_url)
    invite_resp = _api("POST", "/api/admin/admins/invite", base_url=base_url,
                       json={"email": vol["email"]}, token=admin_token)
    assert invite_resp.status_code == 200, invite_resp.text
    invite_token = invite_resp.json()["_dev_invite_token"]
    accept_resp = _api(
        "POST", f"/api/admin/admins/accept-invite?invite_token={invite_token}",
        base_url=base_url, token=vol["token"],
    )
    assert accept_resp.status_code == 200, accept_resp.text
    return {"id": vol["id"], "token": vol["token"]}


def _make_invite(base_url, admin_token):
    """Create a pending invite and return {id, email}."""
    email = f"invite_{uuid.uuid4().hex[:8]}@test.com"
    resp = _api("POST", "/api/admin/admins/invite", base_url=base_url,
                json={"email": email}, token=admin_token)
    assert resp.status_code == 200, resp.text
    list_resp = _api("GET", "/api/admin/invites", base_url=base_url, token=admin_token)
    assert list_resp.status_code == 200
    invite = next(i for i in list_resp.json() if i["email"] == email and i["status"] == "pending")
    return {"id": invite["id"], "email": email}


def _make_note(base_url, admin_token, volunteer_id):
    """Create an admin note for a volunteer and return the note id."""
    resp = _api("POST", f"/api/admin/volunteers/{volunteer_id}/notes", base_url=base_url,
                json={"content": "Test note content", "category": "general"}, token=admin_token)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def _make_skill_category(base_url, admin_token):
    """Create a skill category and return its id."""
    resp = _api("POST", "/api/admin/skill-categories", base_url=base_url,
                json={"name": f"Cat {uuid.uuid4().hex[:6]}"}, token=admin_token)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def _make_skill(base_url, admin_token, category_id):
    """Create a skill within a category and return its id."""
    resp = _api("POST", "/api/admin/skills", base_url=base_url,
                json={"name": f"Skill {uuid.uuid4().hex[:6]}", "category_id": category_id},
                token=admin_token)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def _make_project(base_url, admin_token):
    """Create an admin org project and return its id."""
    resp = _api("POST", "/api/admin/projects", base_url=base_url, json={
        "title": f"Del Project {uuid.uuid4().hex[:8]}",
        "description": "A project to be deleted.",
        "urgency": "low",
    }, token=admin_token)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


# ── DELETE /api/admin/admins/{volunteer_id} ────────────────────────────────────

class TestDeleteAdmin:
    """DELETE /api/admin/admins/{volunteer_id}"""

    @pytest.mark.local_only
    def test_unauthenticated_is_rejected(self, api_url):
        resp = _api("DELETE", "/api/admin/admins/1", base_url=api_url)
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_requires_admin(self, api_url, new_user):
        resp = _api("DELETE", "/api/admin/admins/1", base_url=api_url, token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_cannot_revoke_self(self, api_url, admin_token):
        me = _api("GET", "/api/auth/me", base_url=BASE_URL, token=admin_token)
        assert me.status_code == 200
        own_id = me.json()["id"]
        resp = _api("DELETE", f"/api/admin/admins/{own_id}", base_url=api_url, token=admin_token)
        assert resp.status_code == 400

    @pytest.mark.local_only
    def test_non_admin_volunteer_returns_404(self, api_url, admin_token, new_user):
        resp = _api("DELETE", f"/api/admin/admins/{new_user['id']}", base_url=api_url,
                    token=admin_token)
        assert resp.status_code == 404

    @pytest.mark.local_only
    def test_unknown_id_returns_404(self, api_url, admin_token):
        resp = _api("DELETE", "/api/admin/admins/999999", base_url=api_url, token=admin_token)
        assert resp.status_code == 404

    @pytest.mark.local_only
    def test_revokes_admin_successfully(self, api_url, admin_token):
        second = _make_second_admin(BASE_URL, admin_token)
        resp = _api("DELETE", f"/api/admin/admins/{second['id']}", base_url=api_url,
                    token=admin_token)
        assert resp.status_code == 200
        assert "message" in resp.json()

    @pytest.mark.local_only
    def test_revoked_admin_no_longer_in_admin_list(self, api_url, admin_token):
        second = _make_second_admin(BASE_URL, admin_token)
        _api("DELETE", f"/api/admin/admins/{second['id']}", base_url=BASE_URL, token=admin_token)
        list_resp = _api("GET", "/api/admin/admins", base_url=api_url, token=admin_token)
        assert list_resp.status_code == 200
        ids = [a["id"] for a in list_resp.json()]
        assert second["id"] not in ids


# ── DELETE /api/admin/invites/{invite_id} ──────────────────────────────────────

class TestDeleteInvite:
    """DELETE /api/admin/invites/{invite_id}"""

    @pytest.mark.local_only
    def test_unauthenticated_is_rejected(self, api_url):
        resp = _api("DELETE", "/api/admin/invites/1", base_url=api_url)
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_requires_admin(self, api_url, new_user):
        resp = _api("DELETE", "/api/admin/invites/1", base_url=api_url, token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_unknown_invite_returns_404(self, api_url, admin_token):
        resp = _api("DELETE", "/api/admin/invites/999999", base_url=api_url, token=admin_token)
        assert resp.status_code == 404

    @pytest.mark.local_only
    def test_revokes_pending_invite_successfully(self, api_url, admin_token):
        invite = _make_invite(BASE_URL, admin_token)
        resp = _api("DELETE", f"/api/admin/invites/{invite['id']}", base_url=api_url,
                    token=admin_token)
        assert resp.status_code == 200
        assert "message" in resp.json()

    @pytest.mark.local_only
    def test_already_revoked_invite_returns_404(self, api_url, admin_token):
        invite = _make_invite(BASE_URL, admin_token)
        _api("DELETE", f"/api/admin/invites/{invite['id']}", base_url=BASE_URL, token=admin_token)
        resp = _api("DELETE", f"/api/admin/invites/{invite['id']}", base_url=api_url,
                    token=admin_token)
        assert resp.status_code == 404

    @pytest.mark.local_only
    def test_accepted_invite_returns_404(self, api_url, admin_token):
        vol = _make_volunteer(BASE_URL)
        invite_resp = _api("POST", "/api/admin/admins/invite", base_url=BASE_URL,
                           json={"email": vol["email"]}, token=admin_token)
        invite_token = invite_resp.json()["_dev_invite_token"]
        list_resp = _api("GET", "/api/admin/invites", base_url=BASE_URL, token=admin_token)
        invite_id = next(
            i["id"] for i in list_resp.json()
            if i["email"] == vol["email"] and i["status"] == "pending"
        )
        _api("POST", f"/api/admin/admins/accept-invite?invite_token={invite_token}",
             base_url=BASE_URL, token=vol["token"])
        resp = _api("DELETE", f"/api/admin/invites/{invite_id}", base_url=api_url,
                    token=admin_token)
        assert resp.status_code == 404


# ── DELETE /api/admin/notes/{note_id} ─────────────────────────────────────────

class TestDeleteNote:
    """DELETE /api/admin/notes/{note_id}"""

    @pytest.mark.local_only
    def test_unauthenticated_is_rejected(self, api_url):
        resp = _api("DELETE", "/api/admin/notes/1", base_url=api_url)
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_requires_admin(self, api_url, new_user):
        resp = _api("DELETE", "/api/admin/notes/1", base_url=api_url, token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_unknown_note_returns_404(self, api_url, admin_token):
        resp = _api("DELETE", "/api/admin/notes/999999", base_url=api_url, token=admin_token)
        assert resp.status_code == 404

    @pytest.mark.local_only
    def test_deletes_note_successfully(self, api_url, admin_token, new_user):
        note_id = _make_note(BASE_URL, admin_token, new_user["id"])
        resp = _api("DELETE", f"/api/admin/notes/{note_id}", base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        assert "message" in resp.json()

    @pytest.mark.local_only
    def test_deleted_note_returns_404_on_second_delete(self, api_url, admin_token, new_user):
        note_id = _make_note(BASE_URL, admin_token, new_user["id"])
        _api("DELETE", f"/api/admin/notes/{note_id}", base_url=BASE_URL, token=admin_token)
        resp = _api("DELETE", f"/api/admin/notes/{note_id}", base_url=api_url, token=admin_token)
        assert resp.status_code == 404

    @pytest.mark.local_only
    def test_deleted_note_absent_from_volunteer_notes(self, api_url, admin_token, new_user):
        note_id = _make_note(BASE_URL, admin_token, new_user["id"])
        _api("DELETE", f"/api/admin/notes/{note_id}", base_url=BASE_URL, token=admin_token)
        list_resp = _api("GET", f"/api/admin/volunteers/{new_user['id']}/notes", base_url=api_url,
                         token=admin_token)
        assert list_resp.status_code == 200
        ids = [n["id"] for n in list_resp.json()]
        assert note_id not in ids


# ── DELETE /api/admin/skill-categories/{category_id} ──────────────────────────

class TestDeleteSkillCategory:
    """DELETE /api/admin/skill-categories/{category_id}"""

    @pytest.mark.local_only
    def test_unauthenticated_is_rejected(self, api_url):
        resp = _api("DELETE", "/api/admin/skill-categories/1", base_url=api_url)
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_requires_admin(self, api_url, new_user):
        resp = _api("DELETE", "/api/admin/skill-categories/1", base_url=api_url,
                    token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_unknown_category_returns_404(self, api_url, admin_token):
        resp = _api("DELETE", "/api/admin/skill-categories/999999", base_url=api_url,
                    token=admin_token)
        assert resp.status_code == 404

    @pytest.mark.local_only
    def test_deletes_empty_category_successfully(self, api_url, admin_token):
        cat_id = _make_skill_category(BASE_URL, admin_token)
        resp = _api("DELETE", f"/api/admin/skill-categories/{cat_id}", base_url=api_url,
                    token=admin_token)
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("success") is True or "message" in data

    @pytest.mark.local_only
    def test_cannot_delete_category_with_skills(self, api_url, admin_token):
        cat_id = _make_skill_category(BASE_URL, admin_token)
        _make_skill(BASE_URL, admin_token, cat_id)
        resp = _api("DELETE", f"/api/admin/skill-categories/{cat_id}", base_url=api_url,
                    token=admin_token)
        assert resp.status_code == 400
        assert "skills" in resp.json().get("detail", "").lower()

    @pytest.mark.local_only
    def test_deleted_category_absent_from_list(self, api_url, admin_token):
        cat_id = _make_skill_category(BASE_URL, admin_token)
        _api("DELETE", f"/api/admin/skill-categories/{cat_id}", base_url=BASE_URL,
             token=admin_token)
        list_resp = _api("GET", "/api/admin/skill-categories", base_url=api_url, token=admin_token)
        assert list_resp.status_code == 200
        ids = [c["id"] for c in list_resp.json()]
        assert cat_id not in ids


# ── DELETE /api/admin/skills/{skill_id} ───────────────────────────────────────

class TestDeleteSkill:
    """DELETE /api/admin/skills/{skill_id}"""

    @pytest.mark.local_only
    def test_unauthenticated_is_rejected(self, api_url):
        resp = _api("DELETE", "/api/admin/skills/1", base_url=api_url)
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_requires_admin(self, api_url, new_user):
        resp = _api("DELETE", "/api/admin/skills/1", base_url=api_url, token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_unknown_skill_returns_404(self, api_url, admin_token):
        resp = _api("DELETE", "/api/admin/skills/999999", base_url=api_url, token=admin_token)
        assert resp.status_code == 404

    @pytest.mark.local_only
    def test_deletes_skill_successfully(self, api_url, admin_token):
        cat_id = _make_skill_category(BASE_URL, admin_token)
        skill_id = _make_skill(BASE_URL, admin_token, cat_id)
        resp = _api("DELETE", f"/api/admin/skills/{skill_id}", base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("success") is True or "message" in data
        _api("DELETE", f"/api/admin/skill-categories/{cat_id}", base_url=BASE_URL,
             token=admin_token)

    @pytest.mark.local_only
    def test_deleted_skill_absent_from_skills_tree(self, api_url, admin_token):
        cat_id = _make_skill_category(BASE_URL, admin_token)
        skill_id = _make_skill(BASE_URL, admin_token, cat_id)
        _api("DELETE", f"/api/admin/skills/{skill_id}", base_url=BASE_URL, token=admin_token)
        tree = _api("GET", "/api/skills", base_url=api_url)
        assert tree.status_code == 200
        all_skill_ids = [s["id"] for cat in tree.json() for s in cat.get("skills", [])]
        assert skill_id not in all_skill_ids
        _api("DELETE", f"/api/admin/skill-categories/{cat_id}", base_url=BASE_URL,
             token=admin_token)

    @pytest.mark.local_only
    def test_deleted_skill_returns_404_on_second_delete(self, api_url, admin_token):
        cat_id = _make_skill_category(BASE_URL, admin_token)
        skill_id = _make_skill(BASE_URL, admin_token, cat_id)
        _api("DELETE", f"/api/admin/skills/{skill_id}", base_url=BASE_URL, token=admin_token)
        resp = _api("DELETE", f"/api/admin/skills/{skill_id}", base_url=api_url, token=admin_token)
        assert resp.status_code == 404
        _api("DELETE", f"/api/admin/skill-categories/{cat_id}", base_url=BASE_URL,
             token=admin_token)


# ── DELETE /api/projects/{project_id} ─────────────────────────────────────────

class TestDeleteProject:
    """DELETE /api/projects/{project_id}"""

    @pytest.mark.local_only
    def test_unauthenticated_is_rejected(self, api_url):
        resp = _api("DELETE", "/api/projects/1", base_url=api_url)
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_requires_admin(self, api_url, new_user):
        resp = _api("DELETE", "/api/projects/1", base_url=api_url, token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_unknown_project_returns_404(self, api_url, admin_token):
        resp = _api("DELETE", "/api/projects/999999", base_url=api_url, token=admin_token)
        assert resp.status_code == 404

    @pytest.mark.local_only
    def test_deletes_project_successfully(self, api_url, admin_token):
        pid = _make_project(BASE_URL, admin_token)
        resp = _api("DELETE", f"/api/projects/{pid}", base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        assert "message" in resp.json()

    @pytest.mark.local_only
    def test_deleted_project_returns_404_on_get(self, api_url, admin_token):
        pid = _make_project(BASE_URL, admin_token)
        _api("DELETE", f"/api/projects/{pid}", base_url=BASE_URL, token=admin_token)
        resp = _api("GET", f"/api/projects/{pid}", base_url=api_url, token=admin_token)
        assert resp.status_code == 404

    @pytest.mark.local_only
    def test_deleted_project_absent_from_list(self, api_url, admin_token):
        pid = _make_project(BASE_URL, admin_token)
        _api("DELETE", f"/api/projects/{pid}", base_url=BASE_URL, token=admin_token)
        list_resp = _api("GET", "/api/projects", base_url=api_url)
        assert list_resp.status_code == 200
        ids = [p["id"] for p in list_resp.json()["projects"]]
        assert pid not in ids

    @pytest.mark.local_only
    def test_volunteer_cannot_delete_project(self, api_url, admin_token, new_user):
        pid = _make_project(BASE_URL, admin_token)
        resp = _api("DELETE", f"/api/projects/{pid}", base_url=api_url, token=new_user["token"])
        assert resp.status_code in (401, 403)
        _api("DELETE", f"/api/projects/{pid}", base_url=BASE_URL, token=admin_token)
