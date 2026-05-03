"""
Catalyse: PauseAI UK Volunteer & Project Matching Platform
FastAPI Backend
"""

import os
import sqlite3
import secrets
import hashlib
import json
import base64
import traceback
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, List, Dict, Any
from contextlib import contextmanager

from fastapi import FastAPI, HTTPException, Depends, Header, Query, Response, Request
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, EmailStr, Field

from email_service import (
    is_email_configured,
    is_real_email_sending,
    send_password_reset_email,
    send_admin_invite_email,
    send_welcome_email,
    send_relay_message,
    send_digest_email,
    send_project_notification_email
)

# ============================================
# APP SETUP
# ============================================

app = FastAPI(
    title="Catalyse API",
    description="Volunteer & Project Matching for PauseAI UK",
    version="1.0.0"
)


@app.middleware("http")
async def cache_static(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/static/"):
        if path.endswith(".html"):
            # HTML is the entry point — always revalidate so browsers pick up new asset hashes
            response.headers["Cache-Control"] = "no-cache"
        else:
            # CSS/JS/images have content-hashed URLs, safe to cache for a year
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return response


class AppError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    print(f"[ERROR] {request.method} {request.url.path} — {exc.code}: {exc.message}")
    traceback.print_exc()
    detail = f"{exc.message} Error Code: {exc.code}"
    return JSONResponse(status_code=500, content={"detail": detail})


_FIELD_LABELS = {
    # Auth / account
    "name": "Name",
    "email": "Email",
    "password": "Password",
    "new_password": "New password",
    "current_password": "Current password",
    "whatsapp_number": "WhatsApp number",
    "page_url": "Page URL",
    # Projects
    "title": "Title",
    "description": "Description",
    "project_type": "Project type",
    "urgency": "Urgency",
    "time_commitment_hours_per_week": "Hours per week",
    "estimated_duration": "Estimated duration",
    "collaboration_link": "Collaboration link",
    "country": "Country",
    "local_group": "Local group",
    "tasks": "Tasks",
    # Messaging / content
    "message": "Message",
    "subject": "Subject",
    "content": "Content",
    # IDs that would otherwise get " id" appended
    "category_id": "Category",
    "volunteer_id": "Volunteer",
    "skill_id": "Skill",
}


def _friendly_validation_error(err: dict) -> str:
    loc = err.get("loc", [])
    field = loc[-1] if loc else ""
    label = _FIELD_LABELS.get(str(field), str(field).replace("_", " ").capitalize())
    error_type = err.get("type", "")
    ctx = err.get("ctx", {})

    if error_type == "missing":
        return f"{label} is required"
    if error_type == "string_too_short":
        n = ctx.get("min_length", 1)
        return f"{label} must be at least {n} character{'s' if n != 1 else ''}"
    if error_type == "string_too_long":
        n = ctx.get("max_length", "")
        return f"{label} must be no more than {n} characters"
    if error_type in ("int_parsing", "float_parsing"):
        return f"{label} must be a number"
    if error_type == "value_error":
        return f"{label}: {ctx.get('error', err.get('msg', 'invalid value'))}"
    if error_type == "enum":
        allowed = ", ".join(str(v) for v in ctx.get("expected", []))
        return f"{label} must be one of: {allowed}" if allowed else f"{label} is not a valid option"

    # Fallback: strip Pydantic's boilerplate and sentence-case what remains
    msg = err.get("msg", "Invalid value")
    msg = msg.removeprefix("Value error, ").removeprefix("String ")
    return f"{label}: {msg[0].lower()}{msg[1:]}" if msg else f"{label}: invalid value"


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    errors = [
        {"loc": list(e["loc"]), "msg": _friendly_validation_error(e), "type": e.get("type")}
        for e in exc.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": errors})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    print(f"[ERROR] {request.method} {request.url.path} — {type(exc).__name__}: {exc}")
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": "Something went wrong. Please try again or contact us. Error Code: Unknown"}
    )

# Use RAILWAY_VOLUME_MOUNT_PATH for persistent storage if available,
# otherwise store next to the app (local dev)
_data_dir = os.environ.get("RAILWAY_VOLUME_MOUNT_PATH", str(Path(__file__).parent))
DATABASE_PATH = Path(_data_dir) / "catalyse.db"


@app.get("/api/version")
def get_version():
    sha = os.environ.get("RAILWAY_GIT_COMMIT_SHA", "dev")
    return {"sha": sha}


def get_db():
    """Get database connection with row factory."""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def db_transaction():
    """Context manager for database transactions."""
    conn = get_db()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    """Initialize database from schema."""
    schema_path = Path(__file__).parent / "schema.sql"
    seed_path = Path(__file__).parent / "seed_skills.sql"

    if not DATABASE_PATH.exists():
        conn = get_db()
        with open(schema_path) as f:
            conn.executescript(f.read())
        with open(seed_path) as f:
            conn.executescript(f.read())
        conn.commit()
        conn.close()
        print("Database initialized with schema and skills.")
    else:
        # Check if skills table is empty and seed if needed
        conn = get_db()
        cursor = conn.execute("SELECT COUNT(*) FROM skills")
        count = cursor.fetchone()[0]
        if count == 0:
            print("Skills table empty, seeding...")
            with open(seed_path) as f:
                conn.executescript(f.read())
            conn.commit()
            print("Skills seeded.")
        conn.close()

    # Run any pending migrations
    run_migrations()


def run_migrations():
    """Run SQL migration files that haven't been applied yet."""
    migration_dir = Path(__file__).parent
    migration_files = sorted(migration_dir.glob("migration_*.sql"))

    if not migration_files:
        return

    conn = get_db()

    conn.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            filename TEXT PRIMARY KEY,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()

    for migration_path in migration_files:
        already_applied = conn.execute(
            "SELECT 1 FROM schema_migrations WHERE filename = ?",
            (migration_path.name,)
        ).fetchone()
        if already_applied:
            continue

        with open(migration_path) as f:
            sql = f.read()

        # Execute each statement individually so one failure doesn't skip the rest
        statements = [s.strip() for s in sql.split(';') if s.strip()]
        applied = 0
        for statement in statements:
            # Strip leading comment lines before deciding whether to skip
            non_comment = '\n'.join(
                l for l in statement.split('\n') if not l.strip().startswith('--')
            ).strip()
            if not non_comment:
                continue
            try:
                conn.execute(non_comment)
                applied += 1
            except Exception as e:
                err = str(e).lower()
                if "already exists" not in err and "duplicate column" not in err:
                    print(f"Migration {migration_path.name}: {e}")

        conn.execute(
            "INSERT INTO schema_migrations (filename) VALUES (?)",
            (migration_path.name,)
        )
        conn.commit()
        print(f"Migration applied: {migration_path.name} ({applied} statements)")

    conn.close()


# ============================================
# PYDANTIC MODELS
# ============================================

# --- Auth ---
class VolunteerSignup(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    bio: Optional[str] = None
    discord_handle: Optional[str] = None
    signal_number: Optional[str] = None
    whatsapp_number: Optional[str] = None
    contact_preference: Optional[str] = None
    contact_notes: Optional[str] = None
    availability_hours_per_week: Optional[int] = None
    location: Optional[str] = None
    country: Optional[str] = None
    local_group: Optional[str] = None
    share_contact_directly: bool = False
    other_skills: Optional[str] = None
    skill_ids: List[int] = []
    consent_profile_visible: bool = True
    consent_contact_by_owners: bool = True
    email_digest: Optional[str] = "none"  # 'none', 'match', 'fortnightly'


class VolunteerUpdate(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    discord_handle: Optional[str] = None
    signal_number: Optional[str] = None
    whatsapp_number: Optional[str] = None
    contact_preference: Optional[str] = None
    contact_notes: Optional[str] = None
    availability_hours_per_week: Optional[int] = None
    location: Optional[str] = None
    country: Optional[str] = None
    local_group: Optional[str] = None
    share_contact_directly: Optional[bool] = None
    other_skills: Optional[str] = None
    skill_ids: Optional[List[int]] = None
    profile_visible: Optional[bool] = None
    email_digest: Optional[str] = None  # 'none', 'match', 'fortnightly'


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleAuthRequest(BaseModel):
    credential: str  # JWT token from Google Sign-In


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8, max_length=128)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128)


class ChangeEmailRequest(BaseModel):
    new_email: EmailStr
    password: str


class DeleteAccountRequest(BaseModel):
    password: str


# --- Projects ---
class InitialTaskData(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    description: Optional[str] = None


class ProjectCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    description: str = Field(..., min_length=10)
    project_type: Optional[str] = None
    estimated_duration: Optional[str] = None
    time_commitment_hours_per_week: Optional[int] = None
    urgency: str = "medium"
    skill_ids: List[int] = []
    skill_required_map: Dict[int, bool] = {}
    want_to_own: bool = False
    collaboration_link: Optional[str] = None
    country: Optional[str] = None
    local_group: Optional[str] = None
    is_seeking_help: bool = True
    is_seeking_owner: bool = False
    tasks: List[InitialTaskData] = []


class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    project_type: Optional[str] = None
    estimated_duration: Optional[str] = None
    time_commitment_hours_per_week: Optional[int] = None
    urgency: Optional[str] = None
    skill_ids: Optional[List[int]] = None
    skill_required_map: Optional[Dict[int, bool]] = None
    collaboration_link: Optional[str] = None
    country: Optional[str] = None
    local_group: Optional[str] = None
    owner_id: Optional[int] = None
    is_seeking_help: Optional[bool] = None
    is_seeking_owner: Optional[bool] = None
    outcome: Optional[str] = None
    outcome_notes: Optional[str] = None


class ProjectReview(BaseModel):
    status: str  # 'approved', 'needs_discussion'
    review_notes: Optional[str] = None
    feedback_to_proposer: Optional[str] = None
    target_status: Optional[str] = None  # 'seeking_owner' or 'seeking_help' if approved


class ProjectOutcomeUpdate(BaseModel):
    outcome: str
    outcome_notes: Optional[str] = None


# --- Project Tasks ---
class ProjectTaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    description: Optional[str] = None


class ProjectTaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None  # 'open', 'assigned', 'done'
    assigned_to_id: Optional[int] = None


# --- Interests ---
class InterestCreate(BaseModel):
    interest_type: str  # 'want_to_contribute' or 'want_to_own'
    message: Optional[str] = None


class InterestResponse(BaseModel):
    status: str  # 'accepted' or 'declined'
    response_message: Optional[str] = None


# --- Contact ---
class ContactMessage(BaseModel):
    subject: str = Field(..., min_length=1, max_length=200)
    message: str = Field(..., min_length=1)
    related_project_id: Optional[int] = None


# --- Project Updates ---
class ProjectUpdateCreate(BaseModel):
    content: str = Field(..., min_length=1)


# --- Admin Notes ---
class AdminNoteCreate(BaseModel):
    content: str = Field(..., min_length=1)
    category: str = "general"
    related_project_id: Optional[int] = None


class AdminNoteUpdate(BaseModel):
    content: Optional[str] = None
    category: Optional[str] = None


# --- Starter Tasks ---
class StarterTaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    description: str = Field(..., min_length=1)
    skill_id: Optional[int] = None
    project_id: Optional[int] = None
    estimated_hours: Optional[float] = None


class StarterTaskAssign(BaseModel):
    volunteer_id: int


class StarterTaskReview(BaseModel):
    review_rating: str  # 'excellent', 'good', 'needs_improvement'
    review_notes: Optional[str] = None
    feedback_to_volunteer: Optional[str] = None


# --- Skill Endorsements ---
class SkillEndorsementCreate(BaseModel):
    skill_id: int
    rating: str = "verified"
    source: str = "direct_observation"
    source_id: Optional[int] = None
    notes: Optional[str] = None


# --- Bug Reports ---
class BugReportCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    description: str = Field(..., min_length=10)
    page_url: Optional[str] = None
    category: str = "bug"  # bug, feature, ux, other
    severity: str = "medium"  # low, medium, high, critical
    reporter_email: Optional[str] = None  # For non-logged-in users


class BugReportUpdate(BaseModel):
    status: Optional[str] = None  # open, in_progress, resolved, wont_fix
    resolution_notes: Optional[str] = None


# --- Admin Invites ---
class AdminInviteCreate(BaseModel):
    email: EmailStr


# ============================================
# AUTH HELPERS
# ============================================

def generate_auth_token() -> str:
    """Generate a secure random token."""
    return secrets.token_urlsafe(32)


def hash_password(password: str) -> str:
    """Hash password using PBKDF2-SHA256 with random salt."""
    salt = secrets.token_bytes(32)
    key = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 100000)
    return base64.b64encode(salt + key).decode('ascii')


def verify_password(password: str, password_hash: str) -> bool:
    """Verify password against stored hash."""
    try:
        decoded = base64.b64decode(password_hash.encode('ascii'))
        salt = decoded[:32]
        stored_key = decoded[32:]
        key = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 100000)
        return secrets.compare_digest(key, stored_key)
    except Exception:
        return False


def get_current_volunteer(authorization: Optional[str] = Header(None)) -> Optional[Dict]:
    """Get current volunteer from auth token."""
    if not authorization:
        return None

    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization

    conn = get_db()
    volunteer = conn.execute(
        """SELECT * FROM volunteers
           WHERE auth_token = ?
           AND (auth_token_expires_at IS NULL OR auth_token_expires_at > ?)
           AND deleted_at IS NULL""",
        (token, datetime.now().isoformat())
    ).fetchone()
    conn.close()

    if volunteer:
        return dict(volunteer)
    return None


def require_auth(authorization: Optional[str] = Header(None)) -> Dict:
    """Require authentication."""
    volunteer = get_current_volunteer(authorization)
    if not volunteer:
        raise HTTPException(status_code=401, detail="Authentication required")
    return volunteer


def require_admin(authorization: Optional[str] = Header(None)) -> Dict:
    """Require admin authentication."""
    volunteer = require_auth(authorization)
    if not volunteer.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return volunteer


# ============================================
# HELPER FUNCTIONS
# ============================================

def row_to_dict(row) -> Optional[Dict]:
    """Convert sqlite Row to dict."""
    if row is None:
        return None
    return dict(row)


def rows_to_list(rows) -> List[Dict]:
    """Convert list of sqlite Rows to list of dicts."""
    return [dict(row) for row in rows]


def get_volunteer_skills(conn, volunteer_id: int) -> List[Dict]:
    """Get skills for a volunteer."""
    rows = conn.execute(
        """SELECT s.*, vs.proficiency_level, sc.name as category_name
           FROM skills s
           JOIN volunteer_skills vs ON s.id = vs.skill_id
           JOIN skill_categories sc ON s.category_id = sc.id
           WHERE vs.volunteer_id = ?
           ORDER BY sc.sort_order, s.sort_order""",
        (volunteer_id,)
    ).fetchall()
    return rows_to_list(rows)


def get_project_skills(conn, project_id: int) -> List[Dict]:
    """Get skills for a project."""
    rows = conn.execute(
        """SELECT s.*, ps.is_required, sc.name as category_name
           FROM skills s
           JOIN project_skills ps ON s.id = ps.skill_id
           JOIN skill_categories sc ON s.category_id = sc.id
           WHERE ps.project_id = ?
           ORDER BY ps.is_required DESC, sc.sort_order, s.sort_order""",
        (project_id,)
    ).fetchall()
    return rows_to_list(rows)


def calculate_match_score(volunteer_skill_ids: set, project_skills: List[Dict]) -> Dict:
    """Calculate how well a volunteer matches a project."""
    required_skills = [s for s in project_skills if s.get("is_required")]
    nice_to_have = [s for s in project_skills if not s.get("is_required")]

    required_ids = {s["id"] for s in required_skills}
    nice_ids = {s["id"] for s in nice_to_have}

    matched_required = volunteer_skill_ids & required_ids
    matched_nice = volunteer_skill_ids & nice_ids

    required_score = len(matched_required) / len(required_ids) * 100 if required_ids else 100
    overall_score = required_score

    return {
        "required_match_percent": round(required_score),
        "matched_required_count": len(matched_required),
        "total_required": len(required_ids),
        "matched_nice_to_have_count": len(matched_nice),
        "total_nice_to_have": len(nice_ids),
        "overall_score": round(overall_score)
    }


def enrich_project(conn, project: Dict, volunteer_skill_ids: Optional[set] = None) -> Dict:
    """Add skills and match info to project."""
    project["skills"] = get_project_skills(conn, project["id"])

    # Get owner info
    if project.get("owner_id"):
        owner = conn.execute(
            "SELECT id, name FROM volunteers WHERE id = ? AND deleted_at IS NULL",
            (project["owner_id"],)
        ).fetchone()
        project["owner"] = row_to_dict(owner)
    else:
        project["owner"] = None

    # Get proposer info
    if project.get("proposed_by_id"):
        proposer = conn.execute(
            "SELECT id, name FROM volunteers WHERE id = ? AND deleted_at IS NULL",
            (project["proposed_by_id"],)
        ).fetchone()
        project["proposed_by"] = row_to_dict(proposer)
    else:
        project["proposed_by"] = None

    # Calculate match if volunteer provided
    if volunteer_skill_ids is not None:
        project["match"] = calculate_match_score(volunteer_skill_ids, project["skills"])

    # Count interests
    interest_count = conn.execute(
        "SELECT COUNT(*) FROM project_interests WHERE project_id = ? AND status = 'pending'",
        (project["id"],)
    ).fetchone()[0]
    project["pending_interest_count"] = interest_count

    return project


