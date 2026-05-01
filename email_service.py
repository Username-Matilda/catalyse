"""
Email Service for Catalyse
Uses Resend API for transactional emails.

Setup:
1. Create account at resend.com
2. Verify your domain (or use their test domain for dev)
3. Get API key from dashboard
4. Set RESEND_API_KEY environment variable
"""

import os
import json
from urllib.request import Request, urlopen
from urllib.error import URLError
from typing import Optional


# Configuration
RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
FROM_EMAIL = os.environ.get("FROM_EMAIL", "Catalyse <noreply@catalyse.pauseai.uk>")
APP_URL = os.environ.get("APP_URL", "http://localhost:8000")

_STYLES = """
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a202c; }
    .container { max-width: 500px; margin: 0 auto; padding: 20px; }
    .button { display: inline-block; background: #FF9416; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 13px; color: #718096; }
"""


def is_email_configured() -> bool:
    """Check if email sending is properly configured."""
    return bool(RESEND_API_KEY)


def send_email(to: str, subject: str, html: str) -> bool:
    """
    Send an email via Resend API.
    Returns True if sent, False if failed or not configured.
    """
    if not RESEND_API_KEY:
        print(f"[EMAIL NOT CONFIGURED] Would send to {to}: {subject}")
        return False

    try:
        data = json.dumps({
            "from": FROM_EMAIL,
            "to": [to],
            "subject": subject,
            "html": html
        }).encode('utf-8')

        request = Request(
            "https://api.resend.com/emails",
            data=data,
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json"
            },
            method="POST"
        )

        with urlopen(request, timeout=10) as response:
            if response.status == 200:
                return True
            print(f"[EMAIL ERROR] Status {response.status}")
            return False

    except URLError as e:
        print(f"[EMAIL ERROR] {e}")
        return False
    except Exception as e:
        print(f"[EMAIL ERROR] Unexpected: {e}")
        return False


def send_email_with_reply_to(to: str, subject: str, html: str, reply_to: str = None) -> bool:
    """Send an email via Resend API with optional reply-to header."""
    if not RESEND_API_KEY:
        print(f"[EMAIL NOT CONFIGURED] Would send to {to}: {subject}")
        return False

    try:
        payload = {
            "from": FROM_EMAIL,
            "to": [to],
            "subject": subject,
            "html": html
        }
        if reply_to:
            payload["reply_to"] = reply_to

        data = json.dumps(payload).encode('utf-8')

        request = Request(
            "https://api.resend.com/emails",
            data=data,
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json"
            },
            method="POST"
        )

        with urlopen(request, timeout=10) as response:
            if response.status == 200:
                return True
            print(f"[EMAIL ERROR] Status {response.status}")
            return False

    except URLError as e:
        print(f"[EMAIL ERROR] {e}")
        return False
    except Exception as e:
        print(f"[EMAIL ERROR] Unexpected: {e}")
        return False


# ============================================
# EMAIL TEMPLATES
# ============================================

def _footer(buttons: list[tuple[str, str]] = None) -> str:
    """Render the standard email footer.

    buttons: list of (label, url) pairs matching the buttons in the email body.
    Each entry generates a plain-text link fallback line.
    """
    fallbacks = ""
    for label, url in (buttons or []):
        fallbacks += (
            f'<p style="font-size: 12px;">If the "{label}" button doesn\'t work, copy this link: '
            f'<a href="{url}" style="color: #718096; word-break: break-all;">{url}</a></p>'
        )
    return f"""
        <div class="footer">
            <p>Catalyse - PauseAI Volunteer Platform - This is an automated email</p>
            {fallbacks}
            <p style="font-size: 12px;"><a href="{APP_URL}/static/profile.html">Manage notification preferences</a></p>
        </div>
    """


def compose_password_reset_email(reset_token: str, name: str = "there") -> tuple[str, str]:
    reset_url = f"{APP_URL}/static/reset-password.html?token={reset_token}"
    subject = "Reset your Catalyse password"
    html = f"""<!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>{_STYLES}</style>
    </head>
    <body>
        <div class="container">
            <h2>Reset Your Password</h2>
            <p>Hi {name},</p>
            <p>We received a request to reset your password for your Catalyse account. Click the button below to choose a new password:</p>
            <p style="text-align: center; margin: 32px 0;">
                <a href="{reset_url}" class="button">Reset Password</a>
            </p>
            <p>This link will expire in <strong>1 hour</strong>.</p>
            <p>If you didn't request this, you can safely ignore this email. Your password won't be changed.</p>
            {_footer([("Reset Password", reset_url)])}
        </div>
    </body>
    </html>"""
    return subject, html


