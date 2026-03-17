from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import sqlite3
from typing import List, Dict, Optional

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")

def get_db():
    conn = sqlite3.connect('holacracy.db')
    conn.row_factory = sqlite3.Row
    return conn

class CircleCreate(BaseModel):
    name: str
    purpose: Optional[str] = None
    parent_circle_id: Optional[int] = None

class RoleCreate(BaseModel):
    name: str
    purpose: Optional[str] = None
    circle_id: int
    role_type: str = 'normal'

@app.get("/api/circles")
def get_circles() -> List[Dict]:
    db = get_db()
    circles = db.execute("""
        SELECT id, name, purpose, parent_circle_id 
        FROM circles 
        WHERE deleted_at IS NULL
        ORDER BY parent_circle_id, name
    """).fetchall()
    return [dict(c) for c in circles]

@app.get("/api/circles/{circle_id}")
def get_circle_details(circle_id: int) -> Dict:
    """Return a single circle with its roles."""
    db = get_db()
    
    circle = db.execute("""
        SELECT * FROM circles 
        WHERE id = ? AND deleted_at IS NULL
    """, (circle_id,)).fetchone()
    
    if not circle:
        raise HTTPException(status_code=404, detail="Circle not found")
    
    circle = dict(circle)
    
    # Get roles in this circle
    circle['roles'] = [dict(r) for r in db.execute("""
        SELECT * FROM roles 
        WHERE circle_id = ? AND deleted_at IS NULL
        ORDER BY name
    """, (circle_id,)).fetchall()]
    
    return circle
  
@app.get("/api/circles/{circle_id}/roles")
def get_circle_roles(circle_id: int) -> List[Dict]:
    db = get_db()
    roles = db.execute("""
        SELECT id, name, purpose, role_type
        FROM roles
        WHERE circle_id = ? AND deleted_at IS NULL
        ORDER BY role_type, name
    """, (circle_id,)).fetchall()
    return [dict(r) for r in roles]

@app.get("/api/roles/{role_id}")
def get_role_details(role_id: int) -> Dict:
    db = get_db()
    role = dict(db.execute("""
        SELECT roles.*, circles.name as circle_name
        FROM roles
        JOIN circles ON roles.circle_id = circles.id
        WHERE roles.id = ?
    """, (role_id,)).fetchone())
    role['accountabilities'] = [dict(a) for a in db.execute("""
        SELECT id, description, sort_order FROM accountabilities
        WHERE role_id = ?
        ORDER BY sort_order
    """, (role_id,)).fetchall()]
    role['domains'] = [dict(d) for d in db.execute("""
        SELECT id, description, sort_order FROM domains
        WHERE role_id = ?
        ORDER BY sort_order
    """, (role_id,)).fetchall()]
    role['role_leads'] = [dict(p) for p in db.execute("""
        SELECT people.name, people.email, role_assignments.focus
        FROM people
        JOIN role_assignments ON people.id = role_assignments.person_id
        WHERE role_assignments.role_id = ?
    """, (role_id,)).fetchall()]
    return role

@app.post("/api/circles")
def create_circle(circle: CircleCreate) -> Dict:
        """Create a new circle."""
        db = get_db()

        # Verify parent exists if specified
        if circle.parent_circle_id:
            parent = db.execute(
                "SELECT id FROM circles WHERE id = ? AND deleted_at IS NULL",
                (circle.parent_circle_id,)
            ).fetchone()
            if not parent:
                raise HTTPException(status_code=404, detail="Parent circle not found")

        try:
            cursor = db.execute(
                """INSERT INTO circles (name, purpose, parent_circle_id)
                   VALUES (?, ?, ?)""",
                (circle.name.strip(),
                 circle.purpose.strip() if circle.purpose else None,
                 circle.parent_circle_id)
            )
            db.commit()

            created = db.execute(
                "SELECT * FROM circles WHERE id = ?",
                (cursor.lastrowid,)
            ).fetchone()

            return dict(created)

        except sqlite3.Error as e:
            raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")
        finally:
            db.close()
@app.delete("/api/circles/{circle_id}")

@app.delete("/api/circles/{circle_id}")
def delete_circle(circle_id: int) -> Dict:
    """Soft delete a circle and cascade to contained entities."""
    db = get_db()
    
    try:
        circle = db.execute(
            "SELECT id FROM circles WHERE id = ? AND deleted_at IS NULL",
            (circle_id,)
        ).fetchone()
        
        if not circle:
            raise HTTPException(status_code=404, detail="Circle not found")
        
        # Cascade soft delete to all roles in circle
        db.execute(
            "UPDATE roles SET deleted_at = CURRENT_TIMESTAMP WHERE circle_id = ?",
            (circle_id,)
        )
        
        # Permanently delete policies (no archived_at column)
        db.execute(
            "DELETE FROM policies WHERE circle_id = ?",
            (circle_id,)
        )
        
        # Delete the circle itself
        db.execute(
            "UPDATE circles SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
            (circle_id,)
        )
        
        db.commit()
        return {"success": True, "deleted_id": circle_id}
        
    except sqlite3.Error as e:
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")
    finally:
        db.close()
        
@app.post("/api/roles")
def create_role(role: RoleCreate) -> Dict:
    if not role.name or not role.name.strip():
        raise HTTPException(status_code=400, detail="Role name cannot be empty")
    db = get_db()
    circle = db.execute(
        "SELECT id FROM circles WHERE id = ? AND deleted_at IS NULL",
        (role.circle_id,)
    ).fetchone()
    if not circle:
        raise HTTPException(status_code=404, detail=f"Circle {role.circle_id} not found")
    valid_types = ['normal', 'circle_lead', 'facilitator', 'secretary', 'circle_rep']
    if role.role_type not in valid_types:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid role_type. Must be one of: {', '.join(valid_types)}"
        )
    try:
        cursor = db.execute(
            """INSERT INTO roles (name, purpose, circle_id, role_type)
               VALUES (?, ?, ?, ?)""",
            (role.name.strip(), role.purpose, role.circle_id, role.role_type)
        )
        db.commit()
        role_id = cursor.lastrowid
        created_role = db.execute(
            """SELECT id, name, purpose, circle_id, role_type
               FROM roles WHERE id = ?""",
            (role_id,)
        ).fetchone()
        return dict(created_role)
    except sqlite3.IntegrityError as e:
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")
    finally:
        db.close()

