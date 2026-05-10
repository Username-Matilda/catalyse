"""
E2E tests for Skills routes — parameterised to run against both FastAPI and Next.js.

Scenario 03-skill-management:
  1. Admin creates a skill category
  2. Admin creates a skill within a category
  3. Admin edits a skill name
  4. Admin deletes an unused skill
  5. Admin deletes a skill category
"""

import uuid
import requests
import pytest
from playwright.sync_api import Page, expect

from tests.e2e.helpers import BASE_URL, NEXT_BASE_URL, IS_PRODUCTION, inject_auth_token


def _api(method, path, base_url, json=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    resp = requests.request(method, f"{base_url}{path}", json=json, headers=headers, timeout=10)
    resp.raise_for_status()
    return resp.json()


class TestSkillsPublicEndpoints:
    """GET /api/skills and GET /api/skills/flat are unauthenticated."""

    def test_skills_returns_nested_tree(self, api_url):
        data = _api("GET", "/api/skills", base_url=api_url)
        assert isinstance(data, list)
        if data:
            cat = data[0]
            assert "id" in cat
            assert "name" in cat
            assert "skills" in cat
            assert isinstance(cat["skills"], list)

    def test_skills_flat_returns_list_with_category_name(self, api_url):
        data = _api("GET", "/api/skills/flat", base_url=api_url)
        assert isinstance(data, list)
        if data:
            skill = data[0]
            assert "id" in skill
            assert "category_id" in skill
            assert "category_name" in skill


class TestSkillManagementPage:
    """Browser-based tests for the admin skills management UI (always targets Next.js via app.js)."""

    @pytest.mark.local_only
    def test_admin_creates_skill_category(self, page: Page, admin_token):
        inject_auth_token(page.context, admin_token)
        page.goto(f"{BASE_URL}/static/admin/skills.html")

        cat_name = f"Test Category {uuid.uuid4().hex[:6]}"
        page.click("button.btn-primary:has-text('+ Add Category')")
        page.fill("#categoryName", cat_name)
        page.click("#categoryForm button[type=submit]")

        expect(page.locator("#messageDiv")).to_contain_text("created", timeout=8000)

        page.reload()
        expect(page.locator("#categoriesList")).to_contain_text(cat_name, timeout=10000)

    @pytest.mark.local_only
    def test_admin_creates_skill_in_category(self, page: Page, admin_token):
        inject_auth_token(page.context, admin_token)

        cat_name = f"UI Cat {uuid.uuid4().hex[:6]}"
        cat = _api("POST", "/api/admin/skill-categories", base_url=NEXT_BASE_URL, json={"name": cat_name}, token=admin_token)
        cat_id = cat["id"]

        page.goto(f"{BASE_URL}/static/admin/skills.html")
        skill_name = f"UI Skill {uuid.uuid4().hex[:6]}"

        page.wait_for_selector(f"button[onclick='openAddSkill({cat_id})']", timeout=10000)
        page.click(f"button[onclick='openAddSkill({cat_id})']")
        page.fill("#skillName", skill_name)
        page.click("#skillForm button[type=submit]")

        expect(page.locator("#messageDiv")).to_contain_text("created", timeout=8000)

        page.reload()
        expect(page.locator("#categoriesList")).to_contain_text(skill_name, timeout=10000)

    @pytest.mark.local_only
    def test_admin_edits_skill_name(self, page: Page, admin_token):
        inject_auth_token(page.context, admin_token)

        cat_name = f"Edit Cat {uuid.uuid4().hex[:6]}"
        cat = _api("POST", "/api/admin/skill-categories", base_url=NEXT_BASE_URL, json={"name": cat_name}, token=admin_token)
        cat_id = cat["id"]

        skill_name = f"Edit Skill {uuid.uuid4().hex[:6]}"
        skill = _api(
            "POST", "/api/admin/skills", base_url=NEXT_BASE_URL,
            json={"name": skill_name, "category_id": cat_id},
            token=admin_token,
        )
        skill_id = skill["id"]

        page.goto(f"{BASE_URL}/static/admin/skills.html")
        page.wait_for_selector(f"button[onclick='editSkill({skill_id}, {cat_id})']", timeout=10000)
        page.click(f"button[onclick='editSkill({skill_id}, {cat_id})']")

        updated_name = f"Updated {uuid.uuid4().hex[:6]}"
        page.fill("#skillName", updated_name)
        page.click("#skillForm button[type=submit]")

        expect(page.locator("#messageDiv")).to_contain_text("updated", timeout=8000)

        page.reload()
        expect(page.locator("#categoriesList")).to_contain_text(updated_name, timeout=10000)

    @pytest.mark.local_only
    def test_admin_deletes_unused_skill(self, page: Page, admin_token):
        inject_auth_token(page.context, admin_token)

        cat_name = f"Del Cat {uuid.uuid4().hex[:6]}"
        cat = _api("POST", "/api/admin/skill-categories", base_url=NEXT_BASE_URL, json={"name": cat_name}, token=admin_token)
        cat_id = cat["id"]

        skill_name = f"Del Skill {uuid.uuid4().hex[:6]}"
        skill = _api(
            "POST", "/api/admin/skills", base_url=NEXT_BASE_URL,
            json={"name": skill_name, "category_id": cat_id},
            token=admin_token,
        )
        skill_id = skill["id"]

        page.goto(f"{BASE_URL}/static/admin/skills.html")
        page.wait_for_selector(f"button[onclick='confirmDeleteSkill({skill_id}, \\'{skill_name}\\')']", timeout=10000)
        page.click(f"button[onclick='confirmDeleteSkill({skill_id}, \\'{skill_name}\\')']")

        page.click("#confirmDeleteBtn")
        expect(page.locator("#messageDiv")).to_contain_text("deleted", timeout=8000)

        page.reload()
        expect(page.locator("#categoriesList")).not_to_contain_text(skill_name, timeout=10000)

    @pytest.mark.local_only
    def test_admin_deletes_skill_category(self, page: Page, admin_token):
        inject_auth_token(page.context, admin_token)

        cat_name = f"Gone Cat {uuid.uuid4().hex[:6]}"
        cat = _api("POST", "/api/admin/skill-categories", base_url=NEXT_BASE_URL, json={"name": cat_name}, token=admin_token)
        cat_id = cat["id"]

        page.goto(f"{BASE_URL}/static/admin/skills.html")
        page.wait_for_selector(f"button[onclick=\"confirmDeleteCategory({cat_id}, '{cat_name}', 0)\"]", timeout=10000)
        page.click(f"button[onclick=\"confirmDeleteCategory({cat_id}, '{cat_name}', 0)\"]")

        page.click("#confirmDeleteBtn")
        expect(page.locator("#messageDiv")).to_contain_text("deleted", timeout=8000)

        page.reload()
        expect(page.locator("#categoriesList")).not_to_contain_text(cat_name, timeout=10000)


class TestSkillsAdminApi:
    """Direct API tests against the skills admin endpoints."""

    @pytest.mark.local_only
    def test_list_skill_categories_requires_admin(self, api_url):
        resp = requests.get(f"{api_url}/api/admin/skill-categories", timeout=10)
        assert resp.status_code == 401

    @pytest.mark.local_only
    def test_list_skill_categories_forbidden_for_non_admin(self, api_url, new_user):
        resp = requests.get(
            f"{api_url}/api/admin/skill-categories",
            headers={"Authorization": f"Bearer {new_user['token']}"},
            timeout=10,
        )
        assert resp.status_code == 403

    @pytest.mark.local_only
    def test_create_and_delete_category(self, api_url, admin_token):
        cat_name = f"API Cat {uuid.uuid4().hex[:6]}"
        created = _api(
            "POST", "/api/admin/skill-categories", base_url=api_url,
            json={"name": cat_name},
            token=admin_token,
        )
        assert created["id"]
        assert created["name"] == cat_name

        cats = _api("GET", "/api/admin/skill-categories", base_url=api_url, token=admin_token)
        assert any(c["id"] == created["id"] for c in cats)

        deleted = _api("DELETE", f"/api/admin/skill-categories/{created['id']}", base_url=api_url, token=admin_token)
        assert deleted["success"] is True

    @pytest.mark.local_only
    def test_cannot_delete_category_with_skills(self, api_url, admin_token):
        cat_name = f"Blocked Cat {uuid.uuid4().hex[:6]}"
        cat = _api(
            "POST", "/api/admin/skill-categories", base_url=api_url,
            json={"name": cat_name},
            token=admin_token,
        )
        _api(
            "POST", "/api/admin/skills", base_url=api_url,
            json={"name": f"Orphan {uuid.uuid4().hex[:4]}", "category_id": cat["id"]},
            token=admin_token,
        )

        resp = requests.delete(
            f"{api_url}/api/admin/skill-categories/{cat['id']}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        assert resp.status_code == 400
        assert "skills" in resp.json()["detail"].lower()

    @pytest.mark.local_only
    def test_create_update_delete_skill(self, api_url, admin_token):
        cat = _api(
            "POST", "/api/admin/skill-categories", base_url=api_url,
            json={"name": f"Skill CRUD Cat {uuid.uuid4().hex[:6]}"},
            token=admin_token,
        )
        skill = _api(
            "POST", "/api/admin/skills", base_url=api_url,
            json={"name": "Initial Name", "category_id": cat["id"]},
            token=admin_token,
        )
        assert skill["id"]

        _api(
            "PUT", f"/api/admin/skills/{skill['id']}", base_url=api_url,
            json={"name": "Updated Name"},
            token=admin_token,
        )

        tree = _api("GET", "/api/skills", base_url=api_url)
        found_cat = next((c for c in tree if c["id"] == cat["id"]), None)
        assert found_cat is not None
        assert any(s["name"] == "Updated Name" for s in found_cat["skills"])

        deleted = _api("DELETE", f"/api/admin/skills/{skill['id']}", base_url=api_url, token=admin_token)
        assert deleted["success"] is True

        _api("DELETE", f"/api/admin/skill-categories/{cat['id']}", base_url=api_url, token=admin_token)