def send_password_reset_email(to: str, reset_token: str, name: str = "there") -> bool:
    """Send password reset email."""
    subject, html = compose_password_reset_email(reset_token, name)
    return send_email(to, subject, html)


def compose_admin_invite_email(invite_token: str, invited_by: str) -> tuple[str, str]:
    invite_url = f"{APP_URL}/static/accept-invite.html?token={invite_token}"
    subject = f"{invited_by} invited you to be a Catalyse admin"
    html = f"""<!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>{_STYLES}</style>
    </head>
    <body>
        <div class="container">
            <h2>You're Invited to be a Catalyse Admin</h2>
            <p>Hi!</p>
            <p><strong>{invited_by}</strong> has invited you to become an admin on Catalyse, the PauseAI volunteer coordination platform.</p>
            <p>As an admin, you'll be able to:</p>
            <ul>
                <li>Review and approve volunteer-proposed projects</li>
                <li>Manage skills and starter tasks</li>
                <li>View volunteer profiles and add notes</li>
                <li>Invite other admins</li>
            </ul>
            <p style="text-align: center; margin: 32px 0;">
                <a href="{invite_url}" class="button">Accept Invitation</a>
            </p>
            <p>This invitation expires in <strong>7 days</strong>.</p>
            <p>You'll need to sign up or log in with this email address to accept.</p>
            {_footer([("Accept Invitation", invite_url)])}
        </div>
    </body>
    </html>"""
    return subject, html


def send_admin_invite_email(to: str, invite_token: str, invited_by: str) -> bool:
    """Send admin invite email."""
    subject, html = compose_admin_invite_email(invite_token, invited_by)
    return send_email(to, subject, html)


def compose_welcome_email(name: str) -> tuple[str, str]:
    subject = "Welcome to Catalyse!"
    html = f"""<!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>{_STYLES}</style>
    </head>
    <body>
        <div class="container">
            <h2>Welcome to Catalyse!</h2>
            <p>Hi {name},</p>
            <p>Thanks for joining the PauseAI volunteer community! We're excited to have you.</p>
            <p>Here's what you can do now:</p>
            <ul>
                <li><strong>Browse projects</strong> - Find opportunities that match your skills</li>
                <li><strong>Complete your profile</strong> - Help project owners find you</li>
                <li><strong>Express interest</strong> - Let project owners know you want to help</li>
            </ul>
            <p style="text-align: center; margin: 32px 0;">
                <a href="{APP_URL}" class="button">Explore Projects</a>
            </p>
            {_footer([("Explore Projects", APP_URL)])}
        </div>
    </body>
    </html>"""
    return subject, html


def send_welcome_email(to: str, name: str) -> bool:
    """Send welcome email after signup."""
    subject, html = compose_welcome_email(name)
    return send_email(to, subject, html)


def compose_project_notification_email(name: str, subject: str, message: str,
                                        project_title: str, project_id: int,
                                        extra_html: str = "") -> tuple[str, str]:
    project_url = f"{APP_URL}/static/project.html?id={project_id}"
    html = f"""<!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>{_STYLES}</style>
    </head>
    <body>
        <div class="container">
            <h2>{subject}</h2>
            <p>Hi {name},</p>
            <p>{message}</p>
            {extra_html}
            <p style="text-align: center; margin: 32px 0;">
                <a href="{project_url}" class="button">View Project</a>
            </p>
            {_footer([("View Project", project_url)])}
        </div>
    </body>
    </html>"""
    return subject, html


def send_project_notification_email(to: str, name: str, subject: str,
                                     message: str, project_title: str,
                                     project_id: int, extra_html: str = "") -> bool:
    """Send a project-related notification email to a volunteer."""
    subject, html = compose_project_notification_email(
        name, subject, message, project_title, project_id, extra_html
    )
    return send_email(to, subject, html)


