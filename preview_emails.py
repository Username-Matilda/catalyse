"""
Email preview server. Run with:

    python preview_emails.py

Then open http://localhost:8765 in your browser.
"""

import html as html_module
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse

# Point APP_URL at localhost so links in emails resolve locally.
os.environ.setdefault("APP_URL", "http://localhost:8000")

from email_service import (
    compose_password_reset_email,
    compose_admin_invite_email,
    compose_welcome_email,
    compose_project_notification_email,
    compose_digest_email,
    compose_task_nudge_email,
    compose_task_final_warning_email,
    compose_task_surrendered_owner_email,
    compose_task_surrendered_assignee_email,
    compose_relay_message,
)

PORT = 8765

# ---------------------------------------------------------------------------
# Each entry: label, params dict (for display), compose callable -> (subject, html)
# ---------------------------------------------------------------------------

PREVIEWS = [
    {
        "key": "nudge",
        "label": "Task nudge",
        "params": {
            "name": "Alex Johnson",
            "task_title": "Write fundraising copy",
            "project_title": "Climate Action Newsletter",
            "days_inactive": 14,
            "activity_phrase": "you were assigned this task",
            "last_activity_date": "16 April 2026",
        },
        "compose": lambda: compose_task_nudge_email(
            name="Alex Johnson",
            task_title="Write fundraising copy",
            project_title="Climate Action Newsletter",
            project_id=1,
            task_id=42,
            days_inactive=14,
            activity_phrase="you were assigned this task",
            last_activity_date="16 April 2026",
        ),
    },
    {
        "key": "final-warning",
        "label": "Final warning",
        "params": {
            "name": "Alex Johnson",
            "task_title": "Write fundraising copy",
            "project_title": "Climate Action Newsletter",
            "days_inactive": 21,
            "activity_phrase": "you last updated this task",
            "last_activity_date": "9 April 2026",
            "surrender_date": "7 May 2026",
        },
        "compose": lambda: compose_task_final_warning_email(
            name="Alex Johnson",
            task_title="Write fundraising copy",
            project_title="Climate Action Newsletter",
            project_id=1,
            task_id=42,
            days_inactive=21,
            activity_phrase="you last updated this task",
            last_activity_date="9 April 2026",
            surrender_date="7 May 2026",
        ),
    },
    {
        "key": "surrendered-assignee",
        "label": "Surrendered — assignee",
        "params": {
            "name": "Alex Johnson",
            "task_title": "Write fundraising copy",
            "project_title": "Climate Action Newsletter",
        },
        "compose": lambda: compose_task_surrendered_assignee_email(
            name="Alex Johnson",
            task_title="Write fundraising copy",
            project_title="Climate Action Newsletter",
            project_id=1,
        ),
    },
    {
        "key": "surrendered-owner",
        "label": "Surrendered — owner",
        "params": {
            "owner_name": "Sam Rivera",
            "volunteer_name": "Alex Johnson",
            "task_title": "Write fundraising copy",
            "project_title": "Climate Action Newsletter",
        },
        "compose": lambda: compose_task_surrendered_owner_email(
            owner_name="Sam Rivera",
            volunteer_name="Alex Johnson",
            task_title="Write fundraising copy",
            project_title="Climate Action Newsletter",
            project_id=1,
        ),
    },
    {
        "key": "welcome",
        "label": "Welcome",
        "params": {"name": "Alex Johnson"},
        "compose": lambda: compose_welcome_email(name="Alex Johnson"),
    },
    {
        "key": "password-reset",
        "label": "Password reset",
        "params": {"name": "Alex Johnson", "reset_token": "example-reset-token-abc123"},
        "compose": lambda: compose_password_reset_email(
            reset_token="example-reset-token-abc123",
            name="Alex Johnson",
        ),
    },
    {
        "key": "admin-invite",
        "label": "Admin invite",
        "params": {"invited_by": "Sam Rivera", "invite_token": "example-invite-token-xyz789"},
        "compose": lambda: compose_admin_invite_email(
            invite_token="example-invite-token-xyz789",
            invited_by="Sam Rivera",
        ),
    },
    {
        "key": "digest",
        "label": "Project digest",
        "params": {
            "name": "Alex Johnson",
            "is_match": True,
            "projects": "Climate Action Newsletter (92% match), Social Media Campaign",
        },
        "compose": lambda: compose_digest_email(
            name="Alex Johnson",
            projects=[
                {
                    "id": 1,
                    "title": "Climate Action Newsletter",
                    "description": "Help us produce a monthly newsletter covering climate action stories, volunteer spotlights, and upcoming events for the PauseAI community.",
                    "skill_names": ["Writing", "Editing", "Communications"],
                    "match_percent": 92,
                },
                {
                    "id": 2,
                    "title": "Social Media Campaign",
                    "description": "Create and schedule social media content across Twitter, Instagram, and LinkedIn to grow PauseAI's online presence.",
                    "skill_names": ["Social Media", "Graphic Design"],
                    "match_percent": None,
                },
            ],
            is_match=True,
        ),
    },
    {
        "key": "project-notification",
        "label": "Project notification",
        "params": {
            "name": "Alex Johnson",
            "project_title": "Climate Action Newsletter",
            "subject": "You've been approved for Climate Action Newsletter",
        },
        "compose": lambda: compose_project_notification_email(
            name="Alex Johnson",
            subject="You've been approved for Climate Action Newsletter",
            message="Great news — Sam Rivera has approved your request to join the project. You can now view the full project details and get started.",
            project_title="Climate Action Newsletter",
            project_id=1,
        ),
    },
    {
        "key": "relay",
        "label": "Relay message",
        "params": {
            "to_name": "Alex Johnson",
            "from_name": "Sam Rivera",
            "from_email": "sam@example.com",
            "project_title": "Climate Action Newsletter",
            "subject": "Welcome to the project!",
        },
        "compose": lambda: compose_relay_message(
            to_name="Alex Johnson",
            from_name="Sam Rivera",
            from_email="sam@example.com",
            subject="Welcome to the project!",
            message="Hi Alex, really glad to have you on board. Let me know if you have any questions about the fundraising copy task — happy to jump on a call.",
            project_title="Climate Action Newsletter",
        ),
    },
]


