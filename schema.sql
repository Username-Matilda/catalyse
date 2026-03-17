PRAGMA foreign_keys = ON;

CREATE TABLE people (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  active BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE circles (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  purpose TEXT,
  parent_circle_id INTEGER REFERENCES circles(id),
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CHECK (id != parent_circle_id)
);

CREATE TABLE roles (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  purpose TEXT,
  circle_id INTEGER NOT NULL REFERENCES circles(id),
  role_type TEXT DEFAULT 'normal',
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CHECK (role_type IN ('normal', 'circle_lead', 'facilitator', 'secretary', 'circle_rep'))
);

CREATE TABLE accountabilities (
  id INTEGER PRIMARY KEY,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE domains (
  id INTEGER PRIMARY KEY,
  role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL,
  circle_id INTEGER NOT NULL REFERENCES circles(id),
  description TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE policies (
  id INTEGER PRIMARY KEY,
  circle_id INTEGER NOT NULL REFERENCES circles(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  policy_type TEXT,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE role_assignments (
  id INTEGER PRIMARY KEY,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  person_id INTEGER NOT NULL REFERENCES people(id),
  focus TEXT,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  assigned_until TIMESTAMP,
  
  UNIQUE(role_id, person_id, focus)
);

CREATE TABLE projects (
  id INTEGER PRIMARY KEY,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',
  blocked_reason TEXT,
  blocked_by_project_id INTEGER REFERENCES projects(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  dropped_at TIMESTAMP,
  
  CHECK (status IN ('active', 'on_hold', 'blocked', 'completed', 'dropped'))
);

CREATE TABLE next_actions (
  id INTEGER PRIMARY KEY,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  project_id INTEGER REFERENCES projects(id),
  description TEXT NOT NULL,
  completed BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE TABLE tensions (
  id INTEGER PRIMARY KEY,
  person_id INTEGER NOT NULL REFERENCES people(id),
  role_id INTEGER REFERENCES roles(id),
  description TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CHECK (status IN ('open', 'became_proposal', 'resolved', 'abandoned'))
);

CREATE TABLE proposals (
  id INTEGER PRIMARY KEY,
  proposer_id INTEGER NOT NULL REFERENCES people(id),
  tension_id INTEGER REFERENCES tensions(id),
  circle_id INTEGER NOT NULL REFERENCES circles(id),
  proposal_text TEXT NOT NULL,
  example_situation TEXT,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  adopted_at TIMESTAMP,
  
  CHECK (status IN ('draft', 'in_objection', 'adopted', 'withdrawn'))
);

CREATE TABLE objections (
  id INTEGER PRIMARY KEY,
  proposal_id INTEGER NOT NULL REFERENCES proposals(id),
  objector_id INTEGER NOT NULL REFERENCES people(id),
  concern TEXT NOT NULL,
  is_valid BOOLEAN,
  resolved BOOLEAN DEFAULT 0,
  resolution_note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tensions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL,
    sensed_by_person_id INTEGER,
    related_role_id INTEGER,
    related_circle_id INTEGER,
    tension_type TEXT CHECK(tension_type IN ('governance', 'tactical', 'project', 'unknown')) DEFAULT 'unknown',
    status TEXT CHECK(status IN ('open', 'processed', 'archived')) DEFAULT 'open',
    processing_notes TEXT,
    processed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sensed_by_person_id) REFERENCES people(id),
    FOREIGN KEY (related_role_id) REFERENCES roles(id),
    FOREIGN KEY (related_circle_id) REFERENCES circles(id)
);

-- Indexes for common queries
CREATE INDEX idx_roles_circle ON roles(circle_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_role_assignments_person ON role_assignments(person_id);
CREATE INDEX idx_role_assignments_role ON role_assignments(role_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_accountabilities_role ON accountabilities(role_id);
CREATE INDEX idx_domains_role ON domains(role_id);
CREATE INDEX idx_domains_circle ON domains(circle_id);