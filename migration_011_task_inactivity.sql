-- Migration 011: Task inactivity tracking
-- Supports automated inactivity nudges, final warnings, and task surrender

ALTER TABLE project_tasks ADD COLUMN assigned_at TIMESTAMP;
ALTER TABLE project_tasks ADD COLUMN nudge_sent_at TIMESTAMP;
ALTER TABLE project_tasks ADD COLUMN final_warning_sent_at TIMESTAMP;
