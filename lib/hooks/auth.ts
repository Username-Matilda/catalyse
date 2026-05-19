'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

export function useRequireAuth() {
  const router = useRouter()
  const auth = useAuth()
  useEffect(() => {
    if (!auth.loading && !auth.user) router.replace('/login')
  }, [auth.user, auth.loading, router])
  return auth
}

export function useRequireAdmin() {
  const router = useRouter()
  const auth = useAuth()
  useEffect(() => {
    if (!auth.loading && !auth.user) router.replace('/login')
    if (!auth.loading && auth.user && !auth.user.isAdmin) router.replace('/')
  }, [auth.user, auth.loading, router])
  return auth
}

export function useRequireSuperAdmin() {
  const router = useRouter()
  const auth = useAuth()
  useEffect(() => {
    if (!auth.loading && !auth.user) router.replace('/login')
    if (!auth.loading && auth.user && !auth.user.isSuperAdmin) router.replace('/')
  }, [auth.user, auth.loading, router])
  return auth
}