def enrich_volunteer(conn, volunteer: Dict, show_contact: bool = False) -> Dict:
    """Add skills to volunteer, optionally hide contact info."""
    volunteer["skills"] = get_volunteer_skills(conn, volunteer["id"])

    # Add public endorsements (shows verified track record)
    endorsements = conn.execute(
        """SELECT se.skill_id, se.rating, s.name as skill_name
           FROM skill_endorsements se
           JOIN skills s ON se.skill_id = s.id
           WHERE se.volunteer_id = ?""",
        (volunteer["id"],)
    ).fetchall()
    volunteer["endorsements"] = rows_to_list(endorsements)

    # Hide sensitive fields unless authorized
    if not show_contact:
        volunteer.pop("email", None)
        volunteer.pop("discord_handle", None)
        volunteer.pop("signal_number", None)
        volunteer.pop("whatsapp_number", None)
        volunteer.pop("auth_token", None)
        volunteer.pop("auth_token_expires_at", None)

    # Always hide these
    volunteer.pop("auth_token", None)
    volunteer.pop("auth_token_expires_at", None)
    volunteer.pop("password_hash", None)

    return volunteer


def create_notification(conn, volunteer_id: int, notif_type: str, title: str, body: str = None, link: str = None):
    """Create a notification for a volunteer."""
    conn.execute(
        """INSERT INTO notifications (volunteer_id, type, title, body, link)
           VALUES (?, ?, ?, ?, ?)""",
        (volunteer_id, notif_type, title, body, link)
    )


# ============================================
# AUTH ENDPOINTS
# ============================================

@app.post("/api/auth/signup")
def signup(data: VolunteerSignup) -> Dict:
    """Register a new volunteer."""
    with db_transaction() as conn:
        # Check if email already exists
        existing = conn.execute(
            "SELECT id, deleted_at FROM volunteers WHERE email = ?",
            (data.email,)
        ).fetchone()

        if existing:
            if existing["deleted_at"]:
                raise HTTPException(
                    status_code=400,
                    detail="This email was previously registered. Contact us to restore your account."
                )
            raise HTTPException(status_code=400, detail="Email already registered")

        # Generate auth token and hash password
        auth_token = generate_auth_token()
        password_hash = hash_password(data.password)

        # Build INSERT dynamically based on which columns exist
        cursor_info = conn.execute("PRAGMA table_info(volunteers)")
        existing_columns = {row["name"] for row in cursor_info.fetchall()}

        fields = {
            "name": data.name, "email": data.email, "bio": data.bio,
            "discord_handle": data.discord_handle, "signal_number": data.signal_number,
            "whatsapp_number": data.whatsapp_number, "contact_preference": data.contact_preference,
            "contact_notes": data.contact_notes, "availability_hours_per_week": data.availability_hours_per_week,
            "location": data.location, "share_contact_directly": data.share_contact_directly,
            "other_skills": data.other_skills, "consent_profile_visible": data.consent_profile_visible,
            "consent_contact_by_owners": data.consent_contact_by_owners,
            "consent_given_at": datetime.now().isoformat(),
            "auth_token": auth_token, "password_hash": password_hash
        }
        # Add optional columns only if they exist in the DB
        if "country" in existing_columns:
            fields["country"] = data.country
        if "local_group" in existing_columns:
            fields["local_group"] = data.local_group
        if "email_digest" in existing_columns:
            fields["email_digest"] = getattr(data, "email_digest", None) or "none"

        col_names = ", ".join(fields.keys())
        placeholders = ", ".join("?" * len(fields))
        cursor = conn.execute(
            f"INSERT INTO volunteers ({col_names}) VALUES ({placeholders})",
            list(fields.values())
        )
        volunteer_id = cursor.lastrowid

        # Add skills
        for skill_id in data.skill_ids:
            conn.execute(
                "INSERT OR IGNORE INTO volunteer_skills (volunteer_id, skill_id) VALUES (?, ?)",
                (volunteer_id, skill_id)
            )

        # Check for admin bootstrap via ADMIN_EMAILS env var
        try:
            check_admin_bootstrap(data.email, volunteer_id, conn=conn)
        except Exception as e:
            print(f"[SIGNUP ERROR] admin bootstrap failed for {data.email}: {type(e).__name__}: {e}")
            raise AppError("A", "Something went wrong creating your account. Please try again or contact us.")

        # Auto-accept any pending admin invites for this email
        try:
            pending_invite = conn.execute(
                """SELECT * FROM admin_invites
                   WHERE LOWER(email) = LOWER(?) AND status = 'pending' AND expires_at > ?""",
                (data.email, datetime.now().isoformat())
            ).fetchone()
            print(f"[ADMIN_INVITE] Signup check for {data.email}: pending_invite={'found id=' + str(pending_invite['id']) if pending_invite else 'none'}")
            if pending_invite:
                conn.execute(
                    "UPDATE volunteers SET is_admin = 1 WHERE id = ?",
                    (volunteer_id,)
                )
                conn.execute(
                    """UPDATE admin_invites
                       SET status = 'accepted', accepted_by_id = ?, accepted_at = ?
                       WHERE id = ?""",
                    (volunteer_id, datetime.now().isoformat(), pending_invite["id"])
                )
                print(f"[ADMIN_INVITE] Auto-accepted invite for {data.email} on signup")
        except AppError:
            raise
        except Exception as e:
            print(f"[SIGNUP ERROR] admin invite check failed for {data.email}: {type(e).__name__}: {e}")
            raise AppError("B", "Something went wrong creating your account. Please try again or contact us.")

        # Send welcome email (non-blocking, don't fail signup if email fails)
        try:
            send_welcome_email(to=data.email, name=data.name)
        except Exception as e:
            print(f"[SIGNUP] Welcome email failed for {data.email}: {e}")

        return {
            "id": volunteer_id,
            "auth_token": auth_token,
            "message": "Welcome to Catalyse!"
        }


def check_admin_bootstrap(email: str, volunteer_id: int, conn=None) -> bool:
    """
    Check if email is in ADMIN_EMAILS env var and promote to admin if so.
    Returns True if user was promoted.
    """
    admin_emails = os.environ.get("ADMIN_EMAILS", "")
    print(f"[ADMIN_BOOTSTRAP] Checking email={email}, ADMIN_EMAILS={repr(admin_emails)}")
    if not admin_emails:
        print("[ADMIN_BOOTSTRAP] No ADMIN_EMAILS env var set")
        return False

    # Parse comma-separated list of emails
    allowed_emails = [e.strip().lower() for e in admin_emails.split(",") if e.strip()]
    print(f"[ADMIN_BOOTSTRAP] Parsed allowed_emails={allowed_emails}, checking against {email.lower()}")

    if email.lower() in allowed_emails:
        if conn is not None:
            conn.execute(
                "UPDATE volunteers SET is_admin = 1 WHERE id = ? AND is_admin = 0",
                (volunteer_id,)
            )
        else:
            with db_transaction() as new_conn:
                new_conn.execute(
                    "UPDATE volunteers SET is_admin = 1 WHERE id = ? AND is_admin = 0",
                    (volunteer_id,)
                )
        return True
    return False


