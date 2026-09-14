'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'

export default function Tooltip({
  content,
  children,
}: {
  content: string
  children: React.ReactNode
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  function show(e: React.MouseEvent<HTMLSpanElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    setPos({ top: rect.top, left: rect.left + rect.width / 2 })
  }

  return (
    <span onMouseEnter={show} onMouseLeave={() => setPos(null)}>
      {children}
      {pos &&
        createPortal(
          <span
            role="tooltip"
            className="pointer-events-none fixed -translate-x-1/2 -translate-y-full -mt-1 max-w-xs text-center rounded bg-gray-900 px-2 py-1 text-xs text-white z-50"
            style={{ top: pos.top, left: pos.left }}
          >
            {content}
          </span>,
          document.body,
        )}
    </span>
  )
}
