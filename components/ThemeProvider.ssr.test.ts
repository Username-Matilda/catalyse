import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { ThemeProvider, useTheme } from './ThemeProvider'

/** Server render — no `window` — must fall back to the system theme without touching storage. */
describe('ThemeProvider on the server', () => {
  it('renders with the system theme and no resolved theme', () => {
    function Probe() {
      const { theme, resolvedTheme } = useTheme()
      return createElement('span', null, `${theme}/${resolvedTheme ?? 'none'}`)
    }
    const html = renderToString(createElement(ThemeProvider, null, createElement(Probe)))
    expect(html).toContain('system/none')
  })
})