@app.post("/api/auth/login")
def login(data: LoginRequest) -> Dict:
    """Login with email and password."""
    conn = get_db()
    volunteer = conn.execute(
        "SELECT * FROM volunteers WHERE email = ? AND deleted_at IS NULL",
        (data.email,)
    ).fetchone()
    conn.close()

    if not volunteer:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Verify password
    if not volunteer["password_hash"] or not verify_password(data.password, volunteer["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Check for admin bootstrap via ADMIN_EMAILS env var
    was_promoted = check_admin_bootstrap(data.email, volunteer["id"])

    # Auto-accept any pending admin invites for this email
    with db_transaction() as conn:
        pending_invite = conn.execute(
            """SELECT * FROM admin_invites
               WHERE LOWER(email) = LOWER(?) AND status = 'pending' AND expires_at > ?""",
            (data.email, datetime.now().isoformat())
        ).fetchone()
        print(f"[ADMIN_INVITE] Login check for {data.email}: pending_invite={'found id=' + str(pending_invite['id']) if pending_invite else 'none'}")
        if pending_invite:
            conn.execute(
                "UPDATE volunteers SET is_admin = 1 WHERE id = ?",
                (volunteer["id"],)
            )
            conn.execute(
                """UPDATE admin_invites
                   SET status = 'accepted', accepted_by_id = ?, accepted_at = ?
                   WHERE id = ?""",
                (volunteer["id"], datetime.now().isoformat(), pending_invite["id"])
            )
            was_promoted = True
            print(f"[ADMIN_INVITE] Auto-accepted invite for {data.email} on login")

    # Generate new token
    auth_token = generate_auth_token()

    with db_transaction() as conn:
        conn.execute(
            "UPDATE volunteers SET auth_token = ?, updated_at = ? WHERE id = ?",
            (auth_token, datetime.now().isoformat(), volunteer["id"])
        )

    result = {
        "message": "Login successful",
        "auth_token": auth_token
    }

    if was_promoted:
        result["message"] = "Login successful - you've been granted admin access!"

    return result


# Google OAuth configuration
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")


def verify_google_token(credential: str) -> Optional[Dict]:
    """Verify a Google Sign-In JWT token and return user info."""
    from urllib.request import Request, urlopen
    import json

    if not GOOGLE_CLIENT_ID:
        return None

    try:
        # Use Google's tokeninfo endpoint to verify the JWT
        # This is simpler than manually verifying JWTs and equally secure
        request = Request(
            f"https://oauth2.googleapis.com/tokeninfo?id_token={credential}"
        )
        with urlopen(request, timeout=10) as response:
            data = json.loads(response.read())

        # Verify the audience matches our client ID
        if data.get("aud") != GOOGLE_CLIENT_ID:
            print(f"[GOOGLE_AUTH] Token audience mismatch: {data.get('aud')}")
            return None

        # Verify email is verified
        if data.get("email_verified") != "true":
            print(f"[GOOGLE_AUTH] Email not verified: {data.get('email')}")
            return None

        return {
            "email": data["email"],
            "name": data.get("name", data["email"].split("@")[0]),
            "google_id": data["sub"],
            "picture": data.get("picture")
        }

    except Exception as e:
        print(f"[GOOGLE_AUTH] Token verification failed: {e}")
        return None


@app.get("/api/auth/google-client-id")
def get_google_client_id() -> Dict:
    """Return the Google client ID for frontend initialization."""
    return {"client_id": GOOGLE_CLIENT_ID or ""}


@app.post("/api/auth/google")
def google_auth(data: GoogleAuthRequest) -> Dict:
    """Authenticate via Google Sign-In. Creates account if new, logs in if existing."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google Sign-In is not configured")

    # Verify the Google token
    google_user = verify_google_token(data.credential)
    if not google_user:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    email = google_user["email"]
    name = google_user["name"]

    conn = get_db()
    existing = conn.execute(
        "SELECT * FROM volunteers WHERE email = ? AND deleted_at IS NULL",
        (email,)
    ).fetchone()
    conn.close()

    if existing:
        # Existing user — log them in
        auth_token = generate_auth_token()
        with db_transaction() as conn:
            conn.execute(
                "UPDATE volunteers SET auth_token = ?, updated_at = ? WHERE id = ?",
                (auth_token, datetime.now().isoformat(), existing["id"])
            )

        # Check for admin bootstrap
        was_promoted = check_admin_bootstrap(email, existing["id"])

        # Auto-accept pending admin invites
        with db_transaction() as conn:
            pending_invite = conn.execute(
                """SELECT * FROM admin_invites
                   WHERE LOWER(email) = LOWER(?) AND status = 'pending' AND expires_at > ?""",
                (email, datetime.now().isoformat())
            ).fetchone()
            if pending_invite:
                conn.execute("UPDATE volunteers SET is_admin = 1 WHERE id = ?", (existing["id"],))
                conn.execute(
                    """UPDATE admin_invites SET status = 'accepted', accepted_by_id = ?, accepted_at = ? WHERE id = ?""",
                    (existing["id"], datetime.now().isoformat(), pending_invite["id"])
                )
                was_promoted = True

        result = {"message": "Login successful", "auth_token": auth_token}
        if was_promoted:
            result["message"] = "Login successful - you've been granted admin access!"
        return result

    else:
        # New user — create account
        auth_token = generate_auth_token()

        with db_transaction() as conn:
            cursor = conn.execute(
                """INSERT INTO volunteers (
                    name, email, auth_token,
                    consent_profile_visible, consent_contact_by_owners, consent_given_at
                ) VALUES (?, ?, ?, ?, ?, ?)""",
                (name, email, auth_token, True, True, datetime.now().isoformat())
            )
            volunteer_id = cursor.lastrowid

            # Check admin bootstrap
            try:
                check_admin_bootstrap(email, volunteer_id, conn=conn)
            except Exception as e:
                print(f"[GOOGLE_SIGNUP ERROR] admin bootstrap failed for {email}: {type(e).__name__}: {e}")
                raise AppError("C", "Something went wrong creating your account. Please try again or contact us.")

            # Auto-accept pending admin invites
            try:
                pending_invite = conn.execute(
                    """SELECT * FROM admin_invites
                       WHERE LOWER(email) = LOWER(?) AND status = 'pending' AND expires_at > ?""",
                    (email, datetime.now().isoformat())
                ).fetchone()
                if pending_invite:
                    conn.execute("UPDATE volunteers SET is_admin = 1 WHERE id = ?", (volunteer_id,))
                    conn.execute(
                        """UPDATE admin_invites SET status = 'accepted', accepted_by_id = ?, accepted_at = ? WHERE id = ?""",
                        (volunteer_id, datetime.now().isoformat(), pending_invite["id"])
                    )
            except AppError:
                raise
            except Exception as e:
                print(f"[GOOGLE_SIGNUP ERROR] admin invite check failed for {email}: {type(e).__name__}: {e}")
                raise AppError("D", "Something went wrong creating your account. Please try again or contact us.")

        # Send welcome email
        send_welcome_email(to=email, name=name)

        return {
            "auth_token": auth_token,
            "message": "Welcome to Catalyse!",
            "is_new_user": True
        }


@app.post("/api/auth/logout")
def logout(volunteer: Dict = Depends(require_auth)) -> Dict:
    """Logout - invalidate token."""
    with db_transaction() as conn:
        conn.execute(
            "UPDATE volunteers SET auth_token = NULL WHERE id = ?",
            (volunteer["id"],)
        )
    return {"message": "Logged out"}


@app.post("/api/auth/forgot-password")
def forgot_password(data: ForgotPasswordRequest) -> Dict:
    """Request a password reset email."""
    conn = get_db()
    volunteer = conn.execute(
        "SELECT id, name, email FROM volunteers WHERE email = ? AND deleted_at IS NULL",
        (data.email,)
    ).fetchone()
    conn.close()

    # Always return success to prevent email enumeration
    if not volunteer:
        return {"message": "If an account exists with this email, you'll receive a reset link."}

    # Generate reset token
    reset_token = secrets.token_urlsafe(32)
    expires_at = (datetime.now() + timedelta(hours=1)).isoformat()

    with db_transaction() as conn:
        # Invalidate any existing tokens
        conn.execute(
            "UPDATE password_reset_tokens SET used_at = ? WHERE volunteer_id = ? AND used_at IS NULL",
            (datetime.now().isoformat(), volunteer["id"])
        )

        # Create new token
        conn.execute(
            """INSERT INTO password_reset_tokens (volunteer_id, token, expires_at)
               VALUES (?, ?, ?)""",
            (volunteer["id"], reset_token, expires_at)
        )

    # Send password reset email
    email_sent = send_password_reset_email(
        to=volunteer["email"],
        reset_token=reset_token,
        name=volunteer["name"]
    )

    result = {"message": "If an account exists with this email, you'll receive a reset link."}

    # In dev mode (no email configured), include token for testing
    if not is_email_configured():
        result["_dev_reset_token"] = reset_token
        result["_dev_reset_url"] = f"/static/reset-password.html?token={reset_token}"
        result["_dev_note"] = "Email not configured. Set RESEND_API_KEY to enable."

    return result


@app.post("/api/auth/reset-password")
def reset_password(data: ResetPasswordRequest) -> Dict:
    """Reset password using a valid reset token."""
    conn = get_db()
    token_record = conn.execute(
        """SELECT prt.*, v.id as volunteer_id
           FROM password_reset_tokens prt
           JOIN volunteers v ON prt.volunteer_id = v.id
           WHERE prt.token = ?
             AND prt.used_at IS NULL
             AND prt.expires_at > ?
             AND v.deleted_at IS NULL""",
        (data.token, datetime.now().isoformat())
    ).fetchone()
    conn.close()

    if not token_record:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    # Hash new password and update
    password_hash = hash_password(data.new_password)

    with db_transaction() as conn:
        # Update password
        conn.execute(
            "UPDATE volunteers SET password_hash = ?, auth_token = NULL, updated_at = ? WHERE id = ?",
            (password_hash, datetime.now().isoformat(), token_record["volunteer_id"])
        )

        # Mark token as used
        conn.execute(
            "UPDATE password_reset_tokens SET used_at = ? WHERE id = ?",
            (datetime.now().isoformat(), token_record["id"])
        )

    return {"message": "Password reset successful. Please log in with your new password."}


@app.post("/api/auth/change-password")
def change_password(
    data: ChangePasswordRequest,
    volunteer: Dict = Depends(require_auth)
) -> Dict:
    """Change password for logged-in user."""
    conn = get_db()
    vol = conn.execute(
        "SELECT password_hash FROM volunteers WHERE id = ?",
        (volunteer["id"],)
    ).fetchone()
    conn.close()

    # Verify current password
    if not vol["password_hash"] or not verify_password(data.current_password, vol["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    # Hash and save new password
    new_hash = hash_password(data.new_password)

    with db_transaction() as conn:
        conn.execute(
            "UPDATE volunteers SET password_hash = ?, updated_at = ? WHERE id = ?",
            (new_hash, datetime.now().isoformat(), volunteer["id"])
        )

    return {"message": "Password changed successfully"}


@app.post("/api/auth/change-email")
def change_email(
    data: ChangeEmailRequest,
    volunteer: Dict = Depends(require_auth)
) -> Dict:
    """Change email for logged-in user."""
    conn = get_db()
    vol = conn.execute(
        "SELECT password_hash FROM volunteers WHERE id = ?",
        (volunteer["id"],)
    ).fetchone()
    conn.close()

    # Verify password (skip for Google-only users who have no password)
    if vol["password_hash"]:
        if not verify_password(data.password, vol["password_hash"]):
            raise HTTPException(status_code=400, detail="Password is incorrect")
    else:
        raise HTTPException(status_code=400, detail="Cannot change email for accounts without a password. Contact an admin.")

    # Check duplicate and update inside same transaction to prevent race condition
    with db_transaction() as conn:
        existing = conn.execute(
            "SELECT id FROM volunteers WHERE email = ? AND id != ?",
            (data.new_email, volunteer["id"])
        ).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="This email is already registered to another account")
        conn.execute(
            "UPDATE volunteers SET email = ?, updated_at = ? WHERE id = ?",
            (data.new_email, datetime.now().isoformat(), volunteer["id"])
        )

    return {"message": "Email changed successfully"}


def _send_account_deletion_notifications(conn, deleted_volunteer_id: int, deleted_volunteer_name: str):
    """Notify affected parties when a volunteer deletes their account."""
    # Projects with unfinished tasks assigned to the deleted user, grouped by project owner
    task_rows = conn.execute(
        """SELECT p.owner_id, v.name AS owner_name, v.email AS owner_email,
                  p.id AS project_id, p.title AS project_title,
                  COUNT(st.id) AS task_count
           FROM starter_tasks st
           JOIN projects p ON st.project_id = p.id
           JOIN volunteers v ON p.owner_id = v.id
           WHERE st.assigned_to_id = ?
             AND st.status NOT IN ('completed', 'reviewed')
             AND p.owner_id != ?
             AND v.deleted_at IS NULL
           GROUP BY p.id""",
        (deleted_volunteer_id, deleted_volunteer_id)
    ).fetchall()

    # Active projects owned by the deleted user
    owned_projects = conn.execute(
        """SELECT id, title FROM projects
           WHERE owner_id = ? AND status NOT IN ('completed', 'archived')""",
        (deleted_volunteer_id,)
    ).fetchall()

    if not task_rows and not owned_projects:
        return

    # Build per-owner task map
    owner_task_map = {}
    for row in task_rows:
        oid = row["owner_id"]
        if oid not in owner_task_map:
            owner_task_map[oid] = {"name": row["owner_name"], "email": row["owner_email"], "task_projects": []}
        owner_task_map[oid]["task_projects"].append({
            "project_id": row["project_id"],
            "project_title": row["project_title"],
            "task_count": row["task_count"],
        })

    ownerless = [{"project_id": p["id"], "project_title": p["title"]} for p in owned_projects]

    # Build unified recipient map — admins and task-project owners may overlap
    recipients = {}
    for owner_id, data in owner_task_map.items():
        recipients[owner_id] = {
            "name": data["name"], "email": data["email"],
            "task_projects": data["task_projects"], "ownerless_projects": [],
        }

    if ownerless:
        admins = conn.execute(
            "SELECT id, name, email FROM volunteers WHERE is_admin = 1 AND deleted_at IS NULL AND id != ?",
            (deleted_volunteer_id,)
        ).fetchall()
        for admin in admins:
            aid = admin["id"]
            if aid not in recipients:
                recipients[aid] = {"name": admin["name"], "email": admin["email"], "task_projects": [], "ownerless_projects": []}
            recipients[aid]["ownerless_projects"] = ownerless

    # Send per-project in-app notifications, but only one email per recipient
    for recipient_id, r in recipients.items():
        for p in r["task_projects"]:
            word = "task" if p["task_count"] == 1 else "tasks"
            try:
                create_notification(
                    conn, recipient_id, "account_deleted_impact",
                    f"{deleted_volunteer_name} has deleted their account",
                    f"{p['task_count']} {word} in '{p['project_title']}' assigned to {deleted_volunteer_name} need a new assignee.",
                    f"/static/project.html?id={p['project_id']}"
                )
            except Exception as e:
                print(f"[NOTIFY ERROR] Account deletion notification failed: {e}")

        for p in r["ownerless_projects"]:
            try:
                create_notification(
                    conn, recipient_id, "account_deleted_impact",
                    f"{deleted_volunteer_name} has deleted their account",
                    f"'{p['project_title']}' needs a new owner.",
                    f"/static/project.html?id={p['project_id']}"
                )
            except Exception as e:
                print(f"[NOTIFY ERROR] Account deletion notification failed: {e}")

        try:
            if r["email"]:
                all_projects = r["task_projects"] + r["ownerless_projects"]
                msg_parts = [f"<p><strong>{deleted_volunteer_name}</strong> has deleted their account.</p>"]
                if r["task_projects"]:
                    rows_html = "".join(
                        f"<li>{p['task_count']} {'task' if p['task_count'] == 1 else 'tasks'} in <strong>{p['project_title']}</strong></li>"
                        for p in r["task_projects"]
                    )
                    msg_parts.append(f"<p>The following tasks need a new assignee:</p><ul>{rows_html}</ul>")
                if r["ownerless_projects"]:
                    rows_html = "".join(
                        f"<li><strong>{p['project_title']}</strong></li>"
                        for p in r["ownerless_projects"]
                    )
                    msg_parts.append(f"<p>The following projects need a new owner:</p><ul>{rows_html}</ul>")
                send_project_notification_email(
                    to=r["email"], name=r["name"],
                    subject=f"{deleted_volunteer_name} has deleted their account",
                    message="".join(msg_parts),
                    project_title=all_projects[0]["project_title"],
                    project_id=all_projects[0]["project_id"]
                )
        except Exception as e:
            print(f"[NOTIFY ERROR] Account deletion email failed: {e}")


@app.post("/api/auth/delete-account")
def delete_account(
    data: DeleteAccountRequest,
    volunteer: Dict = Depends(require_auth)
) -> Dict:
    """Delete user account (GDPR compliant soft delete)."""
    conn = get_db()
    vol = conn.execute(
        "SELECT password_hash FROM volunteers WHERE id = ?",
        (volunteer["id"],)
    ).fetchone()
    conn.close()

    # Verify password
    if not vol["password_hash"] or not verify_password(data.password, vol["password_hash"]):
        raise HTTPException(status_code=400, detail="Password is incorrect")

    with db_transaction() as conn:
        # Record deletion request for GDPR compliance
        conn.execute(
            """INSERT INTO deletion_requests (volunteer_id, volunteer_email, status)
               VALUES (?, ?, 'completed')""",
            (volunteer["id"], volunteer["email"])
        )

        _send_account_deletion_notifications(conn, volunteer["id"], volunteer["name"])

        # Soft delete - anonymize personal data but keep for referential integrity
        conn.execute(
            """UPDATE volunteers SET
                name = '[Deleted User]',
                email = NULL,
                bio = NULL,
                discord_handle = NULL,
                signal_number = NULL,
                whatsapp_number = NULL,
                contact_notes = NULL,
                location = NULL,
                other_skills = NULL,
                auth_token = NULL,
                password_hash = NULL,
                deleted_at = ?,
                updated_at = ?
               WHERE id = ?""",
            (datetime.now().isoformat(), datetime.now().isoformat(), volunteer["id"])
        )

        conn.execute(
            "DELETE FROM volunteer_skills WHERE volunteer_id = ?",
            (volunteer["id"],)
        )

    return {"message": "Your account has been deleted. We're sorry to see you go."}


@app.get("/api/auth/me")
def get_me(volunteer: Dict = Depends(require_auth)) -> Dict:
    """Get current volunteer's full profile."""
    conn = get_db()
    vol = conn.execute(
        "SELECT * FROM volunteers WHERE id = ?",
        (volunteer["id"],)
    ).fetchone()
    result = enrich_volunteer(conn, dict(vol), show_contact=True)
    conn.close()
    return result


# ============================================
# SKILLS ENDPOINTS
# ============================================

@app.get("/api/skills")
def list_skills() -> List[Dict]:
    """Get all skills grouped by category."""
    conn = get_db()
    categories = conn.execute(
        "SELECT * FROM skill_categories ORDER BY sort_order"
    ).fetchall()

    result = []
    for cat in categories:
        cat_dict = dict(cat)
        skills = conn.execute(
            "SELECT * FROM skills WHERE category_id = ? ORDER BY sort_order",
            (cat["id"],)
        ).fetchall()
        cat_dict["skills"] = rows_to_list(skills)
        result.append(cat_dict)

    conn.close()
    return result


@app.get("/api/skills/flat")
def list_skills_flat() -> List[Dict]:
    """Get all skills as a flat list."""
    conn = get_db()
    skills = conn.execute(
        """SELECT s.*, sc.name as category_name
           FROM skills s
           JOIN skill_categories sc ON s.category_id = sc.id
           ORDER BY sc.sort_order, s.sort_order"""
    ).fetchall()
    conn.close()
    return rows_to_list(skills)


# --- Admin Skills Management ---

class SkillCategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    sort_order: Optional[int] = None


class SkillCategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None


class SkillCreate(BaseModel):
    category_id: int
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    sort_order: Optional[int] = None


class SkillUpdate(BaseModel):
    category_id: Optional[int] = None
    name: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None


@app.get("/api/admin/skill-categories")
def list_skill_categories(admin: Dict = Depends(require_admin)) -> List[Dict]:
    """Get all skill categories with counts."""
    conn = get_db()
    categories = conn.execute(
        """SELECT sc.*, COUNT(s.id) as skill_count
           FROM skill_categories sc
           LEFT JOIN skills s ON sc.id = s.category_id
           GROUP BY sc.id
           ORDER BY sc.sort_order"""
    ).fetchall()
    conn.close()
    return rows_to_list(categories)


@app.post("/api/admin/skill-categories")
def create_skill_category(
    data: SkillCategoryCreate,
    admin: Dict = Depends(require_admin)
) -> Dict:
    """Create a new skill category."""
    with db_transaction() as conn:
        # Get max sort_order if not provided
        sort_order = data.sort_order
        if sort_order is None:
            max_order = conn.execute(
                "SELECT MAX(sort_order) as max_order FROM skill_categories"
            ).fetchone()
            sort_order = (max_order["max_order"] or 0) + 1

        cursor = conn.execute(
            """INSERT INTO skill_categories (name, description, sort_order)
               VALUES (?, ?, ?)""",
            (data.name, data.description, sort_order)
        )
        return {"id": cursor.lastrowid, "name": data.name, "sort_order": sort_order}


@app.put("/api/admin/skill-categories/{category_id}")
def update_skill_category(
    category_id: int,
    data: SkillCategoryUpdate,
    admin: Dict = Depends(require_admin)
) -> Dict:
    """Update a skill category."""
    with db_transaction() as conn:
        category = conn.execute(
            "SELECT * FROM skill_categories WHERE id = ?", (category_id,)
        ).fetchone()
        if not category:
            raise HTTPException(status_code=404, detail="Category not found")

        updates = []
        params = []
        for field in ["name", "description", "sort_order"]:
            value = getattr(data, field)
            if value is not None:
                updates.append(f"{field} = ?")
                params.append(value)

        if updates:
            params.append(category_id)
            conn.execute(
                f"UPDATE skill_categories SET {', '.join(updates)} WHERE id = ?",
                params
            )

        return {"success": True}


@app.delete("/api/admin/skill-categories/{category_id}")
def delete_skill_category(
    category_id: int,
    admin: Dict = Depends(require_admin)
) -> Dict:
    """Delete a skill category (only if no skills are in it)."""
    with db_transaction() as conn:
        # Check if category has skills
        skill_count = conn.execute(
            "SELECT COUNT(*) as count FROM skills WHERE category_id = ?",
            (category_id,)
        ).fetchone()["count"]

        if skill_count > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete category with {skill_count} skills. Move or delete skills first."
            )

        result = conn.execute(
            "DELETE FROM skill_categories WHERE id = ?", (category_id,)
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Category not found")

        return {"success": True}


@app.post("/api/admin/skills")
def create_skill(
    data: SkillCreate,
    admin: Dict = Depends(require_admin)
) -> Dict:
    """Create a new skill."""
    with db_transaction() as conn:
        # Verify category exists
        category = conn.execute(
            "SELECT id FROM skill_categories WHERE id = ?", (data.category_id,)
        ).fetchone()
        if not category:
            raise HTTPException(status_code=400, detail="Category not found")

        # Get max sort_order if not provided
        sort_order = data.sort_order
        if sort_order is None:
            max_order = conn.execute(
                "SELECT MAX(sort_order) as max_order FROM skills WHERE category_id = ?",
                (data.category_id,)
            ).fetchone()
            sort_order = (max_order["max_order"] or 0) + 1

        cursor = conn.execute(
            """INSERT INTO skills (category_id, name, description, sort_order)
               VALUES (?, ?, ?, ?)""",
            (data.category_id, data.name, data.description, sort_order)
        )
        return {"id": cursor.lastrowid, "name": data.name, "category_id": data.category_id}


@app.put("/api/admin/skills/{skill_id}")
def update_skill(
    skill_id: int,
    data: SkillUpdate,
    admin: Dict = Depends(require_admin)
) -> Dict:
    """Update a skill."""
    with db_transaction() as conn:
        skill = conn.execute(
            "SELECT * FROM skills WHERE id = ?", (skill_id,)
        ).fetchone()
        if not skill:
            raise HTTPException(status_code=404, detail="Skill not found")

        # Verify new category exists if provided
        if data.category_id is not None:
            category = conn.execute(
                "SELECT id FROM skill_categories WHERE id = ?", (data.category_id,)
            ).fetchone()
            if not category:
                raise HTTPException(status_code=400, detail="Category not found")

        updates = []
        params = []
        for field in ["category_id", "name", "description", "sort_order"]:
            value = getattr(data, field)
            if value is not None:
                updates.append(f"{field} = ?")
                params.append(value)

        if updates:
            params.append(skill_id)
            conn.execute(
                f"UPDATE skills SET {', '.join(updates)} WHERE id = ?",
                params
            )

        return {"success": True}


@app.delete("/api/admin/skills/{skill_id}")
def delete_skill(
    skill_id: int,
    admin: Dict = Depends(require_admin)
) -> Dict:
    """Delete a skill (also removes from volunteers and projects)."""
    with db_transaction() as conn:
        skill = conn.execute(
            "SELECT * FROM skills WHERE id = ?", (skill_id,)
        ).fetchone()
        if not skill:
            raise HTTPException(status_code=404, detail="Skill not found")

        # Remove skill associations
        conn.execute("DELETE FROM volunteer_skills WHERE skill_id = ?", (skill_id,))
        conn.execute("DELETE FROM project_skills WHERE skill_id = ?", (skill_id,))
        conn.execute("DELETE FROM skill_endorsements WHERE skill_id = ?", (skill_id,))
        conn.execute("DELETE FROM starter_tasks WHERE skill_id = ?", (skill_id,))

        # Delete the skill
        conn.execute("DELETE FROM skills WHERE id = ?", (skill_id,))

        return {"success": True, "deleted_skill": dict(skill)}


# ============================================
# VOLUNTEER ENDPOINTS
# ============================================

@app.get("/api/volunteers")
def list_volunteers(
    skill_ids: Optional[str] = Query(None, description="Comma-separated skill IDs"),
    search: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    local_group: Optional[str] = Query(None),
    limit: int = Query(50, le=100),
    offset: int = Query(0)
) -> Dict:
    """List volunteers (public profiles only)."""
    conn = get_db()

    query = """
        SELECT DISTINCT v.id, v.name, v.bio, v.availability_hours_per_week,
               v.location, v.other_skills, v.local_group, v.created_at
        FROM volunteers v
        WHERE v.deleted_at IS NULL
        AND v.profile_visible = 1
        AND v.consent_profile_visible = 1
    """
    params = []

    if skill_ids:
        skill_list = [int(s) for s in skill_ids.split(",")]
        placeholders = ",".join("?" * len(skill_list))
        query += f"""
            AND v.id IN (
                SELECT volunteer_id FROM volunteer_skills
                WHERE skill_id IN ({placeholders})
            )
        """
        params.extend(skill_list)

    if search:
        query += " AND (v.name LIKE ? OR v.bio LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])

    if country:
        # Only filter by country if the column exists (migration may not have run yet)
        try:
            conn.execute("SELECT country FROM volunteers LIMIT 1")
            query += " AND v.country = ?"
            params.append(country)
        except Exception:
            pass  # Column doesn't exist yet

    if local_group:
        try:
            conn.execute("SELECT local_group FROM volunteers LIMIT 1")
            query += " AND v.local_group = ?"
            params.append(local_group)
        except Exception:
            pass  # Column doesn't exist yet

    # Get total count
    count_query = "SELECT COUNT(DISTINCT v.id)" + query[query.index("FROM volunteers"):]
    total = conn.execute(count_query, params).fetchone()[0]

    # Get paginated results
    query += " ORDER BY v.created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    volunteers = conn.execute(query, params).fetchall()

    result = []
    for v in volunteers:
        vol_dict = dict(v)
        vol_dict["skills"] = get_volunteer_skills(conn, v["id"])
        result.append(vol_dict)

    conn.close()
    return {"volunteers": result, "total": total}


@app.get("/api/volunteers/{volunteer_id}")
def get_volunteer(
    volunteer_id: int,
    current_volunteer: Optional[Dict] = Depends(get_current_volunteer)
) -> Dict:
    """Get a volunteer's profile."""
    conn = get_db()
    volunteer = conn.execute(
        """SELECT * FROM volunteers
           WHERE id = ? AND deleted_at IS NULL
           AND profile_visible = 1""",
        (volunteer_id,)
    ).fetchone()

    if not volunteer:
        conn.close()
        raise HTTPException(status_code=404, detail="Volunteer not found")

    # Determine if we should show contact info
    show_contact = False
    if current_volunteer:
        # Show contact if it's their own profile
        if current_volunteer["id"] == volunteer_id:
            show_contact = True
        # Admins can always see contact info
        elif current_volunteer.get("is_admin"):
            show_contact = True
        # Show contact if they've opted to share directly AND consent to being contacted
        elif volunteer["share_contact_directly"] and volunteer["consent_contact_by_owners"]:
            show_contact = True

    result = enrich_volunteer(conn, dict(volunteer), show_contact=show_contact)

    # Get their projects (with role info)
    projects = conn.execute(
        """SELECT p.*,
               CASE WHEN p.owner_id = ? THEN 'owner' ELSE 'proposer' END as role
           FROM projects p
           WHERE (p.owner_id = ? OR p.proposed_by_id = ?)
           AND p.status NOT IN ('archived', 'pending_review', 'needs_discussion')
           ORDER BY p.created_at DESC""",
        (volunteer_id, volunteer_id, volunteer_id)
    ).fetchall()
    result["projects"] = rows_to_list(projects)

    # Get completed starter tasks (public track record)
    completed_tasks = conn.execute(
        """SELECT st.title, st.review_rating, st.feedback_to_volunteer,
                  st.reviewed_at, s.name as skill_name
           FROM starter_tasks st
           LEFT JOIN skills s ON st.skill_id = s.id
           WHERE st.assigned_to_id = ?
           AND st.status IN ('completed', 'reviewed')
           AND st.review_rating IN ('excellent', 'good')
           ORDER BY st.reviewed_at DESC""",
        (volunteer_id,)
    ).fetchall()
    result["completed_tasks"] = rows_to_list(completed_tasks)

    conn.close()
    return result


@app.put("/api/volunteers/me")
def update_me(data: VolunteerUpdate, volunteer: Dict = Depends(require_auth)) -> Dict:
    """Update current volunteer's profile."""
    with db_transaction() as conn:
        updates = []
        params = []

        # Check which columns exist (migrations may not have run yet)
        cursor = conn.execute("PRAGMA table_info(volunteers)")
        existing_columns = {row["name"] for row in cursor.fetchall()}

        for field in ["name", "bio", "discord_handle", "signal_number",
                      "whatsapp_number", "contact_preference", "contact_notes",
                      "availability_hours_per_week", "location", "country", "local_group",
                      "share_contact_directly", "other_skills", "profile_visible", "email_digest"]:
            if field not in existing_columns:
                continue
            value = getattr(data, field, None)
            if value is not None or (field == "local_group" and field in data.model_fields_set):
                updates.append(f"{field} = ?")
                params.append(value)

        if updates:
            updates.append("updated_at = ?")
            params.append(datetime.now().isoformat())
            params.append(volunteer["id"])

            conn.execute(
                f"UPDATE volunteers SET {', '.join(updates)} WHERE id = ?",
                params
            )

        # Update skills if provided
        if data.skill_ids is not None:
            conn.execute(
                "DELETE FROM volunteer_skills WHERE volunteer_id = ?",
                (volunteer["id"],)
            )
            for skill_id in data.skill_ids:
                conn.execute(
                    "INSERT OR IGNORE INTO volunteer_skills (volunteer_id, skill_id) VALUES (?, ?)",
                    (volunteer["id"], skill_id)
                )

        # Return updated profile
        vol = conn.execute(
            "SELECT * FROM volunteers WHERE id = ?",
            (volunteer["id"],)
        ).fetchone()
        return enrich_volunteer(conn, dict(vol), show_contact=True)


# ============================================
# PROJECT ENDPOINTS
# ============================================

@app.get("/api/projects")
def list_projects(
    status: Optional[str] = Query(None),
    skill_ids: Optional[str] = Query(None, description="Comma-separated skill IDs"),
    search: Optional[str] = Query(None),
    urgency: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    local_group: Optional[str] = Query(None),
    is_org_proposed: Optional[bool] = Query(None),
    sort_by: str = Query("created_at", pattern="^(created_at|urgency|match)$"),
    limit: int = Query(50, le=100),
    offset: int = Query(0),
    current_volunteer: Optional[Dict] = Depends(get_current_volunteer)
) -> Dict:
    """List projects with filters."""
    conn = get_db()

    # Build query
    query = """
        SELECT DISTINCT p.*
        FROM projects p
        WHERE 1=1
    """
    params = []

    # Only show public statuses unless filtering specifically
    if status:
        query += " AND p.status = ?"
        params.append(status)
    else:
        query += " AND p.status NOT IN ('archived', 'pending_review', 'needs_discussion')"

    if skill_ids:
        skill_list = [int(s) for s in skill_ids.split(",")]
        placeholders = ",".join("?" * len(skill_list))
        query += f"""
            AND p.id IN (
                SELECT project_id FROM project_skills
                WHERE skill_id IN ({placeholders})
            )
        """
        params.extend(skill_list)

    if search:
        query += " AND (p.title LIKE ? OR p.description LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])

    if urgency:
        query += " AND p.urgency = ?"
        params.append(urgency)

    if country:
        try:
            conn.execute("SELECT country FROM projects LIMIT 1")
            query += " AND p.country = ?"
            params.append(country)
        except Exception:
            pass

    if local_group:
        try:
            conn.execute("SELECT local_group FROM projects LIMIT 1")
            query += " AND p.local_group = ?"
            params.append(local_group)
        except Exception:
            pass

    if is_org_proposed is not None:
        query += " AND p.is_org_proposed = ?"
        params.append(is_org_proposed)

    # Get total count
    count_query = query.replace("SELECT DISTINCT p.*", "SELECT COUNT(DISTINCT p.id)")
    total = conn.execute(count_query, params).fetchone()[0]

    # Add ordering — seeking projects first, then by urgency
    # Check if seeking flags exist
    seeking_sort = ""
    try:
        conn.execute("SELECT is_seeking_help FROM projects LIMIT 1")
        seeking_sort = "CASE WHEN p.is_seeking_help OR p.is_seeking_owner THEN 0 ELSE 1 END, "
    except Exception:
        pass

    if sort_by == "urgency":
        query += f" ORDER BY {seeking_sort}CASE p.urgency WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, p.created_at DESC"
    else:
        query += f" ORDER BY {seeking_sort}CASE p.urgency WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, p.created_at DESC"

    query += " LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    projects = conn.execute(query, params).fetchall()

    # Get volunteer's skills for matching
    volunteer_skill_ids = None
    if current_volunteer:
        skill_rows = conn.execute(
            "SELECT skill_id FROM volunteer_skills WHERE volunteer_id = ?",
            (current_volunteer["id"],)
        ).fetchall()
        volunteer_skill_ids = {row["skill_id"] for row in skill_rows}

    # Enrich projects
    result = []
    for p in projects:
        project = enrich_project(conn, dict(p), volunteer_skill_ids)
        result.append(project)

    # Sort by match if requested
    if sort_by == "match" and volunteer_skill_ids:
        result.sort(key=lambda x: x.get("match", {}).get("overall_score", 0), reverse=True)

    conn.close()
    return {"projects": result, "total": total}


@app.get("/api/projects/{project_id}")
def get_project(
    project_id: int,
    current_volunteer: Optional[Dict] = Depends(get_current_volunteer)
) -> Dict:
    """Get a single project with full details."""
    conn = get_db()
    project = conn.execute(
        "SELECT * FROM projects WHERE id = ?",
        (project_id,)
    ).fetchone()

    if not project:
        conn.close()
        raise HTTPException(status_code=404, detail="Project not found")

    project = dict(project)

    # Check access - hide pending/needs_discussion unless involved
    hidden_statuses = ["pending_review", "needs_discussion"]
    if project["status"] in hidden_statuses:
        if not current_volunteer:
            raise HTTPException(status_code=404, detail="Project not found")
        is_proposer = project["proposed_by_id"] == current_volunteer["id"]
        is_admin = current_volunteer.get("is_admin")
        if not (is_proposer or is_admin):
            raise HTTPException(status_code=404, detail="Project not found")

    # Get volunteer's skills for matching
    volunteer_skill_ids = None
    if current_volunteer:
        skill_rows = conn.execute(
            "SELECT skill_id FROM volunteer_skills WHERE volunteer_id = ?",
            (current_volunteer["id"],)
        ).fetchall()
        volunteer_skill_ids = {row["skill_id"] for row in skill_rows}

    project = enrich_project(conn, project, volunteer_skill_ids)

    # Get project updates
    updates = conn.execute(
        """SELECT pu.*, v.name as author_name
           FROM project_updates pu
           LEFT JOIN volunteers v ON pu.author_id = v.id
           WHERE pu.project_id = ?
           ORDER BY pu.created_at DESC""",
        (project_id,)
    ).fetchall()
    project["updates"] = rows_to_list(updates)

    # Get project tasks
    tasks = conn.execute(
        """SELECT pt.*, v_assigned.name as assigned_to_name,
                  v_created.name as created_by_name
           FROM project_tasks pt
           LEFT JOIN volunteers v_assigned ON pt.assigned_to_id = v_assigned.id
           LEFT JOIN volunteers v_created ON pt.created_by_id = v_created.id
           WHERE pt.project_id = ?
           ORDER BY CASE pt.status WHEN 'open' THEN 1 WHEN 'assigned' THEN 2 ELSE 3 END,
                    pt.created_at DESC""",
        (project_id,)
    ).fetchall()
    project["tasks"] = rows_to_list(tasks)

    # Get interests if owner or admin
    if current_volunteer:
        is_owner = project.get("owner_id") == current_volunteer["id"]
        is_admin = current_volunteer.get("is_admin")

        if is_owner or is_admin:
            interests = conn.execute(
                """SELECT pi.*, v.name as volunteer_name, v.bio as volunteer_bio
                   FROM project_interests pi
                   JOIN volunteers v ON pi.volunteer_id = v.id
                   WHERE pi.project_id = ?
                   ORDER BY pi.created_at DESC""",
                (project_id,)
            ).fetchall()
            project["interests"] = rows_to_list(interests)

            # Add skills for each interested volunteer
            for interest in project["interests"]:
                interest["volunteer_skills"] = get_volunteer_skills(conn, interest["volunteer_id"])

        # Check if current user has expressed interest (exclude withdrawn)
        my_interest = conn.execute(
            "SELECT * FROM project_interests WHERE project_id = ? AND volunteer_id = ? AND status != 'withdrawn'",
            (project_id, current_volunteer["id"])
        ).fetchone()
        project["my_interest"] = row_to_dict(my_interest)

    conn.close()
    return project


@app.post("/api/projects")
def create_project(
    data: ProjectCreate,
    volunteer: Dict = Depends(require_auth)
) -> Dict:
    """Create a new project (volunteer-proposed)."""
    if not data.tasks:
        raise HTTPException(status_code=400, detail="At least one task is required to submit a project proposal")

    with db_transaction() as conn:
        status = "pending_review"
        owner_id = volunteer["id"] if data.want_to_own else None

        # Build INSERT dynamically based on existing columns
        proj_columns = {row["name"] for row in conn.execute("PRAGMA table_info(projects)").fetchall()}
        proj_fields = {
            "title": data.title, "description": data.description, "status": status,
            "owner_id": owner_id, "proposed_by_id": volunteer["id"],
            "is_org_proposed": False, "project_type": data.project_type,
            "estimated_duration": data.estimated_duration,
            "time_commitment_hours_per_week": data.time_commitment_hours_per_week,
            "urgency": data.urgency, "collaboration_link": data.collaboration_link
        }
        if "country" in proj_columns:
            proj_fields["country"] = data.country
        if "local_group" in proj_columns:
            proj_fields["local_group"] = data.local_group
        if "is_seeking_help" in proj_columns:
            proj_fields["is_seeking_help"] = data.is_seeking_help
            proj_fields["is_seeking_owner"] = not data.want_to_own

        col_names = ", ".join(proj_fields.keys())
        placeholders = ", ".join("?" * len(proj_fields))
        cursor = conn.execute(
            f"INSERT INTO projects ({col_names}) VALUES ({placeholders})",
            list(proj_fields.values())
        )
        project_id = cursor.lastrowid

        # Add skills
        for skill_id in data.skill_ids:
            is_required = data.skill_required_map.get(skill_id, True)
            conn.execute(
                "INSERT INTO project_skills (project_id, skill_id, is_required) VALUES (?, ?, ?)",
                (project_id, skill_id, is_required)
            )

        # Add initial tasks
        for task in data.tasks:
            conn.execute(
                "INSERT INTO project_tasks (project_id, title, description, created_by_id) VALUES (?, ?, ?, ?)",
                (project_id, task.title, task.description, volunteer["id"])
            )

        # Notify admins (in-app + email)
        admins = conn.execute(
            "SELECT id, name, email FROM volunteers WHERE is_admin = 1 AND deleted_at IS NULL"
        ).fetchall()
        for admin in admins:
            create_notification(
                conn, admin["id"], "new_project_proposal",
                f"New project proposal: {data.title}",
                f"Proposed by {volunteer['name']}",
                "/static/admin/triage.html"
            )
            try:
                if admin["email"]:
                    send_project_notification_email(
                        to=admin["email"], name=admin["name"],
                        subject=f"New project proposal: {data.title}",
                        message=f"<strong>{volunteer['name']}</strong> has submitted a new project proposal: <strong>{data.title}</strong>. Please review it in the triage queue.",
                        project_title=data.title, project_id=project_id
                    )
            except Exception as e:
                print(f"[NOTIFY ERROR] Admin email failed for new proposal: {e}")

        return {"id": project_id, "message": "Project submitted for review"}


@app.put("/api/projects/{project_id}")
def update_project(
    project_id: int,
    data: ProjectUpdate,
    volunteer: Dict = Depends(require_auth)
) -> Dict:
    """Update a project (owner or admin only)."""
    conn = get_db()
    project = conn.execute(
        "SELECT * FROM projects WHERE id = ?",
        (project_id,)
    ).fetchone()
    conn.close()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    is_owner = project["owner_id"] == volunteer["id"]
    is_proposer = project["proposed_by_id"] == volunteer["id"]
    is_admin = volunteer.get("is_admin")

    if not (is_owner or is_proposer or is_admin):
        raise HTTPException(status_code=403, detail="Not authorized to edit this project")

    with db_transaction() as conn:
        updates = []
        params = []

        # Enforce: cannot move to in_progress without at least one open task
        if data.status == 'in_progress' and project["status"] != 'in_progress':
            open_task_count = conn.execute(
                "SELECT COUNT(*) FROM project_tasks WHERE project_id = ? AND status != 'done'",
                (project_id,)
            ).fetchone()[0]
            if open_task_count == 0:
                raise HTTPException(
                    status_code=400,
                    detail="A project cannot be moved to In Progress without at least one open task"
                )

        # Check which columns exist for seeking flags
        proj_columns = {row["name"] for row in conn.execute("PRAGMA table_info(projects)").fetchall()}
        has_seeking_flags = "is_seeking_help" in proj_columns

        # Define which statuses owners can set (vs admin-only statuses)
        owner_allowed_statuses = {"seeking_owner", "seeking_help", "needs_tasks", "in_progress", "on_hold", "completed"}

        for field in ["title", "description", "status", "project_type", "estimated_duration",
                      "time_commitment_hours_per_week", "urgency", "collaboration_link", "country", "local_group", "owner_id"]:
            value = getattr(data, field, None)
            if value is not None or (field == "local_group" and field in data.model_fields_set):
                if field == "status" and not is_admin:
                    if not is_owner or value not in owner_allowed_statuses:
                        continue
                updates.append(f"{field} = ?")
                params.append(value)

        # Handle seeking flags
        if has_seeking_flags:
            if data.is_seeking_help is not None:
                updates.append("is_seeking_help = ?")
                params.append(data.is_seeking_help)
            if data.is_seeking_owner is not None:
                updates.append("is_seeking_owner = ?")
                params.append(data.is_seeking_owner)

            # Auto-clear seeking flags when completing or archiving
            if data.status in ("completed", "archived"):
                if "is_seeking_help = ?" not in updates:
                    updates.append("is_seeking_help = ?")
                    params.append(False)
                if "is_seeking_owner = ?" not in updates:
                    updates.append("is_seeking_owner = ?")
                    params.append(False)

        if updates:
            updates.append("updated_at = ?")
            params.append(datetime.now().isoformat())
            params.append(project_id)

            conn.execute(
                f"UPDATE projects SET {', '.join(updates)} WHERE id = ?",
                params
            )

        # Update skills if provided
        if data.skill_ids is not None:
            conn.execute("DELETE FROM project_skills WHERE project_id = ?", (project_id,))
            skill_required_map = data.skill_required_map or {}
            for skill_id in data.skill_ids:
                is_required = skill_required_map.get(skill_id, True)
                conn.execute(
                    "INSERT INTO project_skills (project_id, skill_id, is_required) VALUES (?, ?, ?)",
                    (project_id, skill_id, is_required)
                )

        # Notify stakeholders if status changed
        if data.status and data.status != project["status"]:
            status_label = {
                'seeking_owner': 'Seeking Owner', 'seeking_help': 'Seeking Help',
                'needs_tasks': 'Needs Tasks',
                'in_progress': 'In Progress', 'on_hold': 'On Hold',
                'completed': 'Completed', 'archived': 'Archived'
            }.get(data.status, data.status)

            # Collect people to notify (deduplicated)
            notify_ids = set()
            if project["owner_id"] and project["owner_id"] != volunteer["id"]:
                notify_ids.add(project["owner_id"])
            if project["proposed_by_id"] and project["proposed_by_id"] != volunteer["id"]:
                notify_ids.add(project["proposed_by_id"])

            # Also notify accepted volunteers
            accepted = conn.execute(
                "SELECT DISTINCT volunteer_id FROM project_interests WHERE project_id = ? AND status = 'accepted'",
                (project_id,)
            ).fetchall()
            for row in accepted:
                if row["volunteer_id"] != volunteer["id"]:
                    notify_ids.add(row["volunteer_id"])

            for vid in notify_ids:
                create_notification(
                    conn, vid, "project_status_changed",
                    f"'{project['title']}' is now {status_label}",
                    f"Status changed by {volunteer['name']}",
                    f"/static/project.html?id={project_id}"
                )
                # Email them
                vol = conn.execute(
                    "SELECT name, email FROM volunteers WHERE id = ? AND deleted_at IS NULL",
                    (vid,)
                ).fetchone()
                if vol and vol["email"]:
                    send_project_notification_email(
                        to=vol["email"], name=vol["name"],
                        subject=f"'{project['title']}' is now {status_label}",
                        message=f"The project <strong>{project['title']}</strong> has been updated to <strong>{status_label}</strong>.",
                        project_title=project["title"], project_id=project_id
                    )

        updated = conn.execute(
            "SELECT * FROM projects WHERE id = ?",
            (project_id,)
        ).fetchone()
        return enrich_project(conn, dict(updated))


@app.delete("/api/projects/{project_id}")
def delete_project(
    project_id: int,
    admin: Dict = Depends(require_admin)
) -> Dict:
    """Delete a project permanently (admin only)."""
    with db_transaction() as conn:
        project = conn.execute(
            "SELECT * FROM projects WHERE id = ?", (project_id,)
        ).fetchone()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Delete related records
        conn.execute("DELETE FROM project_skills WHERE project_id = ?", (project_id,))
        conn.execute("DELETE FROM project_interests WHERE project_id = ?", (project_id,))
        conn.execute("DELETE FROM project_updates WHERE project_id = ?", (project_id,))
        conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))

        return {"message": f"Project '{project['title']}' deleted"}


