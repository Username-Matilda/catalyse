'use client'

import { useEffect, useState } from 'react'
import Script from 'next/script'
import { useMutation } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth-context'
import { useCookieConsent } from '@/lib/cookie-consent-context'
import Button from '@/components/Button'
import { orpc } from '@/lib/orpc'

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

type ConsentState = boolean | null

export default function CookieConsentBanner() {
  const { user, loading } = useAuth()
  const { setBannerVisible } = useCookieConsent()
  const [consent, setConsent] = useState<ConsentState>(null)
  const [resolved, setResolved] = useState(false)
  const updateMeMutation = useMutation({ ...orpc.volunteers.updateMe.mutationOptions() })

  useEffect(() => {
    if (loading) return

    if (user) {
      if (user.cookieConsentAnalytics !== null) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
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

  useEffect(() => {
    setBannerVisible(resolved && consent === null)
  }, [resolved, consent, setBannerVisible])

  function saveConsent(value: boolean) {
    localStorage.setItem('cookieConsent', String(value))
    setConsent(value)

    if (user) {
      updateMeMutation.mutate({ cookieConsentAnalytics: value })
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
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-brand-border bg-surface shadow-lg xl:h-16">
          <div className="container flex flex-wrap items-center justify-between gap-4 py-4 xl:h-full xl:py-0">
            <p className="text-sm text-text-light">
              We use Google Analytics to understand how the site is used. You can decline and it
              won&apos;t load.{' '}
              <a href="/privacy" className="underline">
                Privacy policy
              </a>
              .
            </p>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => saveConsent(false)}>
                Decline
              </Button>
              <Button variant="primary" size="sm" onClick={() => saveConsent(true)}>
                Accept
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
