#!/usr/bin/env node
/**
 * Exports bug reports (with their comment threads) from the database at DATABASE_URL (or
 * --db <url>) to a Markdown file. Point it at a database restored from a prod backup.
 *
 * Usage:
 *   npm run export-bug-reports                          # open + in_progress only
 *   npm run export-bug-reports -- --db postgres://... --out bugs.md
 *   npm run export-bug-reports -- --status open         # single status
 *   npm run export-bug-reports -- --all                 # every status
 *   npm run export-bug-reports -- --base-url https://staging.example.com   # override live-link host
 */

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import { resolveDbUrl } from '../lib/db-url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

const dbUrl = argValue('--db') ?? resolveDbUrl()
const outPath = resolve(ROOT, argValue('--out') ?? 'bug-reports.md')
const baseUrl = (argValue('--base-url') ?? 'https://catalyse.up.railway.app').replace(/\/$/, '')
const showAll = process.argv.includes('--all')
const statusFilter = argValue('--status')
const statuses = statusFilter ? [statusFilter] : showAll ? null : ['open', 'in_progress']

interface BugReportRow {
  id: number
  title: string
  description: string
  status: string
  category: string | null
  severity: string | null
  page_url: string | null
  resolution_notes: string | null
  created_at: Date | null
  reporter_name: string | null
  reporter_email: string | null
  assignee_name: string | null
  resolved_by_name: string | null
  resolved_at: Date | null
}

interface CommentRow {
  bug_report_id: number
  content: string
  created_at: Date | null
  author_name: string | null
}

function formatDate(date: Date | null): string {
  if (date === null) return 'unknown'
  return date.toISOString().replace('T', ' ').slice(0, 19)
}

async function main(): Promise<void> {
  const db = new Client({ connectionString: dbUrl })
  await db.connect()

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
    query += ` WHERE br.status IN (${statuses.map((_, i) => `$${i + 1}`).join(', ')})`
    params.push(...statuses)
  }
  query += ' ORDER BY br.created_at DESC'

  const { rows: reports } = await db.query<BugReportRow>(query, params)

  const { rows: comments } = await db.query<CommentRow>(`
      SELECT c.bug_report_id, c.content, c.created_at, a.name AS author_name
      FROM bug_report_comments c
      LEFT JOIN volunteers a ON a.id = c.author_id
      ORDER BY c.bug_report_id, c.created_at ASC
    `)

  await db.end()

  const commentsByReport = new Map<number, CommentRow[]>()
  for (const c of comments) {
    if (!commentsByReport.has(c.bug_report_id)) commentsByReport.set(c.bug_report_id, [])
    commentsByReport.get(c.bug_report_id)!.push(c)
  }

  const lines: string[] = []
  lines.push(`# Bug Reports`)
  lines.push('')
  lines.push(
    `Source: \`${new URL(dbUrl).pathname.slice(1)}\` — exported ${new Date().toISOString()}`,
  )
  lines.push(
    `Filter: ${statuses ? `status in (${statuses.join(', ')})` : 'all statuses'} — pass --status <status> or --all to change`,
  )
  lines.push(`Total: ${reports.length}`)
  lines.push('')
  lines.push('---')

  for (const r of reports) {
    lines.push('')
    lines.push(`## [#${r.id} — ${r.title}](${baseUrl}/bugs/${r.id})`)
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

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