class RoleUpdate(BaseModel):
    name: Optional[str] = None
    purpose: Optional[str] = None
    circle_id: Optional[int] = None
    role_type: Optional[str] = None


@app.put("/api/roles/{role_id}")
def update_role(role_id: int, updates: RoleUpdate) -> Dict:
    """Update an existing role."""
    db = get_db()
    
    # Verify role exists
    role = db.execute(
        "SELECT id FROM roles WHERE id = ? AND deleted_at IS NULL",
        (role_id,)
    ).fetchone()
    
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    # Build update query dynamically based on provided fields
    update_fields = []
    params = []
    
    if updates.name is not None:
        if not updates.name.strip():
            raise HTTPException(status_code=400, detail="Role name cannot be empty")
        update_fields.append("name = ?")
        params.append(updates.name.strip())
    
    if updates.purpose is not None:
        update_fields.append("purpose = ?")
        params.append(updates.purpose.strip() if updates.purpose else None)
    
    if updates.circle_id is not None:
        # Verify circle exists
        circle = db.execute(
            "SELECT id FROM circles WHERE id = ? AND deleted_at IS NULL",
            (updates.circle_id,)
        ).fetchone()
        if not circle:
            raise HTTPException(status_code=404, detail="Circle not found")
        update_fields.append("circle_id = ?")
        params.append(updates.circle_id)
    
    if updates.role_type is not None:
        valid_types = ['normal', 'circle_lead', 'facilitator', 'secretary', 'circle_rep']
        if updates.role_type not in valid_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid role_type. Must be one of: {', '.join(valid_types)}"
            )
        update_fields.append("role_type = ?")
        params.append(updates.role_type)
    
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    # Execute update
    params.append(role_id)
    query = f"UPDATE roles SET {', '.join(update_fields)} WHERE id = ?"
    
    try:
        db.execute(query, params)
        db.commit()
        
        # Return updated role
        updated_role = db.execute(
            "SELECT id, name, purpose, circle_id, role_type FROM roles WHERE id = ?",
            (role_id,)
        ).fetchone()
        
        return dict(updated_role)
        
    except sqlite3.Error as e:
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")
    finally:
        db.close()

@app.delete("/api/roles/{role_id}")
def delete_role(role_id: int) -> Dict:
    """Delete a role (soft delete via deleted_at timestamp)."""
    db = get_db()
    
    try:
        # Verify role exists
        role = db.execute(
            "SELECT id FROM roles WHERE id = ? AND deleted_at IS NULL",
            (role_id,)
        ).fetchone()
        
        if not role:
            raise HTTPException(status_code=404, detail="Role not found")
        
        # Soft delete
        db.execute(
            "UPDATE roles SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
            (role_id,)
        )
        db.commit()
        
        return {"success": True, "deleted_id": role_id}
        
    except sqlite3.Error as e:
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")
    finally:
        db.close()

@app.post("/api/roles/{role_id}/accountabilities")
def add_accountability(role_id: int, accountability: Dict) -> Dict:
    """Add a new accountability to a role."""
    description = accountability.get('description', '').strip()
    
    if not description:
        raise HTTPException(status_code=400, detail="Accountability description cannot be empty")
    
    db = get_db()
    
    # Verify role exists
    role = db.execute("SELECT id FROM roles WHERE id = ? AND deleted_at IS NULL", (role_id,)).fetchone()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    # Get max sort_order for this role
    max_order = db.execute(
        "SELECT MAX(sort_order) as max_order FROM accountabilities WHERE role_id = ?",
        (role_id,)
    ).fetchone()
    
    next_order = (max_order['max_order'] or -1) + 1
    
    try:
        cursor = db.execute(
            "INSERT INTO accountabilities (role_id, description, sort_order) VALUES (?, ?, ?)",
            (role_id, description, next_order)
        )
        db.commit()
        
        created = db.execute(
            "SELECT id, role_id, description, sort_order FROM accountabilities WHERE id = ?",
            (cursor.lastrowid,)
        ).fetchone()
        
        return dict(created)
        
    except sqlite3.Error as e:
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")
    finally:
        db.close()


@app.delete("/api/roles/{role_id}/accountabilities/{accountability_id}")
def delete_accountability(role_id: int, accountability_id: int) -> Dict:
    """Delete an accountability from a role."""
    db = get_db()
    
    # Verify accountability exists and belongs to this role
    accountability = db.execute(
        "SELECT id FROM accountabilities WHERE id = ? AND role_id = ?",
        (accountability_id, role_id)
    ).fetchone()
    
    if not accountability:
        raise HTTPException(status_code=404, detail="Accountability not found")
    
    try:
        db.execute("DELETE FROM accountabilities WHERE id = ?", (accountability_id,))
        db.commit()
        return {"success": True, "deleted_id": accountability_id}
        
    except sqlite3.Error as e:
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")
    finally:
        db.close()


@app.put("/api/roles/{role_id}/accountabilities/reorder")
def reorder_accountabilities(role_id: int, reorder_data: Dict) -> Dict:
    """Update sort_order for multiple accountabilities."""
    accountability_orders = reorder_data.get('accountabilities', [])
    
    if not accountability_orders:
        raise HTTPException(status_code=400, detail="No accountabilities provided")
    
    db = get_db()
    
    try:
        for item in accountability_orders:
            db.execute(
                "UPDATE accountabilities SET sort_order = ? WHERE id = ? AND role_id = ?",
                (item['sort_order'], item['id'], role_id)
            )
        
        db.commit()
        return {"success": True, "updated": len(accountability_orders)}
        
    except sqlite3.Error as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")
    finally:
        db.close()

