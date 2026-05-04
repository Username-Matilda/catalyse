"""Shared constants and utilities for e2e tests."""
import os

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8002")
IS_PRODUCTION = not BASE_URL.startswith("http://localhost")


def _derive_next_base_url(base_url: str) -> str:
    """Derive the Next.js base URL from the FastAPI base URL.

    During the strangler fig migration FastAPI runs on one port and Next.js on
    another (FastAPI port − 4000).  In production Next.js serves everything, so
    the two URLs are the same.
    """
    if base_url.startswith("http://localhost:"):
        port_str = base_url.split(":")[-1].split("/")[0]
        try:
            next_port = int(port_str) - 4000
            return f"http://localhost:{next_port}"
        except ValueError:
            pass
    return base_url


NEXT_BASE_URL = _derive_next_base_url(BASE_URL)


def inject_auth_token(context, token: str):
    """Populate localStorage before any page script runs."""
    context.add_init_script(f"localStorage.setItem('authToken', '{token}');")
