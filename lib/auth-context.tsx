'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface User {
  id: number
  email: string
  name: string
  is_admin: boolean
  is_super_admin: boolean
  approval_status: string
  volunteer_id?: number
  has_password: boolean
  email_digest: string | null
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

  const fetchMe = useCallback(async (t: string) => {
    try {
      const res = await fetch(`/api/auth/me`, {
        headers: { Authorization: `Bearer ${t}` },
      })
      if (!res.ok) {
        localStorage.removeItem('authToken')
        setTokenState(null)
        setUser(null)
        return
      }
      const data = await res.json()
      setUser(data)
    } catch {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    if (!token) return
    // False positive: rule traces call graph without modelling async boundaries.
    // setState inside fetchMe only runs after await fetch(), never synchronously in the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMe(token).finally(() => setLoading(false))
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
      await fetchMe(t)
    },
    [fetchMe],
  )

  const logout = useCallback(async () => {
    const t = localStorage.getItem('authToken')
    if (t) {
      await fetch(`/api/auth/logout`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${t}` },
      }).catch(() => {})
    }
    localStorage.removeItem('authToken')
    setTokenState(null)
    setUser(null)
    router.push('/login')
  }, [router])

  const refreshUser = useCallback(async () => {
    const t = localStorage.getItem('authToken')
    if (t) await fetchMe(t)
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