@app.post("/api/roles/{role_id}/domains")
def add_domain(role_id: int, domain: Dict) -> Dict:
    """Add a new domain to a role."""
    description = domain.get('description', '').strip()
    
    if not description:
        raise HTTPException(status_code=400, detail="Domain description cannot be empty")
    
    db = get_db()
    
    # Verify role exists and get its circle_id
    role = db.execute(
        "SELECT id, circle_id FROM roles WHERE id = ? AND deleted_at IS NULL", 
        (role_id,)
    ).fetchone()
    
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    circle_id = role['circle_id']
    
    # Get max sort_order for this role's domains
    max_order = db.execute(
        "SELECT MAX(sort_order) as max_order FROM domains WHERE role_id = ?",
        (role_id,)
    ).fetchone()
    
    next_order = (max_order['max_order'] or -1) + 1
    
    try:
        cursor = db.execute(
            "INSERT INTO domains (role_id, circle_id, description, sort_order) VALUES (?, ?, ?, ?)",
            (role_id, circle_id, description, next_order)
        )
        db.commit()
        
        created = db.execute(
            "SELECT id, role_id, circle_id, description, sort_order FROM domains WHERE id = ?",
            (cursor.lastrowid,)
        ).fetchone()
        
        return dict(created)
        
    except sqlite3.Error as e:
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")
    finally:
        db.close()


@app.delete("/api/roles/{role_id}/domains/{domain_id}")
def delete_domain(role_id: int, domain_id: int) -> Dict:
    """Delete a domain from a role."""
    db = get_db()

    domain = db.execute(
        "SELECT id FROM domains WHERE id = ? AND role_id = ?",
        (domain_id, role_id)
    ).fetchone()
    
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
    
    try:
        db.execute("DELETE FROM domains WHERE id = ?", (domain_id,))
        db.commit()
        return {"success": True, "deleted_id": domain_id}
        
    except sqlite3.Error as e:
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")
    finally:
        db.close()
 
@app.get("/api/people")
def get_people() -> List[Dict]:
    """Return all active people in the organization."""
    db = get_db()
    people = db.execute("""
        SELECT id, name, email, notes, created_at
        FROM people
        WHERE active = 1 OR active IS NULL
        ORDER BY name
    """).fetchall()
    return [dict(p) for p in people]


@app.get("/api/people/{person_id}")
def get_person_details(person_id: int) -> Dict:
    """Return person details with all their role assignments."""
    db = get_db()
    
    person = db.execute("""
        SELECT id, name, email, notes, created_at
        FROM people
        WHERE id = ?
    """, (person_id,)).fetchone()
    
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    
    person = dict(person)
    
    # Get all roles this person fills
    person['roles'] = [dict(r) for r in db.execute("""
        SELECT 
            roles.id,
            roles.name,
            roles.purpose,
            circles.name as circle_name,
            role_assignments.focus,
            role_assignments.assigned_at
        FROM role_assignments
        JOIN roles ON role_assignments.role_id = roles.id
        JOIN circles ON roles.circle_id = circles.id
        WHERE role_assignments.person_id = ?
        AND roles.deleted_at IS NULL
        ORDER BY circles.name, roles.name
    """, (person_id,)).fetchall()]
    
    return person


class PersonCreate(BaseModel):
    name: str
    email: Optional [str] = None #
    notes: Optional[str] = None


@app.post("/api/people")
def create_person(person: PersonCreate) -> Dict:
    """Create a new person."""
    if not person.name or not person.name.strip():
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    
    email = person.email.strip() if person.email and person.email.strip() else None
    notes = person.notes.strip() if person.notes and person.notes.strip() else None

    db = get_db()
    
    try:
        cursor = db.execute(
            "INSERT INTO people (name, email, notes) VALUES (?, ?, ?)",
            (person.name.strip(), email, notes)
        )
        db.commit()
        
        created = db.execute(
            "SELECT id, name, email, notes, created_at FROM people WHERE id = ?",
            (cursor.lastrowid,)
        ).fetchone()
        
        return dict(created)
        
    except sqlite3.IntegrityError as e:
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")
    finally:
        db.close()

@app.delete("/api/people/{person_id}")
def soft_delete_person(person_id: int) -> Dict:
    """Mark a person as inactive (soft delete)."""
    db = get_db()

    person = db.execute(
        "SELECT id FROM people WHERE id = ? AND (active = 1 OR active IS NULL)",
        (person_id,)
    ).fetchone()

    if not person:
        raise HTTPException(status_code=404, detail="Person not found or already inactive")

    try:
        db.execute(
            "UPDATE people SET active = 0 WHERE id = ?",
            (person_id,)
        )
        db.commit()
        return {"success": True, "deleted_id": person_id}
    except sqlite3.Error as e:
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")
    finally:
        db.close()

# ============= ROLE ASSIGNMENT ENDPOINTS =============

class RoleAssignment(BaseModel):
    person_id: int
    focus: Optional[str] = None


@app.post("/api/roles/{role_id}/assignments")
def assign_person_to_role(role_id: int, assignment: RoleAssignment) -> Dict:
    """Assign a person to a role."""
    db = get_db()
    
    # Verify role exists
    role = db.execute(
        "SELECT id FROM roles WHERE id = ? AND deleted_at IS NULL",
        (role_id,)
    ).fetchone()
    
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    # Verify person exists
    person = db.execute(
        "SELECT id FROM people WHERE id = ?",
        (assignment.person_id,)
    ).fetchone()
    
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    
    # Check if assignment already exists
    existing = db.execute(
        "SELECT id FROM role_assignments WHERE role_id = ? AND person_id = ?",
        (role_id, assignment.person_id)
    ).fetchone()
    
    if existing:
        raise HTTPException(status_code=400, detail="Person already assigned to this role")
    
    try:
        cursor = db.execute(
            "INSERT INTO role_assignments (role_id, person_id, focus) VALUES (?, ?, ?)",
            (role_id, assignment.person_id, assignment.focus)
        )
        db.commit()
        
        created = db.execute("""
            SELECT 
                role_assignments.id,
                role_assignments.role_id,
                role_assignments.person_id,
                role_assignments.focus,
                role_assignments.assigned_at,
                people.name as person_name,
                people.email as person_email
            FROM role_assignments
            JOIN people ON role_assignments.person_id = people.id
            WHERE role_assignments.id = ?
        """, (cursor.lastrowid,)).fetchone()
        
        return dict(created)
        
    except sqlite3.Error as e:
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")
    finally:
        db.close()


