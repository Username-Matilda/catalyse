"""Shared constants and utilities for e2e tests."""
import os

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8002")
IS_PRODUCTION = not BASE_URL.startswith("http://localhost")


def inject_auth_token(context, token: str):
    """Populate localStorage before any page script runs."""
    context.add_init_script(f"localStorage.setItem('authToken', '{token}');")
