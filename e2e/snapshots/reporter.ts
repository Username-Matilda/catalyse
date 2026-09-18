/**
 * The runner-side half of a snapshot run. Playwright drives the tests; this
 * reporter plans the run, files each capture the workers stage, diffs it
 * against the last run's, and keeps the gallery up to date as it goes.
 */
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter'
import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  BASELINE,
  CURRENT,
  DIFFS,
  FAILURES,
  GALLERY,
  HISTORY,
  laneById,
  laneIndex,
  POOL,
  PREVIOUS,
  RUNS,
  sidecarFile,
  SNAPSHOT_ROOT,
  specId,
  STAGING,
  testKey,
  type CaptureMeta,
} from './config'
import { renderGallery, type GalleryRow, type ImageProvenance, type RunCost } from './gallery'
import {
  analyzeImages,
  appendHistory,
  decodePng,
  encodePng,
  ingestToPool,
  isRealChange,
  pngSha,
  readBaseline,
  renderDiffImage,
} from './png'
import {
  newRunId,
  pruneRuns,
  runProgress,
  writeRun,
  type RunManifest,
  type TestStatus,
} from './runs'

/** How many run manifests to keep. A few KB each; the images live in the pool. */
const RUNS_KEPT = 50
/** How often the gallery is rewritten while a run is still capturing. */
const PROGRESS_EVERY_MS = 2_000

