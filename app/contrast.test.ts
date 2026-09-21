import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

// WCAG 2.1 relative luminance and contrast ratio.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const css = readFileSync(path.join(__dirname, 'globals.css'), 'utf8')
function tokens(selector: string): Record<string, string> {
  const block = css.slice(css.indexOf(selector)).split('}')[0]
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]),
  )
}

// Every colour used for text, against every background it is drawn on.
const TEXT = ['text', 'text-light', 'primary-text', 'error', 'success', 'warning-text']
const BACKGROUNDS = ['background', 'surface']

describe.each([
  ['light', ':root {'],
  ['dark', "[data-theme='dark'] {"],
])('%s theme text contrast', (_theme, selector) => {
  const t = tokens(selector)
  it.each(TEXT.flatMap((fg) => BACKGROUNDS.map((bg) => [fg, bg])))(
    '--%s on --%s meets WCAG AA (4.5:1)',
    (fg, bg) => {
      expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5)
    },
  )
})
