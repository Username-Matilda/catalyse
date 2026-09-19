import { describe, it, expect } from 'vitest'
import { containsLink } from './links'

describe('containsLink', () => {
  it('spots full URLs, www addresses and bare domains in any of the texts', () => {
    expect(containsLink('see https://example.com/me')).toBe(true)
    expect(containsLink(null, 'my site is WWW.example.org')).toBe(true)
    expect(containsLink('portfolio at example.dev', undefined)).toBe(true)
  })

  it('passes ordinary prose and empty values', () => {
    expect(containsLink()).toBe(false)
    expect(containsLink(null, undefined, '')).toBe(false)
    expect(containsLink('I have worked in policy, e.g. on AI. I can give 5 hrs a week.')).toBe(
      false,
    )
  })
})
