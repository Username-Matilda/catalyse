'use client'

import { createContext, useContext, useState } from 'react'

interface CookieConsentContextValue {
  bannerVisible: boolean
  setBannerVisible: (v: boolean) => void
}

const CookieConsentContext = createContext<CookieConsentContextValue>({
  bannerVisible: false,
  setBannerVisible: () => {},
})

export function CookieConsentProvider({ children }: { children: React.ReactNode }) {
  const [bannerVisible, setBannerVisible] = useState(false)
  return (
    <CookieConsentContext.Provider value={{ bannerVisible, setBannerVisible }}>
      {children}
    </CookieConsentContext.Provider>
  )
}

export function useCookieConsent() {
  return useContext(CookieConsentContext)
}
