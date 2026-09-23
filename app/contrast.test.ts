import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
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
const TEXT = ['text', 'heading', 'text-light', 'primary-text', 'error', 'success', 'warning-text']
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

// `--secondary-dark` is a fill (button hover); as a text colour it is grey on the dark page.
// Headings use `--heading`, and text on the orange fill uses `text-gray-900`.
const ON_PRIMARY = '#111827'

describe.each([
  ['light', ':root {'],
  ['dark', "[data-theme='dark'] {"],
])('%s theme text on the orange fill', (_theme, selector) => {
  it('gray-900 on --primary meets WCAG AA (4.5:1)', () => {
    expect(contrast(ON_PRIMARY, tokens(selector).primary)).toBeGreaterThanOrEqual(4.5)
  })
})

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx$/.test(name) && !/\.test\./.test(name) ? [full] : []
  })
}

describe('outline buttons', () => {
  it('are drawn in the text colours, which are measured above, not in --secondary', () => {
    const button = readFileSync(path.join(__dirname, '..', 'components', 'Button.tsx'), 'utf8')
    const outline = button.match(/outline:\s*'([^']*)'/)?.[1] ?? ''
    expect(outline).toContain('text-brand-text')
    expect(outline).toContain('border-text-light')
    expect(outline).not.toMatch(/\btext-secondary\b|\bborder-secondary\b/)
  })
})

describe('text-secondary and text-secondary-dark', () => {
  it('are not text colours: --secondary is a fill, and text-secondary-dark only sits on the accent pill', () => {
    const root = path.join(__dirname, '..')
    const offenders = ['app', 'components']
      .flatMap((d) => sourceFiles(path.join(root, d)))
      .flatMap((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .filter(
            (line) =>
              (line.includes('text-secondary-dark') && !line.includes('dark:text-gray-300')) ||
              /\btext-secondary(?![-\w])/.test(line),
          )
          .map((line) => `${path.relative(root, file)}: ${line.trim()}`),
      )
    expect(offenders).toEqual([])
  })
})
