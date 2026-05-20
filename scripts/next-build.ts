import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

const PROJECT_ROOT = path.resolve(__dirname, '..')
const NEXT_BINARY = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'next')
const NEXT_DIR = path.join(PROJECT_ROOT, '.next')

// Build inputs that never appear in any source map, so the module graph can't
// tell us about them: config files (never enter the graph) and CSS (turbopack
// inlines styles — emitted *.css.map files have an empty `sources` array).
const CONFIG_FILES = [
  'next.config.ts',
  'postcss.config.mjs',
  'prisma.config.ts',
  'prisma/schema.prisma',
  'tsconfig.json',
  'package.json',
  'package-lock.json',
]
const CSS_WALK_ROOT = path.join(PROJECT_ROOT, 'app')

const TURBOPACK_PROJECT_PREFIX = 'turbopack:///[project]/'

// Every emitted *.map lists, in `sources`, the original files turbopack
// consumed to produce that chunk (project source + node_modules). Their union
// is the build's real input graph — maintained by Next, not by us.
function getMappedSources(): string[] | null {
  if (!fs.existsSync(NEXT_DIR)) return null

  const maps: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.map')) maps.push(full)
    }
  }
  walk(NEXT_DIR)
  if (maps.length === 0) return null

  const sources = new Set<string>()
  for (const map of maps) {
    let parsed: { sources?: string[] }
    try {
      parsed = JSON.parse(fs.readFileSync(map, 'utf8'))
    } catch {
      continue
    }
    const base = path.dirname(map)
    for (const raw of parsed.sources ?? []) {
      let decoded: string
      try {
        decoded = decodeURIComponent(raw.split('?')[0])
      } catch {
        continue
      }
      let resolved: string
      if (decoded.startsWith(TURBOPACK_PROJECT_PREFIX)) {
        resolved = path.join(PROJECT_ROOT, decoded.slice(TURBOPACK_PROJECT_PREFIX.length))
      } else if (decoded.includes('://')) {
        continue // virtual runtime module, no file on disk
      } else {
        resolved = path.resolve(base, decoded)
      }
      sources.add(resolved)
    }
  }
  return [...sources]
}

function getCssFiles(): string[] {
  if (!fs.existsSync(CSS_WALK_ROOT)) return []
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.css')) files.push(full)
    }
  }
  walk(CSS_WALK_ROOT)
  return files
}

export function isBuildFresh(): boolean {
  const buildId = path.join(NEXT_DIR, 'BUILD_ID')
  if (!fs.existsSync(buildId)) return false

  const sources = getMappedSources()
  if (!sources) return false

  const buildMtime = fs.statSync(buildId).mtimeMs
  const tracked = [
    ...sources,
    ...CONFIG_FILES.map((f) => path.join(PROJECT_ROOT, f)),
    ...getCssFiles(),
  ]
  return !tracked.some((f) => fs.existsSync(f) && fs.statSync(f).mtimeMs > buildMtime)
}

export async function buildNext(): Promise<void> {
  if (isBuildFresh()) {
    console.log('[build] Fresh — skipping next build')
    return
  }
  console.log('[build] Building...')
  await new Promise<void>((resolve, reject) => {
    const build = spawn(NEXT_BINARY, ['build'], { cwd: PROJECT_ROOT, stdio: 'pipe' })
    const chunks: Buffer[] = []
    build.stdout.on('data', (d) => chunks.push(d))
    build.stderr.on('data', (d) => chunks.push(d))
    build.on('close', (code) => {
      if (code === 0) {
        console.log('[build] Success')
        return resolve()
      }
      console.error(
        '[build] FAILED — next build runs before tests start. Tests did not run. Build output:',
      )
      process.stdout.write(Buffer.concat(chunks))
      reject(new Error(`next build failed (exit ${code})`))
    })
  })
}
