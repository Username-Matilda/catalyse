CREATE TABLE tactical_meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    circle_id INTEGER NOT NULL,
    meeting_date DATE NOT NULL,
    facilitator_person_id INTEGER,
    checkin_notes TEXT,
    checklist_review TEXT,
    metrics_review TEXT,
    project_updates TEXT,
    tension_processing TEXT,
    closing_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (circle_id) REFERENCES circles(id),
    FOREIGN KEY (facilitator_person_id) REFERENCES people(id)
);

CREATE TABLE tactical_meeting_tensions (
    meeting_id INTEGER NOT NULL,
    tension_id INTEGER NOT NULL,
    next_action TEXT,
    owner_person_id INTEGER,
    PRIMARY KEY (meeting_id, tension_id),
    FOREIGN KEY (meeting_id) REFERENCES tactical_meetings(id),
    FOREIGN KEY (tension_id) REFERENCES tensions(id),
    FOREIGN KEY (owner_person_id) REFERENCES people(id)
);