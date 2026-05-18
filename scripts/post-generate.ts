// Post-generate patches for generated/prisma/client.ts.
// Run via "npm run generate" after prisma generate completes.
// Add new patches below following the same pattern.
import { readFileSync, writeFileSync } from 'node:fs'

const file = 'generated/prisma/client.ts'
let content: string = readFileSync(file, 'utf8')
let dirty = false

function patch(description: string, from: string, to: string): void {
  if (content.includes(to)) {
    console.log(`  already applied: ${description}`)
  } else if (content.includes(from)) {
    content = content.replace(from, to)
    dirty = true
    console.log(`  patched: ${description}`)
  } else {
    console.warn(
      `  WARNING: expected string not found for "${description}" — Prisma generator may have changed`,
    )
  }
}

// Prisma's generator emits a process.cwd()-based path annotation so bundlers can
// locate the native query engine binary. Turbopack resolves process.cwd() to the
// project root and traces every file under it, causing next build to warn that
// next.config.ts was "unexpectedly" included in the NFT list for every route that
// imports Prisma. The __dirname annotation on the line above is sufficient for
// Turbopack, so we suppress the process.cwd() trace with turbopackIgnore.
patch(
  'suppress process.cwd() NFT trace in Turbopack build',
  'path.join(process.cwd(),',
  'path.join(/*turbopackIgnore: true*/ process.cwd(),',
)

if (dirty) {
  writeFileSync(file, content)
  console.log(`Wrote ${file}`)
} else {
  console.log(`${file}: no changes needed`)
}

// ─── Zod generated file patches ──────────────────────────────────────────────

const zodFile = 'generated/zod/index.ts'
let zodContent: string = readFileSync(zodFile, 'utf8')
let zodDirty = false

// Strip the ENUMS section (Prisma internals: ScalarFieldEnum, SortOrder, etc.)
// These duplicate types already in generated/prisma and aren't useful for validation.
const ENUMS_MARKER = '/////////////////////////////////////////\n// ENUMS\n'
const MODELS_MARKER = '/////////////////////////////////////////\n// MODELS\n'
const enumsStart = zodContent.indexOf(ENUMS_MARKER)
const modelsStart = zodContent.indexOf(MODELS_MARKER)

if (enumsStart !== -1 && modelsStart !== -1 && enumsStart < modelsStart) {
  zodContent = zodContent.slice(0, enumsStart) + zodContent.slice(modelsStart)
  zodDirty = true
  console.log('  patched: strip Prisma internal enum schemas from zod output')
} else {
  console.log('  already applied or not found: zod enum strip')
}

if (zodDirty) {
  writeFileSync(zodFile, zodContent)
  console.log(`Wrote ${zodFile}`)
} else {
  console.log(`${zodFile}: no changes needed`)
}
