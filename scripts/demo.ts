/**
 * Demo script: records the applicant signup/approval flow and admin review flow.
 *
 * Self-contained — copies your current DATABASE_URL db to an isolated file,
 * then starts a Next.js dev server on port 3099 against that copy.
 * No manual setup required beyond having a dev db with an admin account.
 *
 * Usage:
 *   npm run demo
 *
 * Output: demo.webm in the project root
 */

import { chromium, Browser, BrowserContext, Locator, Page } from '@playwright/test'
import { execSync, spawn, ChildProcess } from 'child_process'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { buildWelcomeAndConfirmHtml } from '../lib/email'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const NEXT_BINARY = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'next')

const DEMO_PORT = 3099
const BASE_URL = `http://localhost:${DEMO_PORT}`
const DEMO_DB_DIR = path.join(os.tmpdir(), 'catalyse_demo')
const DEMO_DB_PATH = path.join(DEMO_DB_DIR, 'catalyse.db')
const ADMIN_EMAIL = 'admin@example.com'
const ADMIN_PASSWORD = 'admin1'
const OUT_DIR = path.join(process.cwd(), 'demo-videos')
const SPEED = 1 // <1 = slower, >1 = faster

// ─── Audio synthesis ──────────────────────────────────────────────────────────

const SR = 44100 // sample rate

interface SoundEvent {
  kind: 'click' | 'type'
  ms: number
}

let phaseEvents: SoundEvent[] = []
let phaseStartMs = 0

function beginPhase() {
  phaseEvents = []
  phaseStartMs = Date.now()
}

function addSound(kind: SoundEvent['kind'], atMs?: number) {
  phaseEvents.push({ kind, ms: atMs ?? Date.now() - phaseStartMs })
  if (kind === 'click') playLiveClick()
}

function loadClip(filePath: string): Float32Array {
  const raw = execSync(`ffmpeg -i "${filePath}" -f f32le -ar ${SR} -ac 1 pipe:1 2>/dev/null`, {
    maxBuffer: 100 * 1024 * 1024, // 100 MB — enough for several minutes of audio
  })
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4)
}

const SOUNDS_DIR = path.join(__dirname, 'sounds')
const CLICK_CLIP = loadClip(path.join(SOUNDS_DIR, 'click.mp3'))
const TYPE_CLIP  = loadClip(path.join(SOUNDS_DIR, 'type.mp3'))

let typingPlayer: ChildProcess | null = null

function playLiveClick() {
  spawn('afplay', [path.join(SOUNDS_DIR, 'click.mp3')], { stdio: 'ignore' }).unref()
}

function startLiveTyping() {
  typingPlayer?.kill()
  typingPlayer = spawn('afplay', [path.join(SOUNDS_DIR, 'type.mp3')], { stdio: 'ignore' })
}

function stopLiveTyping() {
  typingPlayer?.kill()
  typingPlayer = null
}

function overlayClip(pcm: Float32Array, clip: Float32Array, offsetSamples: number) {
  for (let i = 0; i < clip.length; i++) {
    const j = offsetSamples + i
    if (j < pcm.length) pcm[j] = Math.max(-1, Math.min(1, pcm[j] + clip[i]))
  }
}

