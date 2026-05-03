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
# When STUB_EMAIL=true the service reports itself as configured and silently
# accepts all send calls without making HTTP requests. For testing only.
STUB_EMAIL = os.environ.get("STUB_EMAIL", "").lower() in ("1", "true", "yes")


def is_email_configured() -> bool:
    """Check if email sending is properly configured."""
    return STUB_EMAIL or bool(RESEND_API_KEY)


def is_real_email_sending() -> bool:
    """Return True only when real emails are being sent (not stubbed, not unconfigured)."""
    return bool(RESEND_API_KEY) and not STUB_EMAIL


def send_email(to: str, subject: str, html: str) -> bool:
    """
    Send an email via Resend API.
    Returns True if sent, False if failed or not configured.
    """
    if STUB_EMAIL:
        print(f"[EMAIL STUB] Would send to {to}: {subject}")
        return True

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


# ============================================
# EMAIL TEMPLATES
# ============================================

def send_password_reset_email(to: str, reset_token: str, name: str = "there") -> bool:
    """Send password reset email."""
    reset_url = f"{APP_URL}/static/reset-password.html?token={reset_token}"

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a202c; }}
            .container {{ max-width: 500px; margin: 0 auto; padding: 20px; }}
            .button {{ display: inline-block; background: #FF9416; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; }}
            .footer {{ margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 14px; color: #718096; }}
        </style>
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
            <div class="footer">
                <p>Catalyse - PauseAI UK Volunteer Platform</p>
                <p style="font-size: 12px;">If the button doesn't work, copy this link:<br>{reset_url}</p>
            </div>
        </div>
    </body>
    </html>
    """

    return send_email(to, "Reset your Catalyse password", html)


def send_admin_invite_email(to: str, invite_token: str, invited_by: str) -> bool:
    """Send admin invite email."""
    invite_url = f"{APP_URL}/static/accept-invite.html?token={invite_token}"

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a202c; }}
            .container {{ max-width: 500px; margin: 0 auto; padding: 20px; }}
            .button {{ display: inline-block; background: #FF9416; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; }}
            .footer {{ margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 14px; color: #718096; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h2>You're Invited to be a Catalyse Admin</h2>
            <p>Hi!</p>
            <p><strong>{invited_by}</strong> has invited you to become an admin on Catalyse, the PauseAI UK volunteer coordination platform.</p>
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
            <div class="footer">
                <p>Catalyse - PauseAI UK Volunteer Platform</p>
                <p style="font-size: 12px;">If the button doesn't work, copy this link:<br>{invite_url}</p>
            </div>
        </div>
    </body>
    </html>
    """

    return send_email(to, f"{invited_by} invited you to be a Catalyse admin", html)


def send_welcome_email(to: str, name: str) -> bool:
    """Send welcome email after signup."""
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a202c; }}
            .container {{ max-width: 500px; margin: 0 auto; padding: 20px; }}
            .button {{ display: inline-block; background: #FF9416; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; }}
            .footer {{ margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 14px; color: #718096; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h2>Welcome to Catalyse!</h2>
            <p>Hi {name},</p>
            <p>Thanks for joining the PauseAI UK volunteer community! We're excited to have you.</p>
            <p>Here's what you can do now:</p>
            <ul>
                <li><strong>Browse projects</strong> - Find opportunities that match your skills</li>
                <li><strong>Complete your profile</strong> - Help project owners find you</li>
                <li><strong>Express interest</strong> - Let project owners know you want to help</li>
            </ul>
            <p style="text-align: center; margin: 32px 0;">
                <a href="{APP_URL}" class="button">Explore Projects</a>
            </p>
            <div class="footer">
                <p>Catalyse - PauseAI UK Volunteer Platform</p>
            </div>
        </div>
    </body>
    </html>
    """

    return send_email(to, "Welcome to Catalyse!", html)


def send_project_notification_email(to: str, name: str, subject: str,
                                     message: str, project_title: str,
                                     project_id: int, extra_html: str = "") -> bool:
    """Send a project-related notification email to a volunteer."""
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a202c; }}
            .container {{ max-width: 500px; margin: 0 auto; padding: 20px; }}
            .button {{ display: inline-block; background: #FF9416; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; }}
            .footer {{ margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 14px; color: #718096; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h2>{subject}</h2>
            <p>Hi {name},</p>
            <p>{message}</p>
            {extra_html}
            <p style="text-align: center; margin: 32px 0;">
                <a href="{APP_URL}/static/project.html?id={project_id}" class="button">View Project</a>
            </p>
            <div class="footer">
                <p>Catalyse - PauseAI Volunteer Platform</p>
                <p style="font-size: 12px;">
                    <a href="{APP_URL}/static/profile.html">Manage notification preferences</a>
                </p>
            </div>
        </div>
    </body>
    </html>
    """

    return send_email(to, subject, html)


def send_digest_email(to: str, name: str, projects: list, is_match: bool = False) -> bool:
    """Send a project digest email to a volunteer."""
    if not projects:
        return False

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

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a202c; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .button {{ display: inline-block; background: #FF9416; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; }}
            .footer {{ margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 14px; color: #718096; }}
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

            <div class="footer">
                <p>Catalyse - PauseAI Volunteer Platform</p>
                <p style="font-size: 12px;">You're receiving this because you opted in to project notifications.
                <a href="{APP_URL}/static/profile.html">Change your preferences</a> at any time.</p>
            </div>
        </div>
    </body>
    </html>
    """

    subject = "New projects matching your skills" if is_match else "What's new on Catalyse"
    return send_email(to, subject, html)


def send_relay_message(to: str, to_name: str, from_name: str, from_email: str,
                       subject: str, message: str, project_title: str = None) -> bool:
    """Send a relay message from one volunteer to another via the platform."""
    project_context = f" about the project <strong>{project_title}</strong>" if project_title else ""

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a202c; }}
            .container {{ max-width: 500px; margin: 0 auto; padding: 20px; }}
            .message-box {{ background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0; white-space: pre-wrap; }}
            .footer {{ margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 14px; color: #718096; }}
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
            <div class="footer">
                <p>Catalyse - PauseAI UK Volunteer Platform</p>
                <p style="font-size: 12px;">This message was sent via the Catalyse platform. If you no longer wish to receive messages,
                update your contact preferences in your <a href="{APP_URL}/static/profile.html">profile settings</a>.</p>
            </div>
        </div>
    </body>
    </html>
    """

    return send_email_with_reply_to(to, f"[Catalyse] {subject}", html, reply_to=from_email)


def send_email_with_reply_to(to: str, subject: str, html: str, reply_to: str = None) -> bool:
    """Send an email via Resend API with optional reply-to header."""
    if STUB_EMAIL:
        print(f"[EMAIL STUB] Would send to {to}: {subject}")
        return True

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
