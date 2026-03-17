CREATE TABLE governance_meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    circle_id INTEGER NOT NULL,
    meeting_date DATE NOT NULL,
    facilitator_person_id INTEGER,
    secretary_person_id INTEGER,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (circle_id) REFERENCES circles(id),
    FOREIGN KEY (facilitator_person_id) REFERENCES people(id),
    FOREIGN KEY (secretary_person_id) REFERENCES people(id)
);

CREATE TABLE meeting_proposals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER NOT NULL,
    tension_id INTEGER,
    proposer_person_id INTEGER,
    proposal_type TEXT CHECK(proposal_type IN (
        'create_role', 'modify_role', 'remove_role',
        'add_accountability', 'add_domain', 'add_policy',
        'elect_to_role', 'other'
    )),
    proposal_text TEXT NOT NULL,
    clarifying_questions TEXT,
    reactions TEXT,
    objections_raised TEXT,
    integration_notes TEXT,
    outcome TEXT CHECK(outcome IN ('adopted', 'withdrawn', 'amended_and_adopted')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (meeting_id) REFERENCES governance_meetings(id),
    FOREIGN KEY (tension_id) REFERENCES tensions(id),
    FOREIGN KEY (proposer_person_id) REFERENCES people(id)
);

CREATE TABLE meeting_tensions (
    meeting_id INTEGER NOT NULL,
    tension_id INTEGER NOT NULL,
    processed BOOLEAN DEFAULT 0,
    PRIMARY KEY (meeting_id, tension_id),
    FOREIGN KEY (meeting_id) REFERENCES governance_meetings(id),
    FOREIGN KEY (tension_id) REFERENCES tensions(id)
);