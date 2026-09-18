import { useSyncExternalStore, useMemo } from 'react'
import { vi } from 'vitest'

/**
 * A stand-in for `next/navigation` for happy-dom tests. The App Router's hooks need Next's
 * runtime mounted; here they read from and write to happy-dom's real `window.location`, so a
 * page that pushes a URL, then reads `useSearchParams()`, sees its own change — the same
 * contract the real hooks give it. Every navigation is also recorded on `navigation` so a
 * test can assert where a page tried to go.
 */
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

// `test/render.tsx` imports this module for `navigation.params`, and is itself imported by the
// node-environment SSR tests, so the happy-dom wiring must be skipped when there is no window.
if (typeof window !== 'undefined') {
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = window.history[method].bind(window.history)
    window.history[method] = (...args: Parameters<History['pushState']>) => {
      original(...args)
      notify()
    }
  }
  window.addEventListener('popstate', notify)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const navigation = {
  push: vi.fn((url: string) => {
    window.history.pushState(null, '', url)
  }),
  replace: vi.fn((url: string) => {
    window.history.replaceState(null, '', url)
  }),
  back: vi.fn(() => window.history.back()),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
  /** What `useParams()` returns — set it in a test that renders a dynamic route. */
  params: {} as Record<string, string | string[]>,
  reset() {
    this.push.mockClear()
    this.replace.mockClear()
    this.back.mockClear()
    this.refresh.mockClear()
    this.params = {}
    window.history.replaceState(null, '', '/')
  },
}

export function useRouter() {
  return navigation
}

export function usePathname() {
  return useSyncExternalStore(subscribe, () => window.location.pathname)
}

export function useSearchParams() {
  const search = useSyncExternalStore(subscribe, () => window.location.search)
  return useMemo(() => new URLSearchParams(search), [search])
}

export function useParams() {
  return navigation.params
}

export function redirect(url: string): never {
  throw new Error(`NEXT_REDIRECT:${url}`)
}

export function notFound(): never {
  throw new Error('NEXT_NOT_FOUND')
}
