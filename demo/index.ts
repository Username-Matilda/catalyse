import { chromium, Browser } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { buildForDemo, startDemoServer, stopDemoServer } from './server'
import { DemoEngine } from './engine'
import * as volunteerSignupApprovalFlow from './flows/volunteer-signup-approval-flow'

type FlowModule = {
  meta: { name: string; title: string }
  run: (engine: DemoEngine, browser: Browser) => Promise<void>
}

const ALL_FLOWS: FlowModule[] = [volunteerSignupApprovalFlow]

async function main() {
  const flowArg = process.argv[2]
  let flowsToRun: FlowModule[]

  if (flowArg) {
    const found = ALL_FLOWS.find((f) => f.meta.name === flowArg)
    if (!found) {
      console.error(
        `Unknown flow: "${flowArg}". Available: ${ALL_FLOWS.map((f) => f.meta.name).join(', ')}`,
      )
      process.exit(1)
    }
    flowsToRun = [found]
  } else {
    process.env.DEMO_HEADLESS = 'true'
    flowsToRun = ALL_FLOWS
  }

  console.log('Building for demo...')
  await buildForDemo()

  for (const flow of flowsToRun) {
    console.log(`\n=== Running flow: ${flow.meta.name} ===`)

    const dbPath = path.join(os.tmpdir(), 'catalyse_demo', flow.meta.name, 'catalyse.db')
    const scratchDir = path.join(process.cwd(), 'demo', '.scratch', flow.meta.name)

    fs.rmSync(scratchDir, { recursive: true, force: true })
    fs.mkdirSync(scratchDir, { recursive: true })

    // Detect all narration texts without TTS or recording
    const detectEngine = new DemoEngine({ detectMode: true, scratchDir })
    await flow.run(detectEngine, null as unknown as Browser)
    const narrationTexts = detectEngine.collectNarration()
    console.log(`  Found ${narrationTexts.length} narration clips.`)

    // Pre-generate TTS and start server concurrently — whichever takes longer wins
    const engine = new DemoEngine({ scratchDir })
    process.stdout.write('  Waiting for server and pre-generating narration...')
    await Promise.all([engine.pregenerateNarration(narrationTexts), startDemoServer(dbPath)])
    console.log(' ready.')

    try {
      const browser = await chromium.launch({ headless: !!process.env.DEMO_HEADLESS })
      try {
        await flow.run(engine, browser)
      } finally {
        await browser.close()
      }

      const outputDir = path.join(process.cwd(), 'demo', 'output')
      fs.mkdirSync(outputDir, { recursive: true })
      await engine.compile(path.join(outputDir, `${flow.meta.name}.webm`))
    } finally {
      stopDemoServer()
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
