'use client'

import { useEffect, useState } from 'react'
import Script from 'next/script'
import { useAuth } from '@/lib/auth-context'

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

type ConsentState = boolean | null

export default function CookieConsentBanner() {
  const { user, token, loading } = useAuth()
  const [consent, setConsent] = useState<ConsentState>(null)
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    if (loading) return

    if (user) {
      if (user.cookieConsentAnalytics !== null) {
        setConsent(user.cookieConsentAnalytics)
        setResolved(true)
        return
      }
    }

    const stored = localStorage.getItem('cookieConsent')
    if (stored !== null) {
      setConsent(stored === 'true')
      setResolved(true)
      return
    }

    setResolved(true)
  }, [loading, user])

  async function saveConsent(value: boolean) {
    localStorage.setItem('cookieConsent', String(value))
    setConsent(value)

    if (token) {
      await fetch('/api/volunteers/me', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookie_consent_analytics: value }),
      }).catch(() => {})
    }
  }

  return (
    <>
      {GA_ID && consent === true && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga-init" strategy="afterInteractive">{`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
          `}</Script>
        </>
      )}

      {resolved && consent === null && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--border)] bg-[var(--surface)] p-4 shadow-lg sm:flex sm:items-center sm:justify-between sm:gap-4">
          <p className="text-sm text-[var(--text-light)]">
            We use Google Analytics to understand how the site is used. You can decline and it won&apos;t load.{' '}
            <a href="/privacy" className="underline">
              Privacy policy
            </a>
            .
          </p>
          <div className="mt-3 flex gap-2 sm:mt-0 sm:shrink-0">
            <button
              onClick={() => saveConsent(false)}
              className="rounded border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent)]"
            >
              Decline
            </button>
            <button
              onClick={() => saveConsent(true)}
              className="rounded bg-[var(--primary)] px-4 py-2 text-sm text-white hover:bg-[var(--primary-dark)]"
            >
              Accept
            </button>
          </div>
        </div>
      )}
    </>
  )
}
