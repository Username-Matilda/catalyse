"""
E2E tests for the privacy/GDPR export route — parameterised to run against both FastAPI and Next.js.

Scenarios covered:
  - GET /api/privacy/export  (authentication, response shape, top-level skills key)
"""

import requests
import pytest


def _api(method, path, base_url, json=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    resp = requests.request(
        method, f"{base_url}{path}",
        json=json, headers=headers, timeout=10,
    )
    return resp


class TestPrivacyExport:
    """GET /api/privacy/export — GDPR data portability."""

    @pytest.mark.local_only
    def test_requires_authentication(self, api_url):
        resp = _api("GET", "/api/privacy/export", base_url=api_url)
        assert resp.status_code == 401

    @pytest.mark.local_only
    def test_returns_expected_top_level_keys(self, api_url, new_user):
        resp = _api("GET", "/api/privacy/export", base_url=api_url, token=new_user["token"])
        assert resp.status_code == 200
        data = resp.json()
        for key in ("exported_at", "profile", "skills", "projects", "interests", "messages_sent", "messages_received"):
            assert key in data, f"Missing top-level key: {key!r}"

    @pytest.mark.local_only
    def test_skills_is_list(self, api_url, new_user):
        resp = _api("GET", "/api/privacy/export", base_url=api_url, token=new_user["token"])
        assert resp.status_code == 200
        assert isinstance(resp.json()["skills"], list)

    @pytest.mark.local_only
    def test_profile_contains_own_email(self, api_url, new_user):
        resp = _api("GET", "/api/privacy/export", base_url=api_url, token=new_user["token"])
        assert resp.status_code == 200
        assert resp.json()["profile"]["email"] == new_user["email"]

    @pytest.mark.local_only
    def test_profile_does_not_leak_auth_token(self, api_url, new_user):
        resp = _api("GET", "/api/privacy/export", base_url=api_url, token=new_user["token"])
        assert resp.status_code == 200
        profile = resp.json()["profile"]
        assert "auth_token" not in profile
        assert "auth_token_expires_at" not in profile

    @pytest.mark.local_only
    def test_exported_skills_appear_after_profile_update(self, api_url, new_user):
        # Grab the first available skill
        skills_resp = _api("GET", "/api/skills", base_url=api_url)
        categories = skills_resp.json()
        if not categories or not categories[0]["skills"]:
            pytest.skip("No skills in DB")
        skill_id = categories[0]["skills"][0]["id"]

        # Assign that skill to the volunteer
        put = _api("PUT", "/api/volunteers/me", base_url=api_url, token=new_user["token"], json={
            "skill_ids": [skill_id],
        })
        assert put.status_code == 200

        # Export should now include it in the top-level skills list
        resp = _api("GET", "/api/privacy/export", base_url=api_url, token=new_user["token"])
        assert resp.status_code == 200
        exported_skill_ids = [s["id"] for s in resp.json()["skills"]]
        assert skill_id in exported_skill_ids
