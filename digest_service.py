"""
Email Digest Service for Catalyse
Sends project notification emails to volunteers who opted in.

Two modes:
- Skill match: immediate notification when a project matching their skills is approved
- Fortnightly digest: summary of new projects every two weeks

Also handles task inactivity reminders (legitimate interest basis):
- 7 days without a comment: nudge email to assignee
- 14 days: final warning email to assignee
- 21 days: task unassigned, project owner notified
"""

import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
import os

from email_service import (
    send_digest_email,
    is_email_configured,
    send_task_nudge_email,
    send_task_final_warning_email,
    send_task_surrendered_owner_email,
    send_task_surrendered_assignee_email,
)


# Database location (same logic as api.py)
_data_dir = os.environ.get("RAILWAY_VOLUME_MOUNT_PATH", str(Path(__file__).parent))
DATABASE_PATH = Path(_data_dir) / "catalyse.db"


def get_db():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def send_skill_match_notifications(project_id: int):
    """
    Send notifications to volunteers whose skills match a newly approved project.
    Called when a project is approved via triage.
    """
    if not is_email_configured():
        print("[DIGEST] Email not configured, skipping skill match notifications")
        return

    conn = get_db()
    try:
        project = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        if not project:
            return

        project_skills = conn.execute(
            "SELECT skill_id FROM project_skills WHERE project_id = ?", (project_id,)
        ).fetchall()
        skill_ids = {row["skill_id"] for row in project_skills}
        if not skill_ids:
            return

        skill_names = []
        for sid in skill_ids:
            skill = conn.execute("SELECT name FROM skills WHERE id = ?", (sid,)).fetchone()
            if skill:
                skill_names.append(skill["name"])

        # Check if email_digest column exists
        try:
            conn.execute("SELECT email_digest FROM volunteers LIMIT 1")
        except Exception:
            print("[DIGEST] email_digest column not found, skipping")
            return

        placeholders = ",".join("?" * len(skill_ids))
        volunteers = conn.execute(
            f"""SELECT DISTINCT v.id, v.name, v.email
                FROM volunteers v
                JOIN volunteer_skills vs ON v.id = vs.volunteer_id
                WHERE vs.skill_id IN ({placeholders})
                AND v.email_digest = 'match'
                AND v.email IS NOT NULL
                AND v.deleted_at IS NULL
                AND v.id != ?""",
            list(skill_ids) + [project.get("owner_id") or 0]
        ).fetchall()
    finally:
        conn.close()

    if not volunteers:
        print(f"[DIGEST] No skill-match volunteers for project {project_id}")
        return

    project_data = {
        "id": project["id"],
        "title": project["title"],
        "description": project["description"] or "",
        "skill_names": skill_names
    }

    sent = 0
    for vol in volunteers:
        if send_digest_email(vol["email"], vol["name"], [project_data], is_match=True):
            sent += 1

    print(f"[DIGEST] Sent skill-match emails to {sent}/{len(volunteers)} volunteers for project '{project['title']}'")


def send_fortnightly_digest():
    """
    Send a digest of recent projects to all volunteers who opted in.
    Should be called every two weeks by the scheduler.
    """
    if not is_email_configured():
        print("[DIGEST] Email not configured, skipping fortnightly digest")
        return

    conn = get_db()
    try:
        cutoff = (datetime.now() - timedelta(days=14)).isoformat()
        projects = conn.execute(
            """SELECT p.id, p.title, p.description, p.status, p.urgency
               FROM projects p
               WHERE p.status NOT IN ('archived', 'pending_review', 'needs_discussion')
               AND p.created_at >= ?
               ORDER BY p.created_at DESC
               LIMIT 10""",
            (cutoff,)
        ).fetchall()

        if not projects:
            print("[DIGEST] No new projects in the last 14 days, skipping digest")
            return

        project_list = []
        for p in projects:
            skills = conn.execute(
                """SELECT s.name FROM skills s
                   JOIN project_skills ps ON s.id = ps.skill_id
                   WHERE ps.project_id = ?""",
                (p["id"],)
            ).fetchall()
            project_list.append({
                "id": p["id"],
                "title": p["title"],
                "description": p["description"] or "",
                "skill_names": [s["name"] for s in skills]
            })

        # Check if email_digest column exists
        try:
            conn.execute("SELECT email_digest FROM volunteers LIMIT 1")
        except Exception:
            print("[DIGEST] email_digest column not found, skipping fortnightly digest")
            return

        volunteers = conn.execute(
            """SELECT id, name, email
               FROM volunteers
               WHERE email_digest = 'fortnightly'
               AND email IS NOT NULL
               AND deleted_at IS NULL"""
        ).fetchall()
    finally:
        conn.close()

    if not volunteers:
        print("[DIGEST] No volunteers opted in to fortnightly digest")
        return

    # For each volunteer, optionally calculate match scores
    sent = 0
    for vol in volunteers:
        # Get this volunteer's skills for match calculation
        vol_conn = get_db()
        vol_skills = vol_conn.execute(
            "SELECT skill_id FROM volunteer_skills WHERE volunteer_id = ?",
            (vol["id"],)
        ).fetchall()
        vol_skill_ids = {row["skill_id"] for row in vol_skills}
        vol_conn.close()

        # Add match percentage to projects
        enriched_projects = []
        for p in project_list:
            proj_data = dict(p)
            if vol_skill_ids:
                proj_conn = get_db()
                proj_skills = proj_conn.execute(
                    "SELECT skill_id, is_required FROM project_skills WHERE project_id = ?",
                    (p["id"],)
                ).fetchall()
                proj_conn.close()
                required = {s["skill_id"] for s in proj_skills if s["is_required"]}
                if required:
                    matched = vol_skill_ids & required
                    proj_data["match_percent"] = round(len(matched) / len(required) * 100)
            enriched_projects.append(proj_data)

        # Sort by match percentage (best matches first)
        enriched_projects.sort(key=lambda x: x.get("match_percent", 0), reverse=True)

        if send_digest_email(vol["email"], vol["name"], enriched_projects, is_match=False):
            sent += 1

    print(f"[DIGEST] Sent fortnightly digest to {sent}/{len(volunteers)} volunteers ({len(project_list)} projects)")


