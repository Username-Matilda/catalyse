"""
E2E API tests for admin bug-report routes — parameterised to run against both FastAPI and Next.js.

Scenarios covered:
  - GET /api/admin/bug-reports           (list bug reports, optional status filter)
  - PUT /api/admin/bug-reports/{id}      (update status / resolution notes)
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


def _make_bug_report(base_url, token=None):
    """Submit a bug report and return its id."""
    resp = _api("POST", "/api/bug-reports", base_url=base_url, json={
        "title": f"Test Bug {uuid.uuid4().hex[:8]}",
        "description": "This is a test bug report description.",
        "category": "bug",
        "severity": "medium",
    }, token=token)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


# ── GET /api/admin/bug-reports ────────────────────────────────────────────────

class TestAdminListBugReports:
    """GET /api/admin/bug-reports"""

    @pytest.mark.local_only
    def test_unauthenticated_is_rejected(self, api_url):
        resp = _api("GET", "/api/admin/bug-reports", base_url=api_url)
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_requires_admin(self, api_url, new_user):
        resp = _api("GET", "/api/admin/bug-reports", base_url=api_url,
                    token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_returns_list(self, api_url, admin_token):
        resp = _api("GET", "/api/admin/bug-reports", base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.local_only
    def test_submitted_report_appears_in_list(self, api_url, admin_token, new_user):
        report_id = _make_bug_report(BASE_URL, token=new_user["token"])
        resp = _api("GET", "/api/admin/bug-reports", base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        ids = [r["id"] for r in resp.json()]
        assert report_id in ids

    @pytest.mark.local_only
    def test_report_has_expected_fields(self, api_url, admin_token, new_user):
        _make_bug_report(BASE_URL, token=new_user["token"])
        resp = _api("GET", "/api/admin/bug-reports", base_url=api_url, token=admin_token)
        assert resp.status_code == 200
        reports = resp.json()
        assert len(reports) >= 1
        report = reports[0]
        for field in ("id", "title", "description", "category", "severity", "status",
                      "created_at"):
            assert field in report, f"Missing field: {field}"

    @pytest.mark.local_only
    def test_status_filter_open(self, api_url, admin_token):
        _make_bug_report(BASE_URL)
        resp = _api("GET", "/api/admin/bug-reports", base_url=api_url, token=admin_token,
                    params={"status": "open"})
        assert resp.status_code == 200
        for report in resp.json():
            assert report["status"] == "open"

    @pytest.mark.local_only
    def test_status_filter_resolved(self, api_url, admin_token):
        report_id = _make_bug_report(BASE_URL)
        _api("PUT", f"/api/admin/bug-reports/{report_id}", base_url=BASE_URL,
             json={"status": "resolved", "resolution_notes": "Fixed."}, token=admin_token)

        resp = _api("GET", "/api/admin/bug-reports", base_url=api_url, token=admin_token,
                    params={"status": "resolved"})
        assert resp.status_code == 200
        for report in resp.json():
            assert report["status"] == "resolved"


# ── PUT /api/admin/bug-reports/{id} ──────────────────────────────────────────

class TestAdminUpdateBugReport:
    """PUT /api/admin/bug-reports/{id}"""

    @pytest.mark.local_only
    def test_unauthenticated_is_rejected(self, api_url):
        resp = _api("PUT", "/api/admin/bug-reports/1", base_url=api_url,
                    json={"status": "resolved"})
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_requires_admin(self, api_url, new_user):
        resp = _api("PUT", "/api/admin/bug-reports/1", base_url=api_url,
                    json={"status": "resolved"}, token=new_user["token"])
        assert resp.status_code in (401, 403)

    @pytest.mark.local_only
    def test_unknown_report_returns_404(self, api_url, admin_token):
        resp = _api("PUT", "/api/admin/bug-reports/999999", base_url=api_url,
                    json={"status": "resolved"}, token=admin_token)
        assert resp.status_code == 404

    @pytest.mark.local_only
    def test_updates_status_successfully(self, api_url, admin_token):
        report_id = _make_bug_report(BASE_URL)
        resp = _api("PUT", f"/api/admin/bug-reports/{report_id}", base_url=api_url,
                    json={"status": "in_progress"}, token=admin_token)
        assert resp.status_code == 200
        assert "message" in resp.json()

    @pytest.mark.local_only
    def test_resolved_status_sets_resolved_by_and_at(self, api_url, admin_token):
        report_id = _make_bug_report(BASE_URL)
        _api("PUT", f"/api/admin/bug-reports/{report_id}", base_url=api_url,
             json={"status": "resolved"}, token=admin_token)

        reports = _api("GET", "/api/admin/bug-reports", base_url=api_url, token=admin_token).json()
        report = next(r for r in reports if r["id"] == report_id)
        assert report["status"] == "resolved"
        assert report["resolved_by_id"] is not None
        assert report["resolved_at"] is not None

    @pytest.mark.local_only
    def test_wont_fix_status_sets_resolved_fields(self, api_url, admin_token):
        report_id = _make_bug_report(BASE_URL)
        _api("PUT", f"/api/admin/bug-reports/{report_id}", base_url=api_url,
             json={"status": "wont_fix"}, token=admin_token)

        reports = _api("GET", "/api/admin/bug-reports", base_url=api_url, token=admin_token).json()
        report = next(r for r in reports if r["id"] == report_id)
        assert report["status"] == "wont_fix"
        assert report["resolved_by_id"] is not None

    @pytest.mark.local_only
    def test_updates_resolution_notes(self, api_url, admin_token):
        report_id = _make_bug_report(BASE_URL)
        notes = f"Fixed in PR #{uuid.uuid4().hex[:6]}"
        _api("PUT", f"/api/admin/bug-reports/{report_id}", base_url=api_url,
             json={"resolution_notes": notes}, token=admin_token)

        reports = _api("GET", "/api/admin/bug-reports", base_url=api_url, token=admin_token).json()
        report = next(r for r in reports if r["id"] == report_id)
        assert report["resolution_notes"] == notes
