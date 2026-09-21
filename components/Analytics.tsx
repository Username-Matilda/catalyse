'use client'

import { useEffect, useState } from 'react'
import Script from 'next/script'
import { useAuth } from '@/lib/auth-context'

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

/**
 * Loads Google Analytics for everyone who has not declined it. There is no banner: a
 * decline made in Settings (kept on the account, and on the device after signing out)
 * is the opt-out.
 */
export default function Analytics() {
  const { user, loading } = useAuth()
  const [declined, setDeclined] = useState<boolean | null>(null)

  useEffect(() => {
    if (loading) return
    if (user && user.cookieConsentAnalytics !== null) {
      // The account's choice also governs this device after signing out.
      localStorage.setItem('cookieConsent', String(user.cookieConsentAnalytics))
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDeclined(!user.cookieConsentAnalytics)
      return
    }
    setDeclined(localStorage.getItem('cookieConsent') === 'false')
  }, [loading, user])

  if (!GA_ID || declined !== false) return null

  return (
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
  )
}
