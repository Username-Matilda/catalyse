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

/** Where someone lands from an admin page they may not open; see the projects page. */
export const NO_ACCESS_NOTICE_URL = '/projects?notice=no-access'

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

/** Where an approved volunteer with an unconfirmed email is sent from a project page. */
export const VERIFY_EMAIL_URL = '/verify-email'

/**
 * For project pages: approved, and the email proven. An unconfirmed volunteer is sent to the
 * page that asks them to confirm, so a direct link to a project is no way round the gate.
 */
export function useRequireConfirmed() {
  const router = useRouter()
  const auth = useRequireApproved()
  const needsConfirmation = Boolean(auth.user && !auth.user.emailConfirmed && !auth.user.isAdmin)
  useEffect(() => {
    if (needsConfirmation) router.replace(VERIFY_EMAIL_URL)
  }, [needsConfirmation, router])
  return { ...auth, user: needsConfirmation ? null : auth.user }
}

export function useRequireAdmin() {
  const router = useRouter()
  const auth = useAuth()
  useEffect(() => {
    if (!auth.loading && !auth.user) router.replace('/login')
    if (!auth.loading && auth.user && !auth.user.isAdmin) router.replace(NO_ACCESS_NOTICE_URL)
  }, [auth.user, auth.loading, router])
  return auth
}

export function useRequireSuperAdmin() {
  const router = useRouter()
  const auth = useAuth()
  useEffect(() => {
    if (!auth.loading && !auth.user) router.replace('/login')
    if (!auth.loading && auth.user && !auth.user.isSuperAdmin) router.replace(NO_ACCESS_NOTICE_URL)
  }, [auth.user, auth.loading, router])
  return auth
}
