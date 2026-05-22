// TEMPORARY: seeds db/anonymised_prod.db with comment-source data in every
// state the WorkItem migration backfill must handle. Delete after #96 lands.
//
// Run: NODE_OPTIONS=--experimental-sqlite npx tsx scripts/seed-migration-test-state.ts
//
// Idempotent: UPDATEs key off fixed ids; inserted rows are tagged with the
// SENTINEL marker and cleared before re-insert.
import { DatabaseSync } from 'node:sqlite'
import { join } from 'path'

const DB_PATH = join(process.cwd(), 'db', 'anonymised_prod.db')
const ADMIN = 60 // admin@example.com
const VOL = 59 // volunteer@example.com
const SENTINEL = '[seed:migration-test]'

const db = new DatabaseSync(DB_PATH)

function run(label: string, sql: string, ...params: (string | number | null)[]) {
  const info = db.prepare(sql).run(...params)
  console.log(`  ${label}: ${info.changes} row(s)`)
}

console.log(`Seeding ${DB_PATH}`)
db.exec('BEGIN')
try {
  // ── feedback_to_proposer → WorkItemComment ──────────────────────────────
  // Normal: reviewer + reviewed_at present (author + date resolvable).
  run(
    'proposer feedback (normal, project 20)',
    `UPDATE projects SET proposed_by_id=?, reviewed_by_id=?, reviewed_at=datetime('now'),
       feedback_to_proposer='Please clarify scope before we approve.'
     WHERE id=20`,
    VOL,
    ADMIN,
  )
  run(
    'proposer feedback (normal, project 10)',
    `UPDATE projects SET proposed_by_id=?, reviewed_by_id=?, reviewed_at=datetime('now'),
       feedback_to_proposer='Looks good, approving with minor notes.'
     WHERE id=10`,
    VOL,
    ADMIN,
  )
  // Edge: feedback present but reviewer + reviewed_at NULL (comment author/date must fall back).
  run(
    'proposer feedback (null reviewer/date, project 12)',
    `UPDATE projects SET proposed_by_id=?, reviewed_by_id=NULL, reviewed_at=NULL,
       feedback_to_proposer='Orphaned feedback with no reviewer recorded.'
     WHERE id=12`,
    VOL,
  )

  // ── feedback_to_volunteer → WorkItemComment ─────────────────────────────
  // Normal: reviewer + reviewed_at present.
  run(
    'volunteer feedback (normal, starter 1)',
    `UPDATE starter_tasks SET assigned_to_id=?, reviewed_by_id=?, reviewed_at=datetime('now'),
       feedback_to_volunteer='Great first task, well done.'
     WHERE id=1`,
    VOL,
    ADMIN,
  )
  // Edge: feedback present, reviewer NULL.
  run(
    'volunteer feedback (null reviewer, starter 2)',
    `UPDATE starter_tasks SET assigned_to_id=?, reviewed_by_id=NULL, reviewed_at=NULL,
       feedback_to_volunteer='Feedback left without a recorded reviewer.'
     WHERE id=2`,
    VOL,
  )

  // ── project_updates → WorkItemComment ───────────────────────────────────
  // Ensure project 1 is visible to the test volunteer.
  run(
    'project 1 → volunteer',
    `UPDATE projects SET proposed_by_id=?, owner_id=? WHERE id=1`,
    VOL,
    VOL,
  )
  // Clear prior seeded updates, then insert author-present + author-null cases.
  run('clear seeded updates', `DELETE FROM project_updates WHERE content LIKE ?`, `${SENTINEL}%`)
  run(
    'project_update (author present)',
    `INSERT INTO project_updates (project_id, author_id, content, created_at)
     VALUES (1, ?, ?, datetime('now','-2 days'))`,
    VOL,
    `${SENTINEL} progress update from the owner`,
  )
  run(
    'project_update (author null)',
    `INSERT INTO project_updates (project_id, author_id, content, created_at)
     VALUES (1, NULL, ?, datetime('now','-1 days'))`,
    `${SENTINEL} system-generated update, no author`,
  )

  // ── admin_notes / contact_messages FK remap (related_project_id) ─────────
  run('admin_note related_project_id', `UPDATE admin_notes SET related_project_id=1 WHERE id=1`)
  run(
    'contact_message related_project_id (msg 1 → proj 1)',
    `UPDATE contact_messages SET related_project_id=1 WHERE id=1`,
  )
  run(
    'contact_message related_project_id (msg 2 → proj 20)',
    `UPDATE contact_messages SET related_project_id=20 WHERE id=2`,
  )

  db.exec('COMMIT')
  console.log('Done.')
} catch (err) {
  db.exec('ROLLBACK')
  console.error('Failed, rolled back:', err)
  process.exit(1)
} finally {
  db.close()
}
