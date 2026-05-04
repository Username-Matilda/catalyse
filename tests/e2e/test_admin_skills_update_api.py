"""
E2E API tests for admin skill and skill-category update routes — parameterised to run against both FastAPI and Next.js.

Scenarios covered:
  - PUT /api/admin/skill-categories/{category_id}  (update name, description, sort_order)
  - PUT /api/admin/skills/{skill_id}               (update name, description, category)
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


def _cleanup(base_url, admin_token, cat_id, skill_id=None):
    """Delete skill then category (best-effort cleanup)."""
    if skill_id:
        _api("DELETE", f"/api/admin/skills/{skill_id}", base_url=base_url, token=admin_token)
    _api("DELETE", f"/api/admin/skill-categories/{cat_id}", base_url=base_url, token=admin_token)


# ── PUT /api/admin/skill-categories/{category_id} ────────────────────────────

class TestUpdateSkillCategory:
    """PUT /api/admin/skill-categories/{category_id}"""

    @pytest.mark.local_only
    def test_unauthenticated_is_rejected(self, api_url):
        resp = _api("PUT", "/api/admin/skill-categories/1", base_url=api_url,
                    json={"name": "New Name"})
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_requires_admin(self, api_url, new_user):
        resp = _api("PUT", "/api/admin/skill-categories/1", base_url=api_url,
                    json={"name": "New Name"}, token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_unknown_category_returns_404(self, api_url, admin_token):
        resp = _api("PUT", "/api/admin/skill-categories/999999", base_url=api_url,
                    json={"name": "New Name"}, token=admin_token)
        assert resp.status_code == 404

    @pytest.mark.local_only
    def test_updates_name_successfully(self, api_url, admin_token):
        cat_id = _make_skill_category(BASE_URL, admin_token)
        new_name = f"Renamed {uuid.uuid4().hex[:6]}"
        resp = _api("PUT", f"/api/admin/skill-categories/{cat_id}", base_url=api_url,
                    json={"name": new_name}, token=admin_token)
        assert resp.status_code == 200
        _cleanup(BASE_URL, admin_token, cat_id)

    @pytest.mark.local_only
    def test_update_persists_in_admin_list(self, api_url, admin_token):
        cat_id = _make_skill_category(BASE_URL, admin_token)
        new_name = f"Persist {uuid.uuid4().hex[:6]}"
        _api("PUT", f"/api/admin/skill-categories/{cat_id}", base_url=BASE_URL,
             json={"name": new_name}, token=admin_token)

        list_resp = _api("GET", "/api/admin/skill-categories", base_url=api_url, token=admin_token)
        assert list_resp.status_code == 200
        cat = next((c for c in list_resp.json() if c["id"] == cat_id), None)
        assert cat is not None
        assert cat["name"] == new_name
        _cleanup(BASE_URL, admin_token, cat_id)

    @pytest.mark.local_only
    def test_updates_description_successfully(self, api_url, admin_token):
        cat_id = _make_skill_category(BASE_URL, admin_token)
        resp = _api("PUT", f"/api/admin/skill-categories/{cat_id}", base_url=api_url,
                    json={"description": "Updated description"}, token=admin_token)
        assert resp.status_code == 200
        _cleanup(BASE_URL, admin_token, cat_id)

    @pytest.mark.local_only
    def test_updates_sort_order_successfully(self, api_url, admin_token):
        cat_id = _make_skill_category(BASE_URL, admin_token)
        resp = _api("PUT", f"/api/admin/skill-categories/{cat_id}", base_url=api_url,
                    json={"sort_order": 999}, token=admin_token)
        assert resp.status_code == 200
        _cleanup(BASE_URL, admin_token, cat_id)


# ── PUT /api/admin/skills/{skill_id} ─────────────────────────────────────────

class TestUpdateSkill:
    """PUT /api/admin/skills/{skill_id}"""

    @pytest.mark.local_only
    def test_unauthenticated_is_rejected(self, api_url):
        resp = _api("PUT", "/api/admin/skills/1", base_url=api_url,
                    json={"name": "New Name"})
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_requires_admin(self, api_url, new_user):
        resp = _api("PUT", "/api/admin/skills/1", base_url=api_url,
                    json={"name": "New Name"}, token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_unknown_skill_returns_404(self, api_url, admin_token):
        resp = _api("PUT", "/api/admin/skills/999999", base_url=api_url,
                    json={"name": "New Name"}, token=admin_token)
        assert resp.status_code == 404

    @pytest.mark.local_only
    def test_updates_name_successfully(self, api_url, admin_token):
        cat_id = _make_skill_category(BASE_URL, admin_token)
        skill_id = _make_skill(BASE_URL, admin_token, cat_id)
        new_name = f"Renamed {uuid.uuid4().hex[:6]}"
        resp = _api("PUT", f"/api/admin/skills/{skill_id}", base_url=api_url,
                    json={"name": new_name}, token=admin_token)
        assert resp.status_code == 200
        _cleanup(BASE_URL, admin_token, cat_id, skill_id)

    @pytest.mark.local_only
    def test_update_persists_in_skills_tree(self, api_url, admin_token):
        cat_id = _make_skill_category(BASE_URL, admin_token)
        skill_id = _make_skill(BASE_URL, admin_token, cat_id)
        new_name = f"Persist {uuid.uuid4().hex[:6]}"
        _api("PUT", f"/api/admin/skills/{skill_id}", base_url=BASE_URL,
             json={"name": new_name}, token=admin_token)

        tree = _api("GET", "/api/skills", base_url=api_url)
        assert tree.status_code == 200
        all_skills = {s["id"]: s for cat in tree.json() for s in cat.get("skills", [])}
        assert skill_id in all_skills
        assert all_skills[skill_id]["name"] == new_name
        _cleanup(BASE_URL, admin_token, cat_id, skill_id)

    @pytest.mark.local_only
    def test_updates_description_successfully(self, api_url, admin_token):
        cat_id = _make_skill_category(BASE_URL, admin_token)
        skill_id = _make_skill(BASE_URL, admin_token, cat_id)
        resp = _api("PUT", f"/api/admin/skills/{skill_id}", base_url=api_url,
                    json={"description": "Updated skill description"}, token=admin_token)
        assert resp.status_code == 200
        _cleanup(BASE_URL, admin_token, cat_id, skill_id)

    @pytest.mark.local_only
    def test_updates_sort_order_successfully(self, api_url, admin_token):
        cat_id = _make_skill_category(BASE_URL, admin_token)
        skill_id = _make_skill(BASE_URL, admin_token, cat_id)
        resp = _api("PUT", f"/api/admin/skills/{skill_id}", base_url=api_url,
                    json={"sort_order": 999}, token=admin_token)
        assert resp.status_code == 200
        _cleanup(BASE_URL, admin_token, cat_id, skill_id)

    @pytest.mark.local_only
    def test_move_skill_to_another_category(self, api_url, admin_token):
        cat_a = _make_skill_category(BASE_URL, admin_token)
        cat_b = _make_skill_category(BASE_URL, admin_token)
        skill_id = _make_skill(BASE_URL, admin_token, cat_a)

        resp = _api("PUT", f"/api/admin/skills/{skill_id}", base_url=api_url,
                    json={"category_id": cat_b}, token=admin_token)
        assert resp.status_code == 200
        _cleanup(BASE_URL, admin_token, cat_a)
        _cleanup(BASE_URL, admin_token, cat_b, skill_id)

    @pytest.mark.local_only
    def test_move_to_nonexistent_category_returns_error(self, api_url, admin_token):
        cat_id = _make_skill_category(BASE_URL, admin_token)
        skill_id = _make_skill(BASE_URL, admin_token, cat_id)

        resp = _api("PUT", f"/api/admin/skills/{skill_id}", base_url=api_url,
                    json={"category_id": 999999}, token=admin_token)
        assert resp.status_code in (400, 404)
        _cleanup(BASE_URL, admin_token, cat_id, skill_id)
