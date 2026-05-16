import { chromium, Browser } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { startDemoServer, stopDemoServer } from './server'
import { DemoEngine } from './engine'
import { recordDemoFlow } from './flows/demo'
import { SCRATCH_DIR, BASE_URL, DEMO_VIDEO_TITLE } from './data'

async function main() {
  fs.rmSync(SCRATCH_DIR, { recursive: true, force: true })
  fs.mkdirSync(SCRATCH_DIR, { recursive: true })

  console.log('Starting demo server...')
  const serverReady = startDemoServer()

  // Create the recording engine immediately so TTS model loading starts in parallel with the server build.
  const engine = new DemoEngine()

  // Detect all narration texts by running the flow with a no-op engine.
  // detectMode skips TTS and clip loading — nothing is wasted.
  console.log('Detecting narration clips...')
  const detectEngine = new DemoEngine({ detectMode: true })
  await recordDemoFlow(detectEngine, null as unknown as Browser)
  const narrationTexts = detectEngine.collectNarration()
  console.log(`  Found ${narrationTexts.length} clips.`)

  // Pre-generate all TTS and wait for the server concurrently — whichever takes longer wins.
  process.stdout.write('  Waiting for server and pre-generating narration...')
  await Promise.all([
    engine.pregenerateNarration(narrationTexts),
    serverReady,
  ])
  console.log(' ready.')

  try {
    console.log(`Recording demo against ${BASE_URL}`)
    console.log(`Output directory: ${SCRATCH_DIR}`)
    console.log()

    const browser = await chromium.launch({ headless: !!process.env.DEMO_HEADLESS })

    try {
      await recordDemoFlow(engine, browser)
    } finally {
      await browser.close()
    }

    const outputDir = path.join(process.cwd(), 'demo', 'output')
    fs.mkdirSync(outputDir, { recursive: true })
    const filename = DEMO_VIDEO_TITLE.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    await engine.compile(path.join(outputDir, `${filename}.webm`))
  } finally {
    stopDemoServer()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
