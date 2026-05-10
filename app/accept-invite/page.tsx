'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/Header'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'
import Button from '@/components/Button'

function AcceptInviteContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const { user, loading } = useAuth()
  const [apiStatus, setApiStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const status = loading
    ? 'loading'
    : !token
      ? 'error'
      : !user
        ? 'needs-login'
        : apiStatus === 'idle'
          ? 'loading'
          : apiStatus

  useEffect(() => {
    if (loading || !token || !user) return
    apiRequest('/api/admin/admins/accept-invite?invite_token=' + encodeURIComponent(token), {
      method: 'POST',
    })
      .then(() => setApiStatus('success'))
      .catch((err) => {
        setApiStatus('error')
        setErrorMsg(err instanceof Error ? err.message : 'Failed to accept invite')
      })
  }, [loading, user, token])

  useEffect(() => {
    if (status === 'success') {
      const t = setTimeout(() => router.push('/dashboard'), 2000)
      return () => clearTimeout(t)
    }
  }, [status, router])

  if (status === 'loading') {
    return (
      <div className="text-center py-10 text-text-light">
        <div className="spinner" />
        Processing invite…
      </div>
    )
  }

  if (status === 'needs-login') {
    const redirectUrl =
      typeof window !== 'undefined' ? encodeURIComponent(window.location.href) : ''
    return (
      <div className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word text-center">
        <h2>Admin Invite</h2>
        <p className="text-text-light" style={{ margin: '16px 0' }}>
          You&apos;ve been invited to become an admin on Catalyse.
        </p>
        <p style={{ marginBottom: 24 }}>
          Please log in or sign up with the invited email address to accept.
        </p>
        <Button href={`/login?redirect=${redirectUrl}`}>Log In</Button>
        <Button href={`/signup?redirect=${redirectUrl}`} variant="outline" className="ml-2">
          Sign Up
        </Button>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word text-center">
        <h2>Welcome to the Team!</h2>
        <p className="text-text-light" style={{ margin: '16px 0' }}>
          You now have admin access to Catalyse. Redirecting…
        </p>
        <Button href="/admin/triage">Go to Admin Dashboard</Button>
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word text-center">
      <h2>Invite Error</h2>
      <p style={{ margin: '16px 0', color: 'var(--error)' }}>{errorMsg}</p>
      <Button href="/" variant="outline">
        Back to Home
      </Button>
    </div>
  )
}

export default function AcceptInvitePage() {
  return (
    <>
      <Header />
      <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
        <div style={{ maxWidth: 500, margin: '60px auto', textAlign: 'center' }}>
          <Suspense fallback={<div className="text-center py-10 text-text-light">Loading…</div>}>
            <AcceptInviteContent />
          </Suspense>
        </div>
      </main>
    </>
  )
}
