/**
 * `npm run snapshots`: the command in front of the visual snapshot run.
 *
 * The run itself is the Playwright E2E suite with `SNAPSHOTS=1`, which turns
 * on the lanes, the capture fixtures and the reporter under `e2e/snapshots/`.
 * This script adds the two things Playwright cannot do for itself: pin a git
 * ref as the baseline, and clear that pin.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  BASELINE,
  GALLERY,
  HISTORY,
  LATEST,
  POOL,
  PREVIOUS,
  RUNS,
  sidecarFile,
  SNAPSHOT_ROOT,
  type CaptureMeta,
} from '../e2e/snapshots/config'
import { renderGallery } from '../e2e/snapshots/gallery'
import {
  appendHistory,
  clearBaseline,
  pngSha,
  readBaseline,
  writeBaseline,
} from '../e2e/snapshots/png'
import { galleryRows } from '../e2e/snapshots/rows'
import { listRuns, mergeLatestRuns, type RunManifest } from '../e2e/snapshots/runs'

const ROOT = path.resolve(__dirname, '..')

const USAGE = `npm run snapshots [-- <flags> <playwright arguments>]

Runs the E2E suite once per lane with every test photographed, writes
snapshots/index.html, and diffs each picture against the run before it.

  --against=<ref>    Capture <ref> in a temporary worktree and pin it as the
                     baseline every later plain run diffs against.
  --clear-baseline   Drop that pin and go back to diffing the run before.
  --render           Rebuild snapshots/index.html from the newest complete run
                     of each lane on disk, without capturing anything.
  --baseline-from=<url>
                     Pin a published gallery as the baseline, the way --against
                     pins a ref: its pictures come down into previous/.
  --export=<dir> [--baseline-from=<url>]
                     Render as --render does, into <dir> with the files the
                     page needs. Given the URL the baseline came from, the
                     pictures already published there are linked, not copied.
  --help             This.

Anything else is passed to Playwright, so a run can be narrowed the usual way:

  npm run snapshots -- --project=desktop-light
  npm run snapshots -- e2e/tests/11-dashboard.spec.ts
  npm run snapshots -- --grep "notification"

A narrowed run regenerates only the matching pictures; the gallery still
shows every other row from the last full run, marked as carried.`

function run(
  command: string,
  args: string[],
  options: { cwd?: string; env?: Record<string, string> } = {},
): number {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    env: { ...process.env, ...options.env },
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  return result.status ?? 1
}

function output(command: string, args: string[], cwd = ROOT): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed`)
  return result.stdout.trim()
}

function playwright(args: string[], cwd = ROOT): number {
  return run(path.join(ROOT, 'node_modules', '.bin', 'playwright'), ['test', ...args], {
    cwd,
    env: { SNAPSHOTS: '1' },
  })
}

/**
 * Capture `ref` in a git worktree, copy what it captured into `previous/`,
 * and pin it so plain runs diff against it. The working tree and `current/`
 * here are never touched.
 *
 * The worktree lives under the repo's own ignored scratch directory rather
 * than the system temp: the build refuses a node_modules that points outside
 * its root, so the worktree gets a hard-linked copy instead, and hard links
 * need one filesystem.
 */
