#!/usr/bin/env node
/**
 * Exports bug reports (with their comment threads) from a local sqlite db to a Markdown file.
 *
 * Usage:
 *   npm run export-bug-reports                          # open + in_progress only, from db/prod.db
 *   npm run export-bug-reports -- --db db/anonymised_prod.db --out bugs.md
 *   npm run export-bug-reports -- --status open         # single status
 *   npm run export-bug-reports -- --all                 # every status
 */

import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

const dbPath = resolve(ROOT, argValue('--db') ?? 'db/prod.db')
const outPath = resolve(ROOT, argValue('--out') ?? 'bug-reports.md')
const showAll = process.argv.includes('--all')
const statusFilter = argValue('--status')
const statuses = statusFilter ? [statusFilter] : showAll ? null : ['open', 'in_progress']

if (!existsSync(dbPath)) {
  console.error(`Error: db not found at ${dbPath}`)
  process.exit(1)
}

interface BugReportRow {
  id: number
  title: string
  description: string
  status: string
  category: string | null
  severity: string | null
  page_url: string | null
  resolution_notes: string | null
  created_at: number | null
  reporter_name: string | null
  reporter_email: string | null
  assignee_name: string | null
  resolved_by_name: string | null
  resolved_at: number | null
}

interface CommentRow {
  bug_report_id: number
  content: string
  created_at: number | null
  author_name: string | null
}

function formatDate(epochMs: number | null): string {
  if (epochMs === null) return 'unknown'
  return new Date(epochMs).toISOString().replace('T', ' ').slice(0, 19)
}

function main(): void {
  const db = new DatabaseSync(dbPath, { readOnly: true })

  let query = `
    SELECT
      br.id, br.title, br.description, br.status, br.category, br.severity,
      br.page_url, br.resolution_notes, br.created_at, br.resolved_at,
      reporter.name AS reporter_name, br.reporter_email AS reporter_email,
      assignee.name AS assignee_name, resolver.name AS resolved_by_name
    FROM bug_reports br
    LEFT JOIN volunteers reporter ON reporter.id = br.reporter_id
    LEFT JOIN volunteers assignee ON assignee.id = br.assignee_id
    LEFT JOIN volunteers resolver ON resolver.id = br.resolved_by_id
  `
  const params: string[] = []
  if (statuses) {
    query += ` WHERE br.status IN (${statuses.map(() => '?').join(', ')})`
    params.push(...statuses)
  }
  query += ' ORDER BY br.created_at DESC'

  const reports = db.prepare(query).all(...params) as unknown as BugReportRow[]

  const comments = db
    .prepare(
      `
      SELECT c.bug_report_id, c.content, c.created_at, a.name AS author_name
      FROM bug_report_comments c
      LEFT JOIN volunteers a ON a.id = c.author_id
      ORDER BY c.bug_report_id, c.created_at ASC
    `,
    )
    .all() as unknown as CommentRow[]

  db.close()

  const commentsByReport = new Map<number, CommentRow[]>()
  for (const c of comments) {
    if (!commentsByReport.has(c.bug_report_id)) commentsByReport.set(c.bug_report_id, [])
    commentsByReport.get(c.bug_report_id)!.push(c)
  }

  const lines: string[] = []
  lines.push(`# Bug Reports`)
  lines.push('')
  lines.push(`Source: \`${dbPath}\` — exported ${new Date().toISOString()}`)
  lines.push(
    `Filter: ${statuses ? `status in (${statuses.join(', ')})` : 'all statuses'} — pass --status <status> or --all to change`,
  )
  lines.push(`Total: ${reports.length}`)
  lines.push('')
  lines.push('---')

  for (const r of reports) {
    lines.push('')
    lines.push(`## #${r.id} — ${r.title}`)
    lines.push('')
    lines.push(`- **Status:** ${r.status}`)
    lines.push(`- **Category:** ${r.category ?? '—'}`)
    lines.push(`- **Severity:** ${r.severity ?? '—'}`)
    lines.push(`- **Reporter:** ${r.reporter_name ?? r.reporter_email ?? '—'}`)
    if (r.assignee_name) lines.push(`- **Assignee:** ${r.assignee_name}`)
    lines.push(`- **Page URL:** ${r.page_url ?? '—'}`)
    lines.push(`- **Created:** ${formatDate(r.created_at)}`)
    if (r.resolved_at) {
      lines.push(`- **Resolved:** ${formatDate(r.resolved_at)} by ${r.resolved_by_name ?? '—'}`)
    }
    lines.push('')
    lines.push('**Description:**')
    lines.push('')
    lines.push(r.description)

    if (r.resolution_notes) {
      lines.push('')
      lines.push('**Resolution notes:**')
      lines.push('')
      lines.push(r.resolution_notes)
    }

    const reportComments = commentsByReport.get(r.id) ?? []
    if (reportComments.length > 0) {
      lines.push('')
      lines.push('**Comments:**')
      for (const c of reportComments) {
        lines.push('')
        lines.push(
          `- _${formatDate(c.created_at)}_ **${c.author_name ?? 'unknown'}**: ${c.content}`,
        )
      }
    }

    lines.push('')
    lines.push('---')
  }

  writeFileSync(outPath, lines.join('\n'))
  console.log(`Wrote ${reports.length} bug reports to ${outPath}`)
}

main()
