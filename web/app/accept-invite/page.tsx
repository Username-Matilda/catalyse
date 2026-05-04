'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'

function AcceptInviteContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const { user, loading } = useAuth()
  const [status, setStatus] = useState<'loading' | 'needs-login' | 'success' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (loading) return

    if (!token) {
      setStatus('error')
      setErrorMsg('No invite token provided.')
      return
    }

    if (!user) {
      setStatus('needs-login')
      return
    }

    apiRequest('/api/admin/admins/accept-invite?invite_token=' + encodeURIComponent(token), {
      method: 'POST',
    })
      .then(() => setStatus('success'))
      .catch(err => {
        setStatus('error')
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
      <div className="loading">
        <div className="spinner" />
        Processing invite…
      </div>
    )
  }

  if (status === 'needs-login') {
    const redirectUrl = typeof window !== 'undefined' ? encodeURIComponent(window.location.href) : ''
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <h2>Admin Invite</h2>
        <p style={{ margin: '16px 0', color: 'var(--text-light)' }}>
          You&apos;ve been invited to become an admin on Catalyse.
        </p>
        <p style={{ marginBottom: 24 }}>
          Please log in or sign up with the invited email address to accept.
        </p>
        <Link href={`/login?redirect=${redirectUrl}`} className="btn btn-primary">Log In</Link>
        <Link href={`/signup?redirect=${redirectUrl}`} className="btn btn-outline" style={{ marginLeft: 8 }}>Sign Up</Link>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <h2>Welcome to the Team!</h2>
        <p style={{ margin: '16px 0', color: 'var(--text-light)' }}>
          You now have admin access to Catalyse. Redirecting…
        </p>
        <Link href="/admin/triage" className="btn btn-primary">Go to Admin Dashboard</Link>
      </div>
    )
  }

  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <h2>Invite Error</h2>
      <p style={{ margin: '16px 0', color: 'var(--error)' }}>{errorMsg}</p>
      <Link href="/" className="btn btn-outline">Back to Home</Link>
    </div>
  )
}

export default function AcceptInvitePage() {
  return (
    <>
      <Header />
      <main className="container page">
        <div style={{ maxWidth: 500, margin: '60px auto', textAlign: 'center' }}>
          <Suspense fallback={<div className="loading">Loading…</div>}>
            <AcceptInviteContent />
          </Suspense>
        </div>
      </main>
    </>
  )
}