@app.post("/api/projects/{project_id}/updates")
def add_project_update(
    project_id: int,
    data: ProjectUpdateCreate,
    volunteer: Dict = Depends(require_auth)
) -> Dict:
    """Add a progress update to a project."""
    conn = get_db()
    project = conn.execute(
        "SELECT * FROM projects WHERE id = ?",
        (project_id,)
    ).fetchone()
    conn.close()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    is_owner = project["owner_id"] == volunteer["id"]
    is_admin = volunteer.get("is_admin")

    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="Only project owner can add updates")

    with db_transaction() as conn:
        cursor = conn.execute(
            "INSERT INTO project_updates (project_id, author_id, content) VALUES (?, ?, ?)",
            (project_id, volunteer["id"], data.content)
        )
        return {"id": cursor.lastrowid, "message": "Update added"}


# ============================================
# PROJECT TASKS ENDPOINTS
# ============================================

@app.get("/api/projects/{project_id}/tasks")
def list_project_tasks(
    project_id: int,
    current_volunteer: Optional[Dict] = Depends(get_current_volunteer)
) -> List[Dict]:
    """List tasks for a project."""
    conn = get_db()
    tasks = conn.execute(
        """SELECT pt.*, v_assigned.name as assigned_to_name,
                  v_created.name as created_by_name
           FROM project_tasks pt
           LEFT JOIN volunteers v_assigned ON pt.assigned_to_id = v_assigned.id
           LEFT JOIN volunteers v_created ON pt.created_by_id = v_created.id
           WHERE pt.project_id = ?
           ORDER BY CASE pt.status WHEN 'open' THEN 1 WHEN 'assigned' THEN 2 ELSE 3 END,
                    pt.created_at DESC""",
        (project_id,)
    ).fetchall()
    conn.close()
    return rows_to_list(tasks)


