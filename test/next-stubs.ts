/**
 * Replacements for Next.js modules that reach outside the component tree. `next/script`
 * injects tags into the document head, and `next/font/google` downloads font files at build
 * time; under test each is reduced to what a component reads from it.
 */
import { createElement } from 'react'

// An empty tag carrying the id, so a test can see that a script was requested without
// jsdom trying to run its body.
export const script = {
  default: (props: { id?: string }) => createElement('script', { 'data-testid': props.id }),
}

// Each face just contributes its CSS class and variable name.
const font = (name: string) => () => ({ variable: `--font-${name}`, className: name })
export const fontGoogle = {
  Montserrat: font('montserrat'),
  Roboto_Slab: font('roboto-slab'),
  Saira_Condensed: font('saira'),
}
