import { Browser, BrowserContext, Locator, Page } from '@playwright/test'
import { execSync, spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import { OUT_DIR, SPEED, BASE_URL } from './data'

// ─── Audio synthesis ──────────────────────────────────────────────────────────

const SR = 44100 // sample rate

interface SoundEvent {
  kind: 'click' | 'type'
  ms: number
}

const SOUNDS_DIR = path.join(__dirname, 'sounds')

const ANIM_STEP_MS = 50 // real wall-clock ms per animation step; long enough for screencast to capture
const CAPTION_FADE_MS = 240
const SCROLL_PX_PER_SEC = 500 * SPEED // scale with SPEED so slower mode = slower scroll

const CAPTION_CSS = [
  'position:fixed', 'bottom:32px', 'left:50%', 'transform:translateX(-50%)',
  'background:#000', 'color:#fff', 'padding:10px 28px',
  'border-radius:8px', 'font-size:17px', 'font-family:system-ui,sans-serif',
  'font-weight:500', 'z-index:2147483647', 'pointer-events:none',
  'max-width:75%', 'text-align:center', 'box-shadow:0 4px 16px rgba(0,0,0,0.5)',
  'opacity:0', 'transition:opacity 220ms ease',
].join(';')

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

export class DemoEngine {
  activePage: Page | null = null
  cursorX = 200
  cursorY = 200

  private phaseEvents: SoundEvent[] = []
  private phaseStartMs = 0
  private typingPlayer: ChildProcess | null = null
  private readonly CLICK_CLIP: Float32Array
  private readonly TYPE_CLIP: Float32Array

  constructor() {
    this.CLICK_CLIP = this.loadClip(path.join(SOUNDS_DIR, 'click.mp3'))
    this.TYPE_CLIP = this.loadClip(path.join(SOUNDS_DIR, 'type.mp3'))
  }

  // ─── Audio ─────────────────────────────────────────────────────────────────

  private loadClip(filePath: string): Float32Array {
    const raw = execSync(`ffmpeg -i "${filePath}" -f f32le -ar ${SR} -ac 1 pipe:1 2>/dev/null`, {
      maxBuffer: 100 * 1024 * 1024,
    })
    return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4)
  }

  beginPhase(): void {
    this.phaseEvents = []
    this.phaseStartMs = Date.now()
  }

  addSound(kind: SoundEvent['kind'], atMs?: number): void {
    this.phaseEvents.push({ kind, ms: atMs ?? Date.now() - this.phaseStartMs })
    if (kind === 'click') this.playLiveClick()
  }

  getPhaseEvents(): SoundEvent[] {
    return [...this.phaseEvents]
  }

  private playLiveClick(): void {
    spawn('afplay', [path.join(SOUNDS_DIR, 'click.mp3')], { stdio: 'ignore' }).unref()
  }

  private startLiveTyping(): void {
    this.typingPlayer?.kill()
    this.typingPlayer = spawn('afplay', [path.join(SOUNDS_DIR, 'type.mp3')], { stdio: 'ignore' })
  }

  private stopLiveTyping(): void {
    this.typingPlayer?.kill()
    this.typingPlayer = null
  }

  private overlayClip(pcm: Float32Array, clip: Float32Array, offsetSamples: number): void {
    for (let i = 0; i < clip.length; i++) {
      const j = offsetSamples + i
      if (j < pcm.length) pcm[j] = Math.max(-1, Math.min(1, pcm[j] + clip[i]))
    }
  }

  private buildWAV(events: SoundEvent[], videoPath: string): string {
    const durSec = parseFloat(
      execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`).toString().trim()
    )
    const total = Math.ceil(durSec * SR) + SR
    const pcm = new Float32Array(total)

    // Clicks: overlay each individually
    for (const ev of events.filter(e => e.kind === 'click')) {
      this.overlayClip(pcm, this.CLICK_CLIP, Math.floor((ev.ms / 1000) * SR))
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
      const available = this.TYPE_CLIP.length - clipCursor
      const sliceSamples = Math.min(durationSamples, available > 0 ? available : this.TYPE_CLIP.length)
      if (available <= 0) clipCursor = 0 // wrap if we exhaust the file
      const slice = this.TYPE_CLIP.slice(clipCursor, clipCursor + sliceSamples)
      this.overlayClip(pcm, slice, Math.floor((sessionStart / 1000) * SR))
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

  mixAudioIntoClip(videoPath: string, events: SoundEvent[]): void {
    if (!fs.existsSync(videoPath)) return
    const wavPath = this.buildWAV(events, videoPath)
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

  // ─── Cursor ────────────────────────────────────────────────────────────────

  private parseCursorTransform(transform: string): [number, number] {
    const m = transform.match(/translate\(([0-9.-]+)px,\s*([0-9.-]+)px\)/)
    return m ? [parseFloat(m[1]), parseFloat(m[2])] : [200, 200]
  }

  /** Move cursor from its current position to (tx, ty) via bezier arc with jittered timing */
  async moveCursorToXY(tx: number, ty: number): Promise<void> {
    if (!this.activePage) return
    const currentTransform: string = await this.activePage.evaluate(
      `(() => { var el = document.getElementById('__demo-cursor__'); return el ? (el.style.transform || 'translate(200px,200px)') : 'translate(200px,200px)'; })()`,
    )
    const [sx, sy] = this.parseCursorTransform(currentTransform)

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
      await this.activePage.evaluate(
        `(function(){
          var el=document.getElementById('__demo-cursor__');
          if(el){ el.style.transform='translate(${cx}px,${cy}px)'; }
          else { console.log('[demo] cursor missing step ${i}/${steps}'); }
        })()`,
      )
      const jitterMs = ANIM_STEP_MS * (0.7 + Math.random() * 0.6)
      await new Promise((r) => setTimeout(r, jitterMs))
    }
    await this.activePage.mouse.move(tx, ty)
    this.cursorX = tx
    this.cursorY = ty
  }

  async mouseMoveTo(locator: Locator): Promise<void> {
    if (!this.activePage) return
    const box = await locator.boundingBox()
    if (!box) return
    // Land at a random point within the middle 60% of the element
    const tx = box.x + box.width * (0.2 + Math.random() * 0.6)
    const ty = box.y + box.height * (0.2 + Math.random() * 0.6)
    await this.moveCursorToXY(tx, ty)
  }

  /**
   * Move the cursor left-to-right beneath a text element as if reading it.
   * pxPerSec controls reading speed (default 150 px/s).
   */
  async readText(locator: Locator, pxPerSec = 320): Promise<void> {
    if (!this.activePage) return
    await this.smoothScrollTo(locator)
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
    await this.moveCursorToXY(startX, baseY)
    await this.pause(120)

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
      await this.activePage.evaluate(
        `(function(){
          var el=document.getElementById('__demo-cursor__');
          if(el){ el.style.transform='translate(${cx}px,${cy}px)'; }
        })()`,
      )
      const jitterMs = ANIM_STEP_MS * (0.8 + Math.random() * 0.4)
      await new Promise((r) => setTimeout(r, jitterMs))
    }
    await this.activePage.mouse.move(endX, Math.round(baseY))
  }

  /** Force-create/reposition the cursor arrow and move the physical mouse there */
  async placeCursor(x?: number, y?: number): Promise<void> {
    if (!this.activePage) return
    x = x ?? this.cursorX
    y = y ?? this.cursorY
    this.cursorX = x
    this.cursorY = y
    await this.activePage.mouse.move(x, y)
    await this.activePage.evaluate(
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

  /** Ripple animation at cursor position to indicate a click */
  async clickRipple(): Promise<void> {
    if (!this.activePage) return
    const cursorTransform: string = await this.activePage.evaluate(
      `(function(){ var el=document.getElementById('__demo-cursor__'); return el ? el.style.transform : 'translate(200px,200px)'; })()`,
    )
    const [cx, cy] = this.parseCursorTransform(cursorTransform)
    // Expand from 0 to 36px and fade out over 400ms using step loop
    const duration = 400
    const steps = Math.max(1, Math.ceil(duration / ANIM_STEP_MS))
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const size = Math.round(t * 36)
      const opacity = Math.round((1 - t) * 100) / 100
      const offset = Math.round(size / 2)
      await this.activePage.evaluate(
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
    await this.activePage.evaluate(`document.getElementById('__demo-ripple__')?.remove()`)
  }

  // ─── Captions ──────────────────────────────────────────────────────────────

  async showCaption(text: string): Promise<void> {
    if (!this.activePage) return
    await this.activePage.evaluate(([msg, css]: [string, string]) => {
      document.getElementById('__demo-caption__')?.remove()
      const div = document.createElement('div')
      div.id = '__demo-caption__'
      div.textContent = msg
      div.style.cssText = css
      document.body.appendChild(div)
      requestAnimationFrame(() => { div.style.opacity = '1' })
    }, [text, CAPTION_CSS] as [string, string])
  }

  async hideCaption(): Promise<void> {
    if (!this.activePage) return
    await this.activePage.evaluate(() => {
      const div = document.getElementById('__demo-caption__')
      if (!div) return
      div.style.opacity = '0'
      setTimeout(() => div.remove(), 240)
    })
    await this.pause(CAPTION_FADE_MS)
  }

  async caption(text: string, durationMs = 2500): Promise<void> {
    await this.showCaption(text)
    await this.pause(durationMs)
    await this.hideCaption()
  }

  // ─── Actions ───────────────────────────────────────────────────────────────

  async pause(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms / SPEED))
  }

  async smoothScrollTo(locator: Locator): Promise<void> {
    if (!this.activePage) return
    const box = await locator.boundingBox()
    if (!box) return

    // Skip scroll if element is comfortably within the viewport (80px margin each edge)
    const MARGIN = 80
    const viewportHeight: number = await this.activePage.evaluate(`window.innerHeight`)
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
    const startY: number = await this.activePage.evaluate(
      `(document.scrollingElement || document.documentElement).scrollTop`,
    )
    const targetY: number = await this.activePage.evaluate(
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
      await this.activePage.evaluate(
        `(document.scrollingElement || document.documentElement).scrollTop = ${y}`,
      )
      // Variable step delay ±30%
      const jitterMs = ANIM_STEP_MS * (0.7 + Math.random() * 0.6)
      await new Promise((r) => setTimeout(r, jitterMs))
    }
    await this.pause(200)
  }

  async navigateTo(url: string): Promise<void> {
    if (!this.activePage) return
    const urlPath = url.replace(BASE_URL, '') || '/'

    // Try to find a visible link pointing to this path and click it naturally
    const link = this.activePage.locator(`a[href="${urlPath}"], a[href="${url}"]`).first()
    const linkVisible = await link.isVisible({ timeout: 500 }).catch(() => false)
    if (linkVisible) {
      await this.click(link)
      await this.activePage.waitForURL(url, { timeout: 10_000 })
      await this.placeCursor()
      return
    }

    // No link found — show caption, fade out, jump, fade in
    const label = urlPath.replace(/^\//, '').replace(/[-/]/g, ' ').trim() || 'home'
    await this.caption(`Navigating to ${label}`, 800)
    await this.activePage.evaluate(`(function(){
      var o=document.createElement('div');
      o.id='__demo-overlay__';
      o.style.cssText='position:fixed;inset:0;background:#000;opacity:0;z-index:2147483645;pointer-events:none;transition:opacity 300ms ease';
      document.body.appendChild(o);
      requestAnimationFrame(function(){ o.style.opacity='1'; });
    })()`)
    await this.pause(350)
    await this.activePage.goto(url)
    await this.placeCursor()
    await this.activePage.evaluate(`(function(){
      var cover=document.getElementById('__title-cover__');
      var overlay=document.getElementById('__demo-overlay__');
      var el=cover||overlay;
      if(!el)return;
      el.style.transition='opacity 400ms ease';
      el.style.opacity='0';
      setTimeout(function(){ el.remove(); }, 420);
    })()`)
    await this.pause(450)
  }

  /** Hover → click → type character by character */
  async type(locator: Locator, text: string, charDelayMs = 55): Promise<void> {
    await this.smoothScrollTo(locator)
    await this.mouseMoveTo(locator)
    await this.pause(150)
    this.addSound('click')
    await locator.click()
    void this.clickRipple()
    // Move cursor clear of the field so typed text is visible
    const box = await locator.boundingBox()
    if (box) await this.moveCursorToXY(box.x + box.width * 0.75, box.y + box.height + 40 + Math.random() * 20)
    await this.pause(400)
    // Pre-schedule a keypress sound per character relative to now
    const typeStartMs = Date.now() - this.phaseStartMs
    const actualDelay = charDelayMs / SPEED
    for (let i = 0; i < text.length; i++) this.addSound('type', typeStartMs + i * actualDelay)
    this.startLiveTyping()
    await locator.focus()
    await locator.pressSequentially(text, { delay: actualDelay })
    this.stopLiveTyping()
  }

  /** Hover then click a button/link */
  async click(locator: Locator): Promise<void> {
    await this.smoothScrollTo(locator)
    await this.mouseMoveTo(locator)
    await this.pause(200)
    // Read tag + href before clicking — element may leave the DOM after click (e.g. dropdown option)
    const { tag, href } = await locator.evaluate((el: Element) => ({
      tag: el.tagName.toLowerCase(),
      href: el instanceof HTMLAnchorElement ? el.href : '',
    })).catch(() => ({ tag: '', href: '' }))
    const box = await locator.boundingBox()
    this.addSound('click')
    await locator.click()
    await this.clickRipple()

    if (href && new URL(href).pathname !== new URL(this.activePage!.url()).pathname) {
      // Link navigates to a different page — wait then re-place cursor
      await this.activePage!.waitForURL(href, { timeout: 10_000 }).catch(() => {})
      await this.placeCursor()
    } else if ((tag === 'input' || tag === 'textarea') && box) {
      // Move cursor clear of field so typed text is visible
      await this.moveCursorToXY(box.x + box.width * 0.75, box.y + box.height + 40 + Math.random() * 20)
    }
  }

  // ─── Context ───────────────────────────────────────────────────────────────

  async newContext(browser: Browser, authToken?: string): Promise<BrowserContext> {
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
}