def compose_digest_email(name: str, projects: list, is_match: bool = False) -> tuple[str, str]:
    match_intro = "Here are new projects that match your skills:" if is_match else "Here's what's new on Catalyse:"

    project_html = ""
    for p in projects:
        skills_html = ", ".join(p.get("skill_names", [])[:5])
        match_pct = p.get("match_percent")
        match_badge = f' <span style="background: #D1FAE5; color: #065F46; padding: 2px 8px; border-radius: 10px; font-size: 12px;">{match_pct}% match</span>' if match_pct else ""
        desc = p.get("description", "")

        project_html += f"""
            <div style="padding: 16px; margin-bottom: 12px; background: #f7fafc; border-radius: 8px; border-left: 4px solid #FF9416;">
                <a href="{APP_URL}/static/project.html?id={p['id']}" style="font-weight: bold; color: #1A202C; text-decoration: none; font-size: 16px;">
                    {p['title']}
                </a>{match_badge}
                <p style="color: #4A5568; margin: 8px 0 4px 0; font-size: 14px;">
                    {desc[:150]}{'...' if len(desc) > 150 else ''}
                </p>
                {f'<p style="font-size: 12px; color: #718096;">Skills: {skills_html}</p>' if skills_html else ''}
            </div>
        """

    subject = "New projects matching your skills" if is_match else "What's new on Catalyse"
    html = f"""<!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            {_STYLES}
            .container {{ max-width: 600px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h2 style="color: #FF9416;">Catalyse Project Update</h2>
            <p>Hi {name},</p>
            <p>{match_intro}</p>
            {project_html}
            <p style="text-align: center; margin: 32px 0;">
                <a href="{APP_URL}" class="button">Browse All Projects</a>
            </p>
            {_footer([("Browse All Projects", APP_URL)])}
        </div>
    </body>
    </html>"""
    return subject, html


def send_digest_email(to: str, name: str, projects: list, is_match: bool = False) -> bool:
    """Send a project digest email to a volunteer."""
    if not projects:
        return False
    subject, html = compose_digest_email(name, projects, is_match)
    return send_email(to, subject, html)


def compose_task_nudge_email(name: str, task_title: str, project_title: str,
                              project_id: int, task_id: int, days_inactive: int,
                              activity_phrase: str, last_activity_date: str) -> tuple[str, str]:
    task_url = f"{APP_URL}/static/project.html?id={project_id}#task-{task_id}"
    subject = f"How's it going with {task_title}?"
    html = f"""<!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>{_STYLES}</style>
    </head>
    <body>
        <div class="container">
            <h2>How's it going?</h2>
            <p>Hi {name},</p>
            <p>It's been {days_inactive} days since {activity_phrase} <strong>{task_title}</strong> in the project <strong>{project_title}</strong> (on {last_activity_date}).</p>
            <p>Could you leave a quick comment with a progress update? Even a brief note — like "ticking along, awaiting XYZ, will post another update in 2 weeks" — is really helpful so the project team knows things are in good hands.</p>
            <p>If you don't have capacity for the task right now, it's much better to update the project page with an ETA than for the team not to know what's happening.</p>
            <p>We'll send another reminder in a week if we haven't heard from you — it's important that things move along smoothly so everyone can make progress.</p>
            <p style="text-align: center; margin: 32px 0;">
                <a href="{task_url}" class="button">Leave an update</a>
            </p>
            <p>If you can no longer work on this task, please release it so someone else can pick it up.</p>
            <p>If you need support, please contact your project owner or admin.</p>
            {_footer([("Leave an update", task_url)])}
        </div>
    </body>
    </html>"""
    return subject, html


def send_task_nudge_email(to: str, name: str, task_title: str, project_title: str,
                          project_id: int, task_id: int, days_inactive: int,
                          activity_phrase: str, last_activity_date: str) -> bool:
    """Send a 2-week inactivity nudge to a task assignee."""
    subject, html = compose_task_nudge_email(
        name, task_title, project_title, project_id, task_id,
        days_inactive, activity_phrase, last_activity_date
    )
    return send_email(to, subject, html)


def compose_task_final_warning_email(name: str, task_title: str, project_title: str,
                                      project_id: int, task_id: int, days_inactive: int,
                                      activity_phrase: str, last_activity_date: str,
                                      surrender_date: str) -> tuple[str, str]:
    task_url = f"{APP_URL}/static/project.html?id={project_id}#task-{task_id}"
    subject = f"A quick nudge about {task_title}"
    html = f"""<!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            {_STYLES}
            .warning {{ background: #FFF3CD; border-left: 4px solid #FF9416; padding: 12px 16px; border-radius: 4px; margin: 16px 0; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h2>One more nudge</h2>
            <p>Hi {name},</p>
            <p>It's now been {days_inactive} days since {activity_phrase} <strong>{task_title}</strong> in <strong>{project_title}</strong> (on {last_activity_date}).</p>
            <div class="warning">
                <strong>If there is no update by {surrender_date}, we'll open the task to other contributors</strong> so the project can keep moving forward.
            </div>
            <p>Even a quick note is fine — anything to let the project team know you're still on it. If life has got busy, no worries at all, but it would really help to either leave an update or release the task so someone else can step in.</p>
            <p style="text-align: center; margin: 32px 0;">
                <a href="{task_url}" class="button">Leave an update</a>
            </p>
            <p>If you need support, please contact your project owner or a platform admin.</p>
            {_footer([("Leave an update", task_url)])}
        </div>
    </body>
    </html>"""
    return subject, html


