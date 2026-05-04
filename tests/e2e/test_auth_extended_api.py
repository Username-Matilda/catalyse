"""
E2E API tests for extended auth and version routes — parameterised to run against both FastAPI and Next.js.

Scenarios covered:
  - GET  /api/auth/google-client-id   (Google OAuth client ID)
  - GET  /api/version                 (git sha)
  - POST /api/auth/logout             (invalidate token)
  - POST /api/auth/change-password    (change password for authenticated user)
  - POST /api/auth/change-email       (change email for authenticated user)
  - POST /api/auth/delete-account     (soft-delete account)
  - POST /api/auth/forgot-password    (request password reset link)
  - POST /api/auth/reset-password     (reset password with token)
  - POST /api/auth/google             (Google Sign-In)
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


def _signup(base_url):
    """Sign up a fresh volunteer and return {id, email, password, token}."""
    email = f"user_{uuid.uuid4().hex[:8]}@test.com"
    password = "testpassword1"
    resp = _api("POST", "/api/auth/signup", base_url=base_url, json={
        "name": "Test User",
        "email": email,
        "password": password,
        "consent_profile_visible": True,
        "consent_contact_by_owners": True,
    })
    assert resp.status_code == 200, resp.text
    data = resp.json()
    return {"id": data["id"], "email": email, "password": password, "token": data["auth_token"]}


# ── GET /api/auth/google-client-id ────────────────────────────────────────────

class TestGoogleClientId:
    """GET /api/auth/google-client-id"""

    @pytest.mark.local_only
    def test_returns_client_id_field(self, api_url):
        resp = _api("GET", "/api/auth/google-client-id", base_url=api_url)
        assert resp.status_code == 200
        assert "client_id" in resp.json()

    @pytest.mark.local_only
    def test_does_not_require_auth(self, api_url):
        resp = _api("GET", "/api/auth/google-client-id", base_url=api_url)
        assert resp.status_code == 200


# ── GET /api/version ──────────────────────────────────────────────────────────

class TestVersion:
    """GET /api/version"""

    @pytest.mark.local_only
    def test_returns_sha_field(self, api_url):
        resp = _api("GET", "/api/version", base_url=api_url)
        assert resp.status_code == 200
        assert "sha" in resp.json()

    @pytest.mark.local_only
    def test_does_not_require_auth(self, api_url):
        resp = _api("GET", "/api/version", base_url=api_url)
        assert resp.status_code == 200

    @pytest.mark.local_only
    def test_sha_is_string(self, api_url):
        resp = _api("GET", "/api/version", base_url=api_url)
        assert isinstance(resp.json()["sha"], str)


# ── POST /api/auth/logout ─────────────────────────────────────────────────────

class TestLogoutApi:
    """POST /api/auth/logout"""

    @pytest.mark.local_only
    def test_unauthenticated_is_rejected(self, api_url):
        resp = _api("POST", "/api/auth/logout", base_url=api_url)
        assert resp.status_code == 401

    @pytest.mark.local_only
    def test_logout_returns_message(self, api_url):
        user = _signup(BASE_URL)
        resp = _api("POST", "/api/auth/logout", base_url=api_url, token=user["token"])
        assert resp.status_code == 200
        assert "message" in resp.json()

    @pytest.mark.local_only
    def test_token_invalid_after_logout(self, api_url):
        user = _signup(BASE_URL)
        _api("POST", "/api/auth/logout", base_url=BASE_URL, token=user["token"])
        resp = _api("GET", "/api/auth/me", base_url=api_url, token=user["token"])
        assert resp.status_code == 401


# ── POST /api/auth/change-password ───────────────────────────────────────────

class TestChangePassword:
    """POST /api/auth/change-password"""

    @pytest.mark.local_only
    def test_unauthenticated_is_rejected(self, api_url):
        resp = _api("POST", "/api/auth/change-password", base_url=api_url,
                    json={"current_password": "old", "new_password": "newpass1"})
        assert resp.status_code == 401

    @pytest.mark.local_only
    def test_missing_current_password_returns_error(self, api_url, new_user):
        resp = _api("POST", "/api/auth/change-password", base_url=api_url,
                    json={"new_password": "newpass123"}, token=new_user["token"])
        assert resp.status_code in (400, 422)

    @pytest.mark.local_only
    def test_missing_new_password_returns_error(self, api_url, new_user):
        resp = _api("POST", "/api/auth/change-password", base_url=api_url,
                    json={"current_password": "testpassword1"}, token=new_user["token"])
        assert resp.status_code in (400, 422)

    @pytest.mark.local_only
    def test_wrong_current_password_returns_error(self, api_url, new_user):
        resp = _api("POST", "/api/auth/change-password", base_url=api_url,
                    json={"current_password": "wrongpassword", "new_password": "newpass123"},
                    token=new_user["token"])
        assert resp.status_code == 400

    @pytest.mark.local_only
    def test_short_new_password_returns_error(self, api_url, new_user):
        resp = _api("POST", "/api/auth/change-password", base_url=api_url,
                    json={"current_password": "testpassword1", "new_password": "short"},
                    token=new_user["token"])
        assert resp.status_code in (400, 422)

    @pytest.mark.local_only
    def test_successful_change_returns_message(self, api_url):
        user = _signup(BASE_URL)
        resp = _api("POST", "/api/auth/change-password", base_url=api_url,
                    json={"current_password": user["password"], "new_password": "newpassword1"},
                    token=user["token"])
        assert resp.status_code == 200
        assert "message" in resp.json()

    @pytest.mark.local_only
    def test_can_login_with_new_password_after_change(self, api_url):
        user = _signup(BASE_URL)
        new_password = "changedpass1"
        _api("POST", "/api/auth/change-password", base_url=BASE_URL,
             json={"current_password": user["password"], "new_password": new_password},
             token=user["token"])

        login_resp = _api("POST", "/api/auth/login", base_url=api_url,
                          json={"email": user["email"], "password": new_password})
        assert login_resp.status_code == 200
        assert "auth_token" in login_resp.json()


# ── POST /api/auth/change-email ───────────────────────────────────────────────

class TestChangeEmail:
    """POST /api/auth/change-email"""

    @pytest.mark.local_only
    def test_unauthenticated_is_rejected(self, api_url):
        resp = _api("POST", "/api/auth/change-email", base_url=api_url,
                    json={"new_email": "new@test.com", "password": "testpassword1"})
        assert resp.status_code == 401

    @pytest.mark.local_only
    def test_missing_new_email_returns_error(self, api_url, new_user):
        resp = _api("POST", "/api/auth/change-email", base_url=api_url,
                    json={"password": "testpassword1"}, token=new_user["token"])
        assert resp.status_code in (400, 422)

    @pytest.mark.local_only
    def test_missing_password_returns_error(self, api_url, new_user):
        resp = _api("POST", "/api/auth/change-email", base_url=api_url,
                    json={"new_email": "newaddr@test.com"}, token=new_user["token"])
        assert resp.status_code in (400, 422)

    @pytest.mark.local_only
    def test_wrong_password_returns_error(self, api_url, new_user):
        resp = _api("POST", "/api/auth/change-email", base_url=api_url,
                    json={"new_email": "new@test.com", "password": "wrongpassword"},
                    token=new_user["token"])
        assert resp.status_code == 400

    @pytest.mark.local_only
    def test_already_taken_email_returns_error(self, api_url, new_user):
        other = _signup(BASE_URL)
        resp = _api("POST", "/api/auth/change-email", base_url=api_url,
                    json={"new_email": other["email"], "password": new_user["password"]},
                    token=new_user["token"])
        assert resp.status_code == 400

    @pytest.mark.local_only
    def test_successful_change_returns_message(self, api_url):
        user = _signup(BASE_URL)
        new_email = f"changed_{uuid.uuid4().hex[:8]}@test.com"
        resp = _api("POST", "/api/auth/change-email", base_url=api_url,
                    json={"new_email": new_email, "password": user["password"]},
                    token=user["token"])
        assert resp.status_code == 200
        assert "message" in resp.json()

    @pytest.mark.local_only
    def test_email_updated_in_profile(self, api_url):
        user = _signup(BASE_URL)
        new_email = f"updated_{uuid.uuid4().hex[:8]}@test.com"
        _api("POST", "/api/auth/change-email", base_url=BASE_URL,
             json={"new_email": new_email, "password": user["password"]},
             token=user["token"])

        me = _api("GET", "/api/auth/me", base_url=api_url, token=user["token"])
        assert me.status_code == 200
        assert me.json()["email"] == new_email


# ── POST /api/auth/delete-account ────────────────────────────────────────────

class TestDeleteAccount:
    """POST /api/auth/delete-account"""

    @pytest.mark.local_only
    def test_unauthenticated_is_rejected(self, api_url):
        resp = _api("POST", "/api/auth/delete-account", base_url=api_url,
                    json={"password": "testpassword1"})
        assert resp.status_code == 401

    @pytest.mark.local_only
    def test_wrong_password_returns_error(self, api_url, new_user):
        resp = _api("POST", "/api/auth/delete-account", base_url=api_url,
                    json={"password": "wrongpassword"}, token=new_user["token"])
        assert resp.status_code == 400

    @pytest.mark.local_only
    def test_successful_deletion_returns_message(self, api_url):
        user = _signup(BASE_URL)
        resp = _api("POST", "/api/auth/delete-account", base_url=api_url,
                    json={"password": user["password"]}, token=user["token"])
        assert resp.status_code == 200
        assert "message" in resp.json()

    @pytest.mark.local_only
    def test_token_invalid_after_deletion(self, api_url):
        user = _signup(BASE_URL)
        _api("POST", "/api/auth/delete-account", base_url=BASE_URL,
             json={"password": user["password"]}, token=user["token"])
        resp = _api("GET", "/api/auth/me", base_url=api_url, token=user["token"])
        assert resp.status_code == 401


# ── POST /api/auth/forgot-password ───────────────────────────────────────────

class TestForgotPassword:
    """POST /api/auth/forgot-password"""

    @pytest.mark.local_only
    def test_unknown_email_returns_success_to_prevent_enumeration(self, api_url):
        resp = _api("POST", "/api/auth/forgot-password", base_url=api_url,
                    json={"email": "nobody@nowhere.com"})
        assert resp.status_code == 200
        assert "message" in resp.json()

    @pytest.mark.local_only
    def test_known_email_returns_success_message(self, api_url, new_user):
        resp = _api("POST", "/api/auth/forgot-password", base_url=api_url,
                    json={"email": new_user["email"]})
        assert resp.status_code == 200
        assert "message" in resp.json()

    @pytest.mark.local_only
    def test_dev_mode_returns_reset_token(self, api_url, new_user):
        resp = _api("POST", "/api/auth/forgot-password", base_url=api_url,
                    json={"email": new_user["email"]})
        assert resp.status_code == 200
        assert "_dev_reset_token" in resp.json()

    @pytest.mark.local_only
    def test_does_not_require_auth(self, api_url, new_user):
        resp = _api("POST", "/api/auth/forgot-password", base_url=api_url,
                    json={"email": new_user["email"]})
        assert resp.status_code == 200


# ── POST /api/auth/reset-password ────────────────────────────────────────────

class TestResetPassword:
    """POST /api/auth/reset-password"""

    @pytest.mark.local_only
    def test_missing_token_returns_error(self, api_url):
        resp = _api("POST", "/api/auth/reset-password", base_url=api_url,
                    json={"new_password": "newpassword1"})
        assert resp.status_code in (400, 422)

    @pytest.mark.local_only
    def test_missing_new_password_returns_error(self, api_url):
        resp = _api("POST", "/api/auth/reset-password", base_url=api_url,
                    json={"token": "sometoken"})
        assert resp.status_code in (400, 422)

    @pytest.mark.local_only
    def test_short_new_password_returns_error(self, api_url, new_user):
        fp_resp = _api("POST", "/api/auth/forgot-password", base_url=BASE_URL,
                       json={"email": new_user["email"]})
        reset_token = fp_resp.json().get("_dev_reset_token")
        if not reset_token:
            pytest.skip("Dev reset token not available")
        resp = _api("POST", "/api/auth/reset-password", base_url=api_url,
                    json={"token": reset_token, "new_password": "short"})
        assert resp.status_code in (400, 422)

    @pytest.mark.local_only
    def test_invalid_token_returns_400(self, api_url):
        resp = _api("POST", "/api/auth/reset-password", base_url=api_url,
                    json={"token": "invalid_token_xyz", "new_password": "newpassword1"})
        assert resp.status_code == 400

    @pytest.mark.local_only
    def test_valid_token_resets_password(self, api_url):
        user = _signup(BASE_URL)
        fp_resp = _api("POST", "/api/auth/forgot-password", base_url=BASE_URL,
                       json={"email": user["email"]})
        reset_token = fp_resp.json().get("_dev_reset_token")
        if not reset_token:
            pytest.skip("Dev reset token not available")

        new_password = "resetpassword1"
        resp = _api("POST", "/api/auth/reset-password", base_url=api_url,
                    json={"token": reset_token, "new_password": new_password})
        assert resp.status_code == 200
        assert "message" in resp.json()

    @pytest.mark.local_only
    def test_can_login_with_new_password_after_reset(self, api_url):
        user = _signup(BASE_URL)
        fp_resp = _api("POST", "/api/auth/forgot-password", base_url=BASE_URL,
                       json={"email": user["email"]})
        reset_token = fp_resp.json().get("_dev_reset_token")
        if not reset_token:
            pytest.skip("Dev reset token not available")

        new_password = "afterreset1"
        _api("POST", "/api/auth/reset-password", base_url=BASE_URL,
             json={"token": reset_token, "new_password": new_password})

        login_resp = _api("POST", "/api/auth/login", base_url=api_url,
                          json={"email": user["email"], "password": new_password})
        assert login_resp.status_code == 200
        assert "auth_token" in login_resp.json()

    @pytest.mark.local_only
    def test_token_cannot_be_used_twice(self, api_url):
        user = _signup(BASE_URL)
        fp_resp = _api("POST", "/api/auth/forgot-password", base_url=BASE_URL,
                       json={"email": user["email"]})
        reset_token = fp_resp.json().get("_dev_reset_token")
        if not reset_token:
            pytest.skip("Dev reset token not available")

        _api("POST", "/api/auth/reset-password", base_url=BASE_URL,
             json={"token": reset_token, "new_password": "firstpassword1"})

        second_resp = _api("POST", "/api/auth/reset-password", base_url=api_url,
                           json={"token": reset_token, "new_password": "secondpassword1"})
        assert second_resp.status_code == 400


# ── POST /api/auth/google ─────────────────────────────────────────────────────

class TestGoogleAuth:
    """POST /api/auth/google"""

    @pytest.mark.local_only
    def test_unconfigured_returns_503_or_invalid_token_returns_401(self, api_url):
        resp = _api("POST", "/api/auth/google", base_url=api_url,
                    json={"credential": "fake_google_token"})
        # 503 when GOOGLE_CLIENT_ID not set; 401 when set but token is invalid
        assert resp.status_code in (401, 503)

    @pytest.mark.local_only
    def test_missing_credential_returns_error(self, api_url):
        resp = _api("POST", "/api/auth/google", base_url=api_url, json={})
        assert resp.status_code in (400, 401, 422, 503)
