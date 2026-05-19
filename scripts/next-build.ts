import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

const PROJECT_ROOT = path.resolve(__dirname, '..')
const NEXT_BINARY = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'next')

function getTracedFiles(): string[] | null {
  const serverDir = path.join(PROJECT_ROOT, '.next', 'server')
  if (!fs.existsSync(serverDir)) return null

  const nftFiles: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.nft.json')) nftFiles.push(full)
    }
  }
  walk(serverDir)

  if (nftFiles.length === 0) return null

  const traced = new Set<string>()
  for (const nftFile of nftFiles) {
    const { files } = JSON.parse(fs.readFileSync(nftFile, 'utf8')) as { files: string[] }
    const base = path.dirname(nftFile)
    for (const f of files) traced.add(path.resolve(base, f))
  }
  return [...traced]
}

export function isBuildFresh(): boolean {
  const buildId = path.join(PROJECT_ROOT, '.next', 'BUILD_ID')
  if (!fs.existsSync(buildId)) return false

  const traced = getTracedFiles()
  if (!traced) return false

  const buildMtime = fs.statSync(buildId).mtimeMs
  return !traced.some((f) => fs.existsSync(f) && fs.statSync(f).mtimeMs > buildMtime)
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
