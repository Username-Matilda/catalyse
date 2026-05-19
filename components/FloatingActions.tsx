'use client'

import { useState } from 'react'
import { ThemeToggle } from './ThemeToggle'
import BugReportDialog from './BugReportDialog'
import Button from '@/components/Button'
import { useToast } from '@/lib/toast'
import { useCookieConsent } from '@/lib/cookie-consent-context'

export default function FloatingActions() {
  const [bugDialogOpen, setBugDialogOpen] = useState(false)
  const toast = useToast()
  const { bannerVisible } = useCookieConsent()

  return (
    <>
      {/* bottom-4 centers the group in the xl:h-16 footer; bottom-20 clears the same h-16 banner + the 16px gap */}
      <div
        className={`fixed right-6 z-[200] hidden xl:flex items-center bg-surface border border-brand-border rounded-[var(--radius)] shadow-lg overflow-hidden ${bannerVisible ? 'bottom-20' : 'bottom-4'}`}
      >
        <ThemeToggle icon={false} className="rounded-none self-stretch" />
        {process.env.NODE_ENV === 'development' && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toast('This is a success toast', 'success')}
              className="rounded-none"
            >
              ✓
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toast('This is an error toast', 'error')}
              className="rounded-none"
            >
              ✕
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toast('This is an info toast', 'info')}
              className="rounded-none"
            >
              ℹ
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setBugDialogOpen(true)}
          className="rounded-none"
          aria-label="Report a bug or give feedback"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
            <line x1="4" y1="22" x2="4" y2="15" />
          </svg>
          Report bug/feedback
        </Button>
      </div>
      <BugReportDialog isOpen={bugDialogOpen} onClose={() => setBugDialogOpen(false)} />
    </>
  )
}