def check_task_inactivity():
    """
    Daily check for inactive assigned tasks. Applies three escalating actions:
    - 7+ days inactive: send nudge email to assignee
    - 14+ days inactive: send final warning email to assignee
    - 21+ days inactive: unassign the task, notify project owner
    Activity is reset whenever a comment is posted on the task.
    """
    if not is_email_configured():
        print("[INACTIVITY] Email not configured, skipping task inactivity check")
        return

    conn = get_db()
    try:
        # Check columns exist (migration may not have run yet)
        cols = {row[1] for row in conn.execute("PRAGMA table_info(project_tasks)").fetchall()}
        if "assigned_at" not in cols:
            print("[INACTIVITY] assigned_at column not found, skipping")
            return

        now = datetime.now()

        tasks = conn.execute(
            """SELECT pt.id, pt.project_id, pt.title,
                      pt.assigned_at, pt.nudge_sent_at, pt.final_warning_sent_at,
                      pt.assigned_to_id,
                      v.name AS assignee_name, v.email AS assignee_email,
                      p.title AS project_title, p.owner_id,
                      ov.name AS owner_name, ov.email AS owner_email,
                      (SELECT MAX(created_at) FROM project_task_comments
                       WHERE task_id = pt.id) AS last_comment_at
               FROM project_tasks pt
               JOIN projects p ON pt.project_id = p.id
               JOIN volunteers v ON pt.assigned_to_id = v.id
               JOIN volunteers ov ON p.owner_id = ov.id
               WHERE pt.status = 'assigned'
               AND pt.assigned_at IS NOT NULL
               AND v.deleted_at IS NULL"""
        ).fetchall()
    finally:
        conn.close()

    nudged = final_warned = surrendered = 0

    for t in tasks:
        last_activity_str = t["last_comment_at"] or t["assigned_at"]
        try:
            last_activity = datetime.fromisoformat(last_activity_str)
        except (ValueError, TypeError):
            continue
        days_inactive = (now - last_activity).days
        activity_phrase = "you last updated this task" if t["last_comment_at"] else "you were assigned this task"
        last_activity_date = f"{last_activity.day} {last_activity.strftime('%B %Y')}"

        days_since_final_warning = None
        if t["final_warning_sent_at"]:
            try:
                days_since_final_warning = (now - datetime.fromisoformat(t["final_warning_sent_at"])).days
            except (ValueError, TypeError):
                pass

        if days_since_final_warning is not None and days_since_final_warning >= 7:
            # Surrender: unassign task, notify owner
            update_conn = get_db()
            try:
                update_conn.execute(
                    """UPDATE project_tasks
                       SET status = 'open', assigned_to_id = NULL, assigned_at = NULL,
                           nudge_sent_at = NULL, final_warning_sent_at = NULL,
                           updated_at = ?
                       WHERE id = ?""",
                    (now.isoformat(), t["id"])
                )
                update_conn.commit()
            finally:
                update_conn.close()
            if t["assignee_email"]:
                send_task_surrendered_assignee_email(
                    t["assignee_email"], t["assignee_name"],
                    t["title"], t["project_title"], t["project_id"]
                )
            if t["owner_email"]:
                send_task_surrendered_owner_email(
                    t["owner_email"], t["owner_name"], t["assignee_name"],
                    t["title"], t["project_title"], t["project_id"]
                )
            surrendered += 1

        elif days_inactive >= 14 and not t["final_warning_sent_at"]:
            surrender_date = f"{(now + timedelta(days=7)).day} {(now + timedelta(days=7)).strftime('%B %Y')}"
            if t["assignee_email"]:
                send_task_final_warning_email(
                    t["assignee_email"], t["assignee_name"], t["title"],
                    t["project_title"], t["project_id"], t["id"], days_inactive,
                    activity_phrase, last_activity_date, surrender_date
                )
            update_conn = get_db()
            try:
                update_conn.execute(
                    "UPDATE project_tasks SET final_warning_sent_at = ? WHERE id = ?",
                    (now.isoformat(), t["id"])
                )
                update_conn.commit()
            finally:
                update_conn.close()
            final_warned += 1

        elif days_inactive >= 7 and not t["nudge_sent_at"]:
            if t["assignee_email"]:
                send_task_nudge_email(
                    t["assignee_email"], t["assignee_name"], t["title"],
                    t["project_title"], t["project_id"], t["id"], days_inactive,
                    activity_phrase, last_activity_date
                )
            update_conn = get_db()
            try:
                update_conn.execute(
                    "UPDATE project_tasks SET nudge_sent_at = ? WHERE id = ?",
                    (now.isoformat(), t["id"])
                )
                update_conn.commit()
            finally:
                update_conn.close()
            nudged += 1

    print(f"[INACTIVITY] Done — nudged: {nudged}, final warnings: {final_warned}, surrendered: {surrendered}")


if __name__ == "__main__":
    send_fortnightly_digest()
