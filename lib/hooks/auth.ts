'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { ApprovalStatus } from '@/generated/prisma/enums'

export function useRequireAuth() {
  const router = useRouter()
  const auth = useAuth()
  useEffect(() => {
    if (!auth.loading && !auth.user) router.replace('/login')
  }, [auth.user, auth.loading, router])
  return auth
}

/** Where a volunteer lands when a page needs approval they don't have yet; see the dashboard. */
export const PENDING_NOTICE_URL = '/dashboard?notice=pending'

/**
 * For pages only approved volunteers (and admins) may use. `user` stays null until the
 * volunteer is known to be approved, so the page shows its loading state rather than
 * flashing content before the redirect.
 */
export function useRequireApproved() {
  const router = useRouter()
  const auth = useAuth()
  const isApproved = Boolean(
    auth.user && (auth.user.approvalStatus === ApprovalStatus.approved || auth.user.isAdmin),
  )
  useEffect(() => {
    if (auth.loading) return
    if (!auth.user) router.replace('/login')
    else if (!isApproved) router.replace(PENDING_NOTICE_URL)
  }, [auth.user, auth.loading, isApproved, router])
  return { ...auth, user: isApproved ? auth.user : null }
}

export function useRequireAdmin() {
  const router = useRouter()
  const auth = useAuth()
  useEffect(() => {
    if (!auth.loading && !auth.user) router.replace('/login')
    if (!auth.loading && auth.user && !auth.user.isAdmin) router.replace('/projects')
  }, [auth.user, auth.loading, router])
  return auth
}

export function useRequireSuperAdmin() {
  const router = useRouter()
  const auth = useAuth()
  useEffect(() => {
    if (!auth.loading && !auth.user) router.replace('/login')
    if (!auth.loading && auth.user && !auth.user.isSuperAdmin) router.replace('/projects')
  }, [auth.user, auth.loading, router])
  return auth
}
