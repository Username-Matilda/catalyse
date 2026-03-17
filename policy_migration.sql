CREATE TABLE policies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    circle_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    policy_text TEXT NOT NULL,
    created_from_meeting_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (circle_id) REFERENCES circles(id),
    FOREIGN KEY (created_from_meeting_id) REFERENCES governance_meetings(id)
);