@app.post("/api/projects/{project_id}/tasks")
def create_project_task(
    project_id: int,
    data: ProjectTaskCreate,
    volunteer: Dict = Depends(require_auth)
) -> Dict:
    """Create a task within a project (owner or admin)."""
    conn = get_db()
    project = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    conn.close()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    is_owner = project["owner_id"] == volunteer["id"]
    is_admin = volunteer.get("is_admin")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="Only project owner or admin can create tasks")

    with db_transaction() as conn:
        cursor = conn.execute(
            """INSERT INTO project_tasks (project_id, title, description, created_by_id)
               VALUES (?, ?, ?, ?)""",
            (project_id, data.title, data.description, volunteer["id"])
        )
        if project["status"] == "needs_tasks":
            conn.execute(
                "UPDATE projects SET status = 'in_progress' WHERE id = ?",
                (project_id,)
            )
        return {"id": cursor.lastrowid, "message": "Task created"}


@app.put("/api/projects/{project_id}/tasks/{task_id}")
def update_project_task(
    project_id: int,
    task_id: int,
    data: ProjectTaskUpdate,
    volunteer: Dict = Depends(require_auth)
) -> Dict:
    """Update a project task. Owner/admin can edit all fields. Volunteers can claim open tasks."""
    conn = get_db()
    project = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    task = conn.execute(
        "SELECT * FROM project_tasks WHERE id = ? AND project_id = ?", (task_id, project_id)
    ).fetchone()
    conn.close()

    if not project or not task:
        raise HTTPException(status_code=404, detail="Project or task not found")

    is_owner = project["owner_id"] == volunteer["id"]
    is_admin = volunteer.get("is_admin")
    is_assignee = task["assigned_to_id"] == volunteer["id"]

    # Volunteers can claim open tasks or mark their own assigned tasks as done
    if not (is_owner or is_admin):
        if data.status == 'assigned' and data.assigned_to_id == volunteer["id"] and task["status"] == "open":
            pass  # Allow self-claim
        elif data.status == 'done' and is_assignee and task["status"] == "assigned":
            pass  # Allow marking own task done
        else:
            raise HTTPException(status_code=403, detail="Not authorized to update this task")

    with db_transaction() as conn:
        updates = []
        params = []

        if data.title is not None:
            updates.append("title = ?")
            params.append(data.title)
        if data.description is not None:
            updates.append("description = ?")
            params.append(data.description)
        if data.status is not None:
            updates.append("status = ?")
            params.append(data.status)
            if data.status == "done":
                updates.append("completed_at = ?")
                params.append(datetime.now().isoformat())
            elif data.status == "open":
                updates.append("assigned_to_id = NULL")
                updates.append("completed_at = NULL")
        if data.assigned_to_id is not None:
            updates.append("assigned_to_id = ?")
            params.append(data.assigned_to_id)

        if updates:
            updates.append("updated_at = ?")
            params.append(datetime.now().isoformat())
            params.append(task_id)
            conn.execute(
                f"UPDATE project_tasks SET {', '.join(updates)} WHERE id = ?",
                params
            )

        return {"message": "Task updated"}


