"""
E2E API tests for admin user-management routes — parameterised to run against both FastAPI and Next.js.

Scenarios covered:
  - GET  /api/admin/admins                (list admins)
  - GET  /api/admin/invites               (list invites)
  - POST /api/admin/admins/invite         (send invite)
  - POST /api/admin/admins/accept-invite  (accept invite)
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


def _make_pending_invite(base_url, admin_token):
    """Create a pending invite for a fresh email and return {id, email, invite_token}."""
    email = f"invite_{uuid.uuid4().hex[:8]}@test.com"
    resp = _api("POST", "/api/admin/admins/invite", base_url=base_url,
                json={"email": email}, token=admin_token)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    list_resp = _api("GET", "/api/admin/invites", base_url=base_url, token=admin_token)
    invite = next(i for i in list_resp.json() if i["email"] == email and i["status"] == "pending")
    return {"id": invite["id"], "email": email, "invite_token": data.get("_dev_invite_token")}


# ── GET /api/admin/admins ──────────────────────────────────────────────────────

class TestListAdmins:
    """GET /api/admin/admins"""

    @pytest.mark.local_only
    def test_unauthenticated_is_rejected(self, api_url):
        resp = _api("GET", "/api/admin/admins", base_url=api_url)
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_requires_admin(self, api_url, new_user):
        resp = _api("GET", "/api/admin/admins", base_url=api_url, token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_returns_list(self, api_url, admin_token):
        resp = _api("GET", "/api/admin/admins", base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.local_only
    def test_list_is_non_empty(self, api_url, admin_token):
        resp = _api("GET", "/api/admin/admins", base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    @pytest.mark.local_only
    def test_admin_entry_has_expected_fields(self, api_url, admin_token):
        resp = _api("GET", "/api/admin/admins", base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        admin = resp.json()[0]
        for field in ("id", "name", "email", "created_at"):
            assert field in admin, f"Missing field: {field}"

    @pytest.mark.local_only
    def test_volunteer_is_not_in_admin_list(self, api_url, admin_token, new_user):
        resp = _api("GET", "/api/admin/admins", base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        ids = [a["id"] for a in resp.json()]
        assert new_user["id"] not in ids


# ── GET /api/admin/invites ─────────────────────────────────────────────────────

class TestListInvites:
    """GET /api/admin/invites"""

    @pytest.mark.local_only
    def test_unauthenticated_is_rejected(self, api_url):
        resp = _api("GET", "/api/admin/invites", base_url=api_url)
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_requires_admin(self, api_url, new_user):
        resp = _api("GET", "/api/admin/invites", base_url=api_url, token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_returns_list(self, api_url, admin_token):
        resp = _api("GET", "/api/admin/invites", base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.local_only
    def test_invite_has_expected_fields(self, api_url, admin_token):
        _make_pending_invite(BASE_URL, admin_token)
        resp = _api("GET", "/api/admin/invites", base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        invites = resp.json()
        assert len(invites) >= 1
        invite = invites[0]
        for field in ("id", "email", "status", "expires_at", "created_at", "invited_by_name"):
            assert field in invite, f"Missing field: {field}"

    @pytest.mark.local_only
    def test_pending_invite_appears_in_list(self, api_url, admin_token):
        invite = _make_pending_invite(BASE_URL, admin_token)
        resp = _api("GET", "/api/admin/invites", base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        emails = [i["email"] for i in resp.json()]
        assert invite["email"] in emails


# ── POST /api/admin/admins/invite ─────────────────────────────────────────────

class TestSendInvite:
    """POST /api/admin/admins/invite"""

    @pytest.mark.local_only
    def test_unauthenticated_is_rejected(self, api_url):
        resp = _api("POST", "/api/admin/admins/invite", base_url=api_url,
                    json={"email": "someone@test.com"})
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_requires_admin(self, api_url, new_user):
        resp = _api("POST", "/api/admin/admins/invite", base_url=api_url,
                    json={"email": "someone@test.com"}, token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_missing_email_returns_error(self, api_url, admin_token):
        resp = _api("POST", "/api/admin/admins/invite", base_url=api_url,
                    json={}, token=admin_token)
        assert resp.status_code in (400, 422)

    @pytest.mark.local_only
    def test_invalid_email_returns_error(self, api_url, admin_token):
        resp = _api("POST", "/api/admin/admins/invite", base_url=api_url,
                    json={"email": "notanemail"}, token=admin_token)
        assert resp.status_code in (400, 422)

    @pytest.mark.local_only
    def test_already_admin_returns_400(self, api_url, admin_token):
        # Invite the already-admin account's own email
        me = _api("GET", "/api/auth/me", base_url=BASE_URL, token=admin_token)
        admin_email = me.json()["email"]
        resp = _api("POST", "/api/admin/admins/invite", base_url=api_url,
                    json={"email": admin_email}, token=admin_token)
        assert resp.status_code == 400

    @pytest.mark.local_only
    def test_creates_invite_successfully(self, api_url, admin_token):
        email = f"newinvite_{uuid.uuid4().hex[:8]}@test.com"
        resp = _api("POST", "/api/admin/admins/invite", base_url=api_url,
                    json={"email": email}, token=admin_token)
        assert resp.status_code == 200
        data = resp.json()
        assert "message" in data
        assert "expires_at" in data

    @pytest.mark.local_only
    def test_dev_mode_returns_invite_token(self, api_url, admin_token):
        email = f"devtoken_{uuid.uuid4().hex[:8]}@test.com"
        resp = _api("POST", "/api/admin/admins/invite", base_url=api_url,
                    json={"email": email}, token=admin_token)
        assert resp.status_code == 200
        assert "_dev_invite_token" in resp.json()

    @pytest.mark.local_only
    def test_duplicate_pending_invite_returns_400(self, api_url, admin_token):
        email = f"dup_{uuid.uuid4().hex[:8]}@test.com"
        _api("POST", "/api/admin/admins/invite", base_url=BASE_URL,
             json={"email": email}, token=admin_token)
        resp = _api("POST", "/api/admin/admins/invite", base_url=api_url,
                    json={"email": email}, token=admin_token)
        assert resp.status_code == 400


# ── POST /api/admin/admins/accept-invite ──────────────────────────────────────

class TestAcceptInvite:
    """POST /api/admin/admins/accept-invite"""

    @pytest.mark.local_only
    def test_unauthenticated_is_rejected(self, api_url):
        resp = _api("POST", "/api/admin/admins/accept-invite?invite_token=fake",
                    base_url=api_url)
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_missing_invite_token_returns_422(self, api_url, new_user):
        resp = _api("POST", "/api/admin/admins/accept-invite",
                    base_url=api_url, token=new_user["token"])
        assert resp.status_code == 422

    @pytest.mark.local_only
    def test_invalid_token_returns_404(self, api_url, new_user):
        resp = _api("POST", "/api/admin/admins/accept-invite?invite_token=invalid_token",
                    base_url=api_url, token=new_user["token"])
        assert resp.status_code == 404

    @pytest.mark.local_only
    def test_wrong_email_returns_403(self, api_url, admin_token, new_user):
        invite = _make_pending_invite(BASE_URL, admin_token)
        resp = _api(
            "POST", f"/api/admin/admins/accept-invite?invite_token={invite['invite_token']}",
            base_url=api_url, token=new_user["token"],
        )
        assert resp.status_code == 403

    @pytest.mark.local_only
    def test_valid_invite_accepted_successfully(self, api_url, admin_token):
        vol = _make_volunteer(BASE_URL)
        invite_resp = _api("POST", "/api/admin/admins/invite", base_url=BASE_URL,
                           json={"email": vol["email"]}, token=admin_token)
        assert invite_resp.status_code == 200
        invite_token = invite_resp.json()["_dev_invite_token"]

        resp = _api(
            "POST", f"/api/admin/admins/accept-invite?invite_token={invite_token}",
            base_url=api_url, token=vol["token"],
        )
        assert resp.status_code == 200
        assert "message" in resp.json()

    @pytest.mark.local_only
    def test_volunteer_becomes_admin_after_accepting(self, api_url, admin_token):
        vol = _make_volunteer(BASE_URL)
        invite_resp = _api("POST", "/api/admin/admins/invite", base_url=BASE_URL,
                           json={"email": vol["email"]}, token=admin_token)
        invite_token = invite_resp.json()["_dev_invite_token"]
        _api("POST", f"/api/admin/admins/accept-invite?invite_token={invite_token}",
             base_url=BASE_URL, token=vol["token"])

        list_resp = _api("GET", "/api/admin/admins", base_url=api_url, token=admin_token)
        assert list_resp.status_code == 200
        ids = [a["id"] for a in list_resp.json()]
        assert vol["id"] in ids