async function captureAgainst(ref: string, args: string[]): Promise<number> {
  await mkdir(path.join(ROOT, 'tmp'), { recursive: true })
  const worktree = await mkdtemp(path.join(ROOT, 'tmp', 'snapshots-against-'))
  console.log(`Capturing ${ref} in a worktree at ${worktree}`)
  try {
    run('git', ['worktree', 'add', '--detach', worktree, ref])
    const linked = run('cp', [
      '-al',
      path.join(ROOT, 'node_modules'),
      path.join(worktree, 'node_modules'),
    ])
    if (linked !== 0) throw new Error('Could not link node_modules into the worktree')
    // The worktree shares dependencies but not the environment; the suite reads both.
    for (const envFile of ['.env', '.env.local']) {
      if (existsSync(path.join(ROOT, envFile))) {
        await copyFile(path.join(ROOT, envFile), path.join(worktree, envFile))
      }
    }
    const status = playwright(args, worktree)
    if (status !== 0)
      console.log(`The ${ref} run exited ${String(status)}; pinning what it captured.`)
    const worktreeCurrent = path.join(worktree, 'snapshots', 'current')
    if (!existsSync(worktreeCurrent)) throw new Error(`The ${ref} run captured nothing.`)
    await mkdir(PREVIOUS, { recursive: true })
    await mkdir(POOL, { recursive: true })
    const pins: Record<string, string> = {}
    for (const entry of await readdir(worktreeCurrent)) {
      if (!entry.endsWith('.png')) continue
      const source = path.join(worktreeCurrent, entry)
      const buffer = await readFile(source)
      const sha = pngSha(buffer)
      if (!existsSync(path.join(POOL, `${sha}.png`)))
        await copyFile(source, path.join(POOL, `${sha}.png`))
      await copyFile(source, path.join(PREVIOUS, entry))
      const sidecar = path.join(worktreeCurrent, sidecarFile(entry))
      if (existsSync(sidecar)) {
        // Inside the worktree this was a plain run of its own; only here does
        // it become the ref's picture.
        const meta = JSON.parse(await readFile(sidecar, 'utf8')) as CaptureMeta
        meta.ref = ref
        await writeFile(path.join(PREVIOUS, sidecarFile(entry)), JSON.stringify(meta, null, 2))
      }
      pins[entry] = sha
      await appendHistory(entry, sha, ref, HISTORY)
    }
    if (Object.keys(pins).length === 0) throw new Error(`The ${ref} run captured nothing.`)
    const sha = output('git', ['rev-parse', ref])
    await writeBaseline({ ref, sha, pinnedAt: new Date().toISOString(), pins }, BASELINE)
    console.log(
      `Baseline pinned at ${ref} (${sha.slice(0, 7)}), ${String(Object.keys(pins).length)} pictures. Plain runs now diff against it; clear with --clear-baseline.`,
    )
    return 0
  } finally {
    run('git', ['worktree', 'remove', '--force', worktree])
    await rm(worktree, { recursive: true, force: true })
  }
}

/**
 * Pin a published gallery as the baseline: its manifest names every picture,
 * and each comes down into `previous/` with its sidecar. This is how a pull
 * request's run diffs against what main last published.
 */
async function baselineFrom(url: string): Promise<number> {
  const base = url.replace(/\/$/, '')
  const response = await fetch(`${base}/manifest.json`)
  if (!response.ok) {
    console.error(`No gallery at ${base} (${String(response.status)}); nothing pinned.`)
    return 1
  }
  const manifest = (await response.json()) as RunManifest
  await mkdir(PREVIOUS, { recursive: true })
  const pins: Record<string, string> = {}
  for (const file of Object.keys(manifest.captures)) {
    const png = await fetch(`${base}/current/${file}`)
    if (!png.ok) continue
    const buffer = Buffer.from(await png.arrayBuffer())
    await writeFile(path.join(PREVIOUS, file), buffer)
    const sidecar = await fetch(`${base}/current/${sidecarFile(file)}`)
    if (sidecar.ok) {
      const meta = (await sidecar.json()) as CaptureMeta
      meta.ref = manifest.ref ?? 'main'
      await writeFile(path.join(PREVIOUS, sidecarFile(file)), JSON.stringify(meta, null, 2))
    }
    pins[file] = pngSha(buffer)
  }
  await writeBaseline(
    { ref: 'main', sha: manifest.commit, pinnedAt: new Date().toISOString(), pins },
    BASELINE,
  )
  console.log(`Baseline pinned from ${base}: ${String(Object.keys(pins).length)} pictures.`)
  return 0
}

/**
 * The gallery from what is on disk: the newest complete run of each lane,
 * merged. This is how one page comes out of a run split across CI jobs.
 *
 * With `exportDir`, the page and the files it needs are copied there for
 * publishing. Given the URL the baseline was pinned from, the pictures that
 * already live there are referenced rather than copied: every previous
 * picture, and the current picture of every row that did not change. What
 * remains is the page, the changed rows and the diffs.
 */