def send_task_final_warning_email(to: str, name: str, task_title: str, project_title: str,
                                   project_id: int, task_id: int, days_inactive: int,
                                   activity_phrase: str, last_activity_date: str,
                                   surrender_date: str) -> bool:
    """Send a 3-week final warning to a task assignee before automatic surrender."""
    subject, html = compose_task_final_warning_email(
        name, task_title, project_title, project_id, task_id,
        days_inactive, activity_phrase, last_activity_date, surrender_date
    )
    return send_email(to, subject, html)


def compose_task_surrendered_owner_email(owner_name: str, volunteer_name: str,
                                          task_title: str, project_title: str,
                                          project_id: int) -> tuple[str, str]:
    project_url = f"{APP_URL}/static/project.html?id={project_id}"
    subject = f"Task unassigned due to inactivity: {task_title}"
    html = f"""<!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>{_STYLES}</style>
    </head>
    <body>
        <div class="container">
            <h2>Task unassigned due to inactivity</h2>
            <p>Hi {owner_name},</p>
            <p><strong>{volunteer_name}</strong> has been removed from the task <strong>{task_title}</strong> in your project <strong>{project_title}</strong> after four weeks without an update, despite reminders.</p>
            <p>The task is now open and can be claimed by another contributor.</p>
            <p style="text-align: center; margin: 32px 0;">
                <a href="{project_url}" class="button">View Project</a>
            </p>
            <p>If you need support, please contact your project owner or a platform admin.</p>
            {_footer([("View Project", project_url)])}
        </div>
    </body>
    </html>"""
    return subject, html


def send_task_surrendered_owner_email(to: str, owner_name: str, volunteer_name: str,
                                       task_title: str, project_title: str, project_id: int) -> bool:
    """Notify a project owner that an inactive volunteer has been removed from a task."""
    subject, html = compose_task_surrendered_owner_email(
        owner_name, volunteer_name, task_title, project_title, project_id
    )
    return send_email(to, subject, html)


def compose_task_surrendered_assignee_email(name: str, task_title: str,
                                             project_title: str, project_id: int) -> tuple[str, str]:
    project_url = f"{APP_URL}/static/project.html?id={project_id}"
    subject = f"Update on your task: {task_title}"
    html = f"""<!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>{_STYLES}</style>
    </head>
    <body>
        <div class="container">
            <h2>Task now open to other contributors</h2>
            <p>Hi {name},</p>
            <p>Because we haven't received updates from you on the task <strong>{task_title}</strong> in <strong>{project_title}</strong> for four weeks, we've opened the task to other contributors and removed you from it.</p>
            <p>We hope things are going well — if you'd still like to contribute, you're always welcome to claim the task again or pick up something else on the project.</p>
            <p style="text-align: center; margin: 32px 0;">
                <a href="{project_url}" class="button">View Project</a>
            </p>
            <p>If you need support, please contact your project owner or a platform admin.</p>
            {_footer([("View Project", project_url)])}
        </div>
    </body>
    </html>"""
    return subject, html


def send_task_surrendered_assignee_email(to: str, name: str, task_title: str,
                                          project_title: str, project_id: int) -> bool:
    """Notify a volunteer that they have been removed from a task due to inactivity."""
    subject, html = compose_task_surrendered_assignee_email(
        name, task_title, project_title, project_id
    )
    return send_email(to, subject, html)


def compose_relay_message(to_name: str, from_name: str, from_email: str,
                           subject: str, message: str, project_title: str = None) -> tuple[str, str]:
    project_context = f" about the project <strong>{project_title}</strong>" if project_title else ""
    html = f"""<!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            {_STYLES}
            .message-box {{ background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0; white-space: pre-wrap; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h2>Message from {from_name}</h2>
            <p>Hi {to_name},</p>
            <p><strong>{from_name}</strong> has sent you a message via Catalyse{project_context}:</p>
            <div class="message-box">
                <p style="font-weight: 500; margin-bottom: 8px;">{subject}</p>
                <p>{message}</p>
            </div>
            <p>You can reply directly to this email to respond to {from_name}.</p>
            {_footer()}
        </div>
    </body>
    </html>"""
    return f"[Catalyse] {subject}", html


def send_relay_message(to: str, to_name: str, from_name: str, from_email: str,
                       subject: str, message: str, project_title: str = None) -> bool:
    """Send a relay message from one volunteer to another via the platform."""
    email_subject, html = compose_relay_message(
        to_name, from_name, from_email, subject, message, project_title
    )
    return send_email_with_reply_to(to, email_subject, html, reply_to=from_email)
