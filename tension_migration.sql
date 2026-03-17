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