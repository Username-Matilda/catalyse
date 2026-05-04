'use client'

import { useState, FormEvent } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import { apiRequest } from '@/lib/api'

interface ForgotResponse {
  message: string
  _dev_reset_url?: string
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [devUrl, setDevUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const data = await apiRequest<ForgotResponse>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      })
      setSubmitted(true)
      if (data._dev_reset_url) setDevUrl(data._dev_reset_url)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <>
      <Header />
      <main className="container page">
        <div style={{ maxWidth: 400, margin: '60px auto' }}>
          <h1 style={{ textAlign: 'center' }}>Reset Password</h1>
          <p style={{ textAlign: 'center', color: 'var(--text-light)', marginBottom: 32 }}>
            Enter your email and we&apos;ll send you a reset link.
          </p>

          {error && (
            <div role="alert" className="message error" style={{ marginBottom: 16 }}>
              {error}
            </div>
          )}

          {!submitted ? (
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

              <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={submitting}>
                {submitting ? 'Sending…' : 'Send Reset Link'}
              </button>

              <p style={{ textAlign: 'center', marginTop: 20, color: 'var(--text-light)' }}>
                Remember your password? <Link href="/login">Login</Link>
              </p>
            </form>
          ) : (
            <div className="card">
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ color: 'var(--success)' }}>Check Your Email</h3>
                <p style={{ margin: '16px 0', color: 'var(--text-light)' }}>
                  If an account exists with that email, you&apos;ll receive a password reset link shortly.
                </p>
                <Link href="/login" className="btn btn-outline">Back to Login</Link>
                <p style={{ marginTop: 16, fontSize: '0.875rem', color: 'var(--text-light)' }}>
                  Not receiving the email? Check your spam folder, or{' '}
                  <a href="mailto:matilda@pauseai.info">contact support</a>.
                </p>
              </div>
              {devUrl && (
                <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 12, color: 'var(--text-light)' }}>Dev mode — Reset link:</p>
                  <a href={devUrl} style={{ wordBreak: 'break-all' }}>{devUrl}</a>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  )
}
