'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { client } from '@/lib/client'

interface User {
  id: number
  email: string
  name: string
  isAdmin: boolean
  isSuperAdmin: boolean
  approvalStatus: string
  hasPassword: boolean
  emailDigest: string | null
  cookieConsentAnalytics: boolean | null
  skills: Array<{ id: number; name: string }>
}

interface AuthContextValue {
  user: User | null
  token: string | null
  loading: boolean
  setToken: (token: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setTokenState] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('authToken') : null,
  )
  const [loading, setLoading] = useState(
    () => typeof window !== 'undefined' && !!localStorage.getItem('authToken'),
  )
  const router = useRouter()

  const fetchMe = useCallback(async (): Promise<User | null> => {
    try {
      const data = await client.auth.me()
      const u = data as User
      setUser(u)
      return u
    } catch {
      localStorage.removeItem('authToken')
      setTokenState(null)
      setUser(null)
      return null
    }
  }, [])

  useEffect(() => {
    if (!token) return
    // False positive: rule traces call graph without modelling async boundaries.
    // setState inside fetchMe only runs after await, never synchronously in the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMe().finally(() => setLoading(false))
    // Intentionally omit `token` from deps: only fetch on mount. setToken() already
    // calls fetchMe() explicitly, so including token here would double-fetch on login.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchMe])

  useEffect(() => {
    const handler = () => {
      localStorage.removeItem('authToken')
      setTokenState(null)
      setUser(null)
    }
    window.addEventListener('auth:expired', handler)
    return () => window.removeEventListener('auth:expired', handler)
  }, [])

  const setToken = useCallback(
    async (t: string) => {
      localStorage.setItem('authToken', t)
      setTokenState(t)
      const vol = await fetchMe()
      if (vol && vol.cookieConsentAnalytics === null) {
        const stored = localStorage.getItem('cookieConsent')
        if (stored !== null) {
          await client.volunteers
            .updateMe({ cookieConsentAnalytics: stored === 'true' })
            .catch(() => {})
        }
      }
    },
    [fetchMe],
  )

  const logout = useCallback(async () => {
    await client.auth.logout().catch(() => {})
    localStorage.removeItem('authToken')
    setTokenState(null)
    setUser(null)
    router.push('/login')
  }, [router])

  const refreshUser = useCallback(async () => {
    const t = localStorage.getItem('authToken')
    if (t) await fetchMe()
  }, [fetchMe])

  return (
    <AuthContext.Provider value={{ user, token, loading, setToken, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
