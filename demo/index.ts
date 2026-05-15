import { chromium } from '@playwright/test'
import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import { startDemoServer, stopDemoServer, waitForServer } from './server'
import { DemoEngine } from './engine'
import { recordApplicantFlow } from './flows/applicant'
import { recordAdminFlow } from './flows/admin'
import { OUT_DIR, BASE_URL } from './data'

function mergeVideos(): void {
  const videos = ['01-applicant.webm', '02-admin.webm']
    .map((f) => path.join(OUT_DIR, f))
    .filter((f) => fs.existsSync(f))

  if (videos.length === 0) {
    console.warn('No videos found to merge.')
    return
  }

  const concatFile = path.join(OUT_DIR, 'concat.txt')
  fs.writeFileSync(concatFile, videos.map((f) => `file '${f}'`).join('\n'))

  const outFile = path.join(process.cwd(), 'demo.webm')
  console.log(`\nMerging ${videos.length} video(s) → ${outFile}`)
  execSync(`ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c copy "${outFile}"`, {
    stdio: 'pipe',
  })
  console.log('Done.')
}

async function main() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true })
  fs.mkdirSync(OUT_DIR, { recursive: true })

  console.log('Starting demo server...')
  startDemoServer()

  try {
    process.stdout.write('  Waiting for server to be ready...')
    await waitForServer()
    console.log(' ready.')

    console.log(`Recording demo against ${BASE_URL}`)
    console.log(`Output directory: ${OUT_DIR}`)
    console.log()

    const engine = new DemoEngine()
    const browser = await chromium.launch({ headless: false })

    try {
      await recordApplicantFlow(engine, browser)
      await recordAdminFlow(engine, browser)
    } finally {
      await browser.close()
    }

    mergeVideos()
  } finally {
    stopDemoServer()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