@app.delete("/api/projects/{project_id}/tasks/{task_id}")
def delete_project_task(
    project_id: int,
    task_id: int,
    volunteer: Dict = Depends(require_auth)
) -> Dict:
    """Delete a project task (owner or admin only)."""
    conn = get_db()
    project = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    conn.close()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    is_owner = project["owner_id"] == volunteer["id"]
    is_admin = volunteer.get("is_admin")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="Not authorized")

    with db_transaction() as conn:
        result = conn.execute(
            "DELETE FROM project_tasks WHERE id = ? AND project_id = ?",
            (task_id, project_id)
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Task not found")
        return {"message": "Task deleted"}


# ============================================
# ADMIN ENDPOINTS
# ============================================

@app.get("/api/admin/triage")
def get_triage_queue(admin: Dict = Depends(require_admin)) -> List[Dict]:
    """Get projects pending review."""
    conn = get_db()
    projects = conn.execute(
        """SELECT p.*, v.name as proposer_name
           FROM projects p
           LEFT JOIN volunteers v ON p.proposed_by_id = v.id
           WHERE p.status IN ('pending_review', 'needs_discussion')
           ORDER BY p.created_at ASC"""
    ).fetchall()

    result = [enrich_project(conn, dict(p)) for p in projects]
    conn.close()
    return result


@app.post("/api/admin/projects/{project_id}/review")
def review_project(
    project_id: int,
    data: ProjectReview,
    admin: Dict = Depends(require_admin)
) -> Dict:
    """Review a proposed project."""
    conn = get_db()
    project = conn.execute(
        "SELECT * FROM projects WHERE id = ?",
        (project_id,)
    ).fetchone()
    conn.close()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    with db_transaction() as conn:
        if data.status == "approved":
            # Determine lifecycle status and seeking flags
            has_owner = project["owner_id"] is not None
            open_task_count = conn.execute(
                "SELECT COUNT(*) FROM project_tasks WHERE project_id = ? AND status != 'done'",
                (project_id,)
            ).fetchone()[0]
            new_status = "in_progress" if open_task_count > 0 else "needs_tasks"
            target = data.target_status or "seeking_owner"

            # Build update with seeking flags if columns exist
            proj_columns = {row["name"] for row in conn.execute("PRAGMA table_info(projects)").fetchall()}
            if "is_seeking_help" in proj_columns:
                is_seeking_help = target in ("seeking_help",) or target == "seeking_owner"
                is_seeking_owner = target in ("seeking_owner",) and not has_owner
                conn.execute(
                    """UPDATE projects SET
                       status = ?, is_seeking_help = ?, is_seeking_owner = ?,
                       review_notes = ?, reviewed_by_id = ?, reviewed_at = ?, updated_at = ?
                       WHERE id = ?""",
                    (new_status, is_seeking_help, is_seeking_owner,
                     data.review_notes, admin["id"],
                     datetime.now().isoformat(), datetime.now().isoformat(), project_id)
                )
            else:
                conn.execute(
                    """UPDATE projects SET
                       status = ?, review_notes = ?, reviewed_by_id = ?, reviewed_at = ?, updated_at = ?
                       WHERE id = ?""",
                    (target, data.review_notes, admin["id"],
                     datetime.now().isoformat(), datetime.now().isoformat(), project_id)
                )

            # Notify proposer
            if project["proposed_by_id"]:
                create_notification(
                    conn, project["proposed_by_id"], "project_approved",
                    f"Your project '{project['title']}' has been approved!",
                    "It's now visible to other volunteers.",
                    f"/static/project.html?id={project_id}"
                )
                # Email the proposer
                proposer = conn.execute(
                    "SELECT name, email FROM volunteers WHERE id = ?",
                    (project["proposed_by_id"],)
                ).fetchone()
                if proposer and proposer["email"]:
                    send_project_notification_email(
                        to=proposer["email"], name=proposer["name"],
                        subject=f"Your project '{project['title']}' has been approved!",
                        message="Great news! Your project has been approved and is now visible to all volunteers. People can start expressing interest.",
                        project_title=project["title"], project_id=project_id
                    )

            # Send skill-match email notifications (async-safe, non-blocking)
            try:
                from digest_service import send_skill_match_notifications
                import threading
                threading.Thread(
                    target=send_skill_match_notifications,
                    args=(project_id,),
                    daemon=True
                ).start()
            except Exception as e:
                print(f"[DIGEST] Failed to trigger skill match notifications: {e}")

        elif data.status == "needs_discussion":
            conn.execute(
                """UPDATE projects SET
                   status = 'needs_discussion', review_notes = ?, feedback_to_proposer = ?,
                   reviewed_by_id = ?, reviewed_at = ?, updated_at = ?
                   WHERE id = ?""",
                (data.review_notes, data.feedback_to_proposer, admin["id"],
                 datetime.now().isoformat(), datetime.now().isoformat(), project_id)
            )

            # Notify proposer
            if project["proposed_by_id"]:
                feedback = data.feedback_to_proposer or "A team lead wants to chat about your proposal."
                create_notification(
                    conn, project["proposed_by_id"], "project_needs_discussion",
                    f"Let's discuss your project '{project['title']}'",
                    feedback,
                    f"/static/project.html?id={project_id}"
                )
                # Email the proposer
                proposer = conn.execute(
                    "SELECT name, email FROM volunteers WHERE id = ?",
                    (project["proposed_by_id"],)
                ).fetchone()
                if proposer and proposer["email"]:
                    extra = f'<div style="padding: 12px; background: #f7fafc; border-radius: 8px; margin: 16px 0;"><strong>Feedback:</strong> {feedback}</div>'
                    send_project_notification_email(
                        to=proposer["email"], name=proposer["name"],
                        subject=f"Let's discuss your project '{project['title']}'",
                        message="A team lead would like to discuss your project proposal before it goes live.",
                        project_title=project["title"], project_id=project_id,
                        extra_html=extra
                    )

        return {"message": f"Project marked as {data.status}"}


@app.post("/api/admin/projects")
def create_org_project(
    data: ProjectCreate,
    admin: Dict = Depends(require_admin)
) -> Dict:
    """Create an org-proposed project (skips review)."""
    with db_transaction() as conn:
        status = "needs_tasks"

        proj_columns = {row["name"] for row in conn.execute("PRAGMA table_info(projects)").fetchall()}
        proj_fields = {
            "title": data.title, "description": data.description, "status": status,
            "owner_id": admin["id"] if data.want_to_own else None,
            "proposed_by_id": admin["id"], "is_org_proposed": True,
            "project_type": data.project_type, "estimated_duration": data.estimated_duration,
            "time_commitment_hours_per_week": data.time_commitment_hours_per_week,
            "urgency": data.urgency, "collaboration_link": data.collaboration_link
        }
        if "country" in proj_columns:
            proj_fields["country"] = data.country
        if "local_group" in proj_columns:
            proj_fields["local_group"] = data.local_group
        if "is_seeking_help" in proj_columns:
            proj_fields["is_seeking_help"] = data.is_seeking_help
            proj_fields["is_seeking_owner"] = not data.want_to_own

        col_names = ", ".join(proj_fields.keys())
        placeholders = ", ".join("?" * len(proj_fields))
        cursor = conn.execute(
            f"INSERT INTO projects ({col_names}) VALUES ({placeholders})",
            list(proj_fields.values())
        )
        project_id = cursor.lastrowid

        for skill_id in data.skill_ids:
            is_required = data.skill_required_map.get(skill_id, True)
            conn.execute(
                "INSERT INTO project_skills (project_id, skill_id, is_required) VALUES (?, ?, ?)",
                (project_id, skill_id, is_required)
            )

        for task in data.tasks:
            conn.execute(
                "INSERT INTO project_tasks (project_id, title, description, created_by_id) VALUES (?, ?, ?, ?)",
                (project_id, task.title, task.description, admin["id"])
            )

        if data.tasks:
            conn.execute(
                "UPDATE projects SET status = 'in_progress' WHERE id = ?",
                (project_id,)
            )

        return {"id": project_id, "message": "Org project created"}


def _count_seeking(conn) -> int:
    """Count projects that are seeking help or owner (handles missing columns)."""
    try:
        return conn.execute(
            "SELECT COUNT(*) FROM projects WHERE is_seeking_help = 1 OR is_seeking_owner = 1 OR status IN ('seeking_owner', 'seeking_help')"
        ).fetchone()[0]
    except Exception:
        return conn.execute(
            "SELECT COUNT(*) FROM projects WHERE status IN ('seeking_owner', 'seeking_help')"
        ).fetchone()[0]


@app.get("/api/admin/stats")
def get_admin_stats(admin: Dict = Depends(require_admin)) -> Dict:
    """Get platform statistics."""
    conn = get_db()

    stats = {
        "volunteers": {
            "total": conn.execute(
                "SELECT COUNT(*) FROM volunteers WHERE deleted_at IS NULL"
            ).fetchone()[0],
            "this_month": conn.execute(
                """SELECT COUNT(*) FROM volunteers
                   WHERE deleted_at IS NULL
                   AND created_at >= date('now', '-30 days')"""
            ).fetchone()[0]
        },
        "projects": {
            "total": conn.execute("SELECT COUNT(*) FROM projects").fetchone()[0],
            "pending_review": conn.execute(
                "SELECT COUNT(*) FROM projects WHERE status = 'pending_review'"
            ).fetchone()[0],
            "seeking_help": _count_seeking(conn),
            "in_progress": conn.execute(
                "SELECT COUNT(*) FROM projects WHERE status = 'in_progress'"
            ).fetchone()[0],
            "completed": conn.execute(
                "SELECT COUNT(*) FROM projects WHERE status = 'completed'"
            ).fetchone()[0]
        },
        "interests": {
            "total": conn.execute("SELECT COUNT(*) FROM project_interests").fetchone()[0],
            "pending": conn.execute(
                "SELECT COUNT(*) FROM project_interests WHERE status = 'pending'"
            ).fetchone()[0]
        }
    }

    conn.close()
    return stats


@app.get("/api/admin/interests")
def list_all_interests(
    status: Optional[str] = Query(None),
    admin: Dict = Depends(require_admin)
) -> List[Dict]:
    """List all project interests across all projects (admin only)."""
    conn = get_db()

    query = """
        SELECT pi.*, p.title as project_title, p.status as project_status,
               v.name as volunteer_name, v.email as volunteer_email,
               owner.name as owner_name
        FROM project_interests pi
        JOIN projects p ON pi.project_id = p.id
        JOIN volunteers v ON pi.volunteer_id = v.id
        LEFT JOIN volunteers owner ON p.owner_id = owner.id
        WHERE 1=1
    """
    params = []

    if status:
        query += " AND pi.status = ?"
        params.append(status)

    query += " ORDER BY pi.created_at DESC"

    interests = conn.execute(query, params).fetchall()

    result = []
    for i in interests:
        interest = dict(i)
        interest["volunteer_skills"] = get_volunteer_skills(conn, i["volunteer_id"])
        result.append(interest)

    conn.close()
    return result


# ============================================
# ADMIN NOTES ENDPOINTS
# ============================================

@app.get("/api/admin/volunteers/{volunteer_id}/notes")
def get_admin_notes(
    volunteer_id: int,
    admin: Dict = Depends(require_admin)
) -> List[Dict]:
    """Get all admin notes for a volunteer (admin only)."""
    conn = get_db()
    notes = conn.execute(
        """SELECT an.*, v.name as author_name
           FROM admin_notes an
           JOIN volunteers v ON an.author_id = v.id
           WHERE an.volunteer_id = ?
           ORDER BY an.created_at DESC""",
        (volunteer_id,)
    ).fetchall()
    conn.close()
    return rows_to_list(notes)


@app.post("/api/admin/volunteers/{volunteer_id}/notes")
def create_admin_note(
    volunteer_id: int,
    data: AdminNoteCreate,
    admin: Dict = Depends(require_admin)
) -> Dict:
    """Add a private admin note to a volunteer's record."""
    with db_transaction() as conn:
        # Verify volunteer exists
        vol = conn.execute(
            "SELECT id FROM volunteers WHERE id = ?", (volunteer_id,)
        ).fetchone()
        if not vol:
            raise HTTPException(status_code=404, detail="Volunteer not found")

        cursor = conn.execute(
            """INSERT INTO admin_notes (volunteer_id, author_id, content, category, related_project_id)
               VALUES (?, ?, ?, ?, ?)""",
            (volunteer_id, admin["id"], data.content, data.category, data.related_project_id)
        )
        return {"id": cursor.lastrowid, "message": "Note added"}


@app.put("/api/admin/notes/{note_id}")
def update_admin_note(
    note_id: int,
    data: AdminNoteUpdate,
    admin: Dict = Depends(require_admin)
) -> Dict:
    """Update an admin note."""
    with db_transaction() as conn:
        note = conn.execute("SELECT * FROM admin_notes WHERE id = ?", (note_id,)).fetchone()
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")

        updates = []
        params = []
        if data.content is not None:
            updates.append("content = ?")
            params.append(data.content)
        if data.category is not None:
            updates.append("category = ?")
            params.append(data.category)

        if updates:
            updates.append("updated_at = ?")
            params.append(datetime.now().isoformat())
            params.append(note_id)
            conn.execute(f"UPDATE admin_notes SET {', '.join(updates)} WHERE id = ?", params)

        return {"message": "Note updated"}


@app.delete("/api/admin/notes/{note_id}")
def delete_admin_note(
    note_id: int,
    admin: Dict = Depends(require_admin)
) -> Dict:
    """Delete an admin note."""
    with db_transaction() as conn:
        result = conn.execute("DELETE FROM admin_notes WHERE id = ?", (note_id,))
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Note not found")
        return {"message": "Note deleted"}


# ============================================
# STARTER TASKS ENDPOINTS
# ============================================

@app.get("/api/starter-tasks/available")
def list_available_starter_tasks(
    current_volunteer: Optional[Dict] = Depends(get_current_volunteer)
) -> List[Dict]:
    """List available (open) starter tasks for volunteers to browse."""
    conn = get_db()
    tasks = conn.execute(
        """SELECT st.id, st.title, st.description, st.estimated_hours,
                  s.name as skill_name, sc.name as skill_category,
                  p.title as project_title
           FROM starter_tasks st
           LEFT JOIN skills s ON st.skill_id = s.id
           LEFT JOIN skill_categories sc ON s.category_id = sc.id
           LEFT JOIN projects p ON st.project_id = p.id
           WHERE st.status = 'open'
           ORDER BY st.created_at DESC"""
    ).fetchall()
    conn.close()
    return rows_to_list(tasks)


@app.get("/api/starter-tasks")
def list_starter_tasks(
    status: Optional[str] = Query(None),
    skill_id: Optional[int] = Query(None),
    admin: Dict = Depends(require_admin)
) -> List[Dict]:
    """List all starter tasks (admin only)."""
    conn = get_db()
    query = """
        SELECT st.*, s.name as skill_name, sc.name as skill_category,
               p.title as project_title,
               v_assigned.name as assigned_to_name,
               v_reviewer.name as reviewed_by_name
        FROM starter_tasks st
        LEFT JOIN skills s ON st.skill_id = s.id
        LEFT JOIN skill_categories sc ON s.category_id = sc.id
        LEFT JOIN projects p ON st.project_id = p.id
        LEFT JOIN volunteers v_assigned ON st.assigned_to_id = v_assigned.id
        LEFT JOIN volunteers v_reviewer ON st.reviewed_by_id = v_reviewer.id
        WHERE 1=1
    """
    params = []

    if status:
        query += " AND st.status = ?"
        params.append(status)
    if skill_id:
        query += " AND st.skill_id = ?"
        params.append(skill_id)

    query += " ORDER BY st.created_at DESC"

    tasks = conn.execute(query, params).fetchall()
    conn.close()
    return rows_to_list(tasks)


@app.get("/api/my/starter-tasks")
def get_my_starter_tasks(volunteer: Dict = Depends(require_auth)) -> List[Dict]:
    """Get starter tasks assigned to the current volunteer."""
    conn = get_db()
    tasks = conn.execute(
        """SELECT st.*, s.name as skill_name, p.title as project_title
           FROM starter_tasks st
           LEFT JOIN skills s ON st.skill_id = s.id
           LEFT JOIN projects p ON st.project_id = p.id
           WHERE st.assigned_to_id = ?
           ORDER BY st.created_at DESC""",
        (volunteer["id"],)
    ).fetchall()
    conn.close()
    return rows_to_list(tasks)


@app.post("/api/starter-tasks")
def create_starter_task(
    data: StarterTaskCreate,
    admin: Dict = Depends(require_admin)
) -> Dict:
    """Create a new starter task."""
    with db_transaction() as conn:
        cursor = conn.execute(
            """INSERT INTO starter_tasks (title, description, skill_id, project_id, estimated_hours)
               VALUES (?, ?, ?, ?, ?)""",
            (data.title, data.description, data.skill_id, data.project_id, data.estimated_hours)
        )
        return {"id": cursor.lastrowid, "message": "Starter task created"}


@app.post("/api/starter-tasks/{task_id}/assign")
def assign_starter_task(
    task_id: int,
    data: StarterTaskAssign,
    admin: Dict = Depends(require_admin)
) -> Dict:
    """Assign a starter task to a volunteer."""
    with db_transaction() as conn:
        task = conn.execute("SELECT * FROM starter_tasks WHERE id = ?", (task_id,)).fetchone()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        conn.execute(
            """UPDATE starter_tasks
               SET assigned_to_id = ?, assigned_by_id = ?, status = 'assigned', updated_at = ?
               WHERE id = ?""",
            (data.volunteer_id, admin["id"], datetime.now().isoformat(), task_id)
        )

        # Notify the volunteer
        create_notification(
            conn, data.volunteer_id, "starter_task_assigned",
            f"You've been assigned a starter task: {task['title']}",
            task["description"][:200],
            f"/static/dashboard.html"
        )

        return {"message": "Task assigned"}


@app.put("/api/starter-tasks/{task_id}/submit")
def submit_starter_task(
    task_id: int,
    volunteer: Dict = Depends(require_auth)
) -> Dict:
    """Submit a completed starter task for review."""
    with db_transaction() as conn:
        task = conn.execute(
            "SELECT * FROM starter_tasks WHERE id = ? AND assigned_to_id = ?",
            (task_id, volunteer["id"])
        ).fetchone()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found or not assigned to you")

        conn.execute(
            "UPDATE starter_tasks SET status = 'submitted', updated_at = ? WHERE id = ?",
            (datetime.now().isoformat(), task_id)
        )

        # Notify assigning admin
        if task["assigned_by_id"]:
            create_notification(
                conn, task["assigned_by_id"], "starter_task_submitted",
                f"{volunteer['name']} submitted: {task['title']}",
                "Ready for review",
                "/static/admin/starter-tasks.html"
            )

        return {"message": "Task submitted for review"}


@app.post("/api/starter-tasks/{task_id}/review")
def review_starter_task(
    task_id: int,
    data: StarterTaskReview,
    admin: Dict = Depends(require_admin)
) -> Dict:
    """Review a submitted starter task."""
    with db_transaction() as conn:
        task = conn.execute("SELECT * FROM starter_tasks WHERE id = ?", (task_id,)).fetchone()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task["status"] != "submitted":
            raise HTTPException(status_code=400, detail="Task is not in submitted status")

        new_status = "completed" if data.review_rating in ("excellent", "good") else "reviewed"

        conn.execute(
            """UPDATE starter_tasks SET
               status = ?, review_rating = ?, review_notes = ?,
               feedback_to_volunteer = ?, reviewed_by_id = ?,
               reviewed_at = ?, updated_at = ?
               WHERE id = ?""",
            (new_status, data.review_rating, data.review_notes,
             data.feedback_to_volunteer, admin["id"],
             datetime.now().isoformat(), datetime.now().isoformat(), task_id)
        )

        # Auto-create admin note based on outcome
        if task["assigned_to_id"]:
            note_content = f"Starter task '{task['title']}': {data.review_rating}"
            if data.review_notes:
                note_content += f" - {data.review_notes}"

            conn.execute(
                """INSERT INTO admin_notes (volunteer_id, author_id, content, category, related_project_id)
                   VALUES (?, ?, ?, 'skill_feedback', ?)""",
                (task["assigned_to_id"], admin["id"], note_content, task["project_id"])
            )

            # Auto-endorse skill if excellent/good and skill_id is set
            if data.review_rating in ("excellent", "good") and task["skill_id"]:
                rating = "strong" if data.review_rating == "excellent" else "verified"
                conn.execute(
                    """INSERT OR REPLACE INTO skill_endorsements
                       (volunteer_id, skill_id, endorsed_by_id, source, source_id, rating, notes)
                       VALUES (?, ?, ?, 'starter_task', ?, ?, ?)""",
                    (task["assigned_to_id"], task["skill_id"], admin["id"],
                     task_id, rating, data.review_notes)
                )

            # Notify the volunteer
            create_notification(
                conn, task["assigned_to_id"], "starter_task_reviewed",
                f"Your starter task was reviewed: {data.review_rating}",
                data.feedback_to_volunteer or "Check your dashboard for details.",
                "/static/dashboard.html"
            )

        return {"message": f"Task reviewed as {data.review_rating}"}


# ============================================
# SKILL ENDORSEMENT ENDPOINTS
# ============================================

@app.get("/api/admin/volunteers/{volunteer_id}/endorsements")
def get_endorsements(
    volunteer_id: int,
    admin: Dict = Depends(require_admin)
) -> List[Dict]:
    """Get all skill endorsements for a volunteer."""
    conn = get_db()
    endorsements = conn.execute(
        """SELECT se.*, s.name as skill_name, sc.name as skill_category,
                  v.name as endorsed_by_name
           FROM skill_endorsements se
           JOIN skills s ON se.skill_id = s.id
           JOIN skill_categories sc ON s.category_id = sc.id
           JOIN volunteers v ON se.endorsed_by_id = v.id
           WHERE se.volunteer_id = ?
           ORDER BY se.created_at DESC""",
        (volunteer_id,)
    ).fetchall()
    conn.close()
    return rows_to_list(endorsements)


@app.post("/api/admin/volunteers/{volunteer_id}/endorsements")
def create_endorsement(
    volunteer_id: int,
    data: SkillEndorsementCreate,
    admin: Dict = Depends(require_admin)
) -> Dict:
    """Endorse a volunteer's skill (admin only)."""
    with db_transaction() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO skill_endorsements
               (volunteer_id, skill_id, endorsed_by_id, source, source_id, rating, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (volunteer_id, data.skill_id, admin["id"],
             data.source, data.source_id, data.rating, data.notes)
        )
        return {"message": "Skill endorsed"}


# ============================================
# PROJECT OUTCOME ENDPOINTS
# ============================================

@app.put("/api/admin/projects/{project_id}/outcome")
def set_project_outcome(
    project_id: int,
    data: ProjectOutcomeUpdate,
    admin: Dict = Depends(require_admin)
) -> Dict:
    """Record the outcome of a completed project."""
    outcome = data.outcome
    outcome_notes = data.outcome_notes
    if outcome not in ("successful", "partial", "not_completed", "ongoing"):
        raise HTTPException(status_code=400, detail="Invalid outcome")

    with db_transaction() as conn:
        project = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        completed_at = datetime.now().isoformat() if outcome in ("successful", "partial", "not_completed") else None

        conn.execute(
            """UPDATE projects SET outcome = ?, outcome_notes = ?, completed_at = ?,
               status = CASE WHEN ? IN ('successful', 'partial', 'not_completed') THEN 'completed' ELSE status END,
               updated_at = ?
               WHERE id = ?""",
            (outcome, outcome_notes, completed_at, outcome, datetime.now().isoformat(), project_id)
        )

        # Auto-create admin notes for volunteers involved
        if project["owner_id"] and outcome_notes:
            conn.execute(
                """INSERT INTO admin_notes (volunteer_id, author_id, content, category, related_project_id)
                   VALUES (?, ?, ?, 'reliability', ?)""",
                (project["owner_id"], admin["id"],
                 f"Project '{project['title']}' outcome: {outcome}. {outcome_notes}",
                 project_id)
            )

        # Auto-endorse skills if successful
        if outcome == "successful" and project["owner_id"]:
            project_skills = conn.execute(
                "SELECT skill_id FROM project_skills WHERE project_id = ? AND is_required = 1",
                (project_id,)
            ).fetchall()
            for ps in project_skills:
                conn.execute(
                    """INSERT OR REPLACE INTO skill_endorsements
                       (volunteer_id, skill_id, endorsed_by_id, source, source_id, rating, notes)
                       VALUES (?, ?, ?, 'project_outcome', ?, 'verified', ?)""",
                    (project["owner_id"], ps["skill_id"], admin["id"],
                     project_id, f"Successfully delivered: {project['title']}")
                )

        return {"message": f"Project outcome recorded as {outcome}"}


# ============================================
# ADMIN VOLUNTEER DETAIL (enriched view)
# ============================================

@app.get("/api/admin/volunteers/{volunteer_id}")
def get_admin_volunteer_view(
    volunteer_id: int,
    admin: Dict = Depends(require_admin)
) -> Dict:
    """Get comprehensive admin view of a volunteer with notes, endorsements, and history."""
    conn = get_db()
    volunteer = conn.execute(
        "SELECT * FROM volunteers WHERE id = ?", (volunteer_id,)
    ).fetchone()

    if not volunteer:
        conn.close()
        raise HTTPException(status_code=404, detail="Volunteer not found")

    result = enrich_volunteer(conn, dict(volunteer), show_contact=True)

    # Admin notes
    notes = conn.execute(
        """SELECT an.*, v.name as author_name
           FROM admin_notes an
           JOIN volunteers v ON an.author_id = v.id
           WHERE an.volunteer_id = ?
           ORDER BY an.created_at DESC""",
        (volunteer_id,)
    ).fetchall()
    result["admin_notes"] = rows_to_list(notes)

    # Endorsements
    endorsements = conn.execute(
        """SELECT se.*, s.name as skill_name, v.name as endorsed_by_name
           FROM skill_endorsements se
           JOIN skills s ON se.skill_id = s.id
           JOIN volunteers v ON se.endorsed_by_id = v.id
           WHERE se.volunteer_id = ?
           ORDER BY se.created_at DESC""",
        (volunteer_id,)
    ).fetchall()
    result["endorsements"] = rows_to_list(endorsements)

    # Starter task history
    tasks = conn.execute(
        """SELECT st.*, s.name as skill_name
           FROM starter_tasks st
           LEFT JOIN skills s ON st.skill_id = s.id
           WHERE st.assigned_to_id = ?
           ORDER BY st.created_at DESC""",
        (volunteer_id,)
    ).fetchall()
    result["starter_tasks"] = rows_to_list(tasks)

    # Project history with outcomes
    projects = conn.execute(
        """SELECT * FROM projects
           WHERE owner_id = ? OR proposed_by_id = ?
           ORDER BY created_at DESC""",
        (volunteer_id, volunteer_id)
    ).fetchall()
    result["project_history"] = rows_to_list(projects)

    conn.close()
    return result


# ============================================
# ADMIN MANAGEMENT ENDPOINTS
# ============================================

@app.get("/api/admin/admins")
def list_admins(admin: Dict = Depends(require_admin)) -> List[Dict]:
    """List all admin users."""
    conn = get_db()
    admins = conn.execute(
        """SELECT id, name, email, created_at
           FROM volunteers
           WHERE is_admin = 1 AND deleted_at IS NULL
           ORDER BY name"""
    ).fetchall()
    conn.close()
    return rows_to_list(admins)


@app.post("/api/admin/admins/invite")
def invite_admin(data: AdminInviteCreate, admin: Dict = Depends(require_admin)) -> Dict:
    """Send an admin invite to an email address."""
    invite_token = secrets.token_urlsafe(32)
    expires_at = (datetime.now() + timedelta(days=7)).isoformat()

    with db_transaction() as conn:
        # Check if already admin
        existing = conn.execute(
            "SELECT * FROM volunteers WHERE email = ? AND is_admin = 1",
            (data.email,)
        ).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="This person is already an admin")

        # Check for pending invite
        pending = conn.execute(
            "SELECT * FROM admin_invites WHERE email = ? AND status = 'pending' AND expires_at > ?",
            (data.email, datetime.now().isoformat())
        ).fetchone()
        if pending:
            raise HTTPException(status_code=400, detail="An invite is already pending for this email")

        conn.execute(
            """INSERT INTO admin_invites (email, invite_token, invited_by_id, expires_at)
               VALUES (?, ?, ?, ?)""",
            (data.email, invite_token, admin["id"], expires_at)
        )

    # Send admin invite email
    email_sent = send_admin_invite_email(
        to=data.email,
        invite_token=invite_token,
        invited_by=admin["name"]
    )

    result = {
        "message": f"Invite {'sent' if email_sent else 'created'} for {data.email}",
        "expires_at": expires_at
    }

    # In dev/test mode (no real email API or stub mode), include token for manual sharing
    if not is_real_email_sending():
        result["_dev_invite_token"] = invite_token
        result["_dev_invite_url"] = f"/static/accept-invite.html?token={invite_token}"
        result["_dev_note"] = "Email not configured. Share link manually."

    return result


