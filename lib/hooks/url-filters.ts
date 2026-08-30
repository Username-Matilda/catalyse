'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'

function useSetParam() {
  const searchParams = useSearchParams()
  const router = useRouter()
  // Read the latest params through a ref so the returned setter keeps a stable
  // identity across URL changes. Without this, every router.replace() (including
  // a pagination click writing ?page=N) hands consumers a new setter, which
  // re-fires any effect that lists the setter in its deps — e.g. the
  // "reset to page 1 on filter change" effects in the projects/volunteers
  // directories, which would then clobber every page change back to page 1.
  const paramsRef = useRef(searchParams)
  useEffect(() => {
    paramsRef.current = searchParams
  }, [searchParams])
  return useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(paramsRef.current.toString())
      if (value) params.set(key, value)
      else params.delete(key)
      router.replace(`?${params.toString()}`, { scroll: false })
    },
    [router],
  )
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
