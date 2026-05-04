'use client'

import { useState, useEffect, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Script from 'next/script'
import Header from '@/components/Header'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'

export default function LoginPage() {
  const router = useRouter()
  const { user, loading, setToken } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [googleClientId, setGoogleClientId] = useState('')

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard')
  }, [user, loading, router])

  useEffect(() => {
    apiRequest<{ client_id: string }>('/api/auth/google-client-id')
      .then(d => setGoogleClientId(d.client_id))
      .catch(() => {})
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const data = await apiRequest<{ auth_token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      })
      await setToken(data.auth_token)
      router.push('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
      setSubmitting(false)
    }
  }

  function handleGoogleResponse(response: { credential: string }) {
    apiRequest<{ auth_token: string; is_new_user?: boolean }>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential: response.credential }),
    })
      .then(async data => {
        await setToken(data.auth_token)
        router.push(data.is_new_user ? '/profile' : '/dashboard')
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Google sign-in failed'))
  }

  useEffect(() => {
    if (!googleClientId) return
    const win = window as Window & typeof globalThis & { google?: { accounts: { id: { initialize: (c: unknown) => void; renderButton: (el: Element | null, opts: unknown) => void } } } }
    if (!win.google?.accounts?.id) return
    win.google.accounts.id.initialize({ client_id: googleClientId, callback: handleGoogleResponse })
    win.google.accounts.id.renderButton(document.getElementById('g_signin_btn'), { theme: 'outline', size: 'large', width: 350, text: 'sign_in_with' })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleClientId])

  if (loading) return null

  return (
    <>
      {googleClientId && <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />}
      <Header />
      <main className="container page">
        <div style={{ maxWidth: 400, margin: '60px auto' }}>
          <h1 style={{ textAlign: 'center' }}>Welcome Back</h1>
          <p style={{ textAlign: 'center', color: 'var(--text-light)', marginBottom: 32 }}>
            Login to access your dashboard and projects.
          </p>

          {error && (
            <div role="alert" className="message error" style={{ marginBottom: 16 }}>
              {error}
            </div>
          )}

          {googleClientId && (
            <div className="card" style={{ textAlign: 'center', marginBottom: 16 }}>
              <div id="g_signin_btn" />
              <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', gap: 16 }}>
                <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--border)' }} />
                <span style={{ color: 'var(--text-light)', fontSize: '0.875rem' }}>or use email</span>
                <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--border)' }} />
              </div>
            </div>
          )}

          <form className="card" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="email" className="required">Email</label>
              <input
                type="email"
                id="email"
                name="email"
                required
                autoFocus
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password" className="required">Password</label>
              <input
                type="password"
                id="password"
                name="password"
                required
                placeholder="Your password"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={submitting}>
              {submitting ? 'Logging in…' : 'Login'}
            </button>

            <p style={{ textAlign: 'center', marginTop: 16 }}>
              <Link href="/forgot-password">Forgot your password?</Link>
            </p>
            <p style={{ textAlign: 'center', marginTop: 12, color: 'var(--text-light)' }}>
              Don&apos;t have an account? <Link href="/signup">Sign up</Link>
            </p>
          </form>

          <p style={{ textAlign: 'center', marginTop: 24, fontSize: '0.875rem', color: 'var(--text-light)' }}>
            <Link href="/privacy" style={{ color: 'var(--text-light)' }}>Privacy Policy</Link>
            {' · '}
            <a href="mailto:matilda@pauseai.info" style={{ color: 'var(--text-light)' }}>Contact Support</a>
          </p>
        </div>
      </main>
    </>
  )
}