@app.post("/api/admin/admins/accept-invite")
def accept_admin_invite(
    invite_token: str = Query(...),
    volunteer: Dict = Depends(require_auth)
) -> Dict:
    """Accept an admin invite using a token."""
    conn = get_db()
    invite = conn.execute(
        """SELECT * FROM admin_invites
           WHERE invite_token = ? AND status = 'pending' AND expires_at > ?""",
        (invite_token, datetime.now().isoformat())
    ).fetchone()
    conn.close()

    if not invite:
        raise HTTPException(status_code=404, detail="Invalid or expired invite")

    # Check email matches
    if invite["email"].lower() != volunteer["email"].lower():
        raise HTTPException(status_code=403, detail="This invite is for a different email address")

    with db_transaction() as conn:
        # Promote to admin
        conn.execute(
            "UPDATE volunteers SET is_admin = 1 WHERE id = ?",
            (volunteer["id"],)
        )

        # Mark invite as accepted
        conn.execute(
            """UPDATE admin_invites
               SET status = 'accepted', accepted_by_id = ?, accepted_at = ?
               WHERE id = ?""",
            (volunteer["id"], datetime.now().isoformat(), invite["id"])
        )

    return {"message": "You are now an admin!"}


@app.delete("/api/admin/admins/{volunteer_id}")
def revoke_admin(volunteer_id: int, admin: Dict = Depends(require_admin)) -> Dict:
    """Revoke admin access from a volunteer."""
    if volunteer_id == admin["id"]:
        raise HTTPException(status_code=400, detail="You cannot revoke your own admin access")

    conn = get_db()
    target = conn.execute(
        "SELECT * FROM volunteers WHERE id = ? AND is_admin = 1",
        (volunteer_id,)
    ).fetchone()
    conn.close()

    if not target:
        raise HTTPException(status_code=404, detail="Admin not found")

    with db_transaction() as conn:
        conn.execute(
            "UPDATE volunteers SET is_admin = 0 WHERE id = ?",
            (volunteer_id,)
        )

    return {"message": f"Admin access revoked for {target['name']}"}


@app.get("/api/admin/invites")
def list_admin_invites(admin: Dict = Depends(require_admin)) -> List[Dict]:
    """List all admin invites."""
    conn = get_db()
    invites = conn.execute(
        """SELECT ai.*, v.name as invited_by_name
           FROM admin_invites ai
           JOIN volunteers v ON ai.invited_by_id = v.id
           ORDER BY ai.created_at DESC"""
    ).fetchall()
    conn.close()
    return rows_to_list(invites)