async function render(exportDir?: string, baselineUrl?: string): Promise<number> {
  const manifest = mergeLatestRuns(await listRuns(RUNS))
  if (!manifest) {
    console.error('No complete run to render.')
    return 1
  }
  const captures = Object.values(manifest.captures)
  const cost = {
    captures: captures.length,
    ms: captures.reduce((sum, capture) => sum + (capture.durationMs ?? 0), 0),
    wallMs: 0,
  }
  const rows = await galleryRows(manifest)
  const baseline = await readBaseline(BASELINE)
  if (exportDir === undefined) {
    await writeFile(GALLERY, renderGallery(rows, manifest, baseline, cost))
    await writeFile(LATEST, JSON.stringify(manifest, null, 2))
    console.log(`Gallery: ${GALLERY} (${manifest.lanes.join(', ')})`)
    return 0
  }
  const remote = baselineUrl?.replace(/\/$/, '')
  const files = new Set<string>()
  for (const row of rows) {
    if (row.failureSrc !== undefined) files.add(row.failureSrc)
    if (row.file === undefined) continue
    // A published gallery is a baseline for others to diff against and a
    // record of one build, so it carries only current pictures; the previous
    // ones are reachable where they were published, or not at all.
    if (remote !== undefined && row.hasPrevious && row.previousRun.ref !== undefined) {
      row.previousSrc = `${remote}/current/${row.file}`
    } else {
      row.hasPrevious = false
      row.previousSrc = undefined
    }
    if (remote !== undefined && row.hasPrevious && !row.changed && row.diffPixels === 0) {
      row.currentSrc = row.previousSrc
    } else if (row.currentSrc !== undefined) {
      files.add(row.currentSrc)
    }
    if (row.hasDiff && row.hasPrevious) files.add(`diffs/${row.file}`)
  }
  await rm(exportDir, { recursive: true, force: true })
  await mkdir(exportDir, { recursive: true })
  for (const file of files) {
    const source = path.join(SNAPSHOT_ROOT, file)
    if (!existsSync(source)) continue
    await mkdir(path.dirname(path.join(exportDir, file)), { recursive: true })
    await copyFile(source, path.join(exportDir, file))
    const sidecar = sidecarFile(source)
    if (sidecar !== source && existsSync(sidecar)) {
      await copyFile(sidecar, sidecarFile(path.join(exportDir, file)))
    }
  }
  await writeFile(path.join(exportDir, 'index.html'), renderGallery(rows, manifest, baseline, cost))
  await writeFile(path.join(exportDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`Exported ${String(files.size)} files and the gallery to ${exportDir}`)
  return 0
}

async function main(argv: string[]): Promise<number> {
  const passthrough: string[] = []
  let against: string | undefined
  let clear = false
  let rerender = false
  let baselineUrl: string | undefined
  let exportDir: string | undefined
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      console.log(USAGE)
      return 0
    }
    if (arg === '--clear-baseline') {
      clear = true
    } else if (arg === '--render') {
      rerender = true
    } else if (arg.startsWith('--baseline-from=')) {
      baselineUrl = arg.slice('--baseline-from='.length)
    } else if (arg.startsWith('--export=')) {
      rerender = true
      exportDir = path.resolve(arg.slice('--export='.length))
    } else if (arg.startsWith('--against=')) {
      against = arg.slice('--against='.length)
    } else if (arg === '--against') {
      against = argv[i + 1]
      i += 1
    } else {
      passthrough.push(arg)
    }
  }
  if (clear) {
    console.log(
      (await clearBaseline(BASELINE))
        ? 'Baseline cleared. Plain runs diff against the run before them again.'
        : 'No baseline was pinned.',
    )
    return 0
  }
  if (rerender) return render(exportDir, baselineUrl)
  if (baselineUrl !== undefined) return baselineFrom(baselineUrl)
  if (against !== undefined) return captureAgainst(against, passthrough)
  const status = playwright(passthrough)
  console.log(`Gallery: ${GALLERY}`)
  return status
}

main(process.argv.slice(2)).then(
  (status) => process.exit(status),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  },
)