@app.delete("/api/roles/{role_id}/assignments/{person_id}")
def unassign_person_from_role(role_id: int, person_id: int) -> Dict:
    """Remove a person's assignment to a role."""
    db = get_db()
    
    assignment = db.execute(
        "SELECT id FROM role_assignments WHERE role_id = ? AND person_id = ?",
        (role_id, person_id)
    ).fetchone()
    
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    try:
        db.execute(
            "DELETE FROM role_assignments WHERE role_id = ? AND person_id = ?",
            (role_id, person_id)
        )
        db.commit()
        return {"success": True, "role_id": role_id, "person_id": person_id}
        
    except sqlite3.Error as e:
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")
    finally:
        db.close()

@app.get("/api/roles")
def get_all_roles() -> List[Dict]:
    """Return all roles across all circles."""
    db = get_db()
    roles = db.execute("""
        SELECT 
            roles.id,
            roles.name,
            roles.purpose,
            roles.role_type,
            circles.name as circle_name
        FROM roles
        JOIN circles ON roles.circle_id = circles.id
        WHERE roles.deleted_at IS NULL
        ORDER BY circles.name, roles.name
    """).fetchall()
    return [dict(r) for r in roles]

# ============= TENSION ENDPOINTS =============

class TensionCreate(BaseModel):
    description: str
    sensed_by_person_id: Optional[int] = None
    related_role_id: Optional[int] = None
    related_circle_id: Optional[int] = None
    tension_type: str = 'unknown'


class TensionUpdate(BaseModel):
    description: Optional[str] = None
    tension_type: Optional[str] = None
    status: Optional[str] = None
    processing_notes: Optional[str] = None


@app.get("/api/tensions")
def get_tensions(status: Optional[str] = None) -> List[Dict]:
    """Return all tensions, optionally filtered by status."""
    db = get_db()
    
    query = """
        SELECT 
            tensions.*,
            people.name as sensed_by_name,
            roles.name as related_role_name,
            circles.name as related_circle_name
        FROM tensions
        LEFT JOIN people ON tensions.sensed_by_person_id = people.id
        LEFT JOIN roles ON tensions.related_role_id = roles.id
        LEFT JOIN circles ON tensions.related_circle_id = circles.id
    """
    
    params = []
    if status:
        query += " WHERE tensions.status = ?"
        params.append(status)
    
    query += " ORDER BY tensions.created_at DESC"
    
    tensions = db.execute(query, params).fetchall()
    return [dict(t) for t in tensions]


@app.get("/api/tensions/{tension_id}")
def get_tension_details(tension_id: int) -> Dict:
    """Return full tension details."""
    db = get_db()
    
    tension = db.execute("""
        SELECT 
            tensions.*,
            people.name as sensed_by_name,
            roles.name as related_role_name,
            circles.name as related_circle_name
        FROM tensions
        LEFT JOIN people ON tensions.sensed_by_person_id = people.id
        LEFT JOIN roles ON tensions.related_role_id = roles.id
        LEFT JOIN circles ON tensions.related_circle_id = circles.id
        WHERE tensions.id = ?
    """, (tension_id,)).fetchone()
    
    if not tension:
        raise HTTPException(status_code=404, detail="Tension not found")
    
    return dict(tension)


@app.post("/api/tensions")
def create_tension(tension: TensionCreate) -> Dict:
    """Create a new tension."""
    if not tension.description or not tension.description.strip():
        raise HTTPException(status_code=400, detail="Tension description cannot be empty")
    
    valid_types = ['governance', 'tactical', 'project', 'unknown']
    if tension.tension_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid tension_type. Must be one of: {', '.join(valid_types)}"
        )
    
    db = get_db()
    
    try:
        cursor = db.execute(
            """INSERT INTO tensions 
               (description, sensed_by_person_id, related_role_id, related_circle_id, tension_type)
               VALUES (?, ?, ?, ?, ?)""",
            (tension.description.strip(), tension.sensed_by_person_id, 
             tension.related_role_id, tension.related_circle_id, tension.tension_type)
        )
        db.commit()
        
        created = db.execute(
            """SELECT tensions.*, people.name as sensed_by_name
               FROM tensions
               LEFT JOIN people ON tensions.sensed_by_person_id = people.id
               WHERE tensions.id = ?""",
            (cursor.lastrowid,)
        ).fetchone()
        
        return dict(created)
        
    except sqlite3.Error as e:
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")
    finally:
        db.close()


@app.put("/api/tensions/{tension_id}")
def update_tension(tension_id: int, updates: TensionUpdate) -> Dict:
    """Update an existing tension."""
    db = get_db()
    
    tension = db.execute("SELECT id FROM tensions WHERE id = ?", (tension_id,)).fetchone()
    if not tension:
        raise HTTPException(status_code=404, detail="Tension not found")
    
    update_fields = []
    params = []
    
    if updates.description is not None:
        if not updates.description.strip():
            raise HTTPException(status_code=400, detail="Description cannot be empty")
        update_fields.append("description = ?")
        params.append(updates.description.strip())
    
    if updates.tension_type is not None:
        valid_types = ['governance', 'tactical', 'project', 'unknown']
        if updates.tension_type not in valid_types:
            raise HTTPException(status_code=400, detail="Invalid tension_type")
        update_fields.append("tension_type = ?")
        params.append(updates.tension_type)
    
    if updates.status is not None:
        valid_statuses = ['open', 'processed', 'archived']
        if updates.status not in valid_statuses:
            raise HTTPException(status_code=400, detail="Invalid status")
        update_fields.append("status = ?")
        params.append(updates.status)
        if updates.status == 'processed':
            update_fields.append("processed_at = CURRENT_TIMESTAMP")
    
    if updates.processing_notes is not None:
        update_fields.append("processing_notes = ?")
        params.append(updates.processing_notes)
    
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    params.append(tension_id)
    query = f"UPDATE tensions SET {', '.join(update_fields)} WHERE id = ?"
    
    try:
        db.execute(query, params)
        db.commit()
        
        updated = db.execute(
            """SELECT tensions.*, people.name as sensed_by_name
               FROM tensions
               LEFT JOIN people ON tensions.sensed_by_person_id = people.id
               WHERE tensions.id = ?""",
            (tension_id,)
        ).fetchone()
        
        return dict(updated)
        
    except sqlite3.Error as e:
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")
    finally:
        db.close()