@app.delete("/api/admin/invites/{invite_id}")
def revoke_invite(invite_id: int, admin: Dict = Depends(require_admin)) -> Dict:
    """Revoke a pending admin invite."""
    with db_transaction() as conn:
        result = conn.execute(
            "UPDATE admin_invites SET status = 'revoked' WHERE id = ? AND status = 'pending'",
            (invite_id,)
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Invite not found or already used")

    return {"message": "Invite revoked"}


# ============================================
# BUG REPORT ENDPOINTS
# ============================================

@app.post("/api/bug-reports")
def create_bug_report(
    data: BugReportCreate,
    volunteer: Optional[Dict] = Depends(get_current_volunteer)
) -> Dict:
    """Submit a bug report. Works for logged-in and anonymous users."""
    with db_transaction() as conn:
        cursor = conn.execute(
            """INSERT INTO bug_reports
               (reporter_id, reporter_email, title, description, page_url, category, severity)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                volunteer["id"] if volunteer else None,
                data.reporter_email if not volunteer else volunteer["email"],
                data.title,
                data.description,
                data.page_url,
                data.category,
                data.severity
            )
        )
        report_id = cursor.lastrowid

        # Notify admins
        admins = conn.execute("SELECT id FROM volunteers WHERE is_admin = 1").fetchall()
        for admin in admins:
            create_notification(
                conn, admin["id"], "new_bug_report",
                f"New {data.category}: {data.title}",
                f"Severity: {data.severity}",
                f"/static/admin/bugs.html"
            )

    return {"id": report_id, "message": "Thank you for your feedback!"}


@app.get("/api/admin/bug-reports")
def list_bug_reports(
    status: Optional[str] = None,
    admin: Dict = Depends(require_admin)
) -> List[Dict]:
    """List all bug reports."""
    conn = get_db()

    query = """SELECT br.*, v.name as reporter_name
               FROM bug_reports br
               LEFT JOIN volunteers v ON br.reporter_id = v.id"""

    if status:
        query += " WHERE br.status = ?"
        reports = conn.execute(query + " ORDER BY br.created_at DESC", (status,)).fetchall()
    else:
        reports = conn.execute(query + " ORDER BY br.created_at DESC").fetchall()

    conn.close()
    return rows_to_list(reports)


@app.put("/api/admin/bug-reports/{report_id}")
def update_bug_report(
    report_id: int,
    data: BugReportUpdate,
    admin: Dict = Depends(require_admin)
) -> Dict:
    """Update bug report status."""
    with db_transaction() as conn:
        report = conn.execute(
            "SELECT * FROM bug_reports WHERE id = ?", (report_id,)
        ).fetchone()

        if not report:
            raise HTTPException(status_code=404, detail="Bug report not found")

        updates = []
        params = []

        if data.status:
            updates.append("status = ?")
            params.append(data.status)
            if data.status in ("resolved", "wont_fix"):
                updates.append("resolved_by_id = ?")
                params.append(admin["id"])
                updates.append("resolved_at = ?")
                params.append(datetime.now().isoformat())

        if data.resolution_notes is not None:
            updates.append("resolution_notes = ?")
            params.append(data.resolution_notes)

        if updates:
            params.append(report_id)
            conn.execute(
                f"UPDATE bug_reports SET {', '.join(updates)} WHERE id = ?",
                params
            )

    return {"message": "Bug report updated"}


# ============================================
# INTEREST ENDPOINTS
# ============================================

class AssignVolunteer(BaseModel):
    volunteer_id: int
    interest_type: str = "want_to_contribute"


@app.post("/api/projects/{project_id}/assign")
def assign_volunteer_to_project(
    project_id: int,
    data: AssignVolunteer,
    volunteer: Dict = Depends(require_auth)
) -> Dict:
    """Assign a volunteer directly to a project (owner or admin only)."""
    conn = get_db()
    project = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    conn.close()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    is_owner = project["owner_id"] == volunteer["id"]
    is_admin = volunteer.get("is_admin")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="Only project owner or admin can assign volunteers")

    with db_transaction() as conn:
        # Check if already has an active interest
        existing = conn.execute(
            "SELECT * FROM project_interests WHERE project_id = ? AND volunteer_id = ? AND status != 'withdrawn'",
            (project_id, data.volunteer_id)
        ).fetchone()

        if existing:
            if existing["status"] == "pending":
                # Auto-accept existing pending interest
                conn.execute(
                    "UPDATE project_interests SET status = 'accepted', responded_at = ? WHERE id = ?",
                    (datetime.now().isoformat(), existing["id"])
                )
            elif existing["status"] == "accepted":
                return {"message": "This volunteer is already assigned to this project"}
        else:
            # Create and auto-accept interest
            conn.execute(
                """INSERT INTO project_interests (volunteer_id, project_id, interest_type, message, status, responded_at)
                   VALUES (?, ?, ?, 'Assigned by admin/owner', 'accepted', ?)""",
                (data.volunteer_id, project_id, data.interest_type, datetime.now().isoformat())
            )

        # Notify the volunteer
        assignee = conn.execute("SELECT name, email FROM volunteers WHERE id = ?", (data.volunteer_id,)).fetchone()
        if assignee:
            create_notification(
                conn, data.volunteer_id, "assigned_to_project",
                f"You've been assigned to '{project['title']}'",
                f"Assigned by {volunteer['name']}",
                f"/static/project.html?id={project_id}"
            )
            try:
                if assignee["email"]:
                    send_project_notification_email(
                        to=assignee["email"], name=assignee["name"],
                        subject=f"You've been assigned to '{project['title']}'",
                        message=f"<strong>{volunteer['name']}</strong> has assigned you to the project <strong>{project['title']}</strong>.",
                        project_title=project["title"], project_id=project_id
                    )
            except Exception as e:
                print(f"[NOTIFY ERROR] Assignment email failed: {e}")

    return {"message": f"Volunteer assigned to project"}

@app.post("/api/projects/{project_id}/interest")
def express_interest(
    project_id: int,
    data: InterestCreate,
    volunteer: Dict = Depends(require_auth)
) -> Dict:
    """Express interest in a project."""
    conn = get_db()
    # Check if seeking flags column exists
    try:
        conn.execute("SELECT is_seeking_help FROM projects LIMIT 1")
        project = conn.execute(
            """SELECT * FROM projects WHERE id = ? AND status NOT IN ('completed', 'archived')
               AND (is_seeking_help = 1 OR is_seeking_owner = 1 OR status IN ('seeking_owner', 'seeking_help'))""",
            (project_id,)
        ).fetchone()
    except Exception:
        project = conn.execute(
            "SELECT * FROM projects WHERE id = ? AND status IN ('seeking_owner', 'seeking_help')",
            (project_id,)
        ).fetchone()

    if not project:
        conn.close()
        raise HTTPException(status_code=404, detail="This project is not currently seeking volunteers")

    existing = conn.execute(
        "SELECT * FROM project_interests WHERE project_id = ? AND volunteer_id = ?",
        (project_id, volunteer["id"])
    ).fetchone()
    conn.close()

    if existing and existing["status"] != "withdrawn":
        raise HTTPException(status_code=400, detail="You've already expressed interest")

    try:
        with db_transaction() as conn:
            if existing:
                # Revive a previously withdrawn interest
                conn.execute(
                    """UPDATE project_interests
                       SET interest_type = ?, message = ?, status = 'pending', responded_at = NULL, response_message = NULL
                       WHERE project_id = ? AND volunteer_id = ?""",
                    (data.interest_type, data.message, project_id, volunteer["id"])
                )
            else:
                conn.execute(
                    """INSERT INTO project_interests (volunteer_id, project_id, interest_type, message)
                       VALUES (?, ?, ?, ?)""",
                    (volunteer["id"], project_id, data.interest_type, data.message)
                )

            interest_label = "own / lead" if data.interest_type == "want_to_own" else "contribute to"

            # Notify and email the project owner (non-blocking — email failures shouldn't break the interest)
            try:
                if project["owner_id"]:
                    create_notification(
                        conn, project["owner_id"], "new_interest",
                        f"Someone's interested in '{project['title']}'!",
                        f"{volunteer['name']} wants to {interest_label}",
                        f"/static/project.html?id={project_id}"
                    )
                    owner = conn.execute(
                        "SELECT name, email FROM volunteers WHERE id = ?",
                        (project["owner_id"],)
                    ).fetchone()
                    if owner and owner["email"]:
                        extra = ""
                        if data.message:
                            extra = f'<div style="padding: 12px; background: #f7fafc; border-radius: 8px; margin: 16px 0;"><strong>Their message:</strong> {data.message}</div>'
                        send_project_notification_email(
                            to=owner["email"], name=owner["name"],
                            subject=f"{volunteer['name']} wants to {interest_label} '{project['title']}'",
                            message=f"<strong>{volunteer['name']}</strong> has expressed interest in your project <strong>{project['title']}</strong>. Log in to review and accept or decline.",
                            project_title=project["title"], project_id=project_id,
                            extra_html=extra
                        )
            except Exception as e:
                print(f"[NOTIFY ERROR] Owner notification failed for interest: {e}")

            # Also notify all admins (non-blocking)
            try:
                admins = conn.execute(
                    "SELECT id, name, email FROM volunteers WHERE is_admin = 1 AND deleted_at IS NULL"
                ).fetchall()
                for admin in admins:
                    if admin["id"] == project["owner_id"]:
                        continue
                    create_notification(
                        conn, admin["id"], "new_interest",
                        f"New interest in '{project['title']}'",
                        f"{volunteer['name']} wants to {interest_label}",
                        f"/static/project.html?id={project_id}"
                    )
                    if admin["email"]:
                        send_project_notification_email(
                            to=admin["email"], name=admin["name"],
                            subject=f"New interest: {volunteer['name']} → '{project['title']}'",
                            message=f"<strong>{volunteer['name']}</strong> wants to {interest_label} the project <strong>{project['title']}</strong>.",
                            project_title=project["title"], project_id=project_id
                        )
            except Exception as e:
                print(f"[NOTIFY ERROR] Admin notification failed for interest: {e}")
    except HTTPException:
        raise
    except Exception:
        raise AppError("E", "Something went wrong expressing interest. Please try again or contact us.")

    return {"message": "Interest expressed successfully"}


@app.put("/api/projects/{project_id}/interest/{interest_id}")
def respond_to_interest(
    project_id: int,
    interest_id: int,
    data: InterestResponse,
    volunteer: Dict = Depends(require_auth)
) -> Dict:
    """Respond to an expression of interest (owner only)."""
    conn = get_db()
    project = conn.execute(
        "SELECT * FROM projects WHERE id = ?",
        (project_id,)
    ).fetchone()

    is_owner = project and project["owner_id"] == volunteer["id"]
    is_admin = volunteer.get("is_admin")

    if not project or not (is_owner or is_admin):
        conn.close()
        raise HTTPException(status_code=403, detail="Not authorized")

    interest = conn.execute(
        "SELECT * FROM project_interests WHERE id = ? AND project_id = ?",
        (interest_id, project_id)
    ).fetchone()
    conn.close()

    if not interest:
        raise HTTPException(status_code=404, detail="Interest not found")

    with db_transaction() as conn:
        conn.execute(
            """UPDATE project_interests
               SET status = ?, response_message = ?, responded_at = ?
               WHERE id = ?""",
            (data.status, data.response_message, datetime.now().isoformat(), interest_id)
        )

        # Notify the interested volunteer
        status_text = "accepted" if data.status == "accepted" else "declined"
        create_notification(
            conn, interest["volunteer_id"], f"interest_{status_text}",
            f"Your interest in '{project['title']}' was {status_text}",
            data.response_message,
            f"/static/project.html?id={project_id}"
        )

        # If accepting as owner, assign them. Move to in_progress if there are
        # already open tasks, otherwise needs_tasks so the owner can add them first.
        if data.status == "accepted" and interest["interest_type"] == "want_to_own":
            open_task_count = conn.execute(
                "SELECT COUNT(*) FROM project_tasks WHERE project_id = ? AND status != 'done'",
                (project_id,)
            ).fetchone()[0]
            new_status = 'in_progress' if open_task_count > 0 else 'needs_tasks'
            conn.execute(
                "UPDATE projects SET owner_id = ?, status = ? WHERE id = ?",
                (interest["volunteer_id"], new_status, project_id)
            )

        # Email the volunteer
        vol = conn.execute(
            "SELECT name, email FROM volunteers WHERE id = ?",
            (interest["volunteer_id"],)
        ).fetchone()
        if vol and vol["email"]:
            extra = ""
            if data.response_message:
                extra = f'<div style="padding: 12px; background: #f7fafc; border-radius: 8px; margin: 16px 0;"><strong>Message:</strong> {data.response_message}</div>'
            send_project_notification_email(
                to=vol["email"], name=vol["name"],
                subject=f"Your interest in '{project['title']}' was {status_text}",
                message=f"The team has <strong>{status_text}</strong> your interest in the project <strong>{project['title']}</strong>.",
                project_title=project["title"], project_id=project_id,
                extra_html=extra
            )

        return {"message": f"Interest {status_text}"}


@app.delete("/api/projects/{project_id}/interest")
def withdraw_interest(
    project_id: int,
    volunteer: Dict = Depends(require_auth)
) -> Dict:
    """Withdraw your interest in a project."""
    with db_transaction() as conn:
        result = conn.execute(
            """UPDATE project_interests
               SET status = 'withdrawn'
               WHERE project_id = ? AND volunteer_id = ? AND status = 'pending'""",
            (project_id, volunteer["id"])
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="No pending interest found")
        return {"message": "Interest withdrawn"}


# ============================================
# CONTACT ENDPOINTS
# ============================================

@app.post("/api/contact/{volunteer_id}")
def send_contact_message(
    volunteer_id: int,
    data: ContactMessage,
    sender: Dict = Depends(require_auth)
) -> Dict:
    """Send a relay message to another volunteer via email."""
    if sender["id"] == volunteer_id:
        raise HTTPException(status_code=400, detail="Cannot message yourself")

    conn = get_db()
    recipient = conn.execute(
        """SELECT * FROM volunteers
           WHERE id = ? AND deleted_at IS NULL
           AND consent_contact_by_owners = 1""",
        (volunteer_id,)
    ).fetchone()
    conn.close()

    if not recipient:
        raise HTTPException(status_code=404, detail="Volunteer not found or doesn't accept messages")

    if not recipient["email"]:
        raise HTTPException(status_code=400, detail="This volunteer has no email address on file")

    # Get project title if related
    project_title = None
    if data.related_project_id:
        conn = get_db()
        project = conn.execute(
            "SELECT title FROM projects WHERE id = ?", (data.related_project_id,)
        ).fetchone()
        conn.close()
        if project:
            project_title = project["title"]

    # TODO: The message/notification is only created if email succeeds, meaning it
    # fails entirely in environments without RESEND_API_KEY configured (e.g. local
    # dev and the e2e test suite). Consider saving to contact_messages and creating
    # the notification unconditionally, then treating email as best-effort delivery.

    # Send via email relay
    email_sent = send_relay_message(
        to=recipient["email"],
        to_name=recipient["name"],
        from_name=sender["name"],
        from_email=sender["email"],
        subject=data.subject,
        message=data.message,
        project_title=project_title
    )

    if not email_sent:
        if not is_email_configured():
            raise HTTPException(status_code=503, detail="Email service is not configured. Contact an admin for help.")
        raise HTTPException(status_code=500, detail="Failed to send message. Please try again later.")

    # Create notification for recipient
    with db_transaction() as conn:
        create_notification(
            conn, volunteer_id, "message_received",
            f"Message from {sender['name']}",
            data.subject,
            "/static/dashboard.html"
        )

    return {"message": "Message sent! They'll receive it by email and can reply directly to you."}


@app.get("/api/messages")
def get_messages(volunteer: Dict = Depends(require_auth)) -> Dict:
    """Get messages for current volunteer."""
    conn = get_db()

    received = conn.execute(
        """SELECT cm.*, v.name as from_name
           FROM contact_messages cm
           JOIN volunteers v ON cm.from_volunteer_id = v.id
           WHERE cm.to_volunteer_id = ?
           ORDER BY cm.created_at DESC""",
        (volunteer["id"],)
    ).fetchall()

    sent = conn.execute(
        """SELECT cm.*, v.name as to_name
           FROM contact_messages cm
           JOIN volunteers v ON cm.to_volunteer_id = v.id
           WHERE cm.from_volunteer_id = ?
           ORDER BY cm.created_at DESC""",
        (volunteer["id"],)
    ).fetchall()

    conn.close()
    return {
        "received": rows_to_list(received),
        "sent": rows_to_list(sent)
    }


@app.put("/api/messages/{message_id}/read")
def mark_message_read(
    message_id: int,
    volunteer: Dict = Depends(require_auth)
) -> Dict:
    """Mark a message as read."""
    with db_transaction() as conn:
        result = conn.execute(
            """UPDATE contact_messages SET read_at = ?
               WHERE id = ? AND to_volunteer_id = ?""",
            (datetime.now().isoformat(), message_id, volunteer["id"])
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Message not found")
        return {"message": "Marked as read"}


# ============================================
# NOTIFICATION ENDPOINTS
# ============================================

@app.get("/api/notifications")
def get_notifications(
    unread_only: bool = Query(False),
    volunteer: Dict = Depends(require_auth)
) -> List[Dict]:
    """Get notifications for current volunteer."""
    conn = get_db()

    query = "SELECT * FROM notifications WHERE volunteer_id = ?"
    params = [volunteer["id"]]

    if unread_only:
        query += " AND read_at IS NULL"

    query += " ORDER BY created_at DESC LIMIT 50"

    notifications = conn.execute(query, params).fetchall()
    conn.close()
    return rows_to_list(notifications)


@app.put("/api/notifications/read-all")
def mark_all_read(volunteer: Dict = Depends(require_auth)) -> Dict:
    """Mark all notifications as read."""
    with db_transaction() as conn:
        conn.execute(
            "UPDATE notifications SET read_at = ? WHERE volunteer_id = ? AND read_at IS NULL",
            (datetime.now().isoformat(), volunteer["id"])
        )
        return {"message": "All marked as read"}


@app.get("/api/admin/backup")
def download_backup(admin: Dict = Depends(require_admin)):
    """Download a copy of the database (admin only)."""
    if not DATABASE_PATH.exists():
        raise HTTPException(status_code=404, detail="Database not found")

    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M")
    return FileResponse(
        path=str(DATABASE_PATH),
        filename=f"catalyse-backup-{timestamp}.db",
        media_type="application/octet-stream"
    )


@app.post("/api/admin/backup/run")
def trigger_backup(admin: Dict = Depends(require_admin)) -> Dict:
    """Trigger an immediate backup (admin only)."""
    from backup_service import run_backup, is_b2_configured

    if not is_b2_configured():
        run_backup()
        return {"message": "Local backup created. B2 not configured — set B2_KEY_ID, B2_APP_KEY, B2_BUCKET_NAME to enable cloud backups."}

    run_backup()
    return {"message": "Backup complete (local + B2)"}


# ============================================
# GDPR / PRIVACY ENDPOINTS
# ============================================

@app.get("/api/privacy/export")
def export_my_data(volunteer: Dict = Depends(require_auth)) -> Dict:
    """Export all data for current volunteer (GDPR data portability)."""
    conn = get_db()

    # Get full profile
    profile = conn.execute(
        "SELECT * FROM volunteers WHERE id = ?",
        (volunteer["id"],)
    ).fetchone()
    profile = dict(profile)
    profile.pop("auth_token", None)
    profile.pop("auth_token_expires_at", None)

    # Get skills
    skills = get_volunteer_skills(conn, volunteer["id"])

    # Get projects
    projects = conn.execute(
        "SELECT * FROM projects WHERE owner_id = ? OR proposed_by_id = ?",
        (volunteer["id"], volunteer["id"])
    ).fetchall()

    # Get interests
    interests = conn.execute(
        "SELECT * FROM project_interests WHERE volunteer_id = ?",
        (volunteer["id"],)
    ).fetchall()

    # Get messages
    messages_sent = conn.execute(
        "SELECT * FROM contact_messages WHERE from_volunteer_id = ?",
        (volunteer["id"],)
    ).fetchall()
    messages_received = conn.execute(
        "SELECT * FROM contact_messages WHERE to_volunteer_id = ?",
        (volunteer["id"],)
    ).fetchall()

    conn.close()

    return {
        "exported_at": datetime.now().isoformat(),
        "profile": profile,
        "skills": skills,
        "projects": rows_to_list(projects),
        "interests": rows_to_list(interests),
        "messages_sent": rows_to_list(messages_sent),
        "messages_received": rows_to_list(messages_received)
    }


# ============================================
# DASHBOARD ENDPOINT
# ============================================

@app.get("/api/dashboard")
def get_dashboard(volunteer: Dict = Depends(require_auth)) -> Dict:
    """Get personalized dashboard data."""
    conn = get_db()

    # Get volunteer's skill IDs
    skill_rows = conn.execute(
        "SELECT skill_id FROM volunteer_skills WHERE volunteer_id = ?",
        (volunteer["id"],)
    ).fetchall()
    volunteer_skill_ids = {row["skill_id"] for row in skill_rows}

    # Projects I own
    owned_projects = conn.execute(
        "SELECT * FROM projects WHERE owner_id = ? ORDER BY updated_at DESC",
        (volunteer["id"],)
    ).fetchall()
    owned_projects = [enrich_project(conn, dict(p)) for p in owned_projects]

    # Projects I proposed (not owned)
    proposed_projects = conn.execute(
        """SELECT * FROM projects
           WHERE proposed_by_id = ? AND (owner_id IS NULL OR owner_id != ?)
           ORDER BY created_at DESC""",
        (volunteer["id"], volunteer["id"])
    ).fetchall()
    proposed_projects = [enrich_project(conn, dict(p)) for p in proposed_projects]

    # My interests
    my_interests = conn.execute(
        """SELECT pi.*, p.title as project_title, p.status as project_status
           FROM project_interests pi
           JOIN projects p ON pi.project_id = p.id
           WHERE pi.volunteer_id = ?
           ORDER BY pi.created_at DESC""",
        (volunteer["id"],)
    ).fetchall()

    # Suggested projects (matching my skills)
    # Check if seeking flags exist for the query
    try:
        conn.execute("SELECT is_seeking_help FROM projects LIMIT 1")
        seeking_clause = "(p.is_seeking_help = 1 OR p.is_seeking_owner = 1 OR p.status IN ('seeking_owner', 'seeking_help'))"
    except Exception:
        seeking_clause = "p.status IN ('seeking_owner', 'seeking_help')"

    suggested = conn.execute(
        """SELECT DISTINCT p.*
           FROM projects p
           JOIN project_skills ps ON p.id = ps.project_id
           WHERE ps.skill_id IN ({})
           AND {}
           AND p.owner_id != ?
           AND p.id NOT IN (
               SELECT project_id FROM project_interests WHERE volunteer_id = ?
           )
           ORDER BY p.created_at DESC
           LIMIT 5""".format(
               ",".join("?" * len(volunteer_skill_ids)) if volunteer_skill_ids else "0",
               seeking_clause
           ),
        list(volunteer_skill_ids) + [volunteer["id"], volunteer["id"]]
    ).fetchall() if volunteer_skill_ids else []
    suggested = [enrich_project(conn, dict(p), volunteer_skill_ids) for p in suggested]

    # Unread notifications count
    unread_count = conn.execute(
        "SELECT COUNT(*) FROM notifications WHERE volunteer_id = ? AND read_at IS NULL",
        (volunteer["id"],)
    ).fetchone()[0]

    conn.close()

    return {
        "owned_projects": owned_projects,
        "proposed_projects": proposed_projects,
        "my_interests": rows_to_list(my_interests),
        "suggested_projects": suggested,
        "unread_notification_count": unread_count
    }


# ============================================
# STATIC FILES & STARTUP
# ============================================

# Serve from dist/ (built artefact with hashed URLs) if available, else fall back to static/
_dist_path = Path(__file__).parent / "dist"
_static_path = Path(__file__).parent / "static"
_serve_path = _dist_path if _dist_path.exists() else _static_path
app.mount("/static", StaticFiles(directory=_serve_path), name="static")


@app.get("/")
def serve_index():
    """Serve the main page."""
    index_path = _serve_path / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return {"message": "Welcome to Catalyse API", "docs": "/docs"}


@app.on_event("startup")
def startup():
    """Initialize database and start background schedulers."""
    init_db()
    try:
        start_backup_scheduler()
    except Exception as e:
        print(f"[STARTUP] Backup scheduler failed to start: {e}")
    try:
        start_digest_scheduler()
    except Exception as e:
        print(f"[STARTUP] Digest scheduler failed to start: {e}")


def start_backup_scheduler():
    """Start a background thread that runs daily backups."""
    import threading
    import time
    from backup_service import run_backup, is_b2_configured

    def backup_loop():
        # Wait 60 seconds after startup before first backup
        time.sleep(60)
        while True:
            try:
                run_backup()
            except Exception as e:
                print(f"[BACKUP ERROR] Unexpected error in backup loop: {e}")
            # Sleep 24 hours
            time.sleep(24 * 60 * 60)

    thread = threading.Thread(target=backup_loop, daemon=True)
    thread.start()
    print(f"[BACKUP] Scheduler started (B2 configured: {is_b2_configured()})")


def start_digest_scheduler():
    """Start a background thread that sends fortnightly digest emails."""
    import threading
    import time
    from digest_service import send_fortnightly_digest
    from email_service import is_email_configured

    def digest_loop():
        # Wait 5 minutes after startup before first check
        time.sleep(300)
        while True:
            try:
                send_fortnightly_digest()
            except Exception as e:
                print(f"[DIGEST ERROR] Unexpected error in digest loop: {e}")
            # Sleep 14 days
            time.sleep(14 * 24 * 60 * 60)

    thread = threading.Thread(target=digest_loop, daemon=True)
    thread.start()
    print(f"[DIGEST] Scheduler started (email configured: {is_email_configured()})")


# ============================================
# RUN SERVER
# ============================================

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)
