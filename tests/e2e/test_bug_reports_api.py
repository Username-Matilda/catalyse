"""
E2E API tests for the public bug-report submission route — parameterised to run against both FastAPI and Next.js.

Scenarios covered:
  - POST /api/bug-reports  (submit a bug report, auth optional)
"""

import uuid
import pytest
import requests


def _api(method, path, base_url, json=None, token=None, params=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.request(
        method, f"{base_url}{path}",
        json=json, headers=headers, params=params, timeout=10,
    )


class TestSubmitBugReport:
    """POST /api/bug-reports"""

    @pytest.mark.local_only
    def test_missing_title_returns_error(self, api_url):
        resp = _api("POST", "/api/bug-reports", base_url=api_url, json={
            "description": "A description long enough to be valid.",
        })
        assert resp.status_code in (400, 422)

    @pytest.mark.local_only
    def test_title_too_long_returns_error(self, api_url):
        resp = _api("POST", "/api/bug-reports", base_url=api_url, json={
            "title": "X" * 301,
            "description": "A description long enough to be valid.",
        })
        assert resp.status_code in (400, 422)

    @pytest.mark.local_only
    def test_description_too_short_returns_error(self, api_url):
        resp = _api("POST", "/api/bug-reports", base_url=api_url, json={
            "title": "Short desc bug",
            "description": "Too short",
        })
        assert resp.status_code in (400, 422)

    @pytest.mark.local_only
    def test_anonymous_submission_succeeds(self, api_url):
        resp = _api("POST", "/api/bug-reports", base_url=api_url, json={
            "title": f"Anon Bug {uuid.uuid4().hex[:8]}",
            "description": "This is a description of the bug that is long enough.",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data
        assert "message" in data

    @pytest.mark.local_only
    def test_authenticated_submission_succeeds(self, api_url, new_user):
        resp = _api("POST", "/api/bug-reports", base_url=api_url,
                    token=new_user["token"], json={
                        "title": f"Auth Bug {uuid.uuid4().hex[:8]}",
                        "description": "Authenticated user submitting a bug report.",
                    })
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data

    @pytest.mark.local_only
    def test_returns_numeric_id(self, api_url):
        resp = _api("POST", "/api/bug-reports", base_url=api_url, json={
            "title": "ID Check Bug",
            "description": "Checking that the returned id is numeric.",
        })
        assert resp.status_code == 200
        assert isinstance(resp.json()["id"], int)

    @pytest.mark.local_only
    def test_all_optional_fields_accepted(self, api_url):
        resp = _api("POST", "/api/bug-reports", base_url=api_url, json={
            "title": f"Full Bug {uuid.uuid4().hex[:8]}",
            "description": "A complete bug report with all optional fields filled in.",
            "category": "ux",
            "severity": "low",
            "page_url": "/static/dashboard.html",
            "reporter_email": "anon@example.com",
        })
        assert resp.status_code == 200

    @pytest.mark.local_only
    def test_submitted_report_appears_in_admin_list(self, api_url, admin_token):
        title = f"AdminCheck {uuid.uuid4().hex[:8]}"
        resp = _api("POST", "/api/bug-reports", base_url=api_url, json={
            "title": title,
            "description": "This report should appear in the admin bug-report list.",
        })
        assert resp.status_code == 200
        report_id = resp.json()["id"]

        admin_resp = _api("GET", "/api/admin/bug-reports", base_url=api_url, token=admin_token)
        assert admin_resp.status_code == 200
        ids = [r["id"] for r in admin_resp.json()]
        assert report_id in ids
