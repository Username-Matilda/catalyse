import pytest
from playwright.sync_api import Page, expect
from tests.e2e.helpers import BASE_URL, inject_auth_token


class TestProjectsBrowsing:
    def test_homepage_loads(self, page: Page, fresh_token, published_project):
        inject_auth_token(page.context, fresh_token)
        page.goto(f"{BASE_URL}/")
        # Wait for at least one card to confirm the list rendered with content
        expect(page.locator("#projectsList .card").first).to_be_visible(timeout=10000)

    def test_projects_list_shows_cards(self, page: Page, fresh_token, published_project):
        inject_auth_token(page.context, fresh_token)
        page.goto(f"{BASE_URL}/")
        # Cards are loaded asynchronously via JS fetch
        expect(page.locator("#projectsList .card").first).to_be_visible(timeout=10000)

    def test_project_card_links_to_detail(self, page: Page, fresh_token, published_project):
        inject_auth_token(page.context, fresh_token)
        page.goto(f"{BASE_URL}/")
        expect(page.locator("#projectsList .card").first).to_be_visible(timeout=10000)
        page.locator("#projectsList .card a").first.click()
        page.wait_for_url(f"{BASE_URL}/static/project.html**", timeout=5000)
        assert "id=" in page.url

    def test_project_detail_shows_content(self, page: Page, fresh_token, published_project):
        inject_auth_token(page.context, fresh_token)
        page.goto(f"{BASE_URL}/static/project.html?id={published_project}")
        expect(page.locator("#projectContent")).to_be_visible(timeout=10000)
        expect(page.locator("#projectTitle")).not_to_be_empty()

    @pytest.mark.local_only
    def test_unauthenticated_redirects_to_login(self, page: Page, published_project):
        # Without auth, the homepage should redirect to login
        page.goto(f"{BASE_URL}/")
        expect(page).to_have_url(f"{BASE_URL}/static/login.html", timeout=10000)
