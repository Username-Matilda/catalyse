CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    outcome TEXT,
    role_id INTEGER NOT NULL,
    circle_id INTEGER NOT NULL,
    status TEXT CHECK(status IN ('active', 'completed', 'on_hold', 'cancelled')) DEFAULT 'active',
    jira_reference TEXT,
    jira_status TEXT,
    created_from_tension_id INTEGER,
    created_from_meeting_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (role_id) REFERENCES roles(id),
    FOREIGN KEY (circle_id) REFERENCES circles(id),
    FOREIGN KEY (created_from_tension_id) REFERENCES tensions(id),
    FOREIGN KEY (created_from_meeting_id) REFERENCES governance_meetings(id)
);

CREATE TABLE project_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    update_text TEXT NOT NULL,
    meeting_id INTEGER,
    author_person_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (meeting_id) REFERENCES tactical_meetings(id),
    FOREIGN KEY (author_person_id) REFERENCES people(id)
);