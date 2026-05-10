-- Migration 012: Digest run tracking
-- Records when each digest type was last sent, used to prevent duplicate sends

CREATE TABLE IF NOT EXISTS digest_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_digest_runs_type ON digest_runs(type);
