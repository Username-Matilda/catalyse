'use client'

import { useState, useEffect, useCallback, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Script from 'next/script'
import Button from '@/components/Button'
import { useAuth } from '@/lib/auth-context'
import { client } from '@/lib/client'

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
    client.auth
      .googleClientId()
      .then((d) => setGoogleClientId(d.clientId))
      .catch(() => {})
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const data = await client.auth.login({ email: email.trim(), password })
      await setToken(data.token)
      router.push('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
      setSubmitting(false)
    }
  }

  const handleGoogleResponse = useCallback(
    (response: { credential: string }) => {
      client.auth
        .google({ credential: response.credential })
        .then(async (data) => {
          await setToken(data.token)
          router.push(data.isNewUser ? '/profile' : '/dashboard')
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Google sign-in failed'))
    },
    [setToken, router],
  )

  const initGoogleButton = useCallback(() => {
    const win = window as Window &
      typeof globalThis & {
        google?: {
          accounts: {
            id: {
              initialize: (c: unknown) => void
              renderButton: (el: Element | null, opts: unknown) => void
            }
          }
        }
      }
    if (!win.google?.accounts?.id || !googleClientId) return
    win.google.accounts.id.initialize({ client_id: googleClientId, callback: handleGoogleResponse })
    const btnEl = document.getElementById('g_signin_btn')
    const btnWidth = Math.min(400, Math.max(200, btnEl?.offsetWidth ?? 350))
    win.google.accounts.id.renderButton(btnEl, {
      theme: 'outline',
      size: 'large',
      width: btnWidth,
      text: 'sign_in_with',
    })
  }, [googleClientId, handleGoogleResponse])

  useEffect(() => {
    initGoogleButton()
  }, [initGoogleButton])

  if (loading) return null

  return (
    <>
      {googleClientId && (
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onLoad={initGoogleButton}
        />
      )}
      <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
        <div style={{ maxWidth: 400, margin: '60px auto' }}>
          <h1 className="text-center">Welcome Back</h1>
          <p className="text-center text-text-light" style={{ marginBottom: 32 }}>
            Login to access your dashboard and projects.
          </p>

          {error && (
            <div
              role="alert"
              className="flex items-center gap-3 p-4 rounded-lg mb-4 bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5] dark:bg-[#7F1D1D] dark:text-[#FCA5A5] dark:border-[#DC2626]"
            >
              {error}
            </div>
          )}

          <div className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word">
            {googleClientId && (
              <div className="text-center mb-5">
                <div id="g_signin_btn" className="flex justify-center" />
                <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', gap: 16 }}>
                  <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--border)' }} />
                  <span className="text-text-light text-sm">or use email</span>
                  <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--border)' }} />
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="mb-5">
                <label htmlFor="email" className="required">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  autoFocus
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="mb-5">
                <label htmlFor="password" className="required">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  required
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Logging in…' : 'Login'}
              </Button>

              <p className="text-center" style={{ marginTop: 16 }}>
                <Link href="/forgot-password">Forgot your password?</Link>
              </p>
              <p className="text-center text-text-light" style={{ marginTop: 12 }}>
                Don&apos;t have an account? <Link href="/signup">Sign up</Link>
              </p>
            </form>
          </div>

          <p className="text-center text-sm text-text-light" style={{ marginTop: 24 }}>
            <Link href="/privacy" className="text-text-light">
              Privacy Policy
            </Link>
            {' · '}
            <a href="mailto:matilda@pauseai.info" className="text-text-light">
              Contact Support
            </a>
          </p>
        </div>
      </main>
    </>
  )
}