function git(args: string): string {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

/** Describe titles between the file and the test, the way the worker's testInfo lists them. */
function titlePathOf(test: TestCase): string[] {
  const titles = [test.title]
  for (let suite: Suite | undefined = test.parent; suite?.type === 'describe'; suite = suite.parent) {
    titles.unshift(suite.title)
  }
  return titles
}

function keyOf(test: TestCase): string {
  const project = test.parent.project()
  return testKey(project?.name ?? '', test.location.file, titlePathOf(test))
}

/** What a capture is compared against: the pinned baseline, or the last complete run. */
function baselinePathFor(file: string): string {
  return existsSync(BASELINE) ? path.join(PREVIOUS, file) : path.join(CURRENT, file)
}

async function readMeta(pngPath: string): Promise<CaptureMeta | undefined> {
  const metaPath = sidecarFile(pngPath)
  if (!existsSync(metaPath)) return undefined
  return JSON.parse(await readFile(metaPath, 'utf8')) as CaptureMeta
}

async function fileTimestamp(filePath: string): Promise<string | undefined> {
  const meta = await readMeta(filePath)
  return meta?.capturedAt
}

function provenance(meta: CaptureMeta | undefined, manifest: RunManifest): ImageProvenance {
  return {
    runId: meta?.runId,
    commit: meta?.commit,
    dirty: meta?.dirty ?? false,
    ref: meta?.ref,
    thisRun: meta?.runId === manifest.runId,
  }
}

function firstLine(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.split('\n')[0] ?? ''
}

export default class SnapshotReporter implements Reporter {
  private manifest!: RunManifest
  private startedAt = 0
  private captured = { captures: 0, ms: 0 }
  private queue: Promise<void> = Promise.resolve()
  private renderedAt = 0
  private unsettled: string[] = []

  printsToStdio(): boolean {
    return false
  }

  onBegin(_config: FullConfig, suite: Suite): void {
    this.startedAt = Date.now()
    const tests = suite.allTests()
    const lanes = [...new Set(tests.map((test) => test.parent.project()?.name ?? ''))].filter(
      (lane) => laneIndex(lane) >= 0,
    )
    const filters = process.argv
      .slice(2)
      .filter((arg) => !arg.startsWith('--reporter') && !arg.startsWith('--config'))
    this.manifest = {
      runId: newRunId(new Date(), randomUUID().slice(0, 4)),
      startedAt: new Date().toISOString(),
      status: 'running',
      commit: git('rev-parse --short HEAD') || 'unknown',
      dirty: git('status --porcelain') !== '',
      filters,
      lanes,
      tests: Object.fromEntries(
        tests.map((test) => [
          keyOf(test),
          {
            status: 'pending' as TestStatus,
            lane: test.parent.project()?.name ?? '',
            spec: specId(test.location.file),
            title: titlePathOf(test).join(' › '),
            line: test.location.line,
            captures: [],
          },
        ]),
      ),
      captures: {},
    }
    // Synchronous, because the workers start staging captures the moment
    // this returns, and the directory they write to must already be clean.
    this.resetDirectories()
    this.queue = this.queue.then(async () => {
      await writeRun(this.manifest, RUNS)
      await this.showProgress(true)
    })
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    this.queue = this.queue.then(() => this.fileTest(test, result)).catch((error: unknown) => {
      console.error(`[snapshots] ${firstLine(error)}`)
    })
  }

  async onEnd(result: FullResult): Promise<{ status?: FullResult['status'] } | undefined> {
    await this.queue
    this.manifest.status = 'complete'
    this.manifest.finishedAt = new Date().toISOString()
    await this.commitRun()
    await writeRun(this.manifest, RUNS)
    await pruneRuns(RUNS, RUNS_KEPT)
    await this.showProgress(true)
    const { failed } = runProgress(this.manifest)
    const changed = Object.values(this.manifest.captures).filter(
      (capture) => (capture.diffPixels ?? 0) > 0,
    ).length
    console.log(
      `\n[snapshots] ${String(this.captured.captures)} captures, ${String(changed)} changed, ${String(failed)} tests failed. Gallery: ${GALLERY}`,
    )
    if (this.unsettled.length > 0) {
      console.log(
        `[snapshots] Still moving after the settle window, so shot mid-flight and not reproducible:\n  ${this.unsettled.join('\n  ')}`,
      )
    }
    return result.status === 'passed' ? undefined : { status: result.status }
  }

  /**
   * Prepare the directories for a run. Nothing rotates here, because a run's
   * captures only reach `current/` at the end; what this clears is the
   * wreckage of a run that never got that far.
   */
  private resetDirectories(): void {
    for (const dir of [SNAPSHOT_ROOT, PREVIOUS, CURRENT, DIFFS, POOL, RUNS, FAILURES]) {
      mkdirSync(dir, { recursive: true })
    }
    if (existsSync(STAGING)) {
      for (const entry of readdirSync(STAGING)) {
        rmSync(path.join(DIFFS, entry), { force: true })
      }
      rmSync(STAGING, { recursive: true, force: true })
    }
    mkdirSync(STAGING, { recursive: true })
    // A failure shot is only ever this run's; last run's would read as today's.
    for (const key of Object.keys(this.manifest.tests)) {
      rmSync(path.join(FAILURES, `${key}.png`), { force: true })
    }
  }

  private async fileTest(test: TestCase, result: TestResult): Promise<void> {
    const key = keyOf(test)
    const entry = this.manifest.tests[key]
    if (!entry) return
    entry.status =
      result.status === 'passed'
        ? 'passed'
        : result.status === 'skipped'
          ? 'skipped'
          : 'failed'
    entry.durationMs = result.duration
    if (result.error) entry.error = firstLine(result.error.message ?? result.error)
    entry.failureShot = existsSync(path.join(FAILURES, `${key}.png`))
    const staged = (await readdir(STAGING))
      .filter((name) => name.startsWith(`${key}--`) && name.endsWith('.png'))
      .sort()
    for (const file of staged) {
      await this.fileCapture(file, key)
    }
    await writeRun(this.manifest, RUNS)
    await this.showProgress(false)
  }

  /**
   * Diff a staged capture against this run's baseline, complete its sidecar,
   * and pool it. The numbers are cached once here, so every later gallery
   * build reads them instead of decoding both PNGs again.
   */
  private async fileCapture(file: string, key: string): Promise<void> {
    const stagedPath = path.join(STAGING, file)
    const meta = await readMeta(stagedPath)
    if (!meta) return
    const buffer = await readFile(stagedPath)
    const sha = pngSha(buffer)
    const previousPath = baselinePathFor(file)
    const hasPrevious = existsSync(previousPath)
    let diffPixels = 0
    if (hasPrevious) {
      const prevImage = decodePng(await readFile(previousPath))
      const currImage = decodePng(buffer)
      const diff = analyzeImages(prevImage, currImage)
      meta.diff = diff
      diffPixels = diff.count
      const diffPath = path.join(DIFFS, file)
      if (diff.count > 0) {
        await writeFile(diffPath, encodePng(renderDiffImage(prevImage, currImage)))
      } else {
        await rm(diffPath, { force: true })
      }
    }
    meta.sha = sha
    meta.hasPrevious = hasPrevious
    meta.diffPixels = diffPixels
    meta.runId = this.manifest.runId
    meta.commit = this.manifest.commit
    meta.dirty = this.manifest.dirty
    await writeFile(sidecarFile(stagedPath), JSON.stringify(meta, null, 2))
    await ingestToPool(buffer, POOL)
    await appendHistory(file, sha, undefined, HISTORY)
    this.manifest.captures[file] = {
      status: meta.settled ? 'captured' : 'unsettled',
      test: key,
      sha,
      durationMs: meta.durationMs,
      diffPixels,
    }
    this.manifest.tests[key]?.captures.push(file)
    this.captured.captures += 1
    this.captured.ms += meta.durationMs
    if (!meta.settled) this.unsettled.push(file)
  }

  /**
   * Move a finished run's captures into place: the images they replace step
   * back to `previous/`, the new ones take `current/`. A pinned baseline is
   * not rotated, since `previous/` holds the ref's captures until the pin is
   * cleared; there the staged frames simply become `current/`.
   */
  private async commitRun(): Promise<void> {
    const rotate = !existsSync(BASELINE)
    for (const file of Object.keys(this.manifest.captures)) {
      for (const name of [file, sidecarFile(file)]) {
        const staged = path.join(STAGING, name)
        if (!existsSync(staged)) continue
        const current = path.join(CURRENT, name)
        if (rotate && existsSync(current)) {
          await rm(path.join(PREVIOUS, name), { force: true })
          await rename(current, path.join(PREVIOUS, name))
        }
        await rm(current, { force: true })
        await rename(staged, current)
      }
    }
    await rm(STAGING, { recursive: true, force: true })
  }

  private async showProgress(force: boolean): Promise<void> {
    if (!force && Date.now() - this.renderedAt < PROGRESS_EVERY_MS) return
    this.renderedAt = Date.now()
    const cost: RunCost = { ...this.captured, wallMs: Date.now() - this.startedAt }
    const html = renderGallery(await this.galleryRows(), this.manifest, await readBaseline(BASELINE), cost)
    await writeFile(GALLERY, html)
  }

  /** Every capture with an image on disk, plus failed tests that took none, in rail order. */
  private async galleryRows(): Promise<GalleryRow[]> {
    const rows: GalleryRow[] = []
    const seen = new Set<string>()
    for (const dir of [STAGING, CURRENT]) {
      if (!existsSync(dir)) continue
      for (const file of await readdir(dir)) {
        if (!file.endsWith('.png') || seen.has(file)) continue
        seen.add(file)
        const row = await this.captureRow(file, dir === STAGING)
        if (row) rows.push(row)
      }
    }
    for (const [key, test] of Object.entries(this.manifest.tests)) {
      if (test.status === 'failed' && test.captures.length === 0) {
        rows.push(this.failureRow(key))
      }
    }
    return rows.sort(
      (a, b) =>
        laneIndex(a.lane) - laneIndex(b.lane) ||
        a.spec.localeCompare(b.spec) ||
        a.testLine - b.testLine ||
        a.testKey.localeCompare(b.testKey) ||
        a.seq - b.seq,
    )
  }

  private async captureRow(file: string, staged: boolean): Promise<GalleryRow | undefined> {
    const currentPath = path.join(staged ? STAGING : CURRENT, file)
    const previousPath = staged ? baselinePathFor(file) : path.join(PREVIOUS, file)
    const meta = await readMeta(currentPath)
    if (!meta || laneIndex(meta.lane) < 0) return undefined
    const lane = laneById(meta.lane)
    const test = this.manifest.tests[meta.key]
    const inRun = test !== undefined && test.status !== 'pending'
    const hasPrevious = meta.hasPrevious ?? existsSync(previousPath)
    const changed = !hasPrevious || (meta.diff !== undefined && isRealChange(meta.diff))
    return {
      id: file.replace(/\.png$/, ''),
      lane: lane.id,
      laneLabel: lane.label,
      viewport: lane.viewport,
      theme: lane.theme,
      spec: meta.spec,
      test: meta.test,
      testKey: meta.key,
      testLine: meta.testLine,
      seq: meta.seq,
      label: meta.label,
      path: meta.path,
      file,
      hasCurrent: true,
      hasPrevious,
      changed,
      diffPixels: meta.diffPixels ?? 0,
      durationMs: meta.durationMs,
      previousTimestamp: hasPrevious ? await fileTimestamp(previousPath) : undefined,
      currentTimestamp: meta.capturedAt,
      bbox: meta.diff?.bbox ?? undefined,
      hasDiff: existsSync(path.join(DIFFS, file)),
      currentSrc: `${staged ? 'staging' : 'current'}/${file}`,
      previousSrc: `${path.basename(path.dirname(previousPath))}/${file}`,
      currentRun: provenance(meta, this.manifest),
      previousRun: provenance(await readMeta(previousPath), this.manifest),
      testStatus: inRun ? test.status : undefined,
      unsettled: !meta.settled,
      testError: inRun ? test.error : undefined,
      failureSrc: inRun && test.failureShot ? `failures/${meta.key}.png` : undefined,
    }
  }

  private failureRow(key: string): GalleryRow {
    const test = this.manifest.tests[key]
    const lane = laneById(test.lane)
    const none: ImageProvenance = { dirty: false, thisRun: false }
    return {
      id: key,
      lane: lane.id,
      laneLabel: lane.label,
      viewport: lane.viewport,
      theme: lane.theme,
      spec: test.spec,
      test: test.title,
      testKey: key,
      testLine: test.line,
      seq: 0,
      label: 'no capture',
      path: '',
      hasCurrent: false,
      hasPrevious: false,
      changed: false,
      diffPixels: 0,
      hasDiff: false,
      currentRun: none,
      previousRun: none,
      testStatus: 'failed',
      unsettled: false,
      testError: test.error,
      failureSrc: test.failureShot ? `failures/${key}.png` : undefined,
    }
  }
}
