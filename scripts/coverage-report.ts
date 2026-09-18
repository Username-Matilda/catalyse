import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Prints the unit-test coverage as Markdown: the overall figures, then for every file
 * below 100% the lines that never ran. CI appends this to the job summary so a coverage
 * failure can be read from the run page; `npm run coverage:report` does the same locally.
 */

type Position = { line: number }
type FileCoverage = {
  path: string
  statementMap: Record<string, { start: Position; end: Position }>
  s: Record<string, number>
}
type Summary = Record<string, { pct: number; covered: number; total: number }>

const dir = path.resolve('coverage')

/** Collapses sorted line numbers into "3, 7-9, 12". */
export function formatRanges(lines: number[]): string {
  const ranges: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const start = lines[i]
    while (i + 1 < lines.length && lines[i + 1] === lines[i] + 1) i++
    ranges.push(start === lines[i] ? String(start) : `${start}-${lines[i]}`)
  }
  return ranges.join(', ')
}

/** Lines holding a statement that never executed. */
export function uncoveredLines(file: FileCoverage): number[] {
  const lines = new Set<number>()
  for (const [id, count] of Object.entries(file.s)) {
    if (count === 0) lines.add(file.statementMap[id].start.line)
  }
  return [...lines].sort((a, b) => a - b)
}

export function report(summary: Summary, files: FileCoverage[], root = process.cwd()): string {
  const out = ['## Unit test coverage', '', '| Metric | Coverage | Covered |', '|---|---|---|']
  for (const k of ['lines', 'statements', 'branches', 'functions']) {
    out.push(`| ${k} | ${summary[k].pct}% | ${summary[k].covered}/${summary[k].total} |`)
  }
  const missed = files
    .map((f) => ({ file: path.relative(root, f.path), lines: uncoveredLines(f) }))
    .filter((f) => f.lines.length > 0)
    .sort((a, b) => a.file.localeCompare(b.file))
  if (missed.length > 0) {
    out.push('', '### Uncovered lines', '', '| File | Lines |', '|---|---|')
    for (const { file, lines } of missed) out.push(`| \`${file}\` | ${formatRanges(lines)} |`)
  }
  return out.join('\n') + '\n'
}

function main(): void {
  const summaryPath = path.join(dir, 'coverage-summary.json')
  if (!fs.existsSync(summaryPath)) {
    console.log('## Unit test coverage\n\nNo coverage report was produced.\n')
    return
  }
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')).total as Summary
  const files = Object.values(
    JSON.parse(fs.readFileSync(path.join(dir, 'coverage-final.json'), 'utf8')) as Record<
      string,
      FileCoverage
    >,
  )
  process.stdout.write(report(summary, files))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
