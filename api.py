"""
Catalyse: PauseAI UK Volunteer & Project Matching Platform
FastAPI Backend
"""

import os
import sqlite3
import secrets
import hashlib
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, List, Dict, Any
from contextlib import contextmanager

from fastapi import FastAPI, HTTPException, Depends, Header, Query, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, EmailStr, Field

# ============================================
# APP SETUP
# ============================================

app = FastAPI(
    title="Catalyse API",
    description="Volunteer & Project Matching for PauseAI UK",
    version="1.0.0"
)

# Use RAILWAY_VOLUME_MOUNT_PATH for persistent storage if available,
# otherwise store next to the app (local dev)
_data_dir = os.environ.get("RAILWAY_VOLUME_MOUNT_PATH", str(Path(__file__).parent))
DATABASE_PATH = Path(_data_dir) / "catalyse.db"


def get_db():
    """Get database connection with row factory."""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
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


# ============================================
# PYDANTIC MODELS
# ============================================

# --- Auth ---
class VolunteerSignup(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    email: EmailStr
    bio: Optional[str] = None
    discord_handle: Optional[str] = None
    signal_number: Optional[str] = None
    whatsapp_number: Optional[str] = None
    contact_preference: Optional[str] = None
    contact_notes: Optional[str] = None
    availability_hours_per_week: Optional[int] = None
    location: Optional[str] = None
    share_contact_directly: bool = False
    other_skills: Optional[str] = None
    skill_ids: List[int] = []
    consent_profile_visible: bool = True
    consent_contact_by_owners: bool = True


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
    share_contact_directly: Optional[bool] = None
    other_skills: Optional[str] = None
    skill_ids: Optional[List[int]] = None
    profile_visible: Optional[bool] = None


class LoginRequest(BaseModel):
    email: EmailStr


# --- Projects ---
class ProjectCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    description: str = Field(..., min_length=10)
    project_type: Optional[str] = None  # sprint, container, ongoing, one_off
    estimated_duration: Optional[str] = None  # e.g., "2 weeks", "3 months"
    time_commitment_hours_per_week: Optional[int] = None
    urgency: str = "medium"
    skill_ids: List[int] = []
    skill_required_map: Dict[int, bool] = {}  # skill_id -> is_required
    want_to_own: bool = False  # If true, proposer becomes owner
    collaboration_link: Optional[str] = None


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
    owner_id: Optional[int] = None
    outcome: Optional[str] = None
    outcome_notes: Optional[str] = None


class ProjectReview(BaseModel):
    status: str  # 'approved', 'needs_discussion'
    review_notes: Optional[str] = None
    feedback_to_proposer: Optional[str] = None
    target_status: Optional[str] = None  # 'seeking_owner' or 'seeking_help' if approved


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


# ============================================
# AUTH HELPERS
# ============================================

def generate_auth_token() -> str:
    """Generate a secure random token."""
    return secrets.token_urlsafe(32)


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

        # Generate auth token
        auth_token = generate_auth_token()

        # Insert volunteer
        cursor = conn.execute(
            """INSERT INTO volunteers (
                name, email, bio, discord_handle, signal_number, whatsapp_number,
                contact_preference, contact_notes, availability_hours_per_week,
                location, share_contact_directly, other_skills,
                consent_profile_visible, consent_contact_by_owners, consent_given_at,
                auth_token
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                data.name, data.email, data.bio, data.discord_handle,
                data.signal_number, data.whatsapp_number, data.contact_preference,
                data.contact_notes, data.availability_hours_per_week, data.location,
                data.share_contact_directly, data.other_skills,
                data.consent_profile_visible, data.consent_contact_by_owners,
                datetime.now().isoformat(), auth_token
            )
        )
        volunteer_id = cursor.lastrowid

        # Add skills
        for skill_id in data.skill_ids:
            conn.execute(
                "INSERT OR IGNORE INTO volunteer_skills (volunteer_id, skill_id) VALUES (?, ?)",
                (volunteer_id, skill_id)
            )

        return {
            "id": volunteer_id,
            "auth_token": auth_token,
            "message": "Welcome to Catalyse!"
        }


@app.post("/api/auth/login")
def login(data: LoginRequest) -> Dict:
    """
    Login with email - sends magic link (in production).
    For now, returns token directly for development.
    """
    conn = get_db()
    volunteer = conn.execute(
        "SELECT * FROM volunteers WHERE email = ? AND deleted_at IS NULL",
        (data.email,)
    ).fetchone()
    conn.close()

    if not volunteer:
        raise HTTPException(status_code=404, detail="No account found with this email")

    # Generate new token
    auth_token = generate_auth_token()

    with db_transaction() as conn:
        conn.execute(
            "UPDATE volunteers SET auth_token = ?, updated_at = ? WHERE id = ?",
            (auth_token, datetime.now().isoformat(), volunteer["id"])
        )

    # In production: send magic link email
    # For development: return token directly
    return {
        "message": "Login successful",
        "auth_token": auth_token  # Remove in production, send via email instead
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
    limit: int = Query(50, le=100),
    offset: int = Query(0)
) -> Dict:
    """List volunteers (public profiles only)."""
    conn = get_db()

    query = """
        SELECT DISTINCT v.id, v.name, v.bio, v.availability_hours_per_week,
               v.location, v.other_skills, v.created_at
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

    # Get total count
    count_query = query.replace(
        "SELECT DISTINCT v.id, v.name, v.bio, v.availability_hours_per_week, v.location, v.other_skills, v.created_at",
        "SELECT COUNT(DISTINCT v.id)"
    )
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
        # Show contact if they share directly AND viewer is logged in
        elif volunteer["share_contact_directly"] and volunteer["consent_contact_by_owners"]:
            show_contact = True

    result = enrich_volunteer(conn, dict(volunteer), show_contact=show_contact)

    # Get their projects
    projects = conn.execute(
        """SELECT * FROM projects
           WHERE (owner_id = ? OR proposed_by_id = ?)
           AND status NOT IN ('archived', 'pending_review', 'needs_discussion')
           ORDER BY created_at DESC""",
        (volunteer_id, volunteer_id)
    ).fetchall()
    result["projects"] = rows_to_list(projects)

    conn.close()
    return result


@app.put("/api/volunteers/me")
def update_me(data: VolunteerUpdate, volunteer: Dict = Depends(require_auth)) -> Dict:
    """Update current volunteer's profile."""
    with db_transaction() as conn:
        updates = []
        params = []

        for field in ["name", "bio", "discord_handle", "signal_number",
                      "whatsapp_number", "contact_preference", "contact_notes",
                      "availability_hours_per_week", "location",
                      "share_contact_directly", "other_skills", "profile_visible"]:
            value = getattr(data, field, None)
            if value is not None:
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
        query += " AND p.status IN ('seeking_owner', 'seeking_help', 'in_progress', 'completed')"

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

    if is_org_proposed is not None:
        query += " AND p.is_org_proposed = ?"
        params.append(is_org_proposed)

    # Get total count
    count_query = query.replace("SELECT DISTINCT p.*", "SELECT COUNT(DISTINCT p.id)")
    total = conn.execute(count_query, params).fetchone()[0]

    # Add ordering
    if sort_by == "urgency":
        query += " ORDER BY CASE p.urgency WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, p.created_at DESC"
    else:
        query += " ORDER BY p.created_at DESC"

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

        # Check if current user has expressed interest
        my_interest = conn.execute(
            "SELECT * FROM project_interests WHERE project_id = ? AND volunteer_id = ?",
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
    with db_transaction() as conn:
        status = "pending_review"
        owner_id = volunteer["id"] if data.want_to_own else None

        cursor = conn.execute(
            """INSERT INTO projects (
                title, description, status, owner_id, proposed_by_id,
                is_org_proposed, project_type, estimated_duration,
                time_commitment_hours_per_week, urgency, collaboration_link
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                data.title, data.description, status, owner_id, volunteer["id"],
                False, data.project_type, data.estimated_duration,
                data.time_commitment_hours_per_week, data.urgency,
                data.collaboration_link
            )
        )
        project_id = cursor.lastrowid

        # Add skills
        for skill_id in data.skill_ids:
            is_required = data.skill_required_map.get(skill_id, True)
            conn.execute(
                "INSERT INTO project_skills (project_id, skill_id, is_required) VALUES (?, ?, ?)",
                (project_id, skill_id, is_required)
            )

        # Notify admins
        admins = conn.execute("SELECT id FROM volunteers WHERE is_admin = 1").fetchall()
        for admin in admins:
            create_notification(
                conn, admin["id"], "new_project_proposal",
                f"New project proposal: {data.title}",
                f"Proposed by {volunteer['name']}",
                f"/admin/triage"
            )

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

        for field in ["title", "description", "status", "project_type", "estimated_duration",
                      "time_commitment_hours_per_week", "urgency", "collaboration_link", "owner_id"]:
            value = getattr(data, field, None)
            if value is not None:
                # Non-admins can't change status directly
                if field == "status" and not is_admin:
                    continue
                updates.append(f"{field} = ?")
                params.append(value)

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

        updated = conn.execute(
            "SELECT * FROM projects WHERE id = ?",
            (project_id,)
        ).fetchone()
        return enrich_project(conn, dict(updated))


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
            new_status = data.target_status or "seeking_owner"
            conn.execute(
                """UPDATE projects SET
                   status = ?, review_notes = ?, reviewed_by_id = ?, reviewed_at = ?,
                   updated_at = ?
                   WHERE id = ?""",
                (new_status, data.review_notes, admin["id"],
                 datetime.now().isoformat(), datetime.now().isoformat(), project_id)
            )

            # Notify proposer
            if project["proposed_by_id"]:
                create_notification(
                    conn, project["proposed_by_id"], "project_approved",
                    f"Your project '{project['title']}' has been approved!",
                    "It's now visible to other volunteers.",
                    f"/projects/{project_id}"
                )

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
                create_notification(
                    conn, project["proposed_by_id"], "project_needs_discussion",
                    f"Let's discuss your project '{project['title']}'",
                    data.feedback_to_proposer or "A team lead wants to chat about your proposal.",
                    f"/projects/{project_id}"
                )

        return {"message": f"Project marked as {data.status}"}


@app.post("/api/admin/projects")
def create_org_project(
    data: ProjectCreate,
    admin: Dict = Depends(require_admin)
) -> Dict:
    """Create an org-proposed project (skips review)."""
    with db_transaction() as conn:
        status = "seeking_owner" if not data.want_to_own else "seeking_help"

        cursor = conn.execute(
            """INSERT INTO projects (
                title, description, status, owner_id, proposed_by_id,
                is_org_proposed, time_commitment_hours_per_week, urgency,
                collaboration_link
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                data.title, data.description, status,
                admin["id"] if data.want_to_own else None,
                admin["id"], True, data.time_commitment_hours_per_week,
                data.urgency, data.collaboration_link
            )
        )
        project_id = cursor.lastrowid

        for skill_id in data.skill_ids:
            is_required = data.skill_required_map.get(skill_id, True)
            conn.execute(
                "INSERT INTO project_skills (project_id, skill_id, is_required) VALUES (?, ?, ?)",
                (project_id, skill_id, is_required)
            )

        return {"id": project_id, "message": "Org project created"}


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
            "seeking_help": conn.execute(
                "SELECT COUNT(*) FROM projects WHERE status IN ('seeking_owner', 'seeking_help')"
            ).fetchone()[0],
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
    outcome: str = Query(...),
    outcome_notes: Optional[str] = Query(None),
    admin: Dict = Depends(require_admin)
) -> Dict:
    """Record the outcome of a completed project."""
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
# INTEREST ENDPOINTS
# ============================================

@app.post("/api/projects/{project_id}/interest")
def express_interest(
    project_id: int,
    data: InterestCreate,
    volunteer: Dict = Depends(require_auth)
) -> Dict:
    """Express interest in a project."""
    conn = get_db()
    project = conn.execute(
        "SELECT * FROM projects WHERE id = ? AND status IN ('seeking_owner', 'seeking_help')",
        (project_id,)
    ).fetchone()

    if not project:
        conn.close()
        raise HTTPException(status_code=404, detail="Project not available")

    existing = conn.execute(
        "SELECT * FROM project_interests WHERE project_id = ? AND volunteer_id = ?",
        (project_id, volunteer["id"])
    ).fetchone()
    conn.close()

    if existing:
        raise HTTPException(status_code=400, detail="You've already expressed interest")

    with db_transaction() as conn:
        conn.execute(
            """INSERT INTO project_interests (volunteer_id, project_id, interest_type, message)
               VALUES (?, ?, ?, ?)""",
            (volunteer["id"], project_id, data.interest_type, data.message)
        )

        # Notify owner
        if project["owner_id"]:
            create_notification(
                conn, project["owner_id"], "new_interest",
                f"Someone's interested in '{project['title']}'!",
                f"{volunteer['name']} wants to {data.interest_type.replace('_', ' ')}",
                f"/projects/{project_id}"
            )

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

    if not project or project["owner_id"] != volunteer["id"]:
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
            f"/projects/{project_id}"
        )

        # If accepting as owner, update project
        if data.status == "accepted" and interest["interest_type"] == "want_to_own":
            conn.execute(
                "UPDATE projects SET owner_id = ?, status = 'in_progress' WHERE id = ?",
                (interest["volunteer_id"], project_id)
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
    """Send a message to another volunteer."""
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

    with db_transaction() as conn:
        conn.execute(
            """INSERT INTO contact_messages
               (from_volunteer_id, to_volunteer_id, subject, message, related_project_id)
               VALUES (?, ?, ?, ?, ?)""",
            (sender["id"], volunteer_id, data.subject, data.message, data.related_project_id)
        )

        create_notification(
            conn, volunteer_id, "message_received",
            f"New message from {sender['name']}",
            data.subject,
            "/dashboard/messages"
        )

        return {"message": "Message sent"}


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


@app.delete("/api/privacy/delete-account")
def request_account_deletion(volunteer: Dict = Depends(require_auth)) -> Dict:
    """Request account deletion (GDPR right to erasure)."""
    with db_transaction() as conn:
        # Log the deletion request
        conn.execute(
            "INSERT INTO deletion_requests (volunteer_id, volunteer_email) VALUES (?, ?)",
            (volunteer["id"], volunteer.get("email"))
        )

        # Soft delete the volunteer
        conn.execute(
            """UPDATE volunteers SET
               deleted_at = ?,
               email = NULL,
               discord_handle = NULL,
               signal_number = NULL,
               whatsapp_number = NULL,
               bio = NULL,
               other_skills = NULL,
               auth_token = NULL,
               name = 'Deleted User'
               WHERE id = ?""",
            (datetime.now().isoformat(), volunteer["id"])
        )

        # Remove from skill associations
        conn.execute(
            "DELETE FROM volunteer_skills WHERE volunteer_id = ?",
            (volunteer["id"],)
        )

        return {
            "message": "Your account has been deleted. Your data has been anonymized."
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
    suggested = conn.execute(
        """SELECT DISTINCT p.*
           FROM projects p
           JOIN project_skills ps ON p.id = ps.project_id
           WHERE ps.skill_id IN ({})
           AND p.status IN ('seeking_owner', 'seeking_help')
           AND p.owner_id != ?
           AND p.id NOT IN (
               SELECT project_id FROM project_interests WHERE volunteer_id = ?
           )
           ORDER BY p.created_at DESC
           LIMIT 5""".format(",".join("?" * len(volunteer_skill_ids)) if volunteer_skill_ids else "0"),
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

# Mount static files
static_path = Path(__file__).parent / "static"
if static_path.exists():
    app.mount("/static", StaticFiles(directory=static_path), name="static")


@app.get("/")
def serve_index():
    """Serve the main page."""
    index_path = Path(__file__).parent / "static" / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return {"message": "Welcome to Catalyse API", "docs": "/docs"}


@app.on_event("startup")
def startup():
    """Initialize database on startup."""
    init_db()


# ============================================
# RUN SERVER
# ============================================

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)