@app.delete("/api/tensions/{tension_id}")
def delete_tension(tension_id: int) -> Dict:
    """Delete a tension."""
    db = get_db()
    
    tension = db.execute("SELECT id FROM tensions WHERE id = ?", (tension_id,)).fetchone()
    if not tension:
        raise HTTPException(status_code=404, detail="Tension not found")
    
    try:
        db.execute("DELETE FROM tensions WHERE id = ?", (tension_id,))
        db.commit()
        return {"success": True, "deleted_id": tension_id}
    except sqlite3.Error as e:
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")
    finally:
        db.close()

# ============= GOVERNANCE MEETING ENDPOINTS =============

class GovernanceMeetingCreate(BaseModel):
    circle_id: int
    meeting_date: str
    facilitator_person_id: Optional[int] = None
    secretary_person_id: Optional[int] = None
    notes: Optional[str] = None


class ProposalCreate(BaseModel):
    tension_id: Optional[int] = None
    proposer_person_id: Optional[int] = None
    proposal_type: str
    proposal_text: str
    clarifying_questions: Optional[str] = None
    reactions: Optional[str] = None
    objections_raised: Optional[str] = None
    integration_notes: Optional[str] = None
    outcome: str


@app.get("/api/governance-meetings")
def get_governance_meetings(circle_id: Optional[int] = None) -> List[Dict]:
    """Return all governance meetings, optionally filtered by circle."""
    db = get_db()
    
    query = """
        SELECT 
            governance_meetings.*,
            circles.name as circle_name,
            facilitator.name as facilitator_name,
            secretary.name as secretary_name
        FROM governance_meetings
        JOIN circles ON governance_meetings.circle_id = circles.id
        LEFT JOIN people as facilitator ON governance_meetings.facilitator_person_id = facilitator.id
        LEFT JOIN people as secretary ON governance_meetings.secretary_person_id = secretary.id
    """
    
    params = []
    if circle_id:
        query += " WHERE governance_meetings.circle_id = ?"
        params.append(circle_id)
    
    query += " ORDER BY governance_meetings.meeting_date DESC"
    
    meetings = db.execute(query, params).fetchall()
    return [dict(m) for m in meetings]


@app.get("/api/governance-meetings/{meeting_id}")
def get_meeting_details(meeting_id: int) -> Dict:
    """Return full meeting details including all proposals."""
    db = get_db()
    
    meeting = db.execute("""
        SELECT 
            governance_meetings.*,
            circles.name as circle_name,
            facilitator.name as facilitator_name,
            secretary.name as secretary_name
        FROM governance_meetings
        JOIN circles ON governance_meetings.circle_id = circles.id
        LEFT JOIN people as facilitator ON governance_meetings.facilitator_person_id = facilitator.id
        LEFT JOIN people as secretary ON governance_meetings.secretary_person_id = secretary.id
        WHERE governance_meetings.id = ?
    """, (meeting_id,)).fetchone()
    
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    
    meeting = dict(meeting)
    
    # Get proposals
    meeting['proposals'] = [dict(p) for p in db.execute("""
        SELECT 
            meeting_proposals.*,
            tensions.description as tension_description,
            people.name as proposer_name
        FROM meeting_proposals
        LEFT JOIN tensions ON meeting_proposals.tension_id = tensions.id
        LEFT JOIN people ON meeting_proposals.proposer_person_id = people.id
        WHERE meeting_proposals.meeting_id = ?
        ORDER BY meeting_proposals.created_at
    """, (meeting_id,)).fetchall()]
    
    # Get linked tensions
    meeting['tensions'] = [dict(t) for t in db.execute("""
        SELECT tensions.*, meeting_tensions.processed
        FROM meeting_tensions
        JOIN tensions ON meeting_tensions.tension_id = tensions.id
        WHERE meeting_tensions.meeting_id = ?
    """, (meeting_id,)).fetchall()]
    
    return meeting


@app.post("/api/governance-meetings")
def create_governance_meeting(meeting: GovernanceMeetingCreate) -> Dict:
    """Create a new governance meeting."""
    db = get_db()
    
    # Verify circle exists
    circle = db.execute(
        "SELECT id FROM circles WHERE id = ? AND deleted_at IS NULL",
        (meeting.circle_id,)
    ).fetchone()
    
    if not circle:
        raise HTTPException(status_code=404, detail="Circle not found")
    
    try:
        cursor = db.execute(
            """INSERT INTO governance_meetings 
               (circle_id, meeting_date, facilitator_person_id, secretary_person_id, notes)
               VALUES (?, ?, ?, ?, ?)""",
            (meeting.circle_id, meeting.meeting_date, meeting.facilitator_person_id,
             meeting.secretary_person_id, meeting.notes)
        )
        db.commit()
        
        created = db.execute(
            """SELECT governance_meetings.*, circles.name as circle_name
               FROM governance_meetings
               JOIN circles ON governance_meetings.circle_id = circles.id
               WHERE governance_meetings.id = ?""",
            (cursor.lastrowid,)
        ).fetchone()
        
        return dict(created)
        
    except sqlite3.Error as e:
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")
    finally:
        db.close()


