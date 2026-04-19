"""
Delete test data left over from scenario walkthroughs.

Removes the three fixed scenario accounts and any projects they proposed or
owned, plus any project whose title matches known test-data patterns.
Cascade deletes handle interests, notifications, skills, etc. automatically.
"""

import sqlite3
import os
from pathlib import Path

TEST_EMAILS = ("volunteer@test.com", "admin@test.com", "owner@test.com")
TEST_TITLE_PATTERNS = ("Test Proposal%", "E2E Test Project%")

data_dir = os.environ.get("RAILWAY_VOLUME_MOUNT_PATH", str(Path(__file__).parent.parent.parent))
db_path = Path(data_dir) / "catalyse.db"

if not db_path.exists():
    print(f"No database found at {db_path} — nothing to clean.")
    raise SystemExit(0)

conn = sqlite3.connect(db_path)
conn.execute("PRAGMA foreign_keys = ON")

email_placeholders = ",".join("?" * len(TEST_EMAILS))

# Collect test account IDs
ids = [
    row[0]
    for row in conn.execute(
        f"SELECT id FROM volunteers WHERE email IN ({email_placeholders})", TEST_EMAILS
    )
]

deleted_projects = 0

if ids:
    id_placeholders = ",".join("?" * len(ids))
    cur = conn.execute(
        f"DELETE FROM projects WHERE proposed_by_id IN ({id_placeholders})"
        f" OR owner_id IN ({id_placeholders})",
        ids + ids,
    )
    deleted_projects += cur.rowcount

for pattern in TEST_TITLE_PATTERNS:
    cur = conn.execute("DELETE FROM projects WHERE title LIKE ?", (pattern,))
    deleted_projects += cur.rowcount

cur = conn.execute(
    f"DELETE FROM volunteers WHERE email IN ({email_placeholders})", TEST_EMAILS
)
deleted_volunteers = cur.rowcount

conn.commit()
conn.close()

print(f"Removed {deleted_projects} project(s) and {deleted_volunteers} volunteer(s).")