function buildWAV(events: SoundEvent[], videoPath: string): string {
  const durSec = parseFloat(
    execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`).toString().trim()
  )
  const total = Math.ceil(durSec * SR) + SR
  const pcm = new Float32Array(total)

  // Clicks: overlay each individually
  for (const ev of events.filter(e => e.kind === 'click')) {
    overlayClip(pcm, CLICK_CLIP, Math.floor((ev.ms / 1000) * SR))
  }

  // Typing: group consecutive events (gap < 600 ms = same session), overlay one
  // continuous slice of TYPE_CLIP per session so it sounds like real sustained typing
  const typeEvents = events.filter(e => e.kind === 'type').sort((a, b) => a.ms - b.ms)
  let clipCursor = 0
  let i = 0
  while (i < typeEvents.length) {
    const sessionStart = typeEvents[i].ms
    let sessionEnd = sessionStart
    while (i < typeEvents.length && typeEvents[i].ms - sessionEnd < 600) {
      sessionEnd = typeEvents[i].ms
      i++
    }
    const tailMs = 220 // let the last keypress ring out a little
    const durationSamples = Math.floor(((sessionEnd - sessionStart + tailMs) / 1000) * SR)
    const available = TYPE_CLIP.length - clipCursor
    const sliceSamples = Math.min(durationSamples, available > 0 ? available : TYPE_CLIP.length)
    if (available <= 0) clipCursor = 0 // wrap if we exhaust the file
    const slice = TYPE_CLIP.slice(clipCursor, clipCursor + sliceSamples)
    overlayClip(pcm, slice, Math.floor((sessionStart / 1000) * SR))
    clipCursor += sliceSamples
  }

  const data = Buffer.alloc(total * 2)
  for (let i = 0; i < total; i++)
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, pcm[i])) * 32767), i * 2)

  const hdr = Buffer.alloc(44)
  hdr.write('RIFF', 0);          hdr.writeUInt32LE(36 + data.length, 4)
  hdr.write('WAVE', 8);          hdr.write('fmt ', 12)
  hdr.writeUInt32LE(16, 16);     hdr.writeUInt16LE(1, 20)   // PCM
  hdr.writeUInt16LE(1, 22);      hdr.writeUInt32LE(SR, 24)  // mono
  hdr.writeUInt32LE(SR * 2, 28); hdr.writeUInt16LE(2, 32)
  hdr.writeUInt16LE(16, 34);     hdr.write('data', 36)
  hdr.writeUInt32LE(data.length, 40)

  const wavPath = videoPath.replace('.webm', '-sfx.wav')
  fs.writeFileSync(wavPath, Buffer.concat([hdr, data]))
  return wavPath
}

function mixAudioIntoClip(videoPath: string, events: SoundEvent[]) {
  if (!fs.existsSync(videoPath)) return
  const wavPath = buildWAV(events, videoPath)
  const tmp = videoPath + '.tmp.webm'
  try {
    execSync(
      `ffmpeg -y -i "${videoPath}" -i "${wavPath}" -map 0:v -map 1:a -c:v copy -c:a libopus "${tmp}"`,
      { stdio: 'pipe' },
    )
    fs.renameSync(tmp, videoPath)
  } catch {
    // libopus unavailable — fall back to no audio rather than crash
    console.warn('  Audio mix skipped (ffmpeg libopus not available)')
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
  }
  fs.unlinkSync(wavPath)
}

fs.rmSync(OUT_DIR, { recursive: true, force: true })
fs.mkdirSync(OUT_DIR, { recursive: true })

const APPLICANT = {
  name: 'Alex Chen',
  email: 'alex.chen@example.com',
  password: 'DemoPassword1',
  applicationMessage:
    "I've been following PauseAI's work for two years and believe AI safety is the defining challenge of our time. I'm a software engineer with ML experience and want to contribute to advocacy, technical writing, and community coordination.",
  bio: 'Software engineer focused on AI safety. Based in London.',
  discord: 'alexchen#4291',
  contactNotes: "Just let me know you're from PauseAI when you message.",
  location: 'London, UK',
  country: 'United Kingdom',
  localGroup: 'London',
  availability: '8',
}

const REJECT_APPLICANT = {
  name: 'Jordan Smith',
  email: 'jordan.smith@example.com',
  password: 'DemoPassword1',
  applicationMessage: 'I want to join to promote my startup and grow my network.',
}

// Cursor overlay — SVG arrow positioned via transform so updates hit the compositor layer.
// String (not function) so esbuild never injects __name() which would crash in browser context.
const CURSOR_SCRIPT = `
  (function() {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="32"><path d="M2 2 L2 26 L7 20 L11 30 L15 28 L11 18 L18 18 Z" fill="black" stroke="white" stroke-width="2" stroke-linejoin="round" paint-order="stroke fill"/></svg>';
    var url = 'data:image/svg+xml;base64,' + btoa(svg);
    var CSS = 'position:fixed;left:0;top:0;width:24px;height:32px;background-image:url(' + url + ');background-size:contain;background-repeat:no-repeat;pointer-events:none;z-index:2147483646;transform:translate(200px,200px)';
    function ensureCursor() {
      if (!document.body || document.getElementById('__demo-cursor__')) return;
      var el = document.createElement('div');
      el.id = '__demo-cursor__';
      el.style.cssText = CSS;
      document.body.appendChild(el);
    }
    var observer = new MutationObserver(ensureCursor);
    function start() {
      ensureCursor();
      observer.observe(document.body, { childList: true, subtree: false });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  })()
`

// Tracks the active page so type()/click()/smoothScrollTo() can drive the mouse explicitly.
let activePage: Page | null = null

async function pause(ms: number) {
  await new Promise((r) => setTimeout(r, ms / SPEED))
}

const CAPTION_CSS = [
  'position:fixed', 'bottom:32px', 'left:50%', 'transform:translateX(-50%)',
  'background:#000', 'color:#fff', 'padding:10px 28px',
  'border-radius:8px', 'font-size:17px', 'font-family:system-ui,sans-serif',
  'font-weight:500', 'z-index:2147483647', 'pointer-events:none',
  'max-width:75%', 'text-align:center', 'box-shadow:0 4px 16px rgba(0,0,0,0.5)',
  'opacity:0', 'transition:opacity 220ms ease',
].join(';')

async function showCaption(page: Page, text: string) {
  await page.evaluate(([msg, css]: [string, string]) => {
    document.getElementById('__demo-caption__')?.remove()
    const div = document.createElement('div')
    div.id = '__demo-caption__'
    div.textContent = msg
    div.style.cssText = css
    document.body.appendChild(div)
    requestAnimationFrame(() => { div.style.opacity = '1' })
  }, [text, CAPTION_CSS] as [string, string])
}

const CAPTION_FADE_MS = 240

async function hideCaption(page: Page) {
  await page.evaluate(() => {
    const div = document.getElementById('__demo-caption__')
    if (!div) return
    div.style.opacity = '0'
    setTimeout(() => div.remove(), 240)
  })
  await pause(CAPTION_FADE_MS)
}

async function caption(page: Page, text: string, durationMs = 2500) {
  await showCaption(page, text)
  await pause(durationMs)
  await hideCaption(page)
}

const ANIM_STEP_MS = 50 // real wall-clock ms per animation step; long enough for screencast to capture
let cursorX = 200
let cursorY = 200

// Parse current cursor position from transform:translate(Xpx,Ypx)
function parseCursorTransform(transform: string): [number, number] {
  const m = transform.match(/translate\(([0-9.-]+)px,\s*([0-9.-]+)px\)/)
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : [200, 200]
}

/** Move cursor from its current position to (tx, ty) via bezier arc with jittered timing */
async function moveCursorToXY(tx: number, ty: number) {
  if (!activePage) return
  const currentTransform: string = await activePage.evaluate(
    `(() => { var el = document.getElementById('__demo-cursor__'); return el ? (el.style.transform || 'translate(200px,200px)') : 'translate(200px,200px)'; })()`,
  )
  const [sx, sy] = parseCursorTransform(currentTransform)

  // Quadratic bezier control point: perpendicular offset ±40px for natural arc
  const dx = tx - sx
  const dy = ty - sy
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const perpScale = (Math.random() - 0.5) * 80
  const cpx = (sx + tx) / 2 + (-dy / len) * perpScale
  const cpy = (sy + ty) / 2 + (dx / len) * perpScale

  const totalMs = 350 / SPEED
  const steps = Math.max(1, Math.ceil(totalMs / ANIM_STEP_MS))
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
    const cx = Math.round((1 - e) * (1 - e) * sx + 2 * (1 - e) * e * cpx + e * e * tx)
    const cy = Math.round((1 - e) * (1 - e) * sy + 2 * (1 - e) * e * cpy + e * e * ty)
    await activePage.evaluate(
      `(function(){
        var el=document.getElementById('__demo-cursor__');
        if(el){ el.style.transform='translate(${cx}px,${cy}px)'; }
        else { console.log('[demo] cursor missing step ${i}/${steps}'); }
      })()`,
    )
    const jitterMs = ANIM_STEP_MS * (0.7 + Math.random() * 0.6)
    await new Promise((r) => setTimeout(r, jitterMs))
  }
  await activePage.mouse.move(tx, ty)
  cursorX = tx
  cursorY = ty
}

async function mouseMoveTo(locator: Locator) {
  if (!activePage) return
  const box = await locator.boundingBox()
  if (!box) return
  // Land at a random point within the middle 60% of the element
  const tx = box.x + box.width * (0.2 + Math.random() * 0.6)
  const ty = box.y + box.height * (0.2 + Math.random() * 0.6)
  await moveCursorToXY(tx, ty)
}

/**
 * Move the cursor left-to-right beneath a text element as if reading it.
 * pxPerSec controls reading speed (default 150 px/s).
 */
async function readText(locator: Locator, pxPerSec = 320) {
  if (!activePage) return
  await smoothScrollTo(locator)
  const box = await locator.boundingBox()
  if (!box) return

  // Measure actual rendered text extent (first line) via Range API
  const textRect = await locator.evaluate((el: Element) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    const rects = Array.from(range.getClientRects())
    if (!rects.length) return null
    const firstLine = rects[0]
    return { x: firstLine.x, width: firstLine.width, y: firstLine.y, height: firstLine.height }
  })

  const startX = (textRect?.x ?? box.x) + 2
  const endX = textRect ? textRect.x + textRect.width - 2 : box.x + box.width - 4
  const baseY = (textRect?.y ?? box.y) + (textRect?.height ?? box.height) * 0.8

  // Arc in to the start of the text
  await moveCursorToXY(startX, baseY)
  await pause(120)

  // Sweep left → right with sine ease-in-out and sinusoidal y-wobble
  const distance = endX - startX
  const totalMs = (distance / (pxPerSec * SPEED)) * 1000
  const steps = Math.max(1, Math.ceil(totalMs / ANIM_STEP_MS))
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const e = (1 - Math.cos(Math.PI * t)) / 2
    const cx = Math.round(startX + distance * e)
    // Gentle sine wobble on y — simulates natural tracking movement
    const cy = Math.round(baseY + Math.sin(t * Math.PI * 5) * 5)
    await activePage.evaluate(
      `(function(){
        var el=document.getElementById('__demo-cursor__');
        if(el){ el.style.transform='translate(${cx}px,${cy}px)'; }
      })()`,
    )
    const jitterMs = ANIM_STEP_MS * (0.8 + Math.random() * 0.4)
    await new Promise((r) => setTimeout(r, jitterMs))
  }
  await activePage.mouse.move(endX, Math.round(baseY))
}

/** Force-create/reposition the cursor arrow and move the physical mouse there */
async function placeCursor(x = cursorX, y = cursorY) {
  if (!activePage) return
  cursorX = x
  cursorY = y
  await activePage.mouse.move(x, y)
  await activePage.evaluate(
    `(function() {
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="32"><path d="M2 2 L2 26 L7 20 L11 30 L15 28 L11 18 L18 18 Z" fill="black" stroke="white" stroke-width="2" stroke-linejoin="round" paint-order="stroke fill"/></svg>';
      var url = 'data:image/svg+xml;base64,' + btoa(svg);
      var el = document.getElementById('__demo-cursor__');
      if (!el) {
        el = document.createElement('div');
        el.id = '__demo-cursor__';
        document.body.appendChild(el);
      }
      el.style.cssText = 'position:fixed;left:0;top:0;width:24px;height:32px;background-image:url(' + url + ');background-size:contain;background-repeat:no-repeat;pointer-events:none;z-index:2147483646;transform:translate(${x}px,${y}px)';
    })()`,
  )
}

const SCROLL_PX_PER_SEC = 500 * SPEED // scale with SPEED so slower mode = slower scroll

async function smoothScrollTo(locator: Locator) {
  if (!activePage) return
  const box = await locator.boundingBox()
  if (!box) return

  // Skip scroll if element is comfortably within the viewport (80px margin each edge)
  const MARGIN = 80
  const viewportHeight: number = await activePage.evaluate(`window.innerHeight`)
  if (box.y >= MARGIN && box.y + box.height <= viewportHeight - MARGIN) return

  // Skip scroll if element is inside a fixed-position ancestor (e.g. modal) —
  // document scrollTop won't change its viewport position
  const isFixed: boolean = await locator.evaluate((el: Element) => {
    let node: Element | null = el
    while (node) {
      if (window.getComputedStyle(node).position === 'fixed') return true
      node = node.parentElement
    }
    return false
  }).catch(() => false)
  if (isFixed) return

  const by = box.y
  const bh = box.height
  const startY: number = await activePage.evaluate(
    `(document.scrollingElement || document.documentElement).scrollTop`,
  )
  const targetY: number = await activePage.evaluate(
    `(function(){ var se = document.scrollingElement || document.documentElement; return se.scrollTop + ${by} - window.innerHeight/2 + ${bh}/2; })()`,
  )
  const distance = targetY - startY
  if (Math.abs(distance) < 2) return

  const totalMs = (Math.abs(distance) / SCROLL_PX_PER_SEC) * 1000
  const steps = Math.max(1, Math.ceil(totalMs / ANIM_STEP_MS))
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    // Ease-in-out + tiny ±2px noise so scroll feels hand-driven
    const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
    const noise = (Math.random() - 0.5) * 4
    const y = Math.round(startY + distance * e + (i < steps ? noise : 0))
    await activePage.evaluate(
      `(document.scrollingElement || document.documentElement).scrollTop = ${y}`,
    )
    // Variable step delay ±30%
    const jitterMs = ANIM_STEP_MS * (0.7 + Math.random() * 0.6)
    await new Promise((r) => setTimeout(r, jitterMs))
  }
  await pause(200)
}

/** Ripple animation at cursor position to indicate a click */
async function clickRipple() {
  if (!activePage) return
  const cursorTransform: string = await activePage.evaluate(
    `(function(){ var el=document.getElementById('__demo-cursor__'); return el ? el.style.transform : 'translate(200px,200px)'; })()`,
  )
  const [cx, cy] = parseCursorTransform(cursorTransform)
  // Expand from 0 to 36px and fade out over 400ms using step loop
  const duration = 400
  const steps = Math.max(1, Math.ceil(duration / ANIM_STEP_MS))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const size = Math.round(t * 36)
    const opacity = Math.round((1 - t) * 100) / 100
    const offset = Math.round(size / 2)
    await activePage.evaluate(
      `(function(){
        var el = document.getElementById('__demo-ripple__');
        if (!el) {
          el = document.createElement('div');
          el.id = '__demo-ripple__';
          document.body.appendChild(el);
        }
        el.style.cssText = 'position:fixed;left:0;top:0;border-radius:50%;border:2px solid rgba(59,130,246,0.9);pointer-events:none;z-index:2147483645;transform:translate(${cx - offset}px,${cy - offset}px);width:${size}px;height:${size}px;opacity:${opacity}';
      })()`,
    )
    await new Promise((r) => setTimeout(r, ANIM_STEP_MS))
  }
  await activePage.evaluate(`document.getElementById('__demo-ripple__')?.remove()`)
}

/** Hover → click → type character by character */
async function type(locator: Locator, text: string, charDelayMs = 55) {
  await smoothScrollTo(locator)
  await mouseMoveTo(locator)
  await pause(150)
  addSound('click')
  await locator.click()
  void clickRipple()
  // Move cursor clear of the field so typed text is visible
  const box = await locator.boundingBox()
  if (box) await moveCursorToXY(box.x + box.width * 0.75, box.y + box.height + 40 + Math.random() * 20)
  await pause(400)
  // Pre-schedule a keypress sound per character relative to now
  const typeStartMs = Date.now() - phaseStartMs
  const actualDelay = charDelayMs / SPEED
  for (let i = 0; i < text.length; i++) addSound('type', typeStartMs + i * actualDelay)
  startLiveTyping()
  await locator.focus()
  await locator.pressSequentially(text, { delay: actualDelay })
  stopLiveTyping()
}

/** Hover then click a button/link */
async function click(locator: Locator) {
  await smoothScrollTo(locator)
  await mouseMoveTo(locator)
  await pause(200)
  // Read tag + href before clicking — element may leave the DOM after click (e.g. dropdown option)
  const { tag, href } = await locator.evaluate((el: Element) => ({
    tag: el.tagName.toLowerCase(),
    href: el instanceof HTMLAnchorElement ? el.href : '',
  })).catch(() => ({ tag: '', href: '' }))
  const box = await locator.boundingBox()
  addSound('click')
  await locator.click()
  await clickRipple()

  if (href && new URL(href).pathname !== new URL(activePage!.url()).pathname) {
    // Link navigates to a different page — wait then re-place cursor
    await activePage!.waitForURL(href, { timeout: 10_000 }).catch(() => {})
    await placeCursor()
  } else if ((tag === 'input' || tag === 'textarea') && box) {
    // Move cursor clear of field so typed text is visible
    await moveCursorToXY(box.x + box.width * 0.75, box.y + box.height + 40 + Math.random() * 20)
  }
}

async function navigateTo(url: string) {
  if (!activePage) return
  const path = url.replace(BASE_URL, '') || '/'

  // Try to find a visible link pointing to this path and click it naturally
  const link = activePage.locator(`a[href="${path}"], a[href="${url}"]`).first()
  const linkVisible = await link.isVisible({ timeout: 500 }).catch(() => false)
  if (linkVisible) {
    await click(link)
    await activePage.waitForURL(url, { timeout: 10_000 })
    await placeCursor()
    return
  }

  // No link found — show caption, fade out, jump, fade in
  const label = path.replace(/^\//, '').replace(/[-/]/g, ' ').trim() || 'home'
  await caption(activePage, `Navigating to ${label}`, 800)
  await activePage.evaluate(`(function(){
    var o=document.createElement('div');
    o.id='__demo-overlay__';
    o.style.cssText='position:fixed;inset:0;background:#000;opacity:0;z-index:2147483645;pointer-events:none;transition:opacity 300ms ease';
    document.body.appendChild(o);
    requestAnimationFrame(function(){ o.style.opacity='1'; });
  })()`)
  await pause(350)
  await activePage.goto(url)
  await placeCursor()
  await activePage.evaluate(`(function(){
    var cover=document.getElementById('__title-cover__');
    var overlay=document.getElementById('__demo-overlay__');
    var el=cover||overlay;
    if(!el)return;
    el.style.transition='opacity 400ms ease';
    el.style.opacity='0';
    setTimeout(function(){ el.remove(); }, 420);
  })()`)
  await pause(450)
}

async function newContext(browser: Browser, authToken?: string): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    recordVideo: { dir: OUT_DIR, size: { width: 1280, height: 800 } },
    viewport: { width: 1280, height: 800 },
  })
  await ctx.addInitScript(CURSOR_SCRIPT)
  if (authToken) {
    await ctx.addInitScript(`localStorage.setItem('authToken', ${JSON.stringify(authToken)})`)
  }
  return ctx
}

let demoServer: ChildProcess | null = null

function startDemoServer(): void {
  console.log('  Cleaning previous build...')
  fs.rmSync(path.join(PROJECT_ROOT, '.next'), { recursive: true, force: true })
  console.log('  Building for demo...')
  execSync(`${NEXT_BINARY} build`, { cwd: PROJECT_ROOT, stdio: 'inherit' })

  const { resolveDbUrl } = require('../lib/db-url') as { resolveDbUrl: (f?: string) => string }
  const sourceUrl = resolveDbUrl()
  const sourcePath = sourceUrl.startsWith('file:') ? sourceUrl.slice(5) : sourceUrl

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source database not found: ${sourcePath}. Run migrations first.`)
  }

  fs.rmSync(DEMO_DB_DIR, { recursive: true, force: true })
  fs.mkdirSync(DEMO_DB_DIR, { recursive: true })
  fs.copyFileSync(sourcePath, DEMO_DB_PATH)

  // Kill anything already on the port
  try {
    execSync(`lsof -ti :${DEMO_PORT} | xargs kill -TERM 2>/dev/null || true`, { shell: '/bin/sh' })
  } catch { /* nothing listening */ }

  demoServer = spawn(NEXT_BINARY, ['start', '-p', String(DEMO_PORT)], {
    env: {
      ...process.env,
      PORT: String(DEMO_PORT),
      DATABASE_URL: `file:${DEMO_DB_PATH}`,
      STUB_EMAIL: 'true',
    },
    cwd: PROJECT_ROOT,
    detached: false,
    stdio: 'inherit',
  })
}

