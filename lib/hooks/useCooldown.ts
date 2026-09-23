import { useState } from 'react'

/**
 * Ids held "cooling" for `ms` after `start(id)`. A control that replaces another in the
 * same spot stays disabled while its id is cooling, so a second click aimed at the first
 * cannot land on it.
 */
export function useCooldown(ms = 2000) {
  const [cooling, setCooling] = useState<ReadonlySet<number>>(new Set())

  function start(id: number) {
    setCooling((s) => new Set(s).add(id))
    setTimeout(
      () =>
        setCooling((s) => {
          const next = new Set(s)
          next.delete(id)
          return next
        }),
      ms,
    )
  }

  return { isCooling: (id: number) => cooling.has(id), start }
}
