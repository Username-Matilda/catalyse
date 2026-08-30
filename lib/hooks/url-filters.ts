'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams, usePathname } from 'next/navigation'

function useSetParam() {
  // Deliberately depends on nothing: the setter must keep a stable identity for the
  // life of the component. Directory pages list it (via setPageParam) in the deps of
  // their "reset to page 1 when a filter changes" effect — a setter that churned on
  // every URL change would re-fire that effect right after a pagination click and
  // snap the list straight back to page 1.
  //
  // Reads the live URL at call time rather than closing over useSearchParams(), and
  // writes with history.replaceState (which Next patches to sync
  // usePathname/useSearchParams) instead of router.replace() — matching
  // useUrlSearchInput below. router.replace() with a query-only relative URL did not
  // reliably update useSearchParams() here, which is why paging never advanced.
  return useCallback((key: string, value: string) => {
    const params = new URLSearchParams(window.location.search)
    if (value) params.set(key, value)
    else params.delete(key)
    const qs = params.toString()
    const { pathname } = window.location
    window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname)
  }, [])
}

/**
 * Reads a URL search param and returns an immediate setter (no debounce).
 * Suitable for dropdown filters.
 */
export function useUrlParam(key: string): [string, (value: string) => void] {
  const searchParams = useSearchParams()
  const setParam = useSetParam()
  const value = searchParams.get(key) ?? ''
  const setValue = useCallback((v: string) => setParam(key, v), [key, setParam])
  return [value, setValue]
}

/**
 * Manages a text search input with a debounced URL write.
 *
 * Returns [inputValue, setInputValue, urlValue] where:
 * - inputValue / setInputValue drive the <input> element directly
 * - urlValue is the committed (debounced) value to pass to API queries
 *
 * The effect is skipped when inputValue already matches the URL to prevent
 * a spurious router.replace on mount that would race auth redirects.
 */
export function useUrlSearchInput(
  key: string,
  delayMs = 300,
): [string, (value: string) => void, string] {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const urlValue = searchParams.get(key) ?? ''
  const [input, setInput] = useState(urlValue)

  useEffect(() => {
    if (input === urlValue) return
    const t = setTimeout(() => {
      // Clicking a result navigates away; the timer is cleared on unmount, but the new
      // route can commit before that cleanup runs. Writing a bare `?q=...` at that point
      // resolves against whatever page is showing now and stamps the search onto it
      // (/projects/39?q=...), so bail out once we've left the page this input belongs to.
      if (window.location.pathname !== pathname) return
      const params = new URLSearchParams(searchParams.toString())
      if (input) params.set(key, input)
      else params.delete(key)
      // Use the History API directly instead of router.replace(). Next.js patches
      // history.replaceState to sync usePathname/useSearchParams without going through
      // the router's navigation queue — router.replace() here would otherwise race a
      // pending router.push() from clicking a result (e.g. a search result link clicked
      // just as the debounce fires) and silently cancel that navigation.
      window.history.replaceState(null, '', `${pathname}?${params.toString()}`)
    }, delayMs)
    return () => clearTimeout(t)
  }, [input, searchParams, pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  return [input, setInput, urlValue]
}
