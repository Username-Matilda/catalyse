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
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  BASELINE,
  GALLERY,
  HISTORY,
  POOL,
  PREVIOUS,
  sidecarFile,
  type CaptureMeta,
} from '../e2e/snapshots/config'
import { appendHistory, clearBaseline, pngSha, writeBaseline } from '../e2e/snapshots/png'

const ROOT = path.resolve(__dirname, '..')

const USAGE = `npm run snapshots [-- <flags> <playwright arguments>]

Runs the E2E suite once per lane with every test photographed, writes
snapshots/index.html, and diffs each picture against the run before it.

  --against=<ref>    Capture <ref> in a temporary worktree and pin it as the
                     baseline every later plain run diffs against.
  --clear-baseline   Drop that pin and go back to diffing the run before.
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
 * Capture `ref` in a git worktree under the temp directory, copy what it
 * captured into `previous/`, and pin it so plain runs diff against it. The
 * working tree and `current/` here are never touched.
 */
async function captureAgainst(ref: string, args: string[]): Promise<number> {
  const worktree = await mkdtemp(path.join(tmpdir(), 'catalyse-snapshots-'))
  console.log(`Capturing ${ref} in a worktree at ${worktree}`)
  try {
    run('git', ['worktree', 'add', '--detach', worktree, ref])
    await symlink(path.join(ROOT, 'node_modules'), path.join(worktree, 'node_modules'))
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

async function main(argv: string[]): Promise<number> {
  const passthrough: string[] = []
  let against: string | undefined
  let clear = false
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      console.log(USAGE)
      return 0
    }
    if (arg === '--clear-baseline') {
      clear = true
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