def build_index() -> str:
    sections = []
    for preview in PREVIEWS:
        subject, email_html = preview["compose"]()

        params_rows = "".join(
            f"<tr><td>{html_module.escape(k)}</td><td>{html_module.escape(str(v))}</td></tr>"
            for k, v in preview["params"].items()
        )

        # srcdoc requires attribute-escaped HTML (double quotes → &quot;)
        srcdoc = html_module.escape(email_html, quote=True)

        sections.append(f"""
        <section id="{preview['key']}">
            <h2>{html_module.escape(preview['label'])}</h2>
            <div class="row">
                <div class="meta">
                    <div class="subject-line">
                        <span class="pill">Subject</span>
                        {html_module.escape(subject)}
                    </div>
                    <table class="params">
                        <thead><tr><th>Param</th><th>Value</th></tr></thead>
                        <tbody>{params_rows}</tbody>
                    </table>
                </div>
                <div class="preview-box">
                    <iframe srcdoc="{srcdoc}" sandbox="allow-same-origin"></iframe>
                </div>
            </div>
        </section>
        """)

    nav_links = " &middot; ".join(
        f'<a href="#{p["key"]}">{html_module.escape(p["label"])}</a>'
        for p in PREVIEWS
    )

    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Email Previews — Catalyse</title>
  <style>
    *, *::before, *::after {{ box-sizing: border-box; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f7fafc; color: #1a202c; margin: 0; padding: 0;
    }}
    header {{
      position: sticky; top: 0; z-index: 100;
      background: #1a202c; color: #e2e8f0;
      padding: 12px 32px; display: flex; align-items: baseline; gap: 24px;
    }}
    header h1 {{ margin: 0; font-size: 16px; color: #FF9416; white-space: nowrap; }}
    nav {{ font-size: 13px; flex: 1; overflow-x: auto; white-space: nowrap; }}
    nav a {{ color: #a0aec0; text-decoration: none; margin-right: 4px; }}
    nav a:hover {{ color: #FF9416; }}
    main {{ padding: 32px; max-width: 1400px; margin: 0 auto; }}
    section {{ margin-bottom: 64px; }}
    section h2 {{
      font-size: 18px; margin: 0 0 16px;
      padding-bottom: 8px; border-bottom: 2px solid #FF9416;
      display: inline-block;
    }}
    .row {{
      display: grid;
      grid-template-columns: 300px 1fr;
      gap: 24px;
      align-items: start;
    }}
    .meta {{ display: flex; flex-direction: column; gap: 12px; }}
    .subject-line {{
      background: white; border: 1px solid #e2e8f0; border-radius: 8px;
      padding: 12px 14px; font-size: 13px; line-height: 1.5; color: #2d3748;
    }}
    .pill {{
      display: inline-block; background: #FF9416; color: white;
      font-size: 10px; font-weight: bold; letter-spacing: 0.05em;
      padding: 2px 6px; border-radius: 4px; margin-right: 6px;
      vertical-align: middle;
    }}
    table.params {{
      width: 100%; border-collapse: collapse; font-size: 12px;
      background: white; border: 1px solid #e2e8f0; border-radius: 8px;
      overflow: hidden;
    }}
    table.params th, table.params td {{
      padding: 8px 12px; text-align: left; border-bottom: 1px solid #f0f4f8;
    }}
    table.params th {{ background: #f7fafc; color: #718096; font-weight: 600; }}
    table.params td:first-child {{ color: #718096; white-space: nowrap; }}
    table.params tr:last-child td {{ border-bottom: none; }}
    .preview-box {{
      border: 1px solid #e2e8f0; border-radius: 8px;
      overflow: hidden; background: white;
    }}
    .preview-box iframe {{
      width: 100%; height: 0; border: none; display: block;
    }}
  </style>
</head>
<body>
  <header>
    <h1>Email Previews</h1>
    <nav>{nav_links}</nav>
  </header>
  <main>
    {"".join(sections)}
  </main>
  <script>
    document.querySelectorAll('iframe').forEach(function(frame) {{
      frame.addEventListener('load', function() {{
        frame.style.height = frame.contentDocument.documentElement.scrollHeight + 'px';
      }});
    }});
  </script>
</body>
</html>"""


class PreviewHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def do_GET(self):
        path = urlparse(self.path).path.lstrip("/")
        if path == "" or path == "index.html":
            self._respond(200, build_index())
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"Not found")

    def _respond(self, status, html):
        body = html.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class ReusableHTTPServer(HTTPServer):
    allow_reuse_address = True

    def server_bind(self):
        import socket
        self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
        super().server_bind()


if __name__ == "__main__":
    server = ReusableHTTPServer(("127.0.0.1", PORT), PreviewHandler)
    print(f"Email preview server running at http://localhost:{PORT}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        sys.exit(0)
