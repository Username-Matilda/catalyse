"""
E2E tests for Volunteer and Dashboard routes — parameterised to run against both FastAPI and Next.js.

Scenarios covered:
  - GET /api/volunteers        (list, public profiles)
  - GET /api/volunteers/{id}   (single profile, contact visibility)
  - PUT /api/volunteers/me     (update own profile, skills)
  - GET /api/dashboard         (owned/proposed/interests/suggested projects, unread count)
"""

import uuid
import requests
import pytest


def _api(method, path, base_url, json=None, token=None, params=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    resp = requests.request(
        method, f"{base_url}{path}",
        json=json, headers=headers, params=params, timeout=10,
    )
    return resp


class TestVolunteerList:
    """GET /api/volunteers — public volunteer directory."""

    @pytest.mark.local_only
    def test_returns_paginated_structure(self, api_url, new_user):
        resp = _api("GET", "/api/volunteers", base_url=api_url)
        assert resp.status_code == 200
        data = resp.json()
        assert "volunteers" in data
        assert "total" in data
        assert isinstance(data["volunteers"], list)
        assert isinstance(data["total"], int)

    @pytest.mark.local_only
    def test_new_user_appears_in_list(self, api_url, new_user):
        # Default signup sets profile_visible=True and consent_profile_visible=True
        resp = _api("GET", "/api/volunteers", base_url=api_url)
        assert resp.status_code == 200
        ids = [v["id"] for v in resp.json()["volunteers"]]
        assert new_user["id"] in ids

    @pytest.mark.local_only
    def test_volunteer_has_expected_fields(self, api_url, new_user):
        resp = _api("GET", "/api/volunteers", base_url=api_url)
        assert resp.status_code == 200
        volunteers = resp.json()["volunteers"]
        vol = next((v for v in volunteers if v["id"] == new_user["id"]), None)
        assert vol is not None
        assert "id" in vol
        assert "name" in vol
        assert "skills" in vol
        # Contact fields must NOT appear in the public list
        assert "email" not in vol
        assert "discord_handle" not in vol

    @pytest.mark.local_only
    def test_search_filter(self, api_url):
        unique_name = f"VolSearch_{uuid.uuid4().hex[:8]}"
        email = f"{unique_name.lower()}@test.com"
        signup = _api("POST", "/api/auth/signup", base_url=api_url, json={
            "name": unique_name,
            "email": email,
            "password": "testpassword1",
            "consent_profile_visible": True,
            "consent_contact_by_owners": True,
        })
        assert signup.status_code == 200

        resp = _api("GET", "/api/volunteers", base_url=api_url, params={"search": unique_name})
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert any(v["name"] == unique_name for v in data["volunteers"])

    @pytest.mark.local_only
    def test_limit_and_offset(self, api_url, new_user):
        resp = _api("GET", "/api/volunteers", base_url=api_url, params={"limit": 1, "offset": 0})
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["volunteers"]) <= 1


class TestVolunteerDetail:
    """GET /api/volunteers/{id} — single volunteer profile."""

    @pytest.mark.local_only
    def test_own_profile_shows_contact_info(self, api_url, new_user):
        resp = _api("GET", f"/api/volunteers/{new_user['id']}", base_url=api_url, token=new_user["token"])
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == new_user["id"]
        assert "email" in data

    @pytest.mark.local_only
    def test_other_profile_hides_contact_info_by_default(self, api_url, new_user):
        # Create a second user whose shareContactDirectly is False (default)
        other_email = f"other_{uuid.uuid4().hex[:8]}@test.com"
        other_signup = _api("POST", "/api/auth/signup", base_url=api_url, json={
            "name": "Other User",
            "email": other_email,
            "password": "testpassword1",
            "consent_profile_visible": True,
            "consent_contact_by_owners": True,
        })
        assert other_signup.status_code == 200
        other_id = other_signup.json()["id"]

        resp = _api("GET", f"/api/volunteers/{other_id}", base_url=api_url, token=new_user["token"])
        assert resp.status_code == 200
        data = resp.json()
        assert "email" not in data

    @pytest.mark.local_only
    def test_profile_includes_projects_and_completed_tasks(self, api_url, new_user):
        resp = _api("GET", f"/api/volunteers/{new_user['id']}", base_url=api_url, token=new_user["token"])
        assert resp.status_code == 200
        data = resp.json()
        assert "projects" in data
        assert "completed_tasks" in data

    @pytest.mark.local_only
    def test_unknown_volunteer_returns_404(self, api_url):
        resp = _api("GET", "/api/volunteers/999999", base_url=api_url)
        assert resp.status_code == 404


