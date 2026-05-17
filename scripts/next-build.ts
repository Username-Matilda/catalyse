import { execSync, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

const PROJECT_ROOT = path.resolve(__dirname, '..')
const NEXT_BINARY = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'next')

const SOURCE_FILES = ['next.config.ts', 'package.json', 'tsconfig.json']
const SOURCE_DIRS = ['app', 'lib', 'components', 'public', 'prisma']

export function isBuildFresh(): boolean {
  const buildId = path.join(PROJECT_ROOT, '.next', 'BUILD_ID')
  if (!fs.existsSync(buildId)) return false
  const buildMtime = fs.statSync(buildId).mtimeMs

  for (const file of SOURCE_FILES) {
    const p = path.join(PROJECT_ROOT, file)
    if (fs.existsSync(p) && fs.statSync(p).mtimeMs > buildMtime) return false
  }

  for (const dir of SOURCE_DIRS) {
    const p = path.join(PROJECT_ROOT, dir)
    if (!fs.existsSync(p)) continue
    const newer = execSync(`find "${p}" -newer "${buildId}" -type f | head -1`, {
      encoding: 'utf8',
    }).trim()
    if (newer) return false
  }

  return true
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
