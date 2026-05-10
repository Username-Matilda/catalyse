'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface User {
  id: number
  email: string
  name: string
  is_admin: boolean
  volunteer_id?: number
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
  const [token, setTokenState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
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
    const stored = localStorage.getItem('authToken')
    if (stored) {
      setTokenState(stored)
      fetchMe(stored).finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
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