class TestVolunteerUpdateMe:
    """PUT /api/volunteers/me — update own profile."""

    @pytest.mark.local_only
    def test_requires_authentication(self, api_url):
        resp = _api("PUT", "/api/volunteers/me", base_url=api_url, json={"bio": "Hello"})
        assert resp.status_code == 401

    @pytest.mark.local_only
    def test_update_bio(self, api_url, new_user):
        new_bio = f"Updated bio {uuid.uuid4().hex[:6]}"
        resp = _api("PUT", "/api/volunteers/me", base_url=api_url, token=new_user["token"], json={"bio": new_bio})
        assert resp.status_code == 200
        data = resp.json()
        assert data["bio"] == new_bio

    @pytest.mark.local_only
    def test_update_multiple_fields(self, api_url, new_user):
        resp = _api("PUT", "/api/volunteers/me", base_url=api_url, token=new_user["token"], json={
            "location": "London",
            "availability_hours_per_week": 10,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["location"] == "London"
        assert data["availability_hours_per_week"] == 10

    @pytest.mark.local_only
    def test_update_skills(self, api_url, new_user):
        # Grab the first available skill ID
        skills_resp = _api("GET", "/api/skills", base_url=api_url)
        categories = skills_resp.json()
        if not categories or not categories[0]["skills"]:
            pytest.skip("No skills in DB")
        skill_id = categories[0]["skills"][0]["id"]

        resp = _api("PUT", "/api/volunteers/me", base_url=api_url, token=new_user["token"], json={
            "skill_ids": [skill_id],
        })
        assert resp.status_code == 200
        data = resp.json()
        skill_ids_returned = [s["id"] for s in data["skills"]]
        assert skill_id in skill_ids_returned

    @pytest.mark.local_only
    def test_clear_skills(self, api_url, new_user):
        resp = _api("PUT", "/api/volunteers/me", base_url=api_url, token=new_user["token"], json={
            "skill_ids": [],
        })
        assert resp.status_code == 200
        assert resp.json()["skills"] == []

    @pytest.mark.local_only
    def test_response_includes_contact_fields(self, api_url, new_user):
        resp = _api("PUT", "/api/volunteers/me", base_url=api_url, token=new_user["token"], json={})
        assert resp.status_code == 200
        data = resp.json()
        assert "email" in data


class TestDashboard:
    """GET /api/dashboard — personalised volunteer dashboard."""

    @pytest.mark.local_only
    def test_requires_authentication(self, api_url):
        resp = _api("GET", "/api/dashboard", base_url=api_url)
        assert resp.status_code == 401

    @pytest.mark.local_only
    def test_returns_expected_structure(self, api_url, new_user):
        resp = _api("GET", "/api/dashboard", base_url=api_url, token=new_user["token"])
        assert resp.status_code == 200
        data = resp.json()
        assert "owned_projects" in data
        assert "proposed_projects" in data
        assert "my_interests" in data
        assert "suggested_projects" in data
        assert "unread_notification_count" in data

    @pytest.mark.local_only
    def test_unread_count_is_integer(self, api_url, new_user):
        resp = _api("GET", "/api/dashboard", base_url=api_url, token=new_user["token"])
        assert resp.status_code == 200
        assert isinstance(resp.json()["unread_notification_count"], int)

    @pytest.mark.local_only
    def test_owned_projects_appear(self, api_url, admin_token):
        from tests.e2e.helpers import BASE_URL

        # Admin creates a project with want_to_own=True — owner_id is set to admin's id
        proj = _api("POST", "/api/admin/projects", base_url=BASE_URL, json={
            "title": f"Dashboard Test Project {uuid.uuid4().hex[:6]}",
            "description": "Project for dashboard e2e test.",
            "urgency": "medium",
            "want_to_own": True,
        }, token=admin_token)
        assert proj.status_code == 200
        project_id = proj.json()["id"]

        resp = _api("GET", "/api/dashboard", base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        owned_ids = [p["id"] for p in resp.json()["owned_projects"]]
        assert project_id in owned_ids
