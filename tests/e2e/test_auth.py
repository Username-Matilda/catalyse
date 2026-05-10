import uuid
import requests
import pytest
from playwright.sync_api import Page, expect
from tests.e2e.helpers import BASE_URL, IS_PRODUCTION, inject_auth_token


def _api(method, path, base_url, json=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    resp = requests.request(method, f"{base_url}{path}", json=json, headers=headers, timeout=10)
    return resp


# ── Signup ────────────────────────────────────────────────────────────────────

class TestSignup:
    @pytest.mark.local_only
    def test_signup_form_renders(self, page: Page):
        page.goto(f"{BASE_URL}/static/signup.html")
        expect(page.locator("h1")).to_be_visible()
        expect(page.locator("#signupForm")).to_be_visible()

    @pytest.mark.local_only
    def test_successful_signup(self, page: Page):
        email = f"user_{uuid.uuid4().hex[:8]}@test.com"
        page.goto(f"{BASE_URL}/static/signup.html")
        page.fill("#name", "New Test User")
        page.fill("#email", email)
        page.fill("#password", "testpassword1")
        page.fill("#password_confirm", "testpassword1")
        page.click("#signupForm button[type=submit]")
        expect(page).to_have_url(f"{BASE_URL}/static/dashboard.html", timeout=10000)

    @pytest.mark.local_only
    def test_server_error_shows_error_code(self, page: Page):
        """500 responses with an error code surface that code in the UI."""
        page.route(
            "**/api/auth/signup",
            lambda route: route.fulfill(
                status=500,
                content_type="application/json",
                body='{"detail": "Something went wrong creating your account. Please try again or contact us. Error Code: A"}'
            )
        )
        page.goto(f"{BASE_URL}/static/signup.html")
        page.fill("#name", "Test User")
        page.fill("#email", "test@example.com")
        page.fill("#password", "testpassword1")
        page.fill("#password_confirm", "testpassword1")
        page.click("#signupForm button[type=submit]")
        msg = page.locator("#submitMessageDiv")
        expect(msg).to_be_visible(timeout=5000)
        expect(msg).to_contain_text("Error Code: A")

    @pytest.mark.local_only
    def test_duplicate_email_shows_error(self, page: Page, new_user):
        page.goto(f"{BASE_URL}/static/signup.html")
        page.fill("#name", "Dupe User")
        page.fill("#email", new_user["email"])
        page.fill("#password", "testpassword1")
        page.fill("#password_confirm", "testpassword1")
        page.click("#signupForm button[type=submit]")
        expect(page.locator("#messageDiv")).to_be_visible(timeout=5000)


# ── Login ─────────────────────────────────────────────────────────────────────

class TestLogin:
    def test_login_form_renders(self, page: Page):
        page.goto(f"{BASE_URL}/static/login.html")
        expect(page.locator("h1")).to_be_visible()
        expect(page.locator("#loginForm")).to_be_visible()

    def test_successful_login(self, page: Page, user_credentials):
        page.goto(f"{BASE_URL}/static/login.html")
        page.fill("#email", user_credentials["email"])
        page.fill("#password", user_credentials["password"])
        page.click("#loginForm button[type=submit]")
        expect(page).to_have_url(f"{BASE_URL}/static/dashboard.html", timeout=10000)

    @pytest.mark.local_only
    def test_invalid_password_shows_error(self, page: Page, new_user):
        page.goto(f"{BASE_URL}/static/login.html")
        page.fill("#email", new_user["email"])
        page.fill("#password", "wrongpassword1")
        page.click("#loginForm button[type=submit]")
        expect(page.locator("#messageDiv")).to_be_visible(timeout=5000)

    @pytest.mark.local_only
    def test_unknown_email_shows_error(self, page: Page):
        page.goto(f"{BASE_URL}/static/login.html")
        page.fill("#email", "nobody@nowhere.com")
        page.fill("#password", "testpassword1")
        page.click("#loginForm button[type=submit]")
        expect(page.locator("#messageDiv")).to_be_visible(timeout=5000)


# ── Logout ────────────────────────────────────────────────────────────────────

class TestLogout:
    def test_logout_clears_session(self, page: Page, user_credentials):
        # Log in via the form to get a fresh token — don't use the cached fixture
        # token, which may have been invalidated by a prior login in the same session.
        page.goto(f"{BASE_URL}/static/login.html")
        page.fill("#email", user_credentials["email"])
        page.fill("#password", user_credentials["password"])
        page.click("#loginForm button[type=submit]")
        expect(page).to_have_url(f"{BASE_URL}/static/dashboard.html", timeout=10000)
        page.locator(".user-button").click()
        page.get_by_role("link", name="Sign Out").click()
        # logout() redirects to login; wait for that to confirm the full logout flow ran
        expect(page).to_have_url(f"{BASE_URL}/static/login.html", timeout=10000)
        stored = page.evaluate("localStorage.getItem('authToken')")
        assert stored is None


# ── Direct API tests (parameterised across both backends) ─────────────────────

class TestAuthApi:
    """Direct API tests for auth endpoints — runs against both FastAPI and Next.js."""

    @pytest.mark.local_only
    def test_signup_returns_token(self, api_url):
        email = f"api_{uuid.uuid4().hex[:8]}@test.com"
        resp = _api("POST", "/api/auth/signup", base_url=api_url, json={
            "name": "API Test User",
            "email": email,
            "password": "testpassword1",
            "consent_profile_visible": True,
            "consent_contact_by_owners": True,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "auth_token" in data
        assert "id" in data

    @pytest.mark.local_only
    def test_signup_duplicate_email_rejected(self, api_url, new_user):
        resp = _api("POST", "/api/auth/signup", base_url=api_url, json={
            "name": "Dupe User",
            "email": new_user["email"],
            "password": "testpassword1",
            "consent_profile_visible": True,
            "consent_contact_by_owners": True,
        })
        assert resp.status_code == 400

    @pytest.mark.local_only
    def test_login_returns_token(self, api_url, new_user):
        resp = _api("POST", "/api/auth/login", base_url=api_url, json={
            "email": new_user["email"],
            "password": new_user["password"],
        })
        assert resp.status_code == 200
        assert "auth_token" in resp.json()

    @pytest.mark.local_only
    def test_login_wrong_password_rejected(self, api_url, new_user):
        resp = _api("POST", "/api/auth/login", base_url=api_url, json={
            "email": new_user["email"],
            "password": "wrongpassword1",
        })
        assert resp.status_code == 401

    @pytest.mark.local_only
    def test_login_unknown_email_rejected(self, api_url):
        resp = _api("POST", "/api/auth/login", base_url=api_url, json={
            "email": "nobody@nowhere.com",
            "password": "testpassword1",
        })
        assert resp.status_code == 401

    @pytest.mark.local_only
    def test_me_returns_user(self, api_url, new_user):
        resp = _api("GET", "/api/auth/me", base_url=api_url, token=new_user["token"])
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == new_user["email"]

    @pytest.mark.local_only
    def test_me_unauthenticated(self, api_url):
        resp = _api("GET", "/api/auth/me", base_url=api_url)
        assert resp.status_code == 401
