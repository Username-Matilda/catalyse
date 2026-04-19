import uuid
import pytest
from playwright.sync_api import Page, expect
from tests.e2e.helpers import BASE_URL, IS_PRODUCTION, inject_auth_token


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
        page.get_by_role("link", name="Logout").click()
        # logout() redirects to login; wait for that to confirm the full logout flow ran
        expect(page).to_have_url(f"{BASE_URL}/static/login.html", timeout=10000)
        stored = page.evaluate("localStorage.getItem('authToken')")
        assert stored is None