function stopDemoServer(): void {
  if (demoServer) {
    demoServer.kill('SIGTERM')
    demoServer = null
  }
  try {
    execSync(`lsof -ti :${DEMO_PORT} | xargs kill -TERM 2>/dev/null || true`, { shell: '/bin/sh' })
  } catch { /* ignore */ }
}

async function waitForServer(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE_URL}/api/health`)
      if (r.ok) return
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Demo server did not become ready within ${timeoutMs / 1000}s`)
}

async function apiSignup(
  name: string,
  email: string,
  password: string,
  applicationMessage?: string,
): Promise<{ id: number; auth_token: string; email_verification_token?: string }> {
  const resp = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      email,
      password,
      application_message: applicationMessage,
      consent_make_profile_visible_in_directory: true,
      consent_contactable_by_project_owners: true,
    }),
  })
  if (!resp.ok) throw new Error(`Signup failed for ${email}: ${await resp.text()}`)
  return resp.json()
}

async function apiVerifyEmail(token: string): Promise<void> {
  await fetch(`${BASE_URL}/api/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
}

function buildEmailClientHtml(subject: string, from: string, to: string, emailBodyHtml: string): string {
  // Add target="_top" so clicking links in the iframe navigates the top-level page
  const emailWithTargets = emailBodyHtml.replace(/<a /g, '<a target="_top" ')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,-apple-system,sans-serif;background:#f1f5f9;height:100vh;overflow:hidden}
    .client{display:flex;height:100vh}
    .sidebar{width:200px;background:#1e293b;color:#e2e8f0;display:flex;flex-direction:column;flex-shrink:0}
    .sidebar-header{padding:20px 16px 14px;border-bottom:1px solid #334155}
    .sidebar-header h2{font-size:15px;font-weight:600;color:#f8fafc}
    .sidebar-header p{font-size:11px;color:#94a3b8;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .folder-list{padding:8px 0}
    .folder{padding:8px 16px;font-size:13px;color:#94a3b8;cursor:pointer;display:flex;justify-content:space-between;align-items:center}
    .folder.active{background:#334155;color:#f8fafc;border-radius:6px;margin:0 8px;padding:8px 8px}
    .badge{background:#3b82f6;color:white;border-radius:10px;padding:1px 7px;font-size:11px;font-weight:600}
    .inbox{width:260px;background:#f8fafc;border-right:1px solid #e2e8f0;overflow-y:auto;flex-shrink:0}
    .inbox-header{padding:14px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:600;color:#1e293b}
    .email-item{padding:14px 16px;border-bottom:1px solid #f0f4f8;cursor:pointer;background:white;position:relative}
    .email-item.selected{background:#eff6ff;border-left:3px solid #3b82f6}
    .email-item .sender{font-size:13px;font-weight:700;color:#1e293b}
    .email-item .time{font-size:11px;color:#9ca3af;float:right}
    .email-item .subject{font-size:12px;color:#374151;margin-top:2px;font-weight:500}
    .email-item .preview{font-size:11px;color:#6b7280;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .email-pane{flex:1;display:flex;flex-direction:column;min-width:0;background:white}
    .email-header{padding:24px 28px 18px;border-bottom:1px solid #e5e7eb;flex-shrink:0}
    .email-header .subject{font-size:20px;font-weight:600;color:#111827}
    .email-header .meta{margin-top:8px;font-size:13px;color:#6b7280}
    .email-header .meta span{margin-right:16px}
    .email-iframe{flex:1;border:none;display:block;width:100%}
  </style></head><body>
  <div class="client">
    <div class="sidebar">
      <div class="sidebar-header"><h2>${to.split('@')[0]}</h2><p>${to}</p></div>
      <div class="folder-list">
        <div class="folder active">Inbox <span class="badge">1</span></div>
        <div class="folder">Sent</div>
        <div class="folder">Drafts</div>
        <div class="folder">Trash</div>
      </div>
    </div>
    <div class="inbox">
      <div class="inbox-header">Inbox (1 unread)</div>
      <div class="email-item selected">
        <span class="time">Just now</span>
        <div class="sender">Catalyse</div>
        <div class="subject">${subject}</div>
        <div class="preview">Thanks for applying to join Catalyse...</div>
      </div>
    </div>
    <div class="email-pane">
      <div class="email-header">
        <div class="subject">${subject}</div>
        <div class="meta"><span>From: <strong>${from}</strong></span><span>To: ${to}</span></div>
      </div>
      <iframe id="email-frame" class="email-iframe" title="email" sandbox="allow-same-origin allow-top-navigation"></iframe>
    </div>
  </div>
  <div id="__cover__" style="position:fixed;inset:0;background:#000;z-index:2147483647;pointer-events:none;transition:opacity 500ms ease;"></div>
  <script>
    document.getElementById('email-frame').srcdoc = ${JSON.stringify(emailWithTargets)};
    requestAnimationFrame(function(){ requestAnimationFrame(function(){
      var c=document.getElementById('__cover__'); c.style.opacity='0'; setTimeout(function(){ c.remove(); },520);
    }); });
  </script>
  </body></html>`
}

const DEMO_VIDEO_TITLE = 'Volunteer Signup & Approval Flow'

function buildTitleCardHtml(videoTitle: string): string {
  const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 616 616" width="144" height="144"><path d="M308 0C478.104 0 616 137.896 616 308C616 478.104 478.104 616 308 616C137.896 616 0 478.104 0 308C0 137.896 137.896 0 308 0ZM194.04 447.681C194.04 448.785 194.935 449.681 196.04 449.681H269.04C270.145 449.681 271.04 448.785 271.04 447.681V177.561C271.04 176.456 270.145 175.561 269.04 175.561H196.04C194.935 175.561 194.04 176.456 194.04 177.561V447.681ZM340.8 175.561C339.695 175.561 338.8 176.456 338.8 177.561V447.681C338.8 448.785 339.695 449.681 340.8 449.681H413.8C414.904 449.681 415.8 448.785 415.8 447.681V177.561C415.8 176.456 414.904 175.561 413.8 175.561H340.8Z" fill="#FF9416"/></svg>`
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,-apple-system,sans-serif;background:#0f172a;height:100vh;display:flex;align-items:center;justify-content:center}
    .brand{display:flex;align-items:center;justify-content:center;gap:18px;margin-bottom:18px}
    .brand-name{font-size:108px;font-weight:700;color:#FF9416;letter-spacing:-1px}
    .title{font-size:42px;color:#e2e8f0;font-weight:400;text-align:center;opacity:0.85}
  </style></head><body>
  <div>
    <div class="brand">${logoSvg}<span class="brand-name">Catalyse</span></div>
    <div class="title">${videoTitle}</div>
  </div>
  </body></html>`
}

/** Part 1: applicant signup, email verification, pending dashboard */
async function recordApplicantFlow(
  browser: Browser,
): Promise<{ volunteerId: number; authToken: string }> {
  console.log('  Recording applicant signup flow...')

  // Phase 1: unauthenticated context for signup form — no token so app shows a clean signup page
  const signupCtx = await newContext(browser)
  const signupPage = await signupCtx.newPage()
  activePage = signupPage
  beginPhase()

  await signupPage.setContent(buildTitleCardHtml(DEMO_VIDEO_TITLE))
  await pause(2800)
  await signupPage.evaluate(`(function(){
    var o=document.createElement('div');
    o.style.cssText='position:fixed;inset:0;background:#000;opacity:0;z-index:2147483645;pointer-events:none;transition:opacity 600ms ease';
    document.body.appendChild(o);
    requestAnimationFrame(function(){ o.style.opacity='1'; });
  })()`)
  await pause(700)

  // addInitScript fires before first paint — eliminates the flash between old page DOM going away and the fade-in overlay being injected
  await signupPage.addInitScript(`
    (function() {
      var o = document.createElement('div');
      o.id = '__title-cover__';
      o.style.cssText = 'position:fixed;inset:0;background:#000;z-index:2147483647;pointer-events:none;transition:opacity 600ms ease;';
      document.documentElement.appendChild(o);
    })()
  `)
  await signupPage.goto(`${BASE_URL}/`)
  await placeCursor()
  await signupPage.evaluate(`(function(){
    var cover = document.getElementById('__title-cover__');
    if (cover) cover.remove();
    var o=document.createElement('div');
    o.id='__demo-fadein__';
    o.style.cssText='position:fixed;inset:0;background:#000;opacity:1;z-index:2147483645;pointer-events:none;transition:opacity 600ms ease';
    document.body.appendChild(o);
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ o.style.opacity='0'; setTimeout(function(){ o.remove(); },620); }); });
  })()`)
  await pause(700)
  await pause(1200)
  await caption(signupPage, 'Catalyse connects AI safety projects with volunteers', 2000)
  await pause(500)
  await showCaption(signupPage, 'New applicants start by creating an account')
  await navigateTo(`${BASE_URL}/signup`)
  await pause(800)

  await type(signupPage.getByLabel('Your Name'), APPLICANT.name)
  await pause(300)
  await type(signupPage.getByLabel('Email', { exact: true }), APPLICANT.email)
  await pause(300)
  await type(signupPage.getByLabel('Password', { exact: true }), APPLICANT.password)
  await pause(200)
  await type(signupPage.getByLabel('Confirm Password'), APPLICANT.password)
  await pause(300)
  await hideCaption(signupPage)

  const appField = signupPage.getByLabel('Your Application')
  await smoothScrollTo(appField)
  await showCaption(signupPage, 'Applicants explain why they want to join — only visible to admins')
  const appDesc = signupPage.locator('label[for="application_message"] + aside')
  if (await appDesc.isVisible({ timeout: 1000 }).catch(() => false)) {
    await readText(appDesc, 240)
    await pause(300)
  }
  await type(appField, APPLICANT.applicationMessage, 18)
  await pause(600)
  await hideCaption(signupPage)

  const bioField = signupPage.getByLabel('About You')
  if (await bioField.isVisible({ timeout: 2000 }).catch(() => false)) {
    await smoothScrollTo(bioField)
    await showCaption(signupPage, 'The bio is shown on the public volunteer directory')
    await type(bioField, APPLICANT.bio, 35)
    await pause(400)
    await hideCaption(signupPage)
  }

  await showCaption(signupPage, 'Contact details help project owners reach out')
  await type(signupPage.getByLabel('Discord Handle'), APPLICANT.discord, 45)
  await pause(300)

  const contactPrefDropdown = signupPage.getByLabel('Preferred Contact Method')
  if (await contactPrefDropdown.isVisible({ timeout: 2000 }).catch(() => false)) {
    await click(contactPrefDropdown)
    await pause(300)
    const discordOption = signupPage.getByRole('option', { name: 'Discord' })
    if (await discordOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await click(discordOption)
      await pause(300)
    }
  }

  await type(signupPage.getByLabel('Contact Notes'), APPLICANT.contactNotes, 40)
  await pause(400)
  await hideCaption(signupPage)

  await showCaption(signupPage, 'Availability and location help match volunteers to local projects')
  await type(signupPage.getByLabel('Hours per Week'), APPLICANT.availability, 80)
  await pause(200)
  await type(signupPage.getByLabel('Location'), APPLICANT.location, 45)
  await pause(200)
  await type(signupPage.getByLabel('Country'), APPLICANT.country, 45)
  await pause(200)
  await type(signupPage.getByLabel('Local Group'), APPLICANT.localGroup, 45)
  await pause(300)
  await hideCaption(signupPage)

  await showCaption(signupPage, 'Skills help match volunteers with the right projects')
  // Wait for SkillPicker API fetch to complete
  await signupPage.locator('.skill-option').first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  const wantedSkills = new Set(['Software Engineering', 'AI/ML', 'AI Safety Research', 'Writing', 'AI Governance Research', 'Technical AI Safety Expertise'])
  const allSkillLabels = await signupPage.locator('.skill-option').all()
  // Resolve each to {locator, text, y, x} then sort by page position
  const resolved = (await Promise.all(
    allSkillLabels.map(async (l) => {
      const text = (await l.textContent())?.trim() ?? ''
      if (!wantedSkills.has(text)) return null
      const box = await l.boundingBox()
      return box ? { l, text, y: box.y, x: box.x } : null
    })
  )).filter((r): r is { l: Locator; text: string; y: number; x: number } => r !== null)
  resolved.sort((a, b) => a.y - b.y || a.x - b.x)
  for (const { l } of resolved) {
    await click(l)
    await pause(350)
  }
  await pause(300)
  await hideCaption(signupPage)

  const submitBtn = signupPage.getByRole('button', { name: 'Create Account' })
  await smoothScrollTo(submitBtn)
  await showCaption(signupPage, 'Privacy and notification preferences round out the profile')
  const checkboxLabels = signupPage.locator('label').filter({ hasText: /Make my profile|Allow project|Share my contact/i })
  const allCheckboxLabels = await checkboxLabels.all()
  for (const label of allCheckboxLabels) {
    if (await label.isVisible({ timeout: 500 }).catch(() => false)) {
      await readText(label, 220)
      await pause(150)
    }
  }
  await pause(600)
  await hideCaption(signupPage)

  // Capture the signup response to get auth token + email verification token
  const [signupResp] = await Promise.all([
    signupPage.waitForResponse(
      (r) => r.url().includes('/api/auth/signup') && r.status() === 200,
      { timeout: 15_000 },
    ),
    click(submitBtn),
  ])
  const { id: volunteerId, auth_token: authToken, email_verification_token: verifyToken } =
    await signupResp.json() as { id: number; auth_token: string; email_verification_token?: string }

  if (!verifyToken) {
    throw new Error(
      'No email_verification_token returned. Ensure STUB_EMAIL=true is set in .env.local',
    )
  }

  await pause(1500)

  const signupVideoPath = await signupPage.video()?.path()
  const signupPhaseEvents = [...phaseEvents]
  await signupCtx.close()

  // Phase 2: show mock email client, click confirm link, then post-verification screens
  const ctx = await newContext(browser, authToken)
  const page = await ctx.newPage()
  activePage = page
  beginPhase()

  // Navigate to a real URL first so init scripts (cursor overlay) run
  await page.goto(`${BASE_URL}/dashboard`)
  await pause(300)

  // Fade out, switch to email client
  await page.evaluate(`(function(){
    var o=document.createElement('div');
    o.style.cssText='position:fixed;inset:0;background:#000;opacity:0;z-index:2147483645;pointer-events:none;transition:opacity 400ms ease';
    document.body.appendChild(o);
    requestAnimationFrame(function(){ o.style.opacity='1'; });
  })()`)
  await pause(500)

  const confirmUrl = `${BASE_URL}/verify-email?token=${verifyToken}`
  const emailHtml = buildWelcomeAndConfirmHtml(APPLICANT.name, confirmUrl)
  const emailClientHtml = buildEmailClientHtml(
    'Confirm your Catalyse email address',
    'noreply@pauseai.uk',
    APPLICANT.email,
    emailHtml,
  )
  await page.setContent(emailClientHtml)
  await placeCursor(120, 400)
  await pause(600)

  await caption(page, "Alex checks their email — there's a verification link from Catalyse", 2500)

  // Move cursor over inbox item, pause as if reading it
  const emailItem = page.locator('.email-item.selected')
  await mouseMoveTo(emailItem)
  await pause(800)

  await showCaption(page, 'Clicking the confirmation link to verify the account')
  // Button lives inside the iframe — frameLocator gives a Locator in that frame's coordinate space
  const confirmBtn = page.frameLocator('iframe[title="email"]').locator('a.button').filter({ hasText: /Confirm Email/i }).first()
  await mouseMoveTo(confirmBtn)
  await pause(400)
  addSound('click')
  await Promise.all([
    page.waitForURL(`**/verify-email**`, { timeout: 15_000 }),
    confirmBtn.click(),
  ])
  void clickRipple()
  await placeCursor()
  await pause(1200)
  await hideCaption(page)
  await caption(page, 'Email confirmed — application is now under review', 2500)
  await pause(1000)

  await navigateTo(`${BASE_URL}/dashboard`)
  await pause(1200)
  const pendingBanner = page.locator('text=Your account is pending approval').first()
  if (await pendingBanner.isVisible({ timeout: 3000 }).catch(() => false)) {
    await showCaption(page, 'Pending applicants can browse the platform with restricted access')
    await readText(pendingBanner, 320)
    await hideCaption(page)
    await pause(400)
  } else {
    await caption(page, 'Pending applicants can browse the platform with restricted access', 2500)
    await pause(800)
  }

  await navigateTo(`${BASE_URL}/`)
  await pause(1000)
  await caption(page, 'They can browse available projects while waiting for approval', 2000)

  // Scroll slowly through the project listing
  {
    const pageHeight: number = await page.evaluate(`document.body.scrollHeight`)
    const viewportHeight: number = await page.evaluate(`window.innerHeight`)
    const maxScroll = Math.max(0, pageHeight - viewportHeight)
    const targetScroll = Math.min(maxScroll, 1200)
    const totalMs = 3000 / SPEED
    const steps = Math.max(1, Math.ceil(totalMs / ANIM_STEP_MS))
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const e = (1 - Math.cos(Math.PI * t)) / 2
      const y = Math.round(targetScroll * e)
      await page.evaluate(`(document.scrollingElement || document.documentElement).scrollTop = ${y}`)
      const jitterMs = ANIM_STEP_MS * (0.8 + Math.random() * 0.4)
      await new Promise((r) => setTimeout(r, jitterMs))
    }
  }
  await pause(800)

  // Fade to black to bridge into the admin recording
  await page.evaluate(`(function(){
    var o=document.createElement('div');
    o.style.cssText='position:fixed;inset:0;background:#000;opacity:0;z-index:2147483645;pointer-events:none;transition:opacity 600ms ease';
    document.body.appendChild(o);
    requestAnimationFrame(function(){ o.style.opacity='1'; });
  })()`)
  await pause(700)

  const videoPath = await page.video()?.path()
  const pendingPhaseEvents = [...phaseEvents]
  await ctx.close()

  // Mix audio into each raw clip before concatenating
  const part1 = path.join(OUT_DIR, '01a-signup.webm')
  const part2 = path.join(OUT_DIR, '01b-pending.webm')
  if (signupVideoPath) { fs.renameSync(signupVideoPath, part1); mixAudioIntoClip(part1, signupPhaseEvents) }
  if (videoPath) { fs.renameSync(videoPath, part2); mixAudioIntoClip(part2, pendingPhaseEvents) }

  // Merge into final applicant video
  const concatFile = path.join(OUT_DIR, '01-concat.txt')
  fs.writeFileSync(concatFile, [part1, part2].filter(fs.existsSync).map((f) => `file '${f}'`).join('\n'))
  execSync(`ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c copy "${path.join(OUT_DIR, '01-applicant.webm')}"`, { stdio: 'pipe' })

  console.log(`  Applicant video saved. Volunteer ID: ${volunteerId}`)
  return { volunteerId, authToken }
}

/** Part 2: admin reviews, approves one applicant and rejects another */
async function recordAdminFlow(browser: Browser): Promise<void> {
  console.log('  Setting up second applicant to reject...')

  const { email_verification_token: rejectVerifyToken } = await apiSignup(
    REJECT_APPLICANT.name,
    REJECT_APPLICANT.email,
    REJECT_APPLICANT.password,
    REJECT_APPLICANT.applicationMessage,
  )
  if (rejectVerifyToken) await apiVerifyEmail(rejectVerifyToken)

  console.log('  Recording admin review flow...')

  const ctx = await newContext(browser) // no auth token — admin logs in via the form
  const page = await ctx.newPage()
  activePage = page

  beginPhase()
  await page.goto(`${BASE_URL}/login`)
  await placeCursor()
  await page.evaluate(`(function(){
    var o=document.createElement('div');
    o.id='__demo-fadein__';
    o.style.cssText='position:fixed;inset:0;background:#000;opacity:1;z-index:2147483645;pointer-events:none;transition:opacity 600ms ease';
    document.body.appendChild(o);
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ o.style.opacity='0'; setTimeout(function(){ o.remove(); },620); }); });
  })()`)
  await pause(700)

  await showCaption(page, 'An admin logs in to review new applications')
  await type(page.getByLabel('Email', { exact: true }), ADMIN_EMAIL)
  await pause(200)
  await type(page.getByLabel('Password'), ADMIN_PASSWORD)
  await hideCaption(page)
  await pause(300)
  await click(page.getByRole('button', { name: 'Login' }))
  await page.waitForURL(`${BASE_URL}/dashboard`, { timeout: 15_000 })
  await placeCursor()
  await pause(800)

  // Open user menu dropdown and click Manage Applications
  await showCaption(page, 'The admin section is accessible from the user menu')
  const userMenuBtn = page.locator('.xl\\:flex button').first()
  await click(userMenuBtn)
  await pause(400)
  await click(page.getByRole('link', { name: 'Manage Applications' }))
  await hideCaption(page)
  await pause(1200)
  await caption(page, 'Admins see all pending applications in one place', 2500)
  await page.evaluate(() => window.scrollTo({ top: 200, behavior: 'smooth' }))
  await pause(1200)

  // ── Alex Chen: approve ──────────────────────────────────────────────────────
  const alexCard = page.getByRole('article').filter({ hasText: 'Alex Chen' }).first()
  if (await alexCard.isVisible({ timeout: 5000 }).catch(() => false)) {
    await smoothScrollTo(alexCard)
    await pause(400)

    const startReviewBtn = alexCard.getByRole('button', { name: 'Start Review' })
    if (await startReviewBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await showCaption(page, "Start Review claims the application and opens the detail view")
      await click(startReviewBtn)
      await page.waitForURL(/\/admin\/applications\/\d+/, { timeout: 10_000 })
      await placeCursor()
      await pause(800)
      await hideCaption(page)
    }
  }

  // On the detail page — scroll to read the application message
  await caption(page, 'The detail view shows the full application — message, bio, skills, contact', 2500)
  const alexAppMsg = page.locator('h2').filter({ hasText: /Application message/i }).locator('+ p')
  if (await alexAppMsg.isVisible({ timeout: 2000 }).catch(() => false)) {
    await readText(alexAppMsg, 220)
    await pause(400)
  }

  // Fill notes inline before approving
  const adminNotesField = page.getByPlaceholder('Notes visible only to admins…')
  if (await adminNotesField.isVisible({ timeout: 3000 }).catch(() => false)) {
    await showCaption(page, 'Admin notes are private — useful for tracking reasoning behind decisions')
    await type(
      adminNotesField,
      'Strong application — ML background, two years following the org, clear on the mission.',
      40,
    )
    await pause(600)
    await hideCaption(page)
  }

  const approveBtn = page.getByRole('button', { name: 'Approve' }).first()
  if (await approveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await click(approveBtn)
    await pause(500)
    const confirmApproveBtn = page.getByRole('dialog').getByRole('button', { name: 'Approve' })
    await click(confirmApproveBtn)
    await page.waitForURL(/\/admin\/applications$/, { timeout: 10_000 })
    await pause(800)
    await caption(page, 'Approval triggers a welcome email to the applicant', 2500)
    await pause(800)
  }

  // ── Jordan Smith: reject ─────────────────────────────────────────────────────
  const jordanCard = page.getByRole('article').filter({ hasText: 'Jordan Smith' }).first()
  if (await jordanCard.isVisible({ timeout: 5000 }).catch(() => false)) {
    await smoothScrollTo(jordanCard)
    await pause(400)

    const jordanStartReviewBtn = jordanCard.getByRole('button', { name: 'Start Review' })
    if (await jordanStartReviewBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await showCaption(page, "Starting a review claims the application so other admins know it's taken")
      await click(jordanStartReviewBtn)
      await pause(1200)
      await hideCaption(page)
    }

    await showCaption(page, "Applications that don't align with the mission can be rejected")
    const jordanAppMsg = jordanCard.locator('h4').filter({ hasText: /Application/i }).locator('+ p')
    if (await jordanAppMsg.isVisible({ timeout: 1000 }).catch(() => false)) {
      await readText(jordanAppMsg, 220)
    }
    await pause(400)
    await hideCaption(page)

    const jordanStartBtn = jordanCard.getByRole('button', { name: 'Start Review' })
    if (await jordanStartBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await click(jordanStartBtn)
      await page.waitForURL(/\/admin\/applications\/\d+/, { timeout: 10_000 })
      await placeCursor()
      await pause(800)
    }
  }

  // Fill notes on Jordan's detail page
  const rejectAdminNotes = page.getByPlaceholder('Notes visible only to admins…')
  if (await rejectAdminNotes.isVisible({ timeout: 3000 }).catch(() => false)) {
    await showCaption(page, 'Internal notes are only visible to admins — useful for future reference')
    await type(
      rejectAdminNotes,
      'Application appears commercially motivated rather than mission-driven. Self-promotion red flags.',
      40,
    )
    await pause(500)
    await hideCaption(page)
  }

  const applicantMsgField = page.getByPlaceholder('Optional message to applicant…')
  if (await applicantMsgField.isVisible({ timeout: 3000 }).catch(() => false)) {
    await showCaption(page, 'A personal message is included in the rejection email')
    await type(
      applicantMsgField,
      "Thank you for applying. After careful review, we don't think this is the right fit at this time.",
      35,
    )
    await pause(600)
    await hideCaption(page)
  }

  const rejectBtn = page.getByRole('button', { name: 'Reject' }).first()
  if (await rejectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await click(rejectBtn)
    await pause(500)
    const confirmRejectBtn = page.getByRole('dialog').getByRole('button', { name: 'Reject' })
    await click(confirmRejectBtn)
    await page.waitForURL(/\/admin\/applications$/, { timeout: 10_000 })
    await pause(800)
    await caption(page, 'Rejected applicants are notified by email with the custom message', 2500)
    await pause(800)
  }

  const filterBtn = page.getByLabel('Filter applications', { exact: true })
  if (await filterBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await showCaption(page, 'Filter to see approved applications')
    await click(filterBtn)
    await pause(400)
    await click(page.getByRole('option', { name: 'Approved' }))
    await pause(2000)
    await hideCaption(page)

    await showCaption(page, 'Rejected applications are anonymised after 7 days')
    await click(filterBtn)
    await pause(400)
    await click(page.getByRole('option', { name: 'Rejected', exact: true }))
    await pause(2000)
    await hideCaption(page)
  }

  await pause(1200)
  await page.evaluate(`(function(){
    var o=document.createElement('div');
    o.style.cssText='position:fixed;inset:0;background:#000;opacity:0;z-index:2147483645;pointer-events:none;transition:opacity 800ms ease';
    document.body.appendChild(o);
    requestAnimationFrame(function(){ o.style.opacity='1'; });
  })()`)
  await pause(1000)

  const adminPhaseEvents = [...phaseEvents]
  const videoPath = await page.video()?.path()
  await ctx.close()
  if (videoPath) {
    const adminClipPath = path.join(OUT_DIR, '02-admin.webm')
    fs.renameSync(videoPath, adminClipPath)
    mixAudioIntoClip(adminClipPath, adminPhaseEvents)
  }
  console.log('  Admin video saved.')
}

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
  console.log('Starting demo server...')
  startDemoServer()

  try {
    process.stdout.write('  Waiting for server to be ready...')
    await waitForServer()
    console.log(' ready.')

    console.log(`Recording demo against ${BASE_URL}`)
    console.log(`Output directory: ${OUT_DIR}`)
    console.log()

    const browser = await chromium.launch({ headless: false })

    try {
      await recordApplicantFlow(browser)
      await recordAdminFlow(browser)
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
