'use client'

import { useEffect, useState } from 'react'

/**
 * Whether the page was opened with `?notice=<name>`, for a message shown once: the parameter
 * is then dropped from the address so a reload or a shared link doesn't repeat it. Read on
 * mount rather than during render, because after a client-side redirect the address can
 * still be the old one when the page first renders.
 */
export function useOneTimeNotice(name: string): [boolean, () => void] {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('notice') !== name) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShown(true)
    params.delete('notice')
    const query = params.toString()
    history.replaceState(
      null,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    )
  }, [name])
  return [shown, () => setShown(false)]
}
