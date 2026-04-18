"""
Shared fixtures for Catalyse e2e tests.

Modes:
  LOCAL  (default) — starts a fresh api.py subprocess on port 8002 with an
                     isolated temp SQLite database. All data-creating tests run.
  PRODUCTION       — set BASE_URL to the live site. The server is not started;
                     existing_user fixture logs in with TEST_USER_EMAIL /
                     TEST_USER_PASSWORD env vars. Tests marked local_only are skipped.

Usage:
  pytest tests/e2e/                              # local
  BASE_URL=https://... TEST_USER_EMAIL=... TEST_USER_PASSWORD=... \
    pytest tests/e2e/ -m "not local_only"        # production smoke
"""

import os
import subprocess
import time
import tempfile
import shutil
import uuid
import requests
import pytest

from tests.e2e.helpers import BASE_URL, IS_PRODUCTION, inject_auth_token  # noqa: F401

ADMIN_EMAIL = "admin@test.com"
ADMIN_PASSWORD = "adminpassword1"

# ── Helpers ──────────────────────────────────────────────────────────────────

def _api(method, path, json=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    resp = requests.request(method, f"{BASE_URL}{path}", json=json, headers=headers, timeout=10)
    resp.raise_for_status()
    return resp.json()


# ── Server lifecycle ──────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def _tmp_db_dir():
    tmp = tempfile.mkdtemp(prefix="catalyse_test_")
    yield tmp
    shutil.rmtree(tmp, ignore_errors=True)


@pytest.fixture(scope="session", autouse=True)
def live_server(_tmp_db_dir):
    """Start the API on port 8002 with an isolated test database (local only)."""
    if IS_PRODUCTION:
        yield
        return

    env = {
        **os.environ,
        "PORT": "8002",
        "RAILWAY_VOLUME_MOUNT_PATH": _tmp_db_dir,
        # Don't use ADMIN_EMAILS: it triggers a nested db_transaction inside signup
        # which causes SQLite lock contention. Promote via direct DB write instead.
        "ADMIN_EMAILS": "",
        "RESEND_API_KEY": "",
    }

    proc = subprocess.Popen(
        ["python", "api.py"],
        env=env,
        cwd=str(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
    )

    # Poll until ready (skills endpoint requires a fully-initialised DB)
    deadline = time.time() + 30
    while time.time() < deadline:
        try:
            if requests.get(f"{BASE_URL}/api/skills", timeout=2).status_code == 200:
                break
        except requests.ConnectionError:
            pass
        time.sleep(0.5)
    else:
        proc.terminate()
        raise RuntimeError("Test server did not become ready within 30 seconds")

    yield

    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()


# ── User fixtures ─────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def admin_token(live_server, _tmp_db_dir):
    """
    Create the admin user once per session (local only).
    Promotion is done via direct DB write to avoid the nested db_transaction
    bug in check_admin_bootstrap when ADMIN_EMAILS is set on the server.
    """
    if IS_PRODUCTION:
        pytest.skip("admin_token not available in production mode")
    import sqlite3 as _sqlite3
    data = _api("POST", "/api/auth/signup", json={
        "name": "Test Admin",
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD,
        "consent_profile_visible": True,
        "consent_contact_by_owners": True,
    })
    db_path = os.path.join(_tmp_db_dir, "catalyse.db")
    conn = _sqlite3.connect(db_path)
    conn.execute("UPDATE volunteers SET is_admin = 1 WHERE email = ?", (ADMIN_EMAIL,))
    conn.commit()
    conn.close()
    return data["auth_token"]


@pytest.fixture
def new_user(live_server):
    """Create a fresh unique volunteer for each test (local only)."""
    email = f"user_{uuid.uuid4().hex[:8]}@test.com"
    password = "testpassword1"
    data = _api("POST", "/api/auth/signup", json={
        "name": "Test User",
        "email": email,
        "password": password,
        "consent_profile_visible": True,
        "consent_contact_by_owners": True,
    })
    return {"email": email, "password": password, "token": data["auth_token"], "id": data["id"]}


@pytest.fixture(scope="session")
def existing_user(live_server):
    """Log in with real credentials from env vars (production smoke tests)."""
    email = os.environ.get("TEST_USER_EMAIL", "")
    password = os.environ.get("TEST_USER_PASSWORD", "")
    if not email or not password:
        pytest.skip("TEST_USER_EMAIL / TEST_USER_PASSWORD not set")
    data = _api("POST", "/api/auth/login", json={"email": email, "password": password})
    return {"email": email, "password": password, "token": data["auth_token"]}


# ── Project fixture ───────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def published_project(live_server, admin_token):
    """
    Return a visible project id. Local: create via admin API. Production: fetch first listed project.
    Admin-created projects go straight to seeking_owner, no triage needed.
    """
    if IS_PRODUCTION:
        projects = _api("GET", "/api/projects")
        if not projects:
            pytest.skip("No projects found on production")
        return projects[0]["id"]

    data = _api("POST", "/api/admin/projects", json={
        "title": "E2E Test Project",
        "description": "This project exists for automated e2e testing purposes only.",
        "urgency": "medium",
    }, token=admin_token)
    return data["id"]


# ── Test label overlay ────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def test_label(page, request):
    """Inject a floating label into the browser showing the current test name."""
    label = (
        request.node.name
        .replace("[chromium]", "")
        .replace("_", " ")
    )
    page.add_init_script(f"""
        (() => {{
            const show = () => {{
                if (document.getElementById('__test_label__')) return;
                const el = document.createElement('div');
                el.id = '__test_label__';
                el.textContent = '{label}';
                el.style.cssText = [
                    'position:fixed', 'bottom:16px', 'left:16px',
                    'background:rgba(0,0,0,0.72)', 'color:#fff',
                    'padding:7px 14px', 'border-radius:6px',
                    'font:13px/1.4 monospace', 'z-index:99999',
                    'pointer-events:none', 'max-width:420px',
                    'white-space:pre-wrap'
                ].join(';');
                document.body.appendChild(el);
            }};
            document.addEventListener('DOMContentLoaded', show);
            if (document.readyState !== 'loading') show();
        }})();
    """)


# ── Auth token fixtures ───────────────────────────────────────────────────────

@pytest.fixture
def fresh_token(user_credentials):
    """
    Log in via API to get a fresh, valid token for the current test.
    Use this (not user_credentials["token"]) whenever a test needs to inject
    auth into a browser context — the session token can become stale if a
    prior test logged in as the same user via the login form.
    """
    data = _api("POST", "/api/auth/login", json={
        "email": user_credentials["email"],
        "password": user_credentials["password"],
    })
    return data["auth_token"]


# ── Combined credentials fixture (works in both modes) ───────────────────────

@pytest.fixture(scope="session")
def user_credentials(live_server):
    """
    Return {email, password, token} for a user appropriate to the current mode.
    Local: creates a dedicated session-scoped test user via API.
    Production: logs in with TEST_USER_EMAIL / TEST_USER_PASSWORD env vars.
    """
    if IS_PRODUCTION:
        email = os.environ.get("TEST_USER_EMAIL", "")
        password = os.environ.get("TEST_USER_PASSWORD", "")
        if not email or not password:
            pytest.skip("TEST_USER_EMAIL / TEST_USER_PASSWORD not set")
        data = _api("POST", "/api/auth/login", json={"email": email, "password": password})
        return {"email": email, "password": password, "token": data["auth_token"]}
    else:
        email = f"session_user_{uuid.uuid4().hex[:8]}@test.com"
        password = "testpassword1"
        data = _api("POST", "/api/auth/signup", json={
            "name": "Session Test User",
            "email": email,
            "password": password,
            "consent_profile_visible": True,
            "consent_contact_by_owners": True,
        })
        return {"email": email, "password": password, "token": data["auth_token"]}


