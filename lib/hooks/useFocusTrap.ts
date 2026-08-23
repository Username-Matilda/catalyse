import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Traps Tab focus within the container while `isOpen`, and restores focus to the trigger on close. */
export function useFocusTrap(isOpen: boolean) {
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<Element | null>(null)

  useEffect(() => {
    if (!isOpen) return

    triggerRef.current = document.activeElement
    const container = containerRef.current
    const focusable = container?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    focusable?.[0]?.focus()

    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !container) return
      const focusableEls = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (focusableEls.length === 0) return
      const first = focusableEls[0]
      const last = focusableEls[focusableEls.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('keydown', handler)
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus()
    }
  }, [isOpen])

  return containerRef
}