@app.post("/api/governance-meetings/{meeting_id}/proposals")
def add_proposal_to_meeting(meeting_id: int, proposal: ProposalCreate) -> Dict:
    """Add a proposal to a governance meeting."""
    db = get_db()
    
    # Verify meeting exists
    meeting = db.execute(
        "SELECT id FROM governance_meetings WHERE id = ?",
        (meeting_id,)
    ).fetchone()
    
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    
    # Validate outcome
    valid_outcomes = ['adopted', 'withdrawn', 'amended_and_adopted']
    if proposal.outcome not in valid_outcomes:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid outcome. Must be one of: {', '.join(valid_outcomes)}"
        )
    
    try:
        cursor = db.execute(
            """INSERT INTO meeting_proposals 
               (meeting_id, tension_id, proposer_person_id, proposal_type, 
                proposal_text, clarifying_questions, reactions, objections_raised,
                integration_notes, outcome)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (meeting_id, proposal.tension_id, proposal.proposer_person_id,
             proposal.proposal_type, proposal.proposal_text, proposal.clarifying_questions,
             proposal.reactions, proposal.objections_raised, proposal.integration_notes,
             proposal.outcome)
        )
        db.commit()
        
        created = db.execute(
            "SELECT * FROM meeting_proposals WHERE id = ?",
            (cursor.lastrowid,)
        ).fetchone()
        
        return dict(created)
        
    except sqlite3.Error as e:
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")
    finally:
        db.close()


@app.post("/api/governance-meetings/{meeting_id}/link-tension/{tension_id}")
def link_tension_to_meeting(meeting_id: int, tension_id: int) -> Dict:
    """Link a tension to a meeting agenda."""
    db = get_db()
    
    try:
        db.execute(
            "INSERT OR IGNORE INTO meeting_tensions (meeting_id, tension_id) VALUES (?, ?)",
            (meeting_id, tension_id)
        )
        db.commit()
        return {"success": True}
    except sqlite3.Error as e:
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")
    finally:
        db.close()

# ============= TACTICAL MEETING ENDPOINTS =============

class TacticalMeetingCreate(BaseModel):
    circle_id: int
    meeting_date: str
    facilitator_person_id: Optional[int] = None
    checkin_notes: Optional[str] = None
    checklist_review: Optional[str] = None
    metrics_review: Optional[str] = None
    project_updates: Optional[str] = None
    tension_processing: Optional[str] = None
    closing_notes: Optional[str] = None


class TacticalMeetingUpdate(BaseModel):
    checkin_notes: Optional[str] = None
    checklist_review: Optional[str] = None
    metrics_review: Optional[str] = None
    project_updates: Optional[str] = None
    tension_processing: Optional[str] = None
    closing_notes: Optional[str] = None


@app.get("/api/tactical-meetings")
def get_tactical_meetings(circle_id: Optional[int] = None) -> List[Dict]:
    """Return all tactical meetings, optionally filtered by circle."""
    db = get_db()
    
    query = """
        SELECT 
            tactical_meetings.*,
            circles.name as circle_name,
            facilitator.name as facilitator_name
        FROM tactical_meetings
        JOIN circles ON tactical_meetings.circle_id = circles.id
        LEFT JOIN people as facilitator ON tactical_meetings.facilitator_person_id = facilitator.id
    """
    
    params = []
    if circle_id:
        query += " WHERE tactical_meetings.circle_id = ?"
        params.append(circle_id)
    
    query += " ORDER BY tactical_meetings.meeting_date DESC"
    
    meetings = db.execute(query, params).fetchall()
    return [dict(m) for m in meetings]


@app.get("/api/tactical-meetings/{meeting_id}")
def get_tactical_meeting_details(meeting_id: int) -> Dict:
    """Return full tactical meeting details."""
    db = get_db()
    
    meeting = db.execute("""
        SELECT 
            tactical_meetings.*,
            circles.name as circle_name,
            facilitator.name as facilitator_name
        FROM tactical_meetings
        JOIN circles ON tactical_meetings.circle_id = circles.id
        LEFT JOIN people as facilitator ON tactical_meetings.facilitator_person_id = facilitator.id
        WHERE tactical_meetings.id = ?
    """, (meeting_id,)).fetchone()
    
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    
    meeting = dict(meeting)
    
    # Get linked tensions with next actions
    meeting['tensions'] = [dict(t) for t in db.execute("""
        SELECT 
            tensions.*,
            tactical_meeting_tensions.next_action,
            tactical_meeting_tensions.owner_person_id,
            people.name as owner_name
        FROM tactical_meeting_tensions
        JOIN tensions ON tactical_meeting_tensions.tension_id = tensions.id
        LEFT JOIN people ON tactical_meeting_tensions.owner_person_id = people.id
        WHERE tactical_meeting_tensions.meeting_id = ?
    """, (meeting_id,)).fetchall()]
    
    return meeting


@app.post("/api/tactical-meetings")
def create_tactical_meeting(meeting: TacticalMeetingCreate) -> Dict:
    """Create a new tactical meeting."""
    db = get_db()
    
    # Verify circle exists
    circle = db.execute(
        "SELECT id FROM circles WHERE id = ? AND deleted_at IS NULL",
        (meeting.circle_id,)
    ).fetchone()
    
    if not circle:
        raise HTTPException(status_code=404, detail="Circle not found")
    
    try:
        cursor = db.execute(
            """INSERT INTO tactical_meetings 
               (circle_id, meeting_date, facilitator_person_id, checkin_notes,
                checklist_review, metrics_review, project_updates, 
                tension_processing, closing_notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (meeting.circle_id, meeting.meeting_date, meeting.facilitator_person_id,
             meeting.checkin_notes, meeting.checklist_review, meeting.metrics_review,
             meeting.project_updates, meeting.tension_processing, meeting.closing_notes)
        )
        db.commit()
        
        created = db.execute(
            """SELECT tactical_meetings.*, circles.name as circle_name
               FROM tactical_meetings
               JOIN circles ON tactical_meetings.circle_id = circles.id
               WHERE tactical_meetings.id = ?""",
            (cursor.lastrowid,)
        ).fetchone()
        
        return dict(created)
        
    except sqlite3.Error as e:
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")
    finally:
        db.close()


@app.put("/api/tactical-meetings/{meeting_id}")
def update_tactical_meeting(meeting_id: int, updates: TacticalMeetingUpdate) -> Dict:
    """Update tactical meeting content."""
    db = get_db()
    
    meeting = db.execute(
        "SELECT id FROM tactical_meetings WHERE id = ?",
        (meeting_id,)
    ).fetchone()
    
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    
    update_fields = []
    params = []
    
    for field in ['checkin_notes', 'checklist_review', 'metrics_review', 
                  'project_updates', 'tension_processing', 'closing_notes']:
        value = getattr(updates, field)
        if value is not None:
            update_fields.append(f"{field} = ?")
            params.append(value)
    
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    params.append(meeting_id)
    query = f"UPDATE tactical_meetings SET {', '.join(update_fields)} WHERE id = ?"
    
    try:
        db.execute(query, params)
        db.commit()
        
        updated = db.execute(
            "SELECT * FROM tactical_meetings WHERE id = ?",
            (meeting_id,)
        ).fetchone()
        
        return dict(updated)
        
    except sqlite3.Error as e:
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")
    finally:
        db.close()

# ============= PROJECT ENDPOINTS =============

class ProjectCreate(BaseModel):
    title: str
    outcome: Optional[str] = None
    role_id: int
    jira_reference: Optional[str] = None
    jira_status: Optional[str] = None
    created_from_tension_id: Optional[int] = None
    created_from_meeting_id: Optional[int] = None


class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    outcome: Optional[str] = None
    status: Optional[str] = None
    jira_reference: Optional[str] = None
    jira_status: Optional[str] = None


class ProjectUpdateCreate(BaseModel):
    update_text: str
    meeting_id: Optional[int] = None
    author_person_id: Optional[int] = None


@app.get("/api/projects")
def get_projects(
    role_id: Optional[int] = None,
    status: Optional[str] = None
) -> List[Dict]:
    """Return projects, optionally filtered by role or status."""
    db = get_db()
    
    query = """
        SELECT 
            projects.*,
            roles.name as role_name,
            circles.name as circle_name,
            tensions.description as tension_description
        FROM projects
        JOIN roles ON projects.role_id = roles.id AND roles.deleted_at IS NULL
        JOIN circles ON roles.circle_id = circles.id AND circles.deleted_at IS NULL
        LEFT JOIN tensions ON projects.created_from_tension_id = tensions.id
        WHERE 1=1
    """
    
    params = []
    
    if role_id:
        query += " AND projects.role_id = ?"
        params.append(role_id)
    
    if status:
        query += " AND projects.status = ?"
        params.append(status)
    
    query += " ORDER BY projects.created_at DESC"
    
    projects = db.execute(query, params).fetchall()
    return [dict(p) for p in projects]

@app.get("/api/projects/{project_id}")
def get_project_details(project_id: int) -> Dict:
    """Return full project details including update history."""
    db = get_db()
    
    project = db.execute("""
        SELECT 
            projects.*,
            roles.name as role_name,
            circles.name as circle_name,
            tensions.description as tension_description
        FROM projects
        JOIN roles ON projects.role_id = roles.id
        JOIN circles ON projects.circle_id = circles.id
        LEFT JOIN tensions ON projects.created_from_tension_id = tensions.id
        WHERE projects.id = ?
    """, (project_id,)).fetchone()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    project = dict(project)
    
    # Get update history
    project['updates'] = [dict(u) for u in db.execute("""
        SELECT 
            project_updates.*,
            people.name as author_name
        FROM project_updates
        LEFT JOIN people ON project_updates.author_person_id = people.id
        WHERE project_updates.project_id = ?
        ORDER BY project_updates.created_at DESC
    """, (project_id,)).fetchall()]
    
    return project


@app.post("/api/projects")
def create_project(project: ProjectCreate) -> Dict:
    """Create a new project."""
    db = get_db()
    
    # Verify role exists
    role = db.execute(
        "SELECT id, circle_id FROM roles WHERE id = ? AND deleted_at IS NULL",
        (project.role_id,)
    ).fetchone()
    
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    valid_statuses = ['active', 'completed', 'on_hold', 'cancelled']
    
    try:
        cursor = db.execute(
            """INSERT INTO projects 
               (title, outcome, role_id, circle_id, jira_reference, jira_status,
                created_from_tension_id, created_from_meeting_id, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')""",
            (project.title, project.outcome, project.role_id, role['circle_id'],
             project.jira_reference, project.jira_status,
             project.created_from_tension_id, project.created_from_meeting_id)
        )
        db.commit()
        
        created = db.execute(
            """SELECT projects.*, roles.name as role_name, circles.name as circle_name
               FROM projects
               JOIN roles ON projects.role_id = roles.id
               JOIN circles ON projects.circle_id = circles.id
               WHERE projects.id = ?""",
            (cursor.lastrowid,)
        ).fetchone()
        
        return dict(created)
        
    except sqlite3.Error as e:
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")
    finally:
        db.close()


@app.put("/api/projects/{project_id}")
def update_project(project_id: int, updates: ProjectUpdate) -> Dict:
    """Update project details."""
    db = get_db()
    
    project = db.execute("SELECT id FROM projects WHERE id = ?", (project_id,)).fetchone()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    update_fields = []
    params = []
    
    if updates.title is not None:
        if not updates.title.strip():
            raise HTTPException(status_code=400, detail="Title cannot be empty")
        update_fields.append("title = ?")
        params.append(updates.title.strip())
    
    if updates.outcome is not None:
        update_fields.append("outcome = ?")
        params.append(updates.outcome)
    
    if updates.status is not None:
        valid_statuses = ['active', 'completed', 'on_hold', 'cancelled']
        if updates.status not in valid_statuses:
            raise HTTPException(status_code=400, detail="Invalid status")
        update_fields.append("status = ?")
        params.append(updates.status)
        if updates.status == 'completed':
            update_fields.append("completed_at = CURRENT_TIMESTAMP")
    
    if updates.jira_reference is not None:
        update_fields.append("jira_reference = ?")
        params.append(updates.jira_reference)
    
    if updates.jira_status is not None:
        update_fields.append("jira_status = ?")
        params.append(updates.jira_status)
    
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    params.append(project_id)
    query = f"UPDATE projects SET {', '.join(update_fields)} WHERE id = ?"
    
    try:
        db.execute(query, params)
        db.commit()
        
        updated = db.execute(
            """SELECT projects.*, roles.name as role_name, circles.name as circle_name
               FROM projects
               JOIN roles ON projects.role_id = roles.id
               JOIN circles ON projects.circle_id = circles.id
               WHERE projects.id = ?""",
            (project_id,)
        ).fetchone()
        
        return dict(updated)
        
    except sqlite3.Error as e:
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")
    finally:
        db.close()


@app.post("/api/projects/{project_id}/updates")
def add_project_update(project_id: int, update: ProjectUpdateCreate) -> Dict:
    """Add an update to a project."""
    db = get_db()
    
    project = db.execute("SELECT id FROM projects WHERE id = ?", (project_id,)).fetchone()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    try:
        cursor = db.execute(
            """INSERT INTO project_updates 
               (project_id, update_text, meeting_id, author_person_id)
               VALUES (?, ?, ?, ?)""",
            (project_id, update.update_text, update.meeting_id, update.author_person_id)
        )
        db.commit()
        
        created = db.execute(
            """SELECT project_updates.*, people.name as author_name
               FROM project_updates
               LEFT JOIN people ON project_updates.author_person_id = people.id
               WHERE project_updates.id = ?""",
            (cursor.lastrowid,)
        ).fetchone()
        
        return dict(created)
        
    except sqlite3.Error as e:
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")
    finally:
        db.close()

# ============= POLICY ENDPOINTS =============

class PolicyCreate(BaseModel):
    circle_id: int
    title: str
    policy_text: str
    created_from_meeting_id: Optional[int] = None


class PolicyUpdate(BaseModel):
    title: Optional[str] = None
    policy_text: Optional[str] = None


@app.get("/api/policies")
def get_policies(circle_id: Optional[int] = None) -> List[Dict]:
    """Return policies, optionally filtered by circle."""
    db = get_db()
    
    query = """
        SELECT 
            policies.*,
            circles.name as circle_name
        FROM policies
        JOIN circles ON policies.circle_id = circles.id
        WHERE 1=1
    """
    
    params = []
    if circle_id:
        query += " AND policies.circle_id = ?"
        params.append(circle_id)
    
    query += " ORDER BY policies.created_at DESC"
    
    policies = db.execute(query, params).fetchall()
    return [dict(p) for p in policies]


@app.get("/api/policies/{policy_id}")
def get_policy_details(policy_id: int) -> Dict:
    """Return full policy details."""
    db = get_db()
    
    policy = db.execute("""
        SELECT 
            policies.*,
            circles.name as circle_name
        FROM policies
        JOIN circles ON policies.circle_id = circles.id
        WHERE policies.id = ?
    """, (policy_id,)).fetchone()
    
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    
    return dict(policy)


@app.post("/api/policies")
def create_policy(policy: PolicyCreate) -> Dict:
    """Create a new policy."""
    db = get_db()
    
    # Verify circle exists
    circle = db.execute(
        "SELECT id FROM circles WHERE id = ? AND deleted_at IS NULL",
        (policy.circle_id,)
    ).fetchone()
    
    if not circle:
        raise HTTPException(status_code=404, detail="Circle not found")
    
    try:
        cursor = db.execute(
            """INSERT INTO policies 
               (circle_id, title, policy_text, created_from_meeting_id)
               VALUES (?, ?, ?, ?)""",
            (policy.circle_id, policy.title.strip(), policy.policy_text.strip(),
             policy.created_from_meeting_id)
        )
        db.commit()
        
        created = db.execute(
            """SELECT policies.*, circles.name as circle_name
               FROM policies
               JOIN circles ON policies.circle_id = circles.id
               WHERE policies.id = ?""",
            (cursor.lastrowid,)
        ).fetchone()
        
        return dict(created)
        
    except sqlite3.Error as e:
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")
    finally:
        db.close()


@app.put("/api/policies/{policy_id}")
def update_policy(policy_id: int, updates: PolicyUpdate) -> Dict:
    """Update policy details."""
    db = get_db()
    
    policy = db.execute("SELECT id FROM policies WHERE id = ?", (policy_id,)).fetchone()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    
    update_fields = []
    params = []
    
    if updates.title is not None:
        if not updates.title.strip():
            raise HTTPException(status_code=400, detail="Title cannot be empty")
        update_fields.append("title = ?")
        params.append(updates.title.strip())
    
    if updates.policy_text is not None:
        if not updates.policy_text.strip():
            raise HTTPException(status_code=400, detail="Policy text cannot be empty")
        update_fields.append("policy_text = ?")
        params.append(updates.policy_text.strip())
    
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    params.append(policy_id)
    query = f"UPDATE policies SET {', '.join(update_fields)} WHERE id = ?"
    
    try:
        db.execute(query, params)
        db.commit()
        
        updated = db.execute(
            """SELECT policies.*, circles.name as circle_name
               FROM policies
               JOIN circles ON policies.circle_id = circles.id
               WHERE policies.id = ?""",
            (policy_id,)
        ).fetchone()
        
        return dict(updated)
        
    except sqlite3.Error as e:
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")
    finally:
        db.close()


@app.delete("/api/policies/{policy_id}")
def delete_policy(policy_id: int) -> Dict:
    """Delete a policy permanently."""
    db = get_db()
    
    try:
        result = db.execute("DELETE FROM policies WHERE id = ?", (policy_id,))
        db.commit()
        
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Policy not found")
        
        return {"success": True, "deleted_id": policy_id}
    except sqlite3.Error as e:
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")
    finally:
        db.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